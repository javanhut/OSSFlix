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

async function scanMediaDir(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  let tomlFile: string | null = null;
  let bannerImage: string | null = null;
  const videos: string[] = [];
  const subtitles: SubtitleTrack[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();

    if (ext === ".toml") {
      tomlFile = join(dirPath, entry.name);
    } else if (IMAGE_EXTS.has(ext)) {
      bannerImage = `${servePath}/${entry.name}`;
    } else if (VIDEO_EXTS.has(ext)) {
      videos.push(`${servePath}/${entry.name}`);
    } else if (SUBTITLE_EXTS.has(ext)) {
      subtitles.push(parseSubtitleFilename(entry.name, servePath));
    }
  }

  if (!tomlFile) return null;

  const data = await readTomlFile(tomlFile);
  if (!data) return null;

  return {
    ...data,
    bannerImage,
    videos,
    subtitles,
    dirPath: servePath,
    sourcePath: dirPath,
  };
}

export async function scanSingleMedia(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  return scanMediaDir(dirPath, servePath);
}

export async function scanDirectory(basePath: string, servePrefix: string): Promise<ScannedMedia[]> {
  const results: ScannedMedia[] = [];
  try {
    const mediaDirs = await readdir(basePath, { withFileTypes: true });
    for (const mediaDir of mediaDirs) {
      if (!mediaDir.isDirectory()) continue;
      const fullPath = join(basePath, mediaDir.name);
      const servePath = `${servePrefix}/${mediaDir.name}`;
      const scanned = await scanMediaDir(fullPath, servePath);
      if (scanned) results.push(scanned);
    }
  } catch {
    console.error(`Could not scan directory: ${basePath}`);
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
