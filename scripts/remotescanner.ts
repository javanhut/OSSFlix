import { extname } from "node:path";
import * as toml from "toml";
import { kaidadbList, kaidadbFetchText, setKaidadbMapping, type KaidaDBListItem } from "./kaidadb";
import { parseTomlString, normalizeType, type SeasonMeta } from "./tomlreader";
import {
  IMAGE_EXTS,
  VIDEO_EXTS,
  SUBTITLE_EXTS,
  parseSubtitleFilename,
  resolveSeasonLogos,
  type ScannedMedia,
  type EpisodeTimingEntry,
} from "./mediascanner";
import { parseEpisodePath, canonicalFilename, compareVideoSrc } from "./episodeNaming";

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
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

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

function relativeInsideTitle(key: string, prefix: string, titleDir: string): string {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return key.slice(normalizedPrefix.length + titleDir.length + 1);
}

/** Flatten any key (flat or nested) to a filename suitable as a serve-path segment. */
function fallbackFlatten(relative: string): string {
  return relative.replace(/\//g, "_");
}

/** Canonicalize a nested video key to `{slug}_s{NN}_ep{NN}.{ext}`. Returns flat keys unchanged. */
function canonicalizeVideoKey(relative: string): string {
  if (!relative.includes("/")) return relative;
  const parsed = parseEpisodePath(relative);
  if (parsed) return canonicalFilename(parsed);
  return fallbackFlatten(relative);
}

/** Canonicalize a subtitle key while preserving trailing language code (e.g. .en.srt). */
function canonicalizeSubtitleKey(relative: string): string {
  if (!relative.includes("/")) return relative;
  const lastSlash = relative.lastIndexOf("/");
  const dirPart = relative.slice(0, lastSlash);
  const filename = relative.slice(lastSlash + 1);
  const extDot = filename.lastIndexOf(".");
  if (extDot < 0) return fallbackFlatten(relative);
  const ext = filename.slice(extDot + 1);
  const stemFull = filename.slice(0, extDot);
  const langMatch = stemFull.match(/([._])([a-z]{2,3})$/i);
  const langCode = langMatch?.[2];
  const lang = langCode ? langCode.toLowerCase() : null;
  const langMatchLen = langMatch?.[0]?.length ?? 0;
  const baseStem = lang ? stemFull.slice(0, stemFull.length - langMatchLen) : stemFull;
  const synthetic = `${dirPart}/${baseStem || "track"}.${ext}`;
  const parsed = parseEpisodePath(synthetic);
  if (!parsed) return fallbackFlatten(relative);
  const canon = canonicalFilename(parsed);
  if (!lang) return canon;
  const canonExtDot = canon.lastIndexOf(".");
  return `${canon.slice(0, canonExtDot)}.${lang}.${canon.slice(canonExtDot + 1)}`;
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
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  console.log(`[KaidaDB] prefix scan "${prefix}" → ${items.length} items, ${groups.size} title dirs: ${[...groups.keys()].slice(0, 10).join(", ")}${groups.size > 10 ? ", ..." : ""}`);

  for (const [titleDir, titleItems] of groups) {
    let metadataKey: string | null = null;
    let timingKey: string | null = null;
    let bannerItem: KaidaDBListItem | null = null;
    const imageItems: KaidaDBListItem[] = [];
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
        imageItems.push(item);
        if (!bannerItem) bannerItem = item;
      } else if (VIDEO_EXTS.has(ext)) {
        videoItems.push(item);
      } else if (SUBTITLE_EXTS.has(ext)) {
        subtitleItems.push(item);
      }
    }

    // Skip titles without metadata.toml (same as local scanner)
    if (!metadataKey) {
      console.log(`[KaidaDB]   "${titleDir}" skipped: no metadata.toml (${titleItems.length} items in dir)`);
      continue;
    }

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
      console.error(`[KaidaDB]   "${titleDir}" skipped: TOML parse failed or unrecognized type. File: ${metadataKey}`);
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

    const filenameMap = new Map<string, string>(); // filename -> kaidadb key (for collision detection)

    // Banner image (prefer flat banner; skip if it's referenced by seasons[])
    let bannerImage: string | null = null;
    if (bannerItem) {
      const bannerRel = relativeInsideTitle(bannerItem.key, prefix, titleDir);
      const filename = fallbackFlatten(bannerRel);
      bannerImage = `${servePath}/${filename}`;
      setKaidadbMapping(
        bannerImage,
        bannerItem.key,
        bannerItem.content_type,
        bannerItem.total_size,
        bannerItem.checksum,
      );
    }

    // Per-season logos — map TOML logo filenames to KaidaDB keys
    const imageByRel = new Map<string, KaidaDBListItem>();
    const imageByBasename = new Map<string, KaidaDBListItem>();
    for (const img of imageItems) {
      const rel = relativeInsideTitle(img.key, prefix, titleDir);
      imageByRel.set(rel, img);
      imageByBasename.set(rel.split("/").pop()!, img);
    }
    const seasons = resolveSeasonLogos((data as { seasons?: SeasonMeta[] }).seasons, (logoRel) => {
      const img = imageByRel.get(logoRel) ?? imageByBasename.get(logoRel);
      if (!img) return null;
      const filename = fallbackFlatten(relativeInsideTitle(img.key, prefix, titleDir));
      const logoServe = `${servePath}/${filename}`;
      setKaidadbMapping(logoServe, img.key, img.content_type, img.total_size, img.checksum);
      return logoServe;
    });

    // Videos
    const videos: string[] = [];
    for (const item of videoItems) {
      const rel = relativeInsideTitle(item.key, prefix, titleDir);
      let filename = canonicalizeVideoKey(rel);
      if (filenameMap.has(filename)) {
        filename = fallbackFlatten(rel);
      }
      filenameMap.set(filename, item.key);
      const videoServePath = `${servePath}/${filename}`;
      videos.push(videoServePath);
      setKaidadbMapping(videoServePath, item.key, item.content_type, item.total_size, item.checksum);
    }

    videos.sort(compareVideoSrc);

    // Subtitles
    const subtitles = subtitleItems.map((item) => {
      const rel = relativeInsideTitle(item.key, prefix, titleDir);
      const filename = canonicalizeSubtitleKey(rel);
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
      seasons,
    });
  }

  return results;
}

