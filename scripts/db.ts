import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

export const DATA_DIR = resolve(process.env.OSSFLIX_DATA_DIR || "./data");
const DB_PATH = join(DATA_DIR, "ossflix.db");
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH, { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS titles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    image_path TEXT,
    dir_path TEXT NOT NULL UNIQUE,
    source_path TEXT NOT NULL,
    cast_list TEXT,
    season INTEGER,
    episodes INTEGER,
    videos TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migration: add source_path if missing from older DB
try {
  db.run("ALTER TABLE titles ADD COLUMN source_path TEXT NOT NULL DEFAULT ''");
} catch {
  // column already exists
}

db.run(`
  CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS title_genres (
    title_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (title_id, genre_id),
    FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS category_titles (
    category_id INTEGER NOT NULL,
    title_id INTEGER NOT NULL,
    PRIMARY KEY (category_id, title_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    image_path TEXT,
    movies_directory TEXT,
    tvshows_directory TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS playback_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    video_src TEXT NOT NULL,
    dir_path TEXT NOT NULL,
    current_time REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(profile_id, video_src),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS global_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    movies_directory TEXT,
    tvshows_directory TEXT
  )
`);

// Ensure a single global settings row exists
db.run(`INSERT OR IGNORE INTO global_settings (id) VALUES (1)`);

// Migration: add use_global_dirs to profiles
try {
  db.run("ALTER TABLE profiles ADD COLUMN use_global_dirs INTEGER NOT NULL DEFAULT 1");
} catch {
  // column already exists
}

db.run(`
  CREATE TABLE IF NOT EXISTS episode_timings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_src TEXT NOT NULL UNIQUE,
    intro_start REAL,
    intro_end REAL,
    outro_start REAL,
    outro_end REAL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    dir_path TEXT NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(profile_id, dir_path),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

// Migration: add subtitles column to titles
try {
  db.run("ALTER TABLE titles ADD COLUMN subtitles TEXT");
} catch {
  // column already exists
}

// Migration: add per-season metadata JSON to titles
try {
  db.run("ALTER TABLE titles ADD COLUMN seasons_meta TEXT");
} catch {
  // column already exists
}

// Migration: add tmdb_api_key to global_settings
try {
  db.run("ALTER TABLE global_settings ADD COLUMN tmdb_api_key TEXT");
} catch {
  // column already exists
}

// Migration: add kaidadb_url to global_settings
try {
  db.run("ALTER TABLE global_settings ADD COLUMN kaidadb_url TEXT");
} catch {
  // column already exists
}

// Migration: add kaidadb prefix columns to global_settings
try {
  db.run("ALTER TABLE global_settings ADD COLUMN kaidadb_movies_prefix TEXT");
} catch {
  // column already exists
}
try {
  db.run("ALTER TABLE global_settings ADD COLUMN kaidadb_tvshows_prefix TEXT");
} catch {
  // column already exists
}
try {
  db.run("ALTER TABLE global_settings ADD COLUMN kaidadb_root_prefix TEXT");
} catch {
  // column already exists
}

db.run(`
  CREATE TABLE IF NOT EXISTS kaidadb_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_src TEXT NOT NULL UNIQUE,
    kaidadb_key TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'video/mp4',
    total_size INTEGER,
    checksum TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migration: add password_hash to profiles
try {
  db.run("ALTER TABLE profiles ADD COLUMN password_hash TEXT");
} catch {
  // column already exists
}

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    profile_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

// Migration: add user_agent and last_active columns to sessions
try {
  db.run("ALTER TABLE sessions ADD COLUMN user_agent TEXT");
} catch {}
try {
  db.run("ALTER TABLE sessions ADD COLUMN last_active TEXT DEFAULT (datetime('now'))");
} catch {}

db.run(`
  CREATE TABLE IF NOT EXISTS background_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    dir_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress TEXT,
    result TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Index for email-based profile lookup on login page
db.run(`CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles(LOWER(email))`);

// Migration: add SMTP settings to global_settings
try {
  db.run("ALTER TABLE global_settings ADD COLUMN smtp_host TEXT");
} catch {}
try {
  db.run("ALTER TABLE global_settings ADD COLUMN smtp_port INTEGER");
} catch {}
try {
  db.run("ALTER TABLE global_settings ADD COLUMN smtp_user TEXT");
} catch {}
try {
  db.run("ALTER TABLE global_settings ADD COLUMN smtp_pass TEXT");
} catch {}
try {
  db.run("ALTER TABLE global_settings ADD COLUMN smtp_from TEXT");
} catch {}

// Password reset tokens
db.run(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token)`);

// Migration: add admin password to global_settings
try {
  db.run("ALTER TABLE global_settings ADD COLUMN admin_password_hash TEXT");
} catch {}

// Admin sessions
db.run(`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )
`);

export default db;
