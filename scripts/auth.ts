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

export function createSession(profileId: number): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.run(
    "INSERT INTO sessions (id, profile_id, expires_at) VALUES (?, ?, ?)",
    [token, profileId, expiresAt]
  );
  return token;
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

// ── Request authentication ──

export function authenticateRequest(req: Request): { profile: ProfileData; sessionId: string } | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies["ossflix_session"];
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const profile = getProfile(session.profile_id);
  if (!profile) {
    deleteSession(token);
    return null;
  }
  return { profile, sessionId: session.id };
}
