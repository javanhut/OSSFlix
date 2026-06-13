import { resolve } from "node:path";
import { scanDirectory } from "./mediascanner";
import { scanKaidaDBPrefix, scanKaidaDBRoot } from "./remotescanner";
import { getOrCreateDefaultProfile, getGlobalSettings } from "./profile";
import db from "./db";
import {
  allowedMaturityLevels,
  normalizeMaturityLevel,
  normalizeMaturityPreference,
  type MaturityLevel,
  type MaturityPreference,
} from "./maturity";

const DEFAULT_MOVIES_DIR = resolve("./TestDir/Movies");
const DEFAULT_TVSHOWS_DIR = resolve("./TestDir/TV Shows");

// Format epoch seconds as SQLite's UTC 'YYYY-MM-DD HH:MM:SS' so values sort
// lexicographically alongside datetime('now').
function toSqliteUtc(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}

type TitleInfo = {
  name: string;
  imagePath: string;
  pathToDir: string;
};

type MenuRow = {
  genre: string;
  titles: TitleInfo[];
};

export function getMediaDirectories(): { moviesDir: string; tvshowsDir: string } {
  // Prefer global settings, fall back to default profile, then defaults
  const global = getGlobalSettings();
  if (global.movies_directory || global.tvshows_directory) {
    return {
      moviesDir: global.movies_directory || DEFAULT_MOVIES_DIR,
      tvshowsDir: global.tvshows_directory || DEFAULT_TVSHOWS_DIR,
    };
  }
  const profile = getOrCreateDefaultProfile();
  return {
    moviesDir: profile.movies_directory || DEFAULT_MOVIES_DIR,
    tvshowsDir: profile.tvshows_directory || DEFAULT_TVSHOWS_DIR,
  };
}

