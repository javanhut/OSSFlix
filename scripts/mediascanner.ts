import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { readTomlFile } from "./tomlreader";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm"]);

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
  dirPath: string;
  sourcePath: string;
}

async function scanMediaDir(dirPath: string, servePath: string): Promise<ScannedMedia | null> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  let tomlFile: string | null = null;
  let bannerImage: string | null = null;
  const videos: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();

    if (ext === ".toml") {
      tomlFile = join(dirPath, entry.name);
    } else if (IMAGE_EXTS.has(ext)) {
      bannerImage = `${servePath}/${entry.name}`;
    } else if (VIDEO_EXTS.has(ext)) {
      videos.push(`${servePath}/${entry.name}`);
    }
  }

  if (!tomlFile) return null;

  const data = await readTomlFile(tomlFile);
  if (!data) return null;

  return {
    ...data,
    bannerImage,
    videos,
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
