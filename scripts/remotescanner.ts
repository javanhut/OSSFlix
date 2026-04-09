import { extname } from "node:path";
import * as toml from "toml";
import { kaidadbList, kaidadbFetchText, setKaidadbMapping, type KaidaDBListItem } from "./kaidadb";
import { parseTomlString } from "./tomlreader";
import { IMAGE_EXTS, VIDEO_EXTS, SUBTITLE_EXTS, parseSubtitleFilename, type ScannedMedia, type EpisodeTimingEntry } from "./mediascanner";

function parseMinSec(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+):(\d{1,2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseTimingString(content: string): Record<string, EpisodeTimingEntry> | undefined {
  try {
    const parsed = toml.parse(content);
    const timings: Record<string, EpisodeTimingEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^s\d+e\d+$/i.test(key) || typeof value !== "object" || !value) continue;
      const entry = value as Record<string, unknown>;
      timings[key.toLowerCase()] = {
        intro_start: parseMinSec(entry.intro_start),
        intro_end: parseMinSec(entry.intro_end),
        outro_start: parseMinSec(entry.outro_start),
        outro_end: parseMinSec(entry.outro_end),
      };
    }
    return Object.keys(timings).length > 0 ? timings : undefined;
  } catch {
    return undefined;
  }
}

/** Group KaidaDB keys by their title directory (first segment after the prefix). */
function groupByTitleDir(items: KaidaDBListItem[], prefix: string): Map<string, KaidaDBListItem[]> {
  const groups = new Map<string, KaidaDBListItem[]>();
  const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";

  for (const item of items) {
    const relative = item.key.slice(normalizedPrefix.length);
    const slashIdx = relative.indexOf("/");
    if (slashIdx === -1) continue; // file at prefix root, not inside a title dir
    const titleDir = relative.slice(0, slashIdx);
    if (!groups.has(titleDir)) groups.set(titleDir, []);
    groups.get(titleDir)!.push(item);
  }

  return groups;
}

/**
 * Flatten a KaidaDB key into a serve-path filename.
 * For flat keys (directly under title dir), just use the filename.
 * For nested keys (e.g., s01/ep01/file.mp4), flatten path segments with underscores.
 */