/**
 * Scan a root prefix and auto-discover movies vs TV shows by reading each title's metadata.toml type field.
 */
export async function scanKaidaDBRoot(
  rootPrefix: string,
): Promise<{ movies: ScannedMedia[]; tvshows: ScannedMedia[] }> {
  const normalizedRoot = rootPrefix.endsWith("/") ? rootPrefix : rootPrefix.length > 0 ? `${rootPrefix}/` : "";
  const items = await kaidadbList(normalizedRoot);
  console.log(`[KaidaDB] root scan "${rootPrefix}" → ${items.length} items`);

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
  console.log(`[KaidaDB] categories found: ${[...categoryGroups.keys()].join(", ") || "(none)"}`);

  // For each category, scan its titles and classify by type
  const movies: ScannedMedia[] = [];
  const tvshows: ScannedMedia[] = [];

  for (const [category, categoryItems] of categoryGroups) {
    const categoryPrefix = `${normalizedRoot}${category}`;
    const titleGroups = groupByTitleDir(categoryItems, categoryPrefix);
    console.log(`[KaidaDB]   category "${category}" → ${titleGroups.size} title dirs: ${[...titleGroups.keys()].slice(0, 10).join(", ")}${titleGroups.size > 10 ? ", ..." : ""}`);

    for (const [titleDir, titleItems] of titleGroups) {
      // Find metadata.toml to determine type
      const metadataItem = titleItems.find((item) => {
        const filename = item.key.split("/").pop()!.toLowerCase();
        return filename.endsWith(".toml") && filename !== "timing.toml" && filename !== "timings.toml";
      });
      if (!metadataItem) {
        console.log(`[KaidaDB]     "${titleDir}" skipped: no metadata.toml found`);
        continue;
      }

      let metadataContent: string;
      try {
        metadataContent = await kaidadbFetchText(metadataItem.key);
      } catch (err) {
        console.log(`[KaidaDB]     "${titleDir}" skipped: failed to fetch ${metadataItem.key}`, err);
        continue;
      }

      const data = parseTomlString(metadataContent);
      if (!data) {
        console.log(`[KaidaDB]     "${titleDir}" skipped: TOML parse failed or unrecognized type. File: ${metadataItem.key}`);
        continue;
      }

      const isMovie = normalizeType(data.type) === "movie";
      const servePrefix = isMovie ? "/media/movies" : "/media/tvshows";

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
  const imageItems: KaidaDBListItem[] = [];
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
      imageItems.push(item);
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
  const normalizedCategoryPrefix = categoryPrefix.endsWith("/") ? categoryPrefix : `${categoryPrefix}/`;
  const sourcePath = `kaidadb:${normalizedCategoryPrefix}${titleDir}`;
  const titlePrefixSlash = titlePrefix.endsWith("/") ? titlePrefix : `${titlePrefix}/`;

  let bannerImage: string | null = null;
  if (bannerItem) {
    const rel = bannerItem.key.slice(titlePrefixSlash.length);
    const filename = fallbackFlatten(rel);
    bannerImage = `${servePath}/${filename}`;
    setKaidadbMapping(bannerImage, bannerItem.key, bannerItem.content_type, bannerItem.total_size, bannerItem.checksum);
  }

  // Per-season logos
  const imageByRel = new Map<string, KaidaDBListItem>();
  const imageByBasename = new Map<string, KaidaDBListItem>();
  for (const img of imageItems) {
    const rel = img.key.slice(titlePrefixSlash.length);
    imageByRel.set(rel, img);
    imageByBasename.set(rel.split("/").pop()!, img);
  }
  const seasons = resolveSeasonLogos((data as { seasons?: SeasonMeta[] }).seasons, (logoRel) => {
    const img = imageByRel.get(logoRel) ?? imageByBasename.get(logoRel);
    if (!img) return null;
    const rel = img.key.slice(titlePrefixSlash.length);
    const filename = fallbackFlatten(rel);
    const logoServe = `${servePath}/${filename}`;
    setKaidadbMapping(logoServe, img.key, img.content_type, img.total_size, img.checksum);
    return logoServe;
  });

  const filenameMap = new Map<string, string>();
  const videos: string[] = [];
  for (const item of videoItems) {
    const rel = item.key.slice(titlePrefixSlash.length);
    let filename = canonicalizeVideoKey(rel);
    if (filenameMap.has(filename)) {
      filename = fallbackFlatten(rel);
    }
    filenameMap.set(filename, item.key);
    const videoServePath = `${servePath}/${filename}`;
    videos.push(videoServePath);
    setKaidadbMapping(videoServePath, item.key, item.content_type, item.total_size, item.checksum);
  }

  videos.sort(compareVideoSrc);

  const subtitles = subtitleItems.map((item) => {
    const rel = item.key.slice(titlePrefixSlash.length);
    const filename = canonicalizeSubtitleKey(rel);
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
    seasons,
  };
}
