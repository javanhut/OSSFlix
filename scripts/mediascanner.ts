import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { readTomlFile } from "./tomlreader";
import type { SeasonMeta } from "./tomlreader";
import { compareVideoSrc } from "./episodeNaming";

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
export const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".wmv"]);
export const SUBTITLE_EXTS = new Set([".srt", ".vtt", ".ass", ".ssa"]);

export interface SubtitleTrack {
  label: string;
  language: string;
  src: string;
  format: string;
}

export interface EpisodeTimingEntry {
  intro_start?: number | null;
  intro_end?: number | null;
  outro_start?: number | null;
  outro_end?: number | null;
}

export interface ScannedMedia {
  name: string;
  description: string;
  genre: string[];
  type: string;
  cast?: string[];
  season?: number;
  episodes?: number;
  bannerImage: string | null;
  videos: string[];
  subtitles: SubtitleTrack[];
  dirPath: string;
  sourcePath: string;
  timings?: Record<string, EpisodeTimingEntry>;
  seasons?: SeasonMeta[];
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
  sv: "Swedish",
  pl: "Polish",
};

export function parseSubtitleFilename(filename: string, servePath: string): SubtitleTrack {
  const ext = extname(filename).toLowerCase().slice(1); // "srt", "vtt", etc.
  const base = filename.replace(/\.[^.]+$/, ""); // remove extension
  // Try to extract language code from patterns like "video.en.srt" or "video_en.srt"
  const langMatch = base.match(/[._]([a-z]{2,3})$/i);
  const language = langMatch ? langMatch[1].toLowerCase() : "";
  const label = language && LANG_NAMES[language] ? LANG_NAMES[language] : language || "Unknown";
  return { label, language, src: `${servePath}/${filename}`, format: ext };
}

function parseMinSec(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+):(\d{1,2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function parseTimingToml(filePath: string): Promise<Record<string, EpisodeTimingEntry> | undefined> {
  try {
    const toml = await import("toml");
    const content = await Bun.file(filePath).text();
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
    console.error(`Failed to parse timing.toml: ${filePath}`);
    return undefined;
  }
}

/**
 * Resolve per-season logo filenames to serve paths by matching against available image filenames.
 * Returns a new array with logo fields rewritten, or the original if nothing changed.
 */
export function resolveSeasonLogos(
  seasons: SeasonMeta[] | undefined,
  resolveLogo: (logoRelative: string) => string | null,
): SeasonMeta[] | undefined {
  if (!seasons || seasons.length === 0) return seasons;
  return seasons.map((s) => {
    if (!s.logo) return s;
    const resolved = resolveLogo(s.logo);
    return resolved ? { ...s, logo: resolved } : s;
  });
}

export const SEASON_IMAGE_PATTERN = /^(?:s|season[\s_-]?)0*(\d+)\.[a-z0-9]+$/i;

/**
 * Auto-discover per-season banner images from a list of basenames using filename
 * patterns like `s1.jpg`, `s01.png`, `season1.jpg`, `season_2.png`. TOML-supplied
 * entries take precedence — a discovered banner only fills in when `logo` is empty.
 * `resolveLogo` is called with each matched basename and returns the serve URL
 * (or null to skip), letting callers register kaidadb mappings as a side effect.
 */
export function autoDiscoverSeasonBanners(
  seasons: SeasonMeta[] | undefined,
  imageBasenames: string[],
  resolveLogo: (basename: string) => string | null,
): SeasonMeta[] | undefined {
  const bySeason = new Map<number, SeasonMeta>();
  for (const s of seasons ?? []) bySeason.set(s.season, { ...s });

  const seenSeasons = new Set<number>();
  for (const file of imageBasenames) {
    const m = file.match(SEASON_IMAGE_PATTERN);
    if (!m) continue;
    const seasonNum = Number(m[1]);
    if (!Number.isFinite(seasonNum) || seenSeasons.has(seasonNum)) continue;
    seenSeasons.add(seasonNum);
    const existing = bySeason.get(seasonNum);
    if (existing?.logo) continue;
    const resolved = resolveLogo(file);
    if (!resolved) continue;
    if (existing) existing.logo = resolved;
    else bySeason.set(seasonNum, { season: seasonNum, logo: resolved });
  }
  if (bySeason.size === 0) return seasons;
  return Array.from(bySeason.values()).sort((a, b) => a.season - b.season);
}

async function scanMediaDir(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  let metadataTomlFile: string | null = null;
  let timingTomlFile: string | null = null;
  let bannerImage: string | null = null;
  const imageFiles: string[] = [];
  const videos: string[] = [];
  const subtitles: SubtitleTrack[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();

    if (ext === ".toml") {
      const lowerName = entry.name.toLowerCase();
      if (lowerName === "timing.toml" || lowerName === "timings.toml") {
        timingTomlFile = join(dirPath, entry.name);
      } else if (!metadataTomlFile) {
        metadataTomlFile = join(dirPath, entry.name);
      }
    } else if (IMAGE_EXTS.has(ext)) {
      imageFiles.push(entry.name);
      if (!bannerImage) bannerImage = `${servePath}/${entry.name}`;
    } else if (VIDEO_EXTS.has(ext)) {
      videos.push(`${servePath}/${entry.name}`);
    } else if (SUBTITLE_EXTS.has(ext)) {
      subtitles.push(parseSubtitleFilename(entry.name, servePath));
    }
  }

  if (!metadataTomlFile) return null;

  const data = await readTomlFile(metadataTomlFile);
  if (!data) return null;

  const timings = timingTomlFile ? await parseTimingToml(timingTomlFile) : undefined;

  videos.sort(compareVideoSrc);

  const seasonsRaw = (data as { seasons?: SeasonMeta[] }).seasons;
  const imageSet = new Set(imageFiles);
  const seasonsResolved = resolveSeasonLogos(seasonsRaw, (logoRel) => {
    return imageSet.has(logoRel) ? `${servePath}/${logoRel}` : null;
  });
  const seasons = autoDiscoverSeasonBanners(seasonsResolved, imageFiles, (file) => `${servePath}/${file}`);

  return {
    ...data,
    bannerImage,
    videos,
    subtitles,
    dirPath: servePath,
    sourcePath: dirPath,
    timings,
    seasons,
  };
}

export async function scanSingleMedia(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  return scanMediaDir(dirPath, servePath);
}

export async function scanDirectory(basePath: string, servePrefix: string): Promise<ScannedMedia[]> {
  const results: ScannedMedia[] = [];
  let mediaDirs: Awaited<ReturnType<typeof readdir>>;
  try {
    mediaDirs = await readdir(basePath, { withFileTypes: true });
  } catch {
    console.error(`Could not read directory: ${basePath}`);
    return results;
  }
  for (const mediaDir of mediaDirs) {
    if (!mediaDir.isDirectory()) continue;
    const fullPath = join(basePath, mediaDir.name);
    const servePath = `${servePrefix}/${mediaDir.name}`;
    try {
      const scanned = await scanMediaDir(fullPath, servePath);
      if (scanned) results.push(scanned);
    } catch (err) {
      console.error(`Failed to scan ${fullPath}:`, err);
    }
  }
  return results;
}

export async function scanMediaLibrary(basePath: string): Promise<ScannedMedia[]> {
  const results: ScannedMedia[] = [];
  const categories = await readdir(basePath, { withFileTypes: true });

  for (const category of categories) {
    if (!category.isDirectory()) continue;
    const categoryPath = join(basePath, category.name);
    const scanned = await scanDirectory(categoryPath, `/media/${category.name}`);
    results.push(...scanned);
  }

  return results;
}
