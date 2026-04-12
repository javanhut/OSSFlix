import nodemailer from "nodemailer";
import { getGlobalSettings } from "./profile";
import db from "./db";
import { createHash, randomBytes } from "node:crypto";

export function isSmtpConfigured(): boolean {
  const settings = getGlobalSettings();
  return !!(settings.smtp_host && settings.smtp_port && settings.smtp_from);
}

function createTransport() {
  const settings = getGlobalSettings();
  if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_from) {
    throw new Error("SMTP is not configured");
  }
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: settings.smtp_user ? {
      user: settings.smtp_user,
      pass: settings.smtp_pass || "",
    } : undefined,
  });
}

export async function sendPasswordResetEmail(profileEmail: string, profileName: string, resetCode: string): Promise<void> {
  const settings = getGlobalSettings();
  const transport = createTransport();
  await transport.sendMail({
    from: settings.smtp_from!,
    to: profileEmail,
    subject: "Reelscape - Password Reset Code",
    text: `Hi ${profileName},\n\nYour password reset code is: ${resetCode}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #3b82f6; margin-bottom: 24px;">Reelscape</h2>
        <p>Hi ${profileName},</p>
        <p>Your password reset code is:</p>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 2rem; font-weight: 700; letter-spacing: 8px; color: #1e293b;">${resetCode}</span>
        </div>
        <p style="color: #64748b; font-size: 0.9rem;">This code expires in 15 minutes.</p>
        <p style="color: #94a3b8; font-size: 0.85rem;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function testSmtpConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const transport = createTransport();
    await transport.verify();
    return { ok: true, message: "SMTP connection successful!" };
  } catch (err: any) {
    return { ok: false, message: err.message || "Connection failed" };
  }
}

export function createResetToken(profileId: number): string {
  // Generate a 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  // Invalidate any existing unused tokens for this profile
  db.run("UPDATE password_reset_tokens SET used = 1 WHERE profile_id = ? AND used = 0", [profileId]);
  db.run("INSERT INTO password_reset_tokens (profile_id, token, expires_at) VALUES (?, ?, ?)", [profileId, code, expiresAt]);
  return code;
}

export function verifyResetToken(profileId: number, token: string): boolean {
  const row = db.prepare(
    "SELECT id FROM password_reset_tokens WHERE profile_id = ? AND token = ? AND used = 0 AND expires_at > datetime('now')"
  ).get(profileId, token) as { id: number } | null;
  if (!row) return false;
  // Mark as used
  db.run("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [row.id]);
  return true;
}

export function cleanExpiredResetTokens(): void {
  db.run("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used = 1");
}
