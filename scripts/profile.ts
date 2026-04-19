import db from "./db";
import { hashPassword } from "./auth";

export const GUEST_NAME = "Guest";
export const GUEST_PASSWORD = "guest";

export interface ProfileData {
  id: number;
  name: string;
  email: string | null;
  image_path: string | null;
  movies_directory: string | null;
  tvshows_directory: string | null;
  use_global_dirs: number;
}

export interface GlobalSettings {
  movies_directory: string | null;
  tvshows_directory: string | null;
  tmdb_api_key: string | null;
  kaidadb_url: string | null;
  kaidadb_password: string | null;
  kaidadb_movies_prefix: string | null;
  kaidadb_tvshows_prefix: string | null;
  kaidadb_root_prefix: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string | null;
}

export function getProfile(id: number): ProfileData | null {
  return db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles WHERE id = ?",
    )
    .get(id) as ProfileData | null;
}

export function getAllProfiles(): ProfileData[] {
  return db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles ORDER BY id",
    )
    .all() as ProfileData[];
}

export function getProfilesByEmail(email: string): ProfileData[] {
  return db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles WHERE LOWER(email) = LOWER(?) ORDER BY id",
    )
    .all(email.trim()) as ProfileData[];
}

export function getProfilesWithoutEmail(): ProfileData[] {
  return db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles WHERE email IS NULL OR email = '' ORDER BY id",
    )
    .all() as ProfileData[];
}

export function createProfile(name: string, passwordHash?: string, email?: string): ProfileData {
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  if (passwordHash) {
    const result = db.run("INSERT INTO profiles (name, use_global_dirs, password_hash, email) VALUES (?, 1, ?, ?)", [
      name,
      passwordHash,
      normalizedEmail,
    ]);
    return getProfile(Number(result.lastInsertRowid))!;
  }
  const result = db.run("INSERT INTO profiles (name, use_global_dirs, email) VALUES (?, 1, ?)", [
    name,
    normalizedEmail,
  ]);
  return getProfile(Number(result.lastInsertRowid))!;
}

export function getProfileWithHash(id: number): (ProfileData & { password_hash: string | null }) | null {
  return db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs, password_hash FROM profiles WHERE id = ?",
    )
    .get(id) as (ProfileData & { password_hash: string | null }) | null;
}

export function setProfilePassword(id: number, hash: string): void {
  db.run("UPDATE profiles SET password_hash = ? WHERE id = ?", [hash, id]);
}

export function profileHasPassword(id: number): boolean {
  const row = db.prepare("SELECT password_hash FROM profiles WHERE id = ?").get(id) as {
    password_hash: string | null;
  } | null;
  return !!row?.password_hash;
}

/** Find the singleton Guest profile (name="Guest", no email). */
export function getGuestProfile(): ProfileData | null {
  return db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles WHERE name = ? AND (email IS NULL OR email = '') ORDER BY id LIMIT 1",
    )
    .get(GUEST_NAME) as ProfileData | null;
}

/** Ensure the Guest profile exists with password "guest". Idempotent — safe to call on every startup. */
export async function seedGuestProfile(): Promise<ProfileData> {
  const existing = getGuestProfile();
  if (existing) {
    // Make sure it still has the canonical password (heals manual tampering)
    const row = db.prepare("SELECT password_hash FROM profiles WHERE id = ?").get(existing.id) as {
      password_hash: string | null;
    } | null;
    if (!row?.password_hash) {
      const hash = await hashPassword(GUEST_PASSWORD);
      setProfilePassword(existing.id, hash);
    }
    return existing;
  }
  const hash = await hashPassword(GUEST_PASSWORD);
  return createProfile(GUEST_NAME, hash);
}

export function deleteProfile(id: number): void {
  db.run("DELETE FROM profiles WHERE id = ?", [id]);
}

export function getOrCreateDefaultProfile(): ProfileData {
  let profile = db
    .prepare(
      "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles ORDER BY id LIMIT 1",
    )
    .get() as ProfileData | null;
  if (!profile) {
    db.run("INSERT INTO profiles (name, use_global_dirs) VALUES (?, 1)", ["User"]);
    profile = db
      .prepare(
        "SELECT id, name, email, image_path, movies_directory, tvshows_directory, use_global_dirs FROM profiles ORDER BY id LIMIT 1",
      )
      .get() as ProfileData;
  }
  return profile;
}

