import { resolve } from "node:path";
import { scanDirectory, type ScannedMedia } from "./mediascanner";
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
  const categories = db.prepare("SELECT id, name FROM categories ORDER BY sort_order").all() as { id: number; name: string }[];
  const rows: MenuRow[] = [];

  for (const cat of categories) {
    const titles = db.prepare(`
      SELECT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
      FROM titles t
      JOIN category_titles ct ON ct.title_id = t.id
      WHERE ct.category_id = ?
    `).all(cat.id) as TitleInfo[];

    rows.push({ genre: cat.name, titles });
  }

  return rows;
}

export function getCategoriesByType(typeFilter: string | string[]): MenuRow[] {
  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
  const lowerTypes = types.map(t => t.toLowerCase());
  const placeholders = lowerTypes.map(() => "?").join(", ");

  const genres = db.prepare(`
    SELECT DISTINCT g.name
    FROM genres g
    JOIN title_genres tg ON tg.genre_id = g.id
    JOIN titles t ON t.id = tg.title_id
    WHERE LOWER(t.type) IN (${placeholders})
    ORDER BY g.name
  `).all(...lowerTypes) as { name: string }[];

  const rows: MenuRow[] = [];
  for (const g of genres) {
    const titles = db.prepare(`
      SELECT DISTINCT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
      FROM titles t
      JOIN title_genres tg ON tg.title_id = t.id
      JOIN genres gen ON gen.id = tg.genre_id
      WHERE gen.name = ? AND LOWER(t.type) IN (${placeholders})
    `).all(g.name, ...lowerTypes) as TitleInfo[];

    if (titles.length > 0) {
      rows.push({ genre: g.name, titles });
    }
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

  const idSet = new Set(titleIds.map(r => r.id));
  const idPlaceholders = titleIds.map(() => "?").join(", ");
  const idValues = titleIds.map(r => r.id);

  // Get all genres for those titles (excluding the filter tags themselves to avoid redundancy)
  const genres = db.prepare(`
    SELECT DISTINCT g.name
    FROM genres g
    JOIN title_genres tg ON tg.genre_id = g.id
    WHERE tg.title_id IN (${idPlaceholders}) AND LOWER(g.name) NOT IN (${tagPlaceholders})
    ORDER BY g.name
  `).all(...idValues, ...lowerTags) as { name: string }[];

  const rows: MenuRow[] = [];
  for (const g of genres) {
    const titles = db.prepare(`
      SELECT DISTINCT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
      FROM titles t
      JOIN title_genres tg ON tg.title_id = t.id
      JOIN genres gen ON gen.id = tg.genre_id
      WHERE gen.name = ? AND t.id IN (${idPlaceholders})
    `).all(g.name, ...idValues) as TitleInfo[];

    if (titles.length > 0) {
      rows.push({ genre: g.name, titles });
    }
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

// Run directly: bun scripts/autoresolver.ts
if (import.meta.main) {
  await resolveToDb();
}
