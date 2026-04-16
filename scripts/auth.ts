import db from "./db";
import { getProfile, type ProfileData } from "./profile";

// ── Password hashing ──

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, "bcrypt");
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

// ── Sessions ──

const SESSION_TTL_DAYS = 30;
const MAX_SESSIONS_PER_PROFILE = 6;

function buildSessionExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function createSession(profileId: number, userAgent?: string): string {
  // Enforce concurrent session limit — evict oldest if at capacity
  const countRow = db.prepare(
    "SELECT COUNT(*) AS cnt FROM sessions WHERE profile_id = ? AND expires_at > datetime('now')"
  ).get(profileId) as { cnt: number };

  if (countRow.cnt >= MAX_SESSIONS_PER_PROFILE) {
    db.run(
      "DELETE FROM sessions WHERE id = (SELECT id FROM sessions WHERE profile_id = ? ORDER BY created_at ASC LIMIT 1)",
      [profileId]
    );
  }

  const token = crypto.randomUUID();
  const expiresAt = buildSessionExpiry();
  db.run(
    "INSERT INTO sessions (id, profile_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
    [token, profileId, expiresAt, userAgent || null]
  );
  return token;
}

export function getSessionExpiry(): string {
  return buildSessionExpiry();
}

export function getSession(token: string): { id: string; profile_id: number; expires_at: string } | null {
  const row = db.prepare(
    "SELECT id, profile_id, expires_at FROM sessions WHERE id = ?"
  ).get(token) as { id: string; profile_id: number; expires_at: string } | null;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.run("DELETE FROM sessions WHERE id = ?", [token]);
    return null;
  }
  return row;
}

export function deleteSession(token: string): void {
  db.run("DELETE FROM sessions WHERE id = ?", [token]);
}

export function deleteAllSessionsForProfile(profileId: number): void {
  db.run("DELETE FROM sessions WHERE profile_id = ?", [profileId]);
}

export function cleanExpiredSessions(): void {
  db.run("DELETE FROM sessions WHERE expires_at < datetime('now')");
}

// ── Cookie helpers ──

export function sessionCookie(token: string, maxAge: number = SESSION_TTL_DAYS * 24 * 60 * 60): string {
  return `ossflix_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `ossflix_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split("; ")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      cookies[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
    }
  }
  return cookies;
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  return cookies["ossflix_session"] || null;
}

function touchSession(token: string): void {
  const now = Date.now();
  const lastTouched = lastActiveTouched.get(token) || 0;
  if (now - lastTouched > LAST_ACTIVE_DEBOUNCE_MS) {
    db.run("UPDATE sessions SET last_active = datetime('now') WHERE id = ?", [token]);
    lastActiveTouched.set(token, now);
  }
}

// ── Request authentication ──

// Debounce last_active updates to once per 5 minutes per session
const lastActiveTouched = new Map<string, number>();
const LAST_ACTIVE_DEBOUNCE_MS = 5 * 60 * 1000;

export function authenticateRequest(req: Request): { profile: ProfileData; sessionId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const profile = getProfile(session.profile_id);
  if (!profile) {
    deleteSession(token);
    return null;
  }

  // Touch last_active (debounced)
  touchSession(token);

  return { profile, sessionId: session.id };
}
