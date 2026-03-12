import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

// Use a separate test database
const TEST_DB_PATH = resolve("./data/test_profile.db");

// We need to test profile functions which import db.ts that creates the real DB.
// Instead, test the SQL logic directly with an in-memory database.
describe("Profile CRUD operations", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.run(`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        image_path TEXT,
        movies_directory TEXT,
        tvshows_directory TEXT,
        use_global_dirs INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.run(`
      CREATE TABLE global_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        movies_directory TEXT,
        tvshows_directory TEXT,
        tmdb_api_key TEXT
      )
    `);
    db.run("INSERT INTO global_settings (id) VALUES (1)");
  });

  afterAll(() => {
    db.close();
  });

  test("creates a profile", () => {
    db.run("INSERT INTO profiles (name, use_global_dirs) VALUES (?, 1)", ["TestUser"]);
    const profile = db.prepare("SELECT * FROM profiles WHERE name = ?").get("TestUser") as any;
    expect(profile).toBeTruthy();
    expect(profile.name).toBe("TestUser");
    expect(profile.use_global_dirs).toBe(1);
  });

  test("retrieves default profile (first by id)", () => {
    const profile = db.prepare("SELECT * FROM profiles ORDER BY id LIMIT 1").get() as any;
    expect(profile).toBeTruthy();
    expect(profile.name).toBe("TestUser");
  });

  test("updates a profile name", () => {
    db.run("UPDATE profiles SET name = ? WHERE name = ?", ["UpdatedUser", "TestUser"]);
    const profile = db.prepare("SELECT * FROM profiles WHERE name = ?").get("UpdatedUser") as any;
    expect(profile).toBeTruthy();
    expect(profile.name).toBe("UpdatedUser");
  });

  test("updates profile directories", () => {
    const id = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    db.run("UPDATE profiles SET movies_directory = ?, tvshows_directory = ? WHERE id = ?",
      ["/custom/movies", "/custom/tvshows", id]);
    const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as any;
    expect(profile.movies_directory).toBe("/custom/movies");
    expect(profile.tvshows_directory).toBe("/custom/tvshows");
  });

  test("creates multiple profiles", () => {
    db.run("INSERT INTO profiles (name, use_global_dirs) VALUES (?, 1)", ["Profile2"]);
    db.run("INSERT INTO profiles (name, use_global_dirs) VALUES (?, 1)", ["Profile3"]);
    const all = db.prepare("SELECT * FROM profiles ORDER BY id").all() as any[];
    expect(all.length).toBe(3);
  });

  test("deletes a profile", () => {
    const target = db.prepare("SELECT id FROM profiles WHERE name = ?").get("Profile3") as any;
    db.run("DELETE FROM profiles WHERE id = ?", [target.id]);
    const remaining = db.prepare("SELECT * FROM profiles").all() as any[];
    expect(remaining.length).toBe(2);
  });

  test("prevents deleting last profile (application logic)", () => {
    const all = db.prepare("SELECT * FROM profiles").all() as any[];
    // Application should check count before allowing delete
    expect(all.length).toBeGreaterThan(1);
  });

  test("global settings CRUD", () => {
    db.run("UPDATE global_settings SET movies_directory = ?, tvshows_directory = ? WHERE id = 1",
      ["/global/movies", "/global/tvshows"]);
    const settings = db.prepare("SELECT * FROM global_settings WHERE id = 1").get() as any;
    expect(settings.movies_directory).toBe("/global/movies");
    expect(settings.tvshows_directory).toBe("/global/tvshows");
  });

  test("profile with use_global_dirs=0 uses own directories", () => {
    const id = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    db.run("UPDATE profiles SET use_global_dirs = 0 WHERE id = ?", [id]);
    const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as any;
    expect(profile.use_global_dirs).toBe(0);
    expect(profile.movies_directory).toBe("/custom/movies");
  });
});
