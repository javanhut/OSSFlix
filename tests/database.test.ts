import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

describe("Database schema and operations", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");

    // Replicate the schema from scripts/db.ts
    db.run(`CREATE TABLE titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      image_path TEXT,
      dir_path TEXT NOT NULL UNIQUE,
      source_path TEXT NOT NULL DEFAULT '',
      cast_list TEXT,
      season INTEGER,
      episodes INTEGER,
      videos TEXT,
      subtitles TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`);
    db.run(`CREATE TABLE title_genres (
      title_id INTEGER NOT NULL,
      genre_id INTEGER NOT NULL,
      PRIMARY KEY (title_id, genre_id),
      FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
      FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`);
    db.run(`CREATE TABLE category_titles (
      category_id INTEGER NOT NULL,
      title_id INTEGER NOT NULL,
      PRIMARY KEY (category_id, title_id),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      image_path TEXT,
      movies_directory TEXT,
      tvshows_directory TEXT,
      use_global_dirs INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE playback_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      video_src TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      current_time REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, video_src),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE episode_timings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_src TEXT NOT NULL UNIQUE,
      intro_start REAL,
      intro_end REAL,
      outro_start REAL,
      outro_end REAL
    )`);
    db.run(`CREATE TABLE watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      dir_path TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, dir_path),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE global_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      movies_directory TEXT,
      tvshows_directory TEXT,
      tmdb_api_key TEXT
    )`);
    db.run("INSERT INTO global_settings (id) VALUES (1)");
    db.run(`CREATE TABLE background_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress TEXT,
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  });

  afterAll(() => {
    db.close();
  });

  // ── Titles ──
  test("inserts and retrieves a title", () => {
    db.run(`INSERT INTO titles (name, description, type, dir_path, source_path, videos)
      VALUES (?, ?, ?, ?, ?, ?)`,
      ["Test Movie", "A test movie", "Movie", "/media/movies/test", "/path/to/test", '["ep1.mp4"]']);
    const title = db.prepare("SELECT * FROM titles WHERE name = ?").get("Test Movie") as any;
    expect(title).toBeTruthy();
    expect(title.type).toBe("Movie");
    expect(JSON.parse(title.videos)).toEqual(["ep1.mp4"]);
  });

  test("enforces unique dir_path", () => {
    expect(() => {
      db.run(`INSERT INTO titles (name, description, type, dir_path, source_path)
        VALUES (?, ?, ?, ?, ?)`,
        ["Duplicate", "Dup", "Movie", "/media/movies/test", "/path"]);
    }).toThrow();
  });

  // ── Genres ──
  test("creates genres and associates with titles", () => {
    db.run("INSERT INTO genres (name) VALUES (?)", ["Action"]);
    db.run("INSERT INTO genres (name) VALUES (?)", ["Comedy"]);
    const titleId = (db.prepare("SELECT id FROM titles LIMIT 1").get() as any).id;
    const actionId = (db.prepare("SELECT id FROM genres WHERE name = 'Action'").get() as any).id;
    const comedyId = (db.prepare("SELECT id FROM genres WHERE name = 'Comedy'").get() as any).id;
    db.run("INSERT INTO title_genres (title_id, genre_id) VALUES (?, ?)", [titleId, actionId]);
    db.run("INSERT INTO title_genres (title_id, genre_id) VALUES (?, ?)", [titleId, comedyId]);

    const genres = db.prepare(`
      SELECT g.name FROM genres g
      JOIN title_genres tg ON tg.genre_id = g.id
      WHERE tg.title_id = ?
    `).all(titleId) as any[];
    expect(genres.length).toBe(2);
    expect(genres.map((g: any) => g.name).sort()).toEqual(["Action", "Comedy"]);
  });

  test("enforces unique genre names", () => {
    expect(() => {
      db.run("INSERT INTO genres (name) VALUES (?)", ["Action"]);
    }).toThrow();
  });

  // ── Playback Progress ──
  test("saves and retrieves playback progress", () => {
    db.run("INSERT INTO profiles (name) VALUES (?)", ["TestUser"]);
    const profileId = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;

    db.run(`INSERT INTO playback_progress (profile_id, video_src, dir_path, current_time, duration)
      VALUES (?, ?, ?, ?, ?)`, [profileId, "/media/movies/test/ep1.mp4", "/media/movies/test", 120.5, 7200]);

    const progress = db.prepare(
      "SELECT * FROM playback_progress WHERE profile_id = ? AND video_src = ?"
    ).get(profileId, "/media/movies/test/ep1.mp4") as any;

    expect(progress).toBeTruthy();
    expect(progress.current_time).toBe(120.5);
    expect(progress.duration).toBe(7200);
  });

  test("upserts playback progress (UNIQUE constraint)", () => {
    const profileId = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    db.run(`INSERT OR REPLACE INTO playback_progress (profile_id, video_src, dir_path, current_time, duration)
      VALUES (?, ?, ?, ?, ?)`, [profileId, "/media/movies/test/ep1.mp4", "/media/movies/test", 300, 7200]);

    const progress = db.prepare(
      "SELECT * FROM playback_progress WHERE profile_id = ? AND video_src = ?"
    ).get(profileId, "/media/movies/test/ep1.mp4") as any;
    expect(progress.current_time).toBe(300);
  });

  test("retrieves all progress for a directory", () => {
    const profileId = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    db.run(`INSERT OR REPLACE INTO playback_progress (profile_id, video_src, dir_path, current_time, duration)
      VALUES (?, ?, ?, ?, ?)`, [profileId, "/media/movies/test/ep2.mp4", "/media/movies/test", 60, 7200]);

    const rows = db.prepare(
      "SELECT * FROM playback_progress WHERE profile_id = ? AND dir_path = ?"
    ).all(profileId, "/media/movies/test") as any[];
    expect(rows.length).toBe(2);
  });

  // ── Episode Timings ──
  test("saves and retrieves episode timings", () => {
    db.run(`INSERT INTO episode_timings (video_src, intro_start, intro_end, outro_start, outro_end)
      VALUES (?, ?, ?, ?, ?)`, ["/media/tvshows/show/ep1.mkv", 5, 90, 1200, 1260]);

    const timing = db.prepare(
      "SELECT * FROM episode_timings WHERE video_src = ?"
    ).get("/media/tvshows/show/ep1.mkv") as any;

    expect(timing).toBeTruthy();
    expect(timing.intro_start).toBe(5);
    expect(timing.intro_end).toBe(90);
    expect(timing.outro_start).toBe(1200);
    expect(timing.outro_end).toBe(1260);
  });

  test("allows null timing values", () => {
    db.run(`INSERT INTO episode_timings (video_src, intro_start, intro_end)
      VALUES (?, ?, ?)`, ["/media/tvshows/show/ep2.mkv", 10, 95]);

    const timing = db.prepare(
      "SELECT * FROM episode_timings WHERE video_src = ?"
    ).get("/media/tvshows/show/ep2.mkv") as any;

    expect(timing.intro_start).toBe(10);
    expect(timing.outro_start).toBeNull();
    expect(timing.outro_end).toBeNull();
  });

  // ── Watchlist ──
  test("adds and removes from watchlist", () => {
    const profileId = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    db.run("INSERT INTO watchlist (profile_id, dir_path) VALUES (?, ?)",
      [profileId, "/media/movies/test"]);

    const item = db.prepare(
      "SELECT * FROM watchlist WHERE profile_id = ? AND dir_path = ?"
    ).get(profileId, "/media/movies/test") as any;
    expect(item).toBeTruthy();

    db.run("DELETE FROM watchlist WHERE profile_id = ? AND dir_path = ?",
      [profileId, "/media/movies/test"]);
    const deleted = db.prepare(
      "SELECT * FROM watchlist WHERE profile_id = ? AND dir_path = ?"
    ).get(profileId, "/media/movies/test");
    expect(deleted).toBeNull();
  });

  test("enforces unique watchlist entries per profile", () => {
    const profileId = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    db.run("INSERT INTO watchlist (profile_id, dir_path) VALUES (?, ?)",
      [profileId, "/media/movies/unique"]);
    expect(() => {
      db.run("INSERT INTO watchlist (profile_id, dir_path) VALUES (?, ?)",
        [profileId, "/media/movies/unique"]);
    }).toThrow();
  });

  // ── Cascade deletes ──
  test("cascades profile deletion to playback_progress", () => {
    const profileId = (db.prepare("SELECT id FROM profiles LIMIT 1").get() as any).id;
    const beforeCount = (db.prepare("SELECT COUNT(*) as c FROM playback_progress WHERE profile_id = ?").get(profileId) as any).c;
    expect(beforeCount).toBeGreaterThan(0);

    db.run("DELETE FROM profiles WHERE id = ?", [profileId]);
    const afterCount = (db.prepare("SELECT COUNT(*) as c FROM playback_progress WHERE profile_id = ?").get(profileId) as any).c;
    expect(afterCount).toBe(0);
  });

  test("cascades title deletion to title_genres", () => {
    const titleId = (db.prepare("SELECT id FROM titles LIMIT 1").get() as any).id;
    const beforeCount = (db.prepare("SELECT COUNT(*) as c FROM title_genres WHERE title_id = ?").get(titleId) as any).c;
    expect(beforeCount).toBeGreaterThan(0);

    db.run("DELETE FROM titles WHERE id = ?", [titleId]);
    const afterCount = (db.prepare("SELECT COUNT(*) as c FROM title_genres WHERE title_id = ?").get(titleId) as any).c;
    expect(afterCount).toBe(0);
  });

  // ── Background Jobs ──
  test("creates and updates background jobs", () => {
    db.run(`INSERT INTO background_jobs (type, dir_path, status) VALUES (?, ?, ?)`,
      ["intro_detect", "/media/tvshows/show", "pending"]);

    const job = db.prepare("SELECT * FROM background_jobs ORDER BY id DESC LIMIT 1").get() as any;
    expect(job.status).toBe("pending");

    db.run("UPDATE background_jobs SET status = ?, progress = ? WHERE id = ?",
      ["running", '{"current": 3, "total": 12}', job.id]);

    const updated = db.prepare("SELECT * FROM background_jobs WHERE id = ?").get(job.id) as any;
    expect(updated.status).toBe("running");
    expect(JSON.parse(updated.progress)).toEqual({ current: 3, total: 12 });
  });
});