function flattenToFilename(key: string, prefix: string, titleDir: string): string {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
  const relative = key.slice(normalizedPrefix.length + titleDir.length + 1); // strip "prefix/titleDir/"
  if (!relative.includes("/")) return relative; // already flat
  // Nested: join path segments with underscores
  return relative.replace(/\//g, "_");
}

/**
 * Scan a KaidaDB prefix and return ScannedMedia[] matching the local scanner interface.
 * @param prefix  KaidaDB key prefix, e.g. "movies/" or "tv/"
 * @param servePrefix  Serve path prefix, e.g. "/media/movies" or "/media/tvshows"
 */
export async function scanKaidaDBPrefix(prefix: string, servePrefix: string): Promise<ScannedMedia[]> {
  const items = await kaidadbList(prefix);
  const groups = groupByTitleDir(items, prefix);
  const results: ScannedMedia[] = [];
  const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";

  for (const [titleDir, titleItems] of groups) {
    let metadataKey: string | null = null;
    let timingKey: string | null = null;
    let bannerItem: KaidaDBListItem | null = null;
    const videoItems: KaidaDBListItem[] = [];
    const subtitleItems: KaidaDBListItem[] = [];

    for (const item of titleItems) {
      const filename = item.key.split("/").pop()!;
      const ext = extname(filename).toLowerCase();
      const lowerName = filename.toLowerCase();

      if (ext === ".toml") {
        if (lowerName === "timing.toml" || lowerName === "timings.toml") {
          timingKey = item.key;
        } else if (!metadataKey) {
          metadataKey = item.key;
        }
      } else if (IMAGE_EXTS.has(ext)) {
        if (!bannerItem) bannerItem = item;
      } else if (VIDEO_EXTS.has(ext)) {
        videoItems.push(item);
      } else if (SUBTITLE_EXTS.has(ext)) {
        subtitleItems.push(item);
      }
    }

    // Skip titles without metadata.toml (same as local scanner)
    if (!metadataKey) continue;

    // Fetch and parse metadata
    let metadataContent: string;
    try {
      metadataContent = await kaidadbFetchText(metadataKey);
    } catch (err) {
      console.error(`Failed to fetch metadata from KaidaDB: ${metadataKey}`, err);
      continue;
    }

    const data = parseTomlString(metadataContent);
    if (!data) {
      console.error(`Failed to parse metadata.toml from KaidaDB: ${metadataKey}`);
      continue;
    }

    // Fetch and parse timing.toml if present
    let timings: Record<string, EpisodeTimingEntry> | undefined;
    if (timingKey) {
      try {
        const timingContent = await kaidadbFetchText(timingKey);
        timings = parseTimingString(timingContent);
      } catch {
        console.error(`Failed to fetch timing.toml from KaidaDB: ${timingKey}`);
      }
    }

    const servePath = `${servePrefix}/${titleDir}`;
    const sourcePath = `kaidadb:${normalizedPrefix}${titleDir}`;

    // Build serve paths and detect collisions for nested keys
    const filenameMap = new Map<string, string>(); // filename -> kaidadb key (for collision detection)

    // Banner image
    let bannerImage: string | null = null;
    if (bannerItem) {
      const filename = flattenToFilename(bannerItem.key, prefix, titleDir);
      bannerImage = `${servePath}/${filename}`;
      setKaidadbMapping(bannerImage, bannerItem.key, bannerItem.content_type, bannerItem.total_size, bannerItem.checksum);
    }

    // Videos
    const videos: string[] = [];
    for (const item of videoItems) {
      let filename = flattenToFilename(item.key, prefix, titleDir);
      // Handle collision: if filename already used, prefix with path
      if (filenameMap.has(filename)) {
        const relative = item.key.slice(normalizedPrefix.length + titleDir.length + 1);
        filename = relative.replace(/\//g, "_");
      }
      filenameMap.set(filename, item.key);
      const videoServePath = `${servePath}/${filename}`;
      videos.push(videoServePath);
      setKaidadbMapping(videoServePath, item.key, item.content_type, item.total_size, item.checksum);
    }

    // Sort videos by season/episode
    videos.sort((a, b) => {
      const re = /_s(\d+)_ep(\d+)\.[^.]+$/i;
      const ma = a.match(re);
      const mb = b.match(re);
      if (ma && mb) {
        const seasonDiff = Number(ma[1]) - Number(mb[1]);
        if (seasonDiff !== 0) return seasonDiff;
        return Number(ma[2]) - Number(mb[2]);
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });

    // Subtitles
    const subtitles = subtitleItems.map(item => {
      const filename = flattenToFilename(item.key, prefix, titleDir);
      const subServePath = `${servePath}/${filename}`;
      setKaidadbMapping(subServePath, item.key, item.content_type, item.total_size, item.checksum);
      return parseSubtitleFilename(filename, servePath);
    });

    results.push({
      ...data,
      bannerImage,
      videos,
      subtitles,
      dirPath: servePath,
      sourcePath,
      timings,
    });
  }

  return results;
}

/**
 * Scan a root prefix and auto-discover movies vs TV shows by reading each title's metadata.toml type field.
 */
export async function scanKaidaDBRoot(rootPrefix: string): Promise<{ movies: ScannedMedia[]; tvshows: ScannedMedia[] }> {
  const normalizedRoot = rootPrefix.endsWith("/") ? rootPrefix : rootPrefix.length > 0 ? rootPrefix + "/" : "";
  const items = await kaidadbList(normalizedRoot);

  // Group by top-level category directory (first segment after root)
  const categoryGroups = new Map<string, KaidaDBListItem[]>();
  for (const item of items) {
    const relative = item.key.slice(normalizedRoot.length);
    const slashIdx = relative.indexOf("/");
    if (slashIdx === -1) continue;
    const category = relative.slice(0, slashIdx);
    if (!categoryGroups.has(category)) categoryGroups.set(category, []);
    categoryGroups.get(category)!.push(item);
  }

  // For each category, scan its titles and classify by type
  const movies: ScannedMedia[] = [];
  const tvshows: ScannedMedia[] = [];

  for (const [category, categoryItems] of categoryGroups) {
    const categoryPrefix = `${normalizedRoot}${category}`;
    const titleGroups = groupByTitleDir(categoryItems, categoryPrefix);

    for (const [titleDir, titleItems] of titleGroups) {
      // Find metadata.toml to determine type
      const metadataItem = titleItems.find(item => {
        const filename = item.key.split("/").pop()!.toLowerCase();
        return filename.endsWith(".toml") && filename !== "timing.toml" && filename !== "timings.toml";
      });
      if (!metadataItem) continue;

      let metadataContent: string;
      try {
        metadataContent = await kaidadbFetchText(metadataItem.key);
      } catch {
        continue;
      }

      const data = parseTomlString(metadataContent);
      if (!data) continue;

      const isMovie = data.type.toLowerCase() === "movie";
      const servePrefix = isMovie ? "/media/movies" : "/media/tvshows";

      // Now do a full scan of this single title using scanKaidaDBPrefix logic
      // We reconstruct a mini prefix scan for just this title
      const titlePrefix = `${categoryPrefix}/${titleDir}`;
      const scanned = await scanSingleRemoteTitle(titleItems, titlePrefix, categoryPrefix, titleDir, servePrefix);
      if (scanned) {
        if (isMovie) {
          movies.push(scanned);
        } else {
          tvshows.push(scanned);
        }
      }
    }
  }

  return { movies, tvshows };
}

/** Scan a single remote title from pre-fetched items. */
async function scanSingleRemoteTitle(
  titleItems: KaidaDBListItem[],
  titlePrefix: string,
  categoryPrefix: string,
  titleDir: string,
  servePrefix: string,
): Promise<ScannedMedia | null> {
  let metadataKey: string | null = null;
  let timingKey: string | null = null;
  let bannerItem: KaidaDBListItem | null = null;
  const videoItems: KaidaDBListItem[] = [];
  const subtitleItems: KaidaDBListItem[] = [];

  for (const item of titleItems) {
    const filename = item.key.split("/").pop()!;
    const ext = extname(filename).toLowerCase();
    const lowerName = filename.toLowerCase();

    if (ext === ".toml") {
      if (lowerName === "timing.toml" || lowerName === "timings.toml") {
        timingKey = item.key;
      } else if (!metadataKey) {
        metadataKey = item.key;
      }
    } else if (IMAGE_EXTS.has(ext)) {
      if (!bannerItem) bannerItem = item;
    } else if (VIDEO_EXTS.has(ext)) {
      videoItems.push(item);
    } else if (SUBTITLE_EXTS.has(ext)) {
      subtitleItems.push(item);
    }
  }

  if (!metadataKey) return null;

  let metadataContent: string;
  try {
    metadataContent = await kaidadbFetchText(metadataKey);
  } catch {
    return null;
  }

  const data = parseTomlString(metadataContent);
  if (!data) return null;

  let timings: Record<string, EpisodeTimingEntry> | undefined;
  if (timingKey) {
    try {
      const timingContent = await kaidadbFetchText(timingKey);
      timings = parseTimingString(timingContent);
    } catch {
      // ignore
    }
  }

  const servePath = `${servePrefix}/${titleDir}`;
  const normalizedCategoryPrefix = categoryPrefix.endsWith("/") ? categoryPrefix : categoryPrefix + "/";
  const sourcePath = `kaidadb:${normalizedCategoryPrefix}${titleDir}`;

  let bannerImage: string | null = null;
  if (bannerItem) {
    const filename = bannerItem.key.split("/").pop()!;
    bannerImage = `${servePath}/${filename}`;
    setKaidadbMapping(bannerImage, bannerItem.key, bannerItem.content_type, bannerItem.total_size, bannerItem.checksum);
  }

  const filenameMap = new Map<string, string>();
  const videos: string[] = [];
  for (const item of videoItems) {
    // Get relative path within the title directory
    const titlePrefixSlash = titlePrefix.endsWith("/") ? titlePrefix : titlePrefix + "/";
    const relative = item.key.slice(titlePrefixSlash.length);
    let filename = relative.includes("/") ? relative.replace(/\//g, "_") : relative;
    if (filenameMap.has(filename)) {
      filename = relative.replace(/\//g, "_");
    }
    filenameMap.set(filename, item.key);
    const videoServePath = `${servePath}/${filename}`;
    videos.push(videoServePath);
    setKaidadbMapping(videoServePath, item.key, item.content_type, item.total_size, item.checksum);
  }

  videos.sort((a, b) => {
    const re = /_s(\d+)_ep(\d+)\.[^.]+$/i;
    const ma = a.match(re);
    const mb = b.match(re);
    if (ma && mb) {
      const seasonDiff = Number(ma[1]) - Number(mb[1]);
      if (seasonDiff !== 0) return seasonDiff;
      return Number(ma[2]) - Number(mb[2]);
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });

  const subtitles = subtitleItems.map(item => {
    const filename = item.key.split("/").pop()!;
    const subServePath = `${servePath}/${filename}`;
    setKaidadbMapping(subServePath, item.key, item.content_type, item.total_size, item.checksum);
    return parseSubtitleFilename(filename, servePath);
  });

  return {
    ...data,
    bannerImage,
    videos,
    subtitles,
    dirPath: servePath,
    sourcePath,
    timings,
  };
}