export async function resolveToDb(): Promise<void> {
  const { moviesDir, tvshowsDir } = getMediaDirectories();

  const [movies, tvShows] = await Promise.all([
    scanDirectory(moviesDir, "/media/movies"),
    scanDirectory(tvshowsDir, "/media/tvshows"),
  ]);

  // Remote media discovery from KaidaDB
  const settings = getGlobalSettings();
  if (settings.kaidadb_url) {
    try {
      const hasExplicitPrefix = settings.kaidadb_movies_prefix || settings.kaidadb_tvshows_prefix;
      const useRoot = settings.kaidadb_root_prefix != null || !hasExplicitPrefix;

      if (useRoot) {
        // Auto-discover: explicit root prefix, or default to entire bucket ("") when nothing configured
        const rootPrefix = settings.kaidadb_root_prefix ?? "";
        const { movies: remoteMovies, tvshows: remoteTv } = await scanKaidaDBRoot(rootPrefix);
        movies.push(...remoteMovies);
        tvShows.push(...remoteTv);
      } else {
        // Explicit movies/tvshows prefix mode
        if (settings.kaidadb_movies_prefix) {
          const remoteMovies = await scanKaidaDBPrefix(settings.kaidadb_movies_prefix, "/media/movies");
          movies.push(...remoteMovies);
        }
        if (settings.kaidadb_tvshows_prefix) {
          const remoteTv = await scanKaidaDBPrefix(settings.kaidadb_tvshows_prefix, "/media/tvshows");
          tvShows.push(...remoteTv);
        }
      }
    } catch (err) {
      console.error("Failed to scan remote media from KaidaDB:", err);
    }
  }

  const allMedia = [...movies, ...tvShows];
  const existingMaturity = new Map<string, MaturityLevel>();
  const maturityRows = db.prepare("SELECT dir_path, maturity_level FROM titles").all() as {
    dir_path: string;
    maturity_level: string;
  }[];
  for (const row of maturityRows) existingMaturity.set(row.dir_path, normalizeMaturityLevel(row.maturity_level));

  const existingAltNames = new Map<string, string | null>();
  const altNameRows = db.prepare("SELECT dir_path, alt_name FROM titles").all() as {
    dir_path: string;
    alt_name: string | null;
  }[];
  for (const row of altNameRows) existingAltNames.set(row.dir_path, row.alt_name);

  // Preserve each title's "added" timestamp across rescans. The full DELETE+INSERT
  // below would otherwise reset created_at to now() every scan, making "Newly Added"
  // reflect scan order rather than real recency. Remote titles carry an accurate
  // source time (addedAt); locals fall back to the previously stored value.
  const existingCreatedAt = new Map<string, string>();
  const createdAtRows = db.prepare("SELECT dir_path, created_at FROM titles").all() as {
    dir_path: string;
    created_at: string;
  }[];
  for (const row of createdAtRows) existingCreatedAt.set(row.dir_path, row.created_at);

  const tx = db.transaction(() => {
    db.run("DELETE FROM category_titles");
    db.run("DELETE FROM title_genres");
    db.run("DELETE FROM categories");
    db.run("DELETE FROM genres");
    db.run("DELETE FROM titles");

    const insertTitle = db.prepare(`
      INSERT INTO titles (name, description, type, image_path, dir_path, source_path, cast_list, season, episodes, videos, subtitles, seasons_meta, maturity_level, alt_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertGenre = db.prepare("INSERT OR IGNORE INTO genres (name) VALUES (?)");
    const getGenreId = db.prepare("SELECT id FROM genres WHERE name = ?");
    const insertTitleGenre = db.prepare("INSERT OR IGNORE INTO title_genres (title_id, genre_id) VALUES (?, ?)");
    const insertCategory = db.prepare("INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)");
    const getCategoryId = db.prepare("SELECT id FROM categories WHERE name = ?");
    const insertCategoryTitle = db.prepare(
      "INSERT OR IGNORE INTO category_titles (category_id, title_id) VALUES (?, ?)",
    );

    const titleIds: Map<string, number> = new Map();

    for (const media of allMedia) {
      // Accurate source time for remote titles; preserved first-seen for everything
      // else; only brand-new locals fall back to now().
      const createdAt =
        media.addedAt != null
          ? toSqliteUtc(media.addedAt)
          : (existingCreatedAt.get(media.dirPath) ?? toSqliteUtc(Date.now() / 1000));
      const result = insertTitle.run(
        media.name,
        media.description,
        media.type,
        media.bannerImage,
        media.dirPath,
        media.sourcePath,
        media.cast?.filter((c) => c).join(", ") || null,
        media.season ?? null,
        media.episodes ?? null,
        media.videos.length > 0 ? JSON.stringify(media.videos) : null,
        media.subtitles.length > 0 ? JSON.stringify(media.subtitles) : null,
        media.seasons && media.seasons.length > 0 ? JSON.stringify(media.seasons) : null,
        existingMaturity.get(media.dirPath) || "everyone",
        existingAltNames.get(media.dirPath) ?? null,
        createdAt,
      );
      const titleId = Number(result.lastInsertRowid);
      titleIds.set(media.dirPath, titleId);

      for (const genre of media.genre) {
        insertGenre.run(genre);
        const genreRow = getGenreId.get(genre) as { id: number };
        insertTitleGenre.run(titleId, genreRow.id);
      }
    }

    let sortOrder = 0;

    if (allMedia.length > 0) {
      insertCategory.run("Newly Added", sortOrder++);
      const catRow = getCategoryId.get("Newly Added") as { id: number };
      const recentTitles = db.prepare("SELECT id FROM titles ORDER BY created_at DESC, id DESC LIMIT 6").all() as {
        id: number;
      }[];
      for (const { id } of recentTitles) {
        insertCategoryTitle.run(catRow.id, id);
      }
    }

    if (movies.length > 0) {
      insertCategory.run("Movies", sortOrder++);
      const catRow = getCategoryId.get("Movies") as { id: number };
      for (const m of movies) {
        insertCategoryTitle.run(catRow.id, titleIds.get(m.dirPath)!);
      }
    }

    if (tvShows.length > 0) {
      insertCategory.run("TV Shows", sortOrder++);
      const catRow = getCategoryId.get("TV Shows") as { id: number };
      for (const m of tvShows) {
        insertCategoryTitle.run(catRow.id, titleIds.get(m.dirPath)!);
      }
    }

    const genreMap = new Map<string, string[]>();
    for (const media of allMedia) {
      for (const genre of media.genre) {
        if (!genreMap.has(genre)) genreMap.set(genre, []);
        genreMap.get(genre)!.push(media.dirPath);
      }
    }

    for (const [genre, dirPaths] of genreMap) {
      insertCategory.run(genre, sortOrder++);
      const catRow = getCategoryId.get(genre) as { id: number };
      for (const dirPath of dirPaths) {
        insertCategoryTitle.run(catRow.id, titleIds.get(dirPath)!);
      }
    }
  });

  tx();

  // Upsert episode timings from timing.toml files
  const upsertTiming = db.prepare(`
    INSERT INTO episode_timings (video_src, intro_start, intro_end, outro_start, outro_end)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(video_src) DO UPDATE SET
      intro_start = excluded.intro_start,
      intro_end = excluded.intro_end,
      outro_start = excluded.outro_start,
      outro_end = excluded.outro_end
  `);

  for (const media of allMedia) {
    if (!media.timings) continue;
    for (const [sectionKey, timing] of Object.entries(media.timings)) {
      // sectionKey is like "s01e01" — match to video files with _s01_ep01 pattern
      const match = sectionKey.match(/^s(\d+)e(\d+)$/i);
      if (!match) continue;
      const seasonNum = Number(match[1]);
      const epNum = Number(match[2]);
      const pattern = new RegExp(`_s0*${seasonNum}_ep0*${epNum}(?:_(?:sub|dub))?\\.[^.]+$`, "i");
      for (const videoSrc of media.videos) {
        const filename = videoSrc.split("/").pop() || "";
        if (pattern.test(filename)) {
          upsertTiming.run(
            videoSrc,
            timing.intro_start ?? null,
            timing.intro_end ?? null,
            timing.outro_start ?? null,
            timing.outro_end ?? null,
          );
        }
      }
    }
  }

  console.log(`Resolved ${allMedia.length} titles into database (movies: ${moviesDir}, tvshows: ${tvshowsDir})`);
}

function maturityWhere(preference?: string | null, alias = "t"): { sql: string; params: MaturityLevel[] } {
  const levels = allowedMaturityLevels(normalizeMaturityPreference(preference));
  return {
    sql: `${alias}.maturity_level IN (${levels.map(() => "?").join(", ")})`,
    params: levels,
  };
}

export function getCategoriesFromDb(preference?: MaturityPreference | string | null): MenuRow[] {
  const maturity = maturityWhere(preference);
  const allRows = db
    .prepare(`
    SELECT c.name AS category, COALESCE(NULLIF(t.alt_name, ''), t.name) AS name, t.image_path AS imagePath, t.dir_path AS pathToDir
    FROM categories c
    JOIN category_titles ct ON ct.category_id = c.id
    JOIN titles t ON t.id = ct.title_id
    WHERE ${maturity.sql}
    ORDER BY c.sort_order, c.name
  `)
    .all(...maturity.params) as { category: string; name: string; imagePath: string; pathToDir: string }[];

  const grouped = new Map<string, TitleInfo[]>();
  for (const row of allRows) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category)!.push({ name: row.name, imagePath: row.imagePath, pathToDir: row.pathToDir });
  }

  const rows: MenuRow[] = [];
  for (const [category, titles] of grouped) {
    rows.push({ genre: category, titles });
  }

  return rows;
}

export function getCategoriesByType(
  typeFilter: string | string[],
  preference?: MaturityPreference | string | null,
): MenuRow[] {
  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
  const lowerTypes = types.map((t) => t.toLowerCase());
  const placeholders = lowerTypes.map(() => "?").join(", ");
  const maturity = maturityWhere(preference);

  const allRows = db
    .prepare(`
    SELECT g.name AS genre, COALESCE(NULLIF(t.alt_name, ''), t.name) AS name, t.image_path AS imagePath, t.dir_path AS pathToDir
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE LOWER(t.type) IN (${placeholders}) AND ${maturity.sql}
    ORDER BY g.name, t.name
  `)
    .all(...lowerTypes, ...maturity.params) as { genre: string; name: string; imagePath: string; pathToDir: string }[];

  const grouped = new Map<string, TitleInfo[]>();
  for (const row of allRows) {
    if (!grouped.has(row.genre)) grouped.set(row.genre, []);
    grouped.get(row.genre)!.push({ name: row.name, imagePath: row.imagePath, pathToDir: row.pathToDir });
  }

  const rows: MenuRow[] = [];
  for (const [genre, titles] of grouped) {
    rows.push({ genre, titles });
  }

  return rows;
}

export function getCategoriesByGenreTag(
  genreTags: string[],
  preference?: MaturityPreference | string | null,
): MenuRow[] {
  const lowerTags = genreTags.map((t) => t.toLowerCase());
  const tagPlaceholders = lowerTags.map(() => "?").join(", ");
  const maturity = maturityWhere(preference);

  // Get title IDs that have any of the specified genre tags
  const titleIds = db
    .prepare(`
    SELECT DISTINCT t.id
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE LOWER(g.name) IN (${tagPlaceholders}) AND ${maturity.sql}
  `)
    .all(...lowerTags, ...maturity.params) as { id: number }[];

  if (titleIds.length === 0) return [];

  const idPlaceholders = titleIds.map(() => "?").join(", ");
  const idValues = titleIds.map((r) => r.id);

  // Single query: get all genre-title mappings for matching titles, excluding the filter tags
  const allRows = db
    .prepare(`
    SELECT DISTINCT g.name AS genre, COALESCE(NULLIF(t.alt_name, ''), t.name) AS name, t.image_path AS imagePath, t.dir_path AS pathToDir
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE t.id IN (${idPlaceholders}) AND LOWER(g.name) NOT IN (${tagPlaceholders})
    ORDER BY g.name, t.name
  `)
    .all(...idValues, ...lowerTags) as { genre: string; name: string; imagePath: string; pathToDir: string }[];

  const grouped = new Map<string, TitleInfo[]>();
  for (const row of allRows) {
    if (!grouped.has(row.genre)) grouped.set(row.genre, []);
    grouped.get(row.genre)!.push({ name: row.name, imagePath: row.imagePath, pathToDir: row.pathToDir });
  }

  const rows: MenuRow[] = [];
  for (const [genre, titles] of grouped) {
    rows.push({ genre, titles });
  }

  return rows;
}

export function getTitleFromDb(dirPath: string, preference?: MaturityPreference | string | null) {
  const maturity = maturityWhere(preference);
  const title = db
    .prepare(`
    SELECT
      t.id, t.name, t.alt_name AS altName, t.description, t.type, t.image_path AS bannerImage,
      t.dir_path AS dirPath, t.source_path AS sourcePath, t.cast_list AS castList,
      t.season, t.episodes, t.videos, t.subtitles, t.seasons_meta AS seasonsMeta,
      t.maturity_level AS maturityLevel
    FROM titles t
    WHERE t.dir_path = ? AND ${maturity.sql}
  `)
    .get(dirPath, ...maturity.params) as {
    id: number;
    name: string;
    altName: string | null;
    description: string;
    type: string;
    bannerImage: string | null;
    dirPath: string;
    sourcePath: string;
    castList: string | null;
    season: number | null;
    episodes: number | null;
    videos: string | null;
    subtitles: string | null;
    seasonsMeta: string | null;
    maturityLevel: MaturityLevel;
  } | null;

  if (!title) return null;

  const genres = db
    .prepare(`
    SELECT g.name FROM genres g
    JOIN title_genres tg ON tg.genre_id = g.id
    WHERE tg.title_id = ?
  `)
    .all(title.id) as { name: string }[];

  return {
    ...title,
    genres: genres.map((g) => g.name),
  };
}

export function listAllTitles() {
  return db
    .prepare(`
    SELECT COALESCE(NULLIF(t.alt_name, ''), t.name) AS name, t.type, t.image_path AS imagePath, t.dir_path AS dirPath,
           t.source_path AS sourcePath, t.season, t.episodes, t.maturity_level AS maturityLevel
    FROM titles t
    ORDER BY name
  `)
    .all() as {
    name: string;
    type: string;
    imagePath: string | null;
    dirPath: string;
    sourcePath: string;
    season: number | null;
    episodes: number | null;
    maturityLevel: MaturityLevel;
  }[];
}

export function updateTitleMaturity(dirPath: string, maturityLevel: string): boolean {
  const result = db
    .prepare("UPDATE titles SET maturity_level = ? WHERE dir_path = ?")
    .run(normalizeMaturityLevel(maturityLevel), dirPath);
  return result.changes > 0;
}

export function searchTitles(query: string, preference?: MaturityPreference | string | null) {
  const maturity = maturityWhere(preference);
  return db
    .prepare(`
    SELECT DISTINCT COALESCE(NULLIF(t.alt_name, ''), t.name) AS name, t.image_path AS imagePath, t.dir_path AS pathToDir, t.type
    FROM titles t
    WHERE (t.name LIKE ? OR t.alt_name LIKE ?) AND ${maturity.sql}
    ORDER BY name
    LIMIT 20
  `)
    .all(`%${query}%`, `%${query}%`, ...maturity.params) as {
    name: string;
    imagePath: string | null;
    pathToDir: string;
    type: string;
  }[];
}

export function searchGenres(query: string) {
  return db
    .prepare(`
    SELECT DISTINCT g.name
    FROM genres g
    WHERE g.name LIKE ?
    ORDER BY g.name
    LIMIT 5
  `)
    .all(`%${query}%`) as { name: string }[];
}

export function resolveSourcePath(servePath: string): string | null {
  const title = db
    .prepare("SELECT source_path FROM titles WHERE dir_path = ?")
    .get(servePath.replace(/\/[^/]+$/, "")) as { source_path: string } | null;
  if (!title) return null;
  const filename = servePath.split("/").pop()!;
  return `${title.source_path}/${filename}`;
}

export function getAllGenreNames(): string[] {
  const rows = db.prepare("SELECT name FROM genres ORDER BY name").all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getTitlesByMultipleGenres(genreNames: string[], preference?: MaturityPreference | string | null) {
  const lowerNames = genreNames.map((n) => n.toLowerCase());
  const placeholders = lowerNames.map(() => "?").join(", ");
  const maturity = maturityWhere(preference);
  return db
    .prepare(`
    SELECT COALESCE(NULLIF(t.alt_name, ''), t.name) AS name, t.image_path AS imagePath, t.dir_path AS pathToDir, t.type
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE LOWER(g.name) IN (${placeholders}) AND ${maturity.sql}
    GROUP BY t.id HAVING COUNT(DISTINCT g.id) = ?
  `)
    .all(...lowerNames, ...maturity.params, lowerNames.length) as {
    name: string;
    imagePath: string | null;
    pathToDir: string;
    type: string;
  }[];
}

// Run directly: bun scripts/autoresolver.ts
if (import.meta.main) {
  await resolveToDb();
}
