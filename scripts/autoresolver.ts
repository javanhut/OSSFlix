import { resolve } from "node:path";
import { scanDirectory, type ScannedMedia } from "./mediascanner";
import { scanKaidaDBPrefix, scanKaidaDBRoot } from "./remotescanner";
import { getOrCreateDefaultProfile, getGlobalSettings } from "./profile";
import db from "./db";

const DEFAULT_MOVIES_DIR = resolve("./TestDir/Movies");
const DEFAULT_TVSHOWS_DIR = resolve("./TestDir/TV Shows");

type TitleInfo = {
  name: string;
  imagePath: string;
  pathToDir: string;
};

type MenuRow = {
  genre: string;
  titles: TitleInfo[];
};

function getMediaDirectories(): { moviesDir: string; tvshowsDir: string } {
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
      if (settings.kaidadb_root_prefix != null) {
        // Root prefix mode — auto-discover categories by type field
        const { movies: remoteMovies, tvshows: remoteTv } = await scanKaidaDBRoot(settings.kaidadb_root_prefix);
        movies.push(...remoteMovies);
        tvShows.push(...remoteTv);
      } else {
        // Explicit prefix mode
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

  const tx = db.transaction(() => {
    db.run("DELETE FROM category_titles");
    db.run("DELETE FROM title_genres");
    db.run("DELETE FROM categories");
    db.run("DELETE FROM genres");
    db.run("DELETE FROM titles");

    const insertTitle = db.prepare(`
      INSERT INTO titles (name, description, type, image_path, dir_path, source_path, cast_list, season, episodes, videos, subtitles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertGenre = db.prepare("INSERT OR IGNORE INTO genres (name) VALUES (?)");
    const getGenreId = db.prepare("SELECT id FROM genres WHERE name = ?");
    const insertTitleGenre = db.prepare("INSERT OR IGNORE INTO title_genres (title_id, genre_id) VALUES (?, ?)");
    const insertCategory = db.prepare("INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)");
    const getCategoryId = db.prepare("SELECT id FROM categories WHERE name = ?");
    const insertCategoryTitle = db.prepare("INSERT OR IGNORE INTO category_titles (category_id, title_id) VALUES (?, ?)");

    const titleIds: Map<string, number> = new Map();

    for (const media of allMedia) {
      const result = insertTitle.run(
        media.name,
        media.description,
        media.type,
        media.bannerImage,
        media.dirPath,
        media.sourcePath,
        media.cast?.filter(c => c).join(", ") || null,
        media.season ?? null,
        media.episodes ?? null,
        media.videos.length > 0 ? JSON.stringify(media.videos) : null,
        media.subtitles.length > 0 ? JSON.stringify(media.subtitles) : null,
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
      for (const [, titleId] of titleIds) {
        insertCategoryTitle.run(catRow.id, titleId);
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
      const pattern = new RegExp(`_s0*${seasonNum}_ep0*${epNum}\\.[^.]+$`, "i");
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

export function getCategoriesFromDb(): MenuRow[] {
  const allRows = db.prepare(`
    SELECT c.name AS category, t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
    FROM categories c
    JOIN category_titles ct ON ct.category_id = c.id
    JOIN titles t ON t.id = ct.title_id
    ORDER BY c.sort_order, c.name
  `).all() as { category: string; name: string; imagePath: string; pathToDir: string }[];

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

export function getCategoriesByType(typeFilter: string | string[]): MenuRow[] {
  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
  const lowerTypes = types.map(t => t.toLowerCase());
  const placeholders = lowerTypes.map(() => "?").join(", ");

  const allRows = db.prepare(`
    SELECT g.name AS genre, t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE LOWER(t.type) IN (${placeholders})
    ORDER BY g.name, t.name
  `).all(...lowerTypes) as { genre: string; name: string; imagePath: string; pathToDir: string }[];

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

export function getCategoriesByGenreTag(genreTags: string[]): MenuRow[] {
  const lowerTags = genreTags.map(t => t.toLowerCase());
  const tagPlaceholders = lowerTags.map(() => "?").join(", ");

  // Get title IDs that have any of the specified genre tags
  const titleIds = db.prepare(`
    SELECT DISTINCT t.id
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE LOWER(g.name) IN (${tagPlaceholders})
  `).all(...lowerTags) as { id: number }[];

  if (titleIds.length === 0) return [];

  const idPlaceholders = titleIds.map(() => "?").join(", ");
  const idValues = titleIds.map(r => r.id);

  // Single query: get all genre-title mappings for matching titles, excluding the filter tags
  const allRows = db.prepare(`
    SELECT DISTINCT g.name AS genre, t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE t.id IN (${idPlaceholders}) AND LOWER(g.name) NOT IN (${tagPlaceholders})
    ORDER BY g.name, t.name
  `).all(...idValues, ...lowerTags) as { genre: string; name: string; imagePath: string; pathToDir: string }[];

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

export function getTitleFromDb(dirPath: string) {
  const title = db.prepare(`
    SELECT
      t.id, t.name, t.description, t.type, t.image_path AS bannerImage,
      t.dir_path AS dirPath, t.source_path AS sourcePath, t.cast_list AS castList,
      t.season, t.episodes, t.videos, t.subtitles
    FROM titles t
    WHERE t.dir_path = ?
  `).get(dirPath) as {
    id: number;
    name: string;
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
  } | null;

  if (!title) return null;

  const genres = db.prepare(`
    SELECT g.name FROM genres g
    JOIN title_genres tg ON tg.genre_id = g.id
    WHERE tg.title_id = ?
  `).all(title.id) as { name: string }[];

  return {
    ...title,
    genres: genres.map(g => g.name),
  };
}

export function listAllTitles() {
  return db.prepare(`
    SELECT t.name, t.type, t.image_path AS imagePath, t.dir_path AS dirPath,
           t.source_path AS sourcePath, t.season, t.episodes
    FROM titles t
    ORDER BY t.name
  `).all() as { name: string; type: string; imagePath: string | null; dirPath: string; sourcePath: string; season: number | null; episodes: number | null }[];
}

export function searchTitles(query: string) {
  return db.prepare(`
    SELECT DISTINCT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir, t.type
    FROM titles t
    WHERE t.name LIKE ?
    ORDER BY t.name
    LIMIT 20
  `).all(`%${query}%`) as { name: string; imagePath: string | null; pathToDir: string; type: string }[];
}

export function searchGenres(query: string) {
  return db.prepare(`
    SELECT DISTINCT g.name
    FROM genres g
    WHERE g.name LIKE ?
    ORDER BY g.name
    LIMIT 5
  `).all(`%${query}%`) as { name: string }[];
}

export function resolveSourcePath(servePath: string): string | null {
  const title = db.prepare("SELECT source_path FROM titles WHERE dir_path = ?").get(
    servePath.replace(/\/[^/]+$/, "")
  ) as { source_path: string } | null;
  if (!title) return null;
  const filename = servePath.split("/").pop()!;
  return `${title.source_path}/${filename}`;
}

export function getAllGenreNames(): string[] {
  const rows = db.prepare("SELECT name FROM genres ORDER BY name").all() as { name: string }[];
  return rows.map(r => r.name);
}

export function getTitlesByMultipleGenres(genreNames: string[]) {
  const lowerNames = genreNames.map(n => n.toLowerCase());
  const placeholders = lowerNames.map(() => "?").join(", ");
  return db.prepare(`
    SELECT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir, t.type
    FROM titles t
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE LOWER(g.name) IN (${placeholders})
    GROUP BY t.id HAVING COUNT(DISTINCT g.id) = ?
  `).all(...lowerNames, lowerNames.length) as { name: string; imagePath: string | null; pathToDir: string; type: string }[];
}

// Run directly: bun scripts/autoresolver.ts
if (import.meta.main) {
  await resolveToDb();
}
