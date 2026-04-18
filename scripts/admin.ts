import db from "./db";
import { hashPassword, verifyPassword } from "./auth";

const ADMIN_SESSION_TTL_HOURS = 24;

export function isAdminSetup(): boolean {
  const row = db.prepare("SELECT admin_password_hash FROM global_settings WHERE id = 1").get() as {
    admin_password_hash: string | null;
  } | null;
  return !!row?.admin_password_hash;
}

export async function setupAdmin(plain: string): Promise<void> {
  if (isAdminSetup()) throw new Error("Admin password already set");
  const hash = await hashPassword(plain);
  db.run("UPDATE global_settings SET admin_password_hash = ? WHERE id = 1", [hash]);
}

export async function verifyAdminPassword(plain: string): Promise<boolean> {
  const row = db.prepare("SELECT admin_password_hash FROM global_settings WHERE id = 1").get() as {
    admin_password_hash: string | null;
  } | null;
  if (!row?.admin_password_hash) return false;
  return verifyPassword(plain, row.admin_password_hash);
}

export function createAdminSession(): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  // Clean up expired sessions
  db.run("DELETE FROM admin_sessions WHERE expires_at < datetime('now')");
  db.run("INSERT INTO admin_sessions (id, expires_at) VALUES (?, ?)", [token, expiresAt]);
  return token;
}

export function getAdminSession(token: string): boolean {
  const row = db.prepare("SELECT id FROM admin_sessions WHERE id = ? AND expires_at > datetime('now')").get(token);
  return !!row;
}

export function deleteAdminSession(token: string): void {
  db.run("DELETE FROM admin_sessions WHERE id = ?", [token]);
}

export function authenticateAdminRequest(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)ossflix_admin=([^;]+)/);
  if (!match) return false;
  return getAdminSession(match[1]);
}

export function adminSessionCookie(token: string): string {
  const maxAge = ADMIN_SESSION_TTL_HOURS * 60 * 60;
  return `ossflix_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearAdminSessionCookie(): string {
  return "ossflix_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
}
