import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { readTomlFile } from "./tomlreader";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm"]);
const SUBTITLE_EXTS = new Set([".srt", ".vtt", ".ass", ".ssa"]);

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
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese", ru: "Russian",
  ar: "Arabic", hi: "Hindi", nl: "Dutch", sv: "Swedish", pl: "Polish",
};

function parseSubtitleFilename(filename: string, servePath: string): SubtitleTrack {
  const ext = extname(filename).toLowerCase().slice(1); // "srt", "vtt", etc.
  const base = filename.replace(/\.[^.]+$/, ""); // remove extension
  // Try to extract language code from patterns like "video.en.srt" or "video_en.srt"
  const langMatch = base.match(/[._]([a-z]{2,3})$/i);
  const language = langMatch ? langMatch[1].toLowerCase() : "";
  const label = language && LANG_NAMES[language] ? LANG_NAMES[language] : (language || "Unknown");
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

async function scanMediaDir(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  let metadataTomlFile: string | null = null;
  let timingTomlFile: string | null = null;
  let bannerImage: string | null = null;
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
      bannerImage = `${servePath}/${entry.name}`;
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

  return {
    ...data,
    bannerImage,
    videos,
    subtitles,
    dirPath: servePath,
    sourcePath: dirPath,
    timings,
  };
}

export async function scanSingleMedia(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  return scanMediaDir(dirPath, servePath);
}

export async function scanDirectory(basePath: string, servePrefix: string): Promise<ScannedMedia[]> {
  const results: ScannedMedia[] = [];
  let mediaDirs;
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
