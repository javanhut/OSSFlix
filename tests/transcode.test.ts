import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import {
  buildCacheTranscodeArgs,
  buildLiveTranscodeArgs,
  selectAudioStream,
  selectVideoStream,
  type ProbeStream,
  type SelectedAudioStream,
  type SelectedVideoStream,
} from "../scripts/streamingProfile";

// ── Test the real transcode arg builders from scripts/streamingProfile.ts ──

const CACHE_DIR = resolve("./data/cache");

function getCacheKey(sourcePath: string, audioIndex: number): string {
  const hash = createHash("sha256").update(`${sourcePath}:audio=${audioIndex}`).digest("hex").slice(0, 16);
  const baseName =
    sourcePath
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") || "video";
  return `${baseName}_${hash}`;
}

function getCachePath(cacheKey: string): string {
  return join(CACHE_DIR, `${cacheKey}.mp4`);
}

const STEREO_AAC: SelectedAudioStream = { index: 1, channels: 2, codecName: "aac" };
const SURROUND_AC3: SelectedAudioStream = { index: 1, channels: 6, codecName: "ac3" };
const H264_VIDEO: SelectedVideoStream = { index: 0, codecName: "h264", pixFmt: "yuv420p" };
const HEVC_VIDEO: SelectedVideoStream = { index: 0, codecName: "hevc", pixFmt: "yuv420p10le" };

// Find the `-af` filter chain in an arg list (the value immediately after "-af")
function audioFilter(args: string[]): string | null {
  const i = args.indexOf("-af");
  return i >= 0 ? args[i + 1] : null;
}

// Extract the codec value following a "-c:v"/"-c:a" flag
function codec(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

describe("Cache key generation", () => {
  test("produces deterministic keys", () => {
    expect(getCacheKey("/media/movies/test.mkv", 0)).toBe(getCacheKey("/media/movies/test.mkv", 0));
  });

  test("different audio indices produce different keys", () => {
    expect(getCacheKey("/media/movies/test.mkv", 0)).not.toBe(getCacheKey("/media/movies/test.mkv", 1));
  });

  test("different files produce different keys", () => {
    expect(getCacheKey("/media/movies/movie1.mkv", 0)).not.toBe(getCacheKey("/media/movies/movie2.mkv", 0));
  });

  test("extracts base name from path", () => {
    expect(getCacheKey("/media/movies/my_cool_movie.mkv", 0).startsWith("my_cool_movie_")).toBe(true);
  });

  test("cache path ends with .mp4", () => {
    const path = getCachePath(getCacheKey("/media/movies/test.mkv", 0));
    expect(path.endsWith(".mp4")).toBe(true);
    expect(path).toContain("data/cache/");
  });
});

describe("selectAudioStream / selectVideoStream", () => {
  const streams: ProbeStream[] = [
    { index: 0, codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" },
    { index: 1, codec_type: "audio", codec_name: "aac", channels: 2 },
    { index: 2, codec_type: "audio", codec_name: "ac3", channels: 6 },
  ];

  test("selects the requested audio stream by ordinal", () => {
    expect(selectAudioStream(streams, 0)?.index).toBe(1);
    expect(selectAudioStream(streams, 1)?.index).toBe(2);
  });

  test("falls back to the first audio stream for an out-of-range index", () => {
    expect(selectAudioStream(streams, 99)?.index).toBe(1);
  });

  test("returns null when there is no audio", () => {
    expect(selectAudioStream([streams[0]], 0)).toBeNull();
  });

  test("selects the video stream", () => {
    expect(selectVideoStream(streams)?.codecName).toBe("h264");
  });
});

describe("Cache transcode args", () => {
  test("re-encodes video as constant frame rate", () => {
    const args = buildCacheTranscodeArgs("/m/test.mkv", STEREO_AAC, "/out.mp4");
    expect(codec(args, "-c:v")).toBe("libx264");
    const vs = args.indexOf("-vsync");
    expect(vs).toBeGreaterThan(-1);
    expect(args[vs + 1]).toBe("cfr");
  });

  test("uses ongoing drift correction and no first_pts pinning", () => {
    const af = audioFilter(buildCacheTranscodeArgs("/m/test.mkv", SURROUND_AC3, "/out.mp4"));
    expect(af).toContain("aresample=async=1000");
    expect(af).not.toContain("first_pts=0");
  });

  test("surround source is downmixed and loudness-normalized", () => {
    const af = audioFilter(buildCacheTranscodeArgs("/m/test.mkv", SURROUND_AC3, "/out.mp4"));
    expect(af).toContain("pan=stereo");
    expect(af).toContain("loudnorm");
  });

  test("omits audio mapping when there is no audio", () => {
    const args = buildCacheTranscodeArgs("/m/test.mkv", null, "/out.mp4");
    expect(args).not.toContain("-c:a");
  });
});

describe("Live transcode args", () => {
  test("copies both streams only when video AND audio are copyable", () => {
    const args = buildLiveTranscodeArgs("/m/test.mkv", STEREO_AAC, H264_VIDEO, 0);
    expect(codec(args, "-c:v")).toBe("copy");
    expect(codec(args, "-c:a")).toBe("copy");
  });

  test("re-encodes BOTH streams when only the audio needs work (no mixed copy)", () => {
    // h264/yuv420p video would be copyable, but ac3 surround audio is not.
    // Mixing copy-video with re-encoded-audio caused fixed lip-sync offsets,
    // so the video must be re-encoded too.
    const args = buildLiveTranscodeArgs("/m/test.mkv", SURROUND_AC3, H264_VIDEO, 0);
    expect(codec(args, "-c:v")).toBe("libx264");
    expect(codec(args, "-c:a")).toBe("aac");
  });

  test("re-encodes BOTH streams when only the video needs work", () => {
    // aac stereo audio is copyable, but hevc video is not.
    const args = buildLiveTranscodeArgs("/m/test.mkv", STEREO_AAC, HEVC_VIDEO, 0);
    expect(codec(args, "-c:v")).toBe("libx264");
    expect(codec(args, "-c:a")).toBe("aac");
  });

  test("re-encoded video is forced to constant frame rate", () => {
    const args = buildLiveTranscodeArgs("/m/test.mkv", SURROUND_AC3, HEVC_VIDEO, 0);
    const vs = args.indexOf("-vsync");
    expect(vs).toBeGreaterThan(-1);
    expect(args[vs + 1]).toBe("cfr");
  });

  test("a seek forces re-encode even for an otherwise-copyable file", () => {
    const args = buildLiveTranscodeArgs("/m/test.mkv", STEREO_AAC, H264_VIDEO, 120);
    expect(codec(args, "-c:v")).toBe("libx264");
    expect(codec(args, "-c:a")).toBe("aac");
    expect(args).toContain("-ss");
  });

  test("remote sources always re-encode (never copy)", () => {
    const args = buildLiveTranscodeArgs("kaidadb:abc", STEREO_AAC, H264_VIDEO, 0, true);
    expect(codec(args, "-c:v")).toBe("libx264");
  });

  test("re-encoded audio uses ongoing drift correction, no first_pts pinning", () => {
    const af = audioFilter(buildLiveTranscodeArgs("/m/test.mkv", SURROUND_AC3, HEVC_VIDEO, 0));
    expect(af).toContain("aresample=async=1000");
    expect(af).not.toContain("first_pts=0");
  });

  test("live audio filter has no loudnorm (deferred to cache for low latency)", () => {
    const af = audioFilter(buildLiveTranscodeArgs("/m/test.mkv", SURROUND_AC3, HEVC_VIDEO, 0));
    expect(af).not.toContain("loudnorm");
  });
});
