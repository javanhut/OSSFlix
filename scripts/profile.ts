import db from "./db";

export interface ProfileData {
  id: number;
  name: string;
  email: string | null;
  image_path: string | null;
  movies_directory: string | null;
  tvshows_directory: string | null;
}

export function getProfile(id: number): ProfileData | null {
  return db.prepare("SELECT id, name, email, image_path, movies_directory, tvshows_directory FROM profiles WHERE id = ?").get(id) as ProfileData | null;
}

export function getOrCreateDefaultProfile(): ProfileData {
  let profile = db.prepare("SELECT id, name, email, image_path, movies_directory, tvshows_directory FROM profiles ORDER BY id LIMIT 1").get() as ProfileData | null;
  if (!profile) {
    db.run("INSERT INTO profiles (name) VALUES (?)", ["User"]);
    profile = db.prepare("SELECT id, name, email, image_path, movies_directory, tvshows_directory FROM profiles ORDER BY id LIMIT 1").get() as ProfileData;
  }
  return profile;
}

export function updateProfile(id: number, updates: {
  name?: string;
  email?: string;
  image_path?: string;
  movies_directory?: string;
  tvshows_directory?: string;
}): ProfileData | null {
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

  if (fields.length === 0) return getProfile(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.run(`UPDATE profiles SET ${fields.join(", ")} WHERE id = ?`, values);
  return getProfile(id);
}