export function updateProfile(
  id: number,
  updates: {
    name?: string;
    email?: string;
    image_path?: string;
    movies_directory?: string;
    tvshows_directory?: string;
    use_global_dirs?: number;
  },
): ProfileData | null {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    if (updates.name.length < 1 || updates.name.length > 25) {
      throw new Error("Name must be between 1 and 25 characters");
    }
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email || null);
  }
  if (updates.image_path !== undefined) {
    fields.push("image_path = ?");
    values.push(updates.image_path || null);
  }
  if (updates.movies_directory !== undefined) {
    fields.push("movies_directory = ?");
    values.push(updates.movies_directory || null);
  }
  if (updates.tvshows_directory !== undefined) {
    fields.push("tvshows_directory = ?");
    values.push(updates.tvshows_directory || null);
  }
  if (updates.use_global_dirs !== undefined) {
    fields.push("use_global_dirs = ?");
    values.push(updates.use_global_dirs);
  }

  if (fields.length === 0) return getProfile(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.run(`UPDATE profiles SET ${fields.join(", ")} WHERE id = ?`, values);
  return getProfile(id);
}

export function getGlobalSettings(): GlobalSettings {
  return db
    .prepare(
      "SELECT movies_directory, tvshows_directory, tmdb_api_key, kaidadb_url, kaidadb_password, kaidadb_movies_prefix, kaidadb_tvshows_prefix, kaidadb_root_prefix, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from FROM global_settings WHERE id = 1",
    )
    .get() as GlobalSettings;
}

export function updateGlobalSettings(updates: {
  movies_directory?: string;
  tvshows_directory?: string;
}): GlobalSettings {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.movies_directory !== undefined) {
    fields.push("movies_directory = ?");
    values.push(updates.movies_directory || null);
  }
  if (updates.tvshows_directory !== undefined) {
    fields.push("tvshows_directory = ?");
    values.push(updates.tvshows_directory || null);
  }
  if ((updates as any).tmdb_api_key !== undefined) {
    fields.push("tmdb_api_key = ?");
    values.push((updates as any).tmdb_api_key || null);
  }
  if ((updates as any).kaidadb_url !== undefined) {
    fields.push("kaidadb_url = ?");
    values.push((updates as any).kaidadb_url || null);
  }
  if ((updates as any).kaidadb_password !== undefined) {
    fields.push("kaidadb_password = ?");
    values.push((updates as any).kaidadb_password || null);
  }
  if ((updates as any).kaidadb_movies_prefix !== undefined) {
    fields.push("kaidadb_movies_prefix = ?");
    values.push((updates as any).kaidadb_movies_prefix || null);
  }
  if ((updates as any).kaidadb_tvshows_prefix !== undefined) {
    fields.push("kaidadb_tvshows_prefix = ?");
    values.push((updates as any).kaidadb_tvshows_prefix || null);
  }
  if ((updates as any).kaidadb_root_prefix !== undefined) {
    fields.push("kaidadb_root_prefix = ?");
    values.push((updates as any).kaidadb_root_prefix ?? null);
  }
  if ((updates as any).smtp_host !== undefined) {
    fields.push("smtp_host = ?");
    values.push((updates as any).smtp_host || null);
  }
  if ((updates as any).smtp_port !== undefined) {
    fields.push("smtp_port = ?");
    values.push((updates as any).smtp_port || null);
  }
  if ((updates as any).smtp_user !== undefined) {
    fields.push("smtp_user = ?");
    values.push((updates as any).smtp_user || null);
  }
  if ((updates as any).smtp_pass !== undefined) {
    fields.push("smtp_pass = ?");
    values.push((updates as any).smtp_pass || null);
  }
  if ((updates as any).smtp_from !== undefined) {
    fields.push("smtp_from = ?");
    values.push((updates as any).smtp_from || null);
  }

  if (fields.length > 0) {
    db.run(`UPDATE global_settings SET ${fields.join(", ")} WHERE id = 1`, values);
  }

  return getGlobalSettings();
}

// Get the effective directories for a profile (global or per-profile)
export function getEffectiveDirs(profileId: number): {
  movies_directory: string | null;
  tvshows_directory: string | null;
} {
  const profile = getProfile(profileId);
  if (!profile) return { movies_directory: null, tvshows_directory: null };

  if (profile.use_global_dirs) {
    const global = getGlobalSettings();
    return {
      movies_directory: global.movies_directory,
      tvshows_directory: global.tvshows_directory,
    };
  }

  return {
    movies_directory: profile.movies_directory,
    tvshows_directory: profile.tvshows_directory,
  };
}
