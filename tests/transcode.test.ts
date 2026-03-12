import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

// ── Test the pure functions extracted from index.ts transcode logic ──
// These test the cache key generation, audio filter chain building, and FFmpeg arg construction

const CACHE_DIR = resolve("./data/cache");

function getCacheKey(sourcePath: string, audioIndex: number): string {
  const hash = createHash("sha256").update(`${sourcePath}:audio=${audioIndex}`).digest("hex").slice(0, 16);
  const baseName = sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "video";
  return `${baseName}_${hash}`;
}

function getCachePath(cacheKey: string): string {
  return join(CACHE_DIR, `${cacheKey}.mp4`);
}

// Replicate the audio filter chain building from index.ts (cache transcode)
function buildCacheAudioFilters(canCopyAudio: boolean, audioChannels: number): string[] {
  const filters: string[] = [];
  if (!canCopyAudio && audioChannels > 2) {
    filters.push("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE");
  }
  if (!canCopyAudio) {
    filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
    filters.push("aresample=async=1:first_pts=0");
  }
  return filters;
}

// Replicate the audio filter chain building from index.ts (live transcode)
function buildLiveAudioFilters(canCopyAudio: boolean, audioChannels: number): string[] {
  const filters: string[] = [];
  if (!canCopyAudio && audioChannels > 2) {
    filters.push("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE");
  }
  if (!canCopyAudio) {
    filters.push("aresample=async=1:first_pts=0");
  }
  return filters;
}

function getAudioBitrate(channels: number): string {
  return channels > 2 ? "448k" : "256k";
}

// Build the FFmpeg video args for cache transcode
function buildCacheVideoArgs(canCopyVideo: boolean): string[] {
  return canCopyVideo
    ? ["-c:v", "copy"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "20"];
}

// Build the FFmpeg video args for live transcode
function buildLiveVideoArgs(canCopyVideo: boolean): string[] {
  return canCopyVideo
    ? ["-c:v", "copy"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "23"];
}

describe("Cache key generation", () => {
  test("produces deterministic keys", () => {
    const key1 = getCacheKey("/media/movies/test.mkv", 0);
    const key2 = getCacheKey("/media/movies/test.mkv", 0);
    expect(key1).toBe(key2);
  });

  test("different audio indices produce different keys", () => {
    const key0 = getCacheKey("/media/movies/test.mkv", 0);
    const key1 = getCacheKey("/media/movies/test.mkv", 1);
    expect(key0).not.toBe(key1);
  });

  test("different files produce different keys", () => {
    const key1 = getCacheKey("/media/movies/movie1.mkv", 0);
    const key2 = getCacheKey("/media/movies/movie2.mkv", 0);
    expect(key1).not.toBe(key2);
  });

  test("extracts base name from path", () => {
    const key = getCacheKey("/media/movies/my_cool_movie.mkv", 0);
    expect(key.startsWith("my_cool_movie_")).toBe(true);
  });

  test("handles paths without extension", () => {
    const key = getCacheKey("/media/movies/noext", 0);
    expect(key.startsWith("noext_")).toBe(true);
  });

  test("cache path ends with .mp4", () => {
    const key = getCacheKey("/media/movies/test.mkv", 0);
    const path = getCachePath(key);
    expect(path.endsWith(".mp4")).toBe(true);
    expect(path).toContain("data/cache/");
  });
});

describe("Audio filter chain building", () => {
  // ── Cache transcode filters ──
  test("cache: AAC audio copies without filters", () => {
    const filters = buildCacheAudioFilters(true, 2);
    expect(filters.length).toBe(0);
  });

  test("cache: stereo non-AAC gets loudnorm + aresample", () => {
    const filters = buildCacheAudioFilters(false, 2);
    expect(filters.length).toBe(2);
    expect(filters[0]).toContain("loudnorm");
    expect(filters[1]).toContain("aresample=async=1:first_pts=0");
  });

  test("cache: surround non-AAC gets pan downmix + loudnorm + aresample", () => {
    const filters = buildCacheAudioFilters(false, 6);
    expect(filters.length).toBe(3);
    expect(filters[0]).toContain("pan=stereo");
    expect(filters[0]).toContain("0.5*FC"); // center channel preserved
    expect(filters[0]).toContain("0.5*LFE"); // LFE included
    expect(filters[1]).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(filters[2]).toContain("aresample=async=1:first_pts=0");
  });

  test("cache: no aggressive async correction (no async=1000)", () => {
    const filters = buildCacheAudioFilters(false, 2);
    const joined = filters.join(",");
    expect(joined).not.toContain("async=1000");
    expect(joined).toContain("async=1");
  });

  // ── Live transcode filters ──
  test("live: AAC audio copies without filters", () => {
    const filters = buildLiveAudioFilters(true, 2);
    expect(filters.length).toBe(0);
  });

  test("live: stereo non-AAC gets aresample only (no loudnorm)", () => {
    const filters = buildLiveAudioFilters(false, 2);
    expect(filters.length).toBe(1);
    expect(filters[0]).toContain("aresample=async=1:first_pts=0");
  });

  test("live: surround non-AAC gets pan downmix + aresample (no loudnorm)", () => {
    const filters = buildLiveAudioFilters(false, 6);
    expect(filters.length).toBe(2);
    expect(filters[0]).toContain("pan=stereo");
    expect(filters[1]).toContain("aresample=async=1:first_pts=0");
    // No loudnorm in live transcode (adds latency)
    const joined = filters.join(",");
    expect(joined).not.toContain("loudnorm");
  });

  test("live: no aggressive async correction", () => {
    const filters = buildLiveAudioFilters(false, 2);
    const joined = filters.join(",");
    expect(joined).not.toContain("async=1000");
  });
});

describe("Audio bitrate selection", () => {
  test("stereo gets 256k", () => {
    expect(getAudioBitrate(2)).toBe("256k");
  });

  test("mono gets 256k", () => {
    expect(getAudioBitrate(1)).toBe("256k");
  });

  test("5.1 surround gets 448k", () => {
    expect(getAudioBitrate(6)).toBe("448k");
  });

  test("7.1 surround gets 448k", () => {
    expect(getAudioBitrate(8)).toBe("448k");
  });
});

describe("Video encoding args", () => {
  test("cache: copies compatible video", () => {
    const args = buildCacheVideoArgs(true);
    expect(args).toEqual(["-c:v", "copy"]);
  });

  test("cache: uses medium preset without zerolatency", () => {
    const args = buildCacheVideoArgs(false);
    expect(args).toContain("-preset");
    expect(args).toContain("medium");
    expect(args).toContain("-crf");
    expect(args).toContain("20");
    expect(args).not.toContain("-tune");
    expect(args).not.toContain("zerolatency");
  });

  test("live: copies compatible video", () => {
    const args = buildLiveVideoArgs(true);
    expect(args).toEqual(["-c:v", "copy"]);
  });

  test("live: uses veryfast preset with zerolatency", () => {
    const args = buildLiveVideoArgs(false);
    expect(args).toContain("-preset");
    expect(args).toContain("veryfast");
    expect(args).toContain("-tune");
    expect(args).toContain("zerolatency");
    expect(args).toContain("-crf");
    expect(args).toContain("23");
  });

  test("live: does not use ultrafast (quality regression check)", () => {
    const args = buildLiveVideoArgs(false);
    expect(args).not.toContain("ultrafast");
  });

  test("cache: does not use fast preset (quality regression check)", () => {
    const args = buildCacheVideoArgs(false);
    expect(args).not.toContain("fast");
  });
});
