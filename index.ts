import index from "./index.html";
import { resolve, join, dirname } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { extname } from "node:path";
import { createHash } from "node:crypto";
import { readTomlFile } from "./scripts/tomlreader";
import { resolveToDb, getCategoriesFromDb, getCategoriesByType, getCategoriesByGenreTag, getTitleFromDb, resolveSourcePath, searchTitles, searchGenres, listAllTitles, getAllGenreNames, getTitlesByMultipleGenres } from "./scripts/autoresolver";
import { copyFile, mkdir } from "node:fs/promises";
import { getOrCreateDefaultProfile, updateProfile, getProfile, getAllProfiles, createProfile, deleteProfile, getGlobalSettings, updateGlobalSettings, getEffectiveDirs } from "./scripts/profile";
import { detectSleepPattern } from "./scripts/sleepdetect";
import { searchTMDB, getTMDBDetails, downloadImage } from "./scripts/tmdb";
import { updateTomlFile } from "./scripts/tomlwriter";
import { createJob, updateJobStatus, getJob, detectIntros } from "./scripts/introdetector";
import { getRecommendations } from "./scripts/recommend";
import db from "./scripts/db";

function getProfileFromReq(req: Request) {
  const id = req.headers.get("x-profile-id");
  if (id) {
    const profile = getProfile(parseInt(id, 10));
    if (profile) return profile;
  }
  return getOrCreateDefaultProfile();
}

const IMAGES_BASE = resolve("./images");
const AVATARS_BASE = resolve("./data/avatars");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

// ── Transcode cache ──
const CACHE_DIR = resolve("./data/cache");
await mkdir(CACHE_DIR, { recursive: true });
const MAX_CACHE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

async function enforceCacheLimit() {
  try {
    const entries = await readdir(CACHE_DIR);
    const files: { path: string; size: number; mtime: number }[] = [];
    let totalSize = 0;
    for (const entry of entries) {
      if (entry.endsWith(".tmp")) continue;
      const filePath = join(CACHE_DIR, entry);
      const s = await stat(filePath);
      if (s.isFile()) {
        files.push({ path: filePath, size: s.size, mtime: s.mtimeMs });
        totalSize += s.size;
      }
    }
    if (totalSize <= MAX_CACHE_SIZE) return;
    // Delete oldest files until under 80% of limit
    const target = MAX_CACHE_SIZE * 0.8;
    files.sort((a, b) => a.mtime - b.mtime);
    const { unlink } = await import("node:fs/promises");
    for (const f of files) {
      if (totalSize <= target) break;
      try {
        await unlink(f.path);
        totalSize -= f.size;
      } catch {}
    }
  } catch {}
}

// Track active transcoding jobs: cacheKey -> { process, bytesWritten, duration, done, error }
const activeTranscodes = new Map<string, {
  process: ReturnType<typeof Bun.spawn>;
  bytesWritten: number;
  duration: number;
  done: boolean;
  error: boolean;
}>();

function getCacheKey(sourcePath: string, audioIndex: number): string {
  const hash = createHash("sha256").update(`${sourcePath}:audio=${audioIndex}`).digest("hex").slice(0, 16);
  const baseName = sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "video";
  return `${baseName}_${hash}`;
}

function getCachePath(cacheKey: string): string {
  return join(CACHE_DIR, `${cacheKey}.mp4`);
}

async function getCacheStatus(sourcePath: string, audioIndex: number): Promise<{
  cached: boolean;
  cacheKey: string;
  cachePath: string;
  transcoding: boolean;
  bytesWritten: number;
  duration: number;
  fileSize: number;
}> {
  const cacheKey = getCacheKey(sourcePath, audioIndex);
  const cachePath = getCachePath(cacheKey);
  const active = activeTranscodes.get(cacheKey);
  const file = Bun.file(cachePath);
  const exists = await file.exists();
  const done = active?.done ?? false;

  return {
    cached: exists && (done || !active),
    cacheKey,
    cachePath,
    transcoding: !!active && !active.done && !active.error,
    bytesWritten: active?.bytesWritten ?? (exists ? file.size : 0),
    duration: active?.duration ?? 0,
    fileSize: exists ? file.size : 0,
  };
}

// Start a background full-file transcode and save to cache
async function startCacheTranscode(sourcePath: string, audioIndex: number): Promise<string> {
  const cacheKey = getCacheKey(sourcePath, audioIndex);
  const cachePath = getCachePath(cacheKey);

  // Already cached or in-progress
  if (activeTranscodes.has(cacheKey)) return cacheKey;
  const file = Bun.file(cachePath);
  if (await file.exists()) return cacheKey;

  // Probe for codec info
  const probe = Bun.spawnSync([
    "ffprobe", "-v", "quiet",
    "-show_entries", "stream=index,codec_name,codec_type,channels",
    "-show_entries", "format=duration",
    "-of", "json",
    sourcePath,
  ]);
  const probeData = JSON.parse(probe.stdout.toString() || "{}");
  const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");
  const videoCodec = videoStream?.codec_name || "";
  const canCopyVideo = ["h264", "h265", "hevc"].includes(videoCodec);
  const audioStreams = probeData.streams?.filter((s: any) => s.codec_type === "audio") || [];
  const selectedAudio = audioStreams[audioIndex] || audioStreams[0];
  const audioCodec = selectedAudio?.codec_name || "";
  const audioChannels = selectedAudio?.channels || 2;
  const canCopyAudio = audioCodec === "aac";
  const audioBitrate = audioChannels > 2 ? "448k" : "256k";
  const duration = parseFloat(probeData.format?.duration || "0");

  // Build audio filter chain for cache transcode
  const cacheAudioFilters: string[] = [];
  if (!canCopyAudio && audioChannels > 2) {
    cacheAudioFilters.push("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE");
  }
  if (!canCopyAudio) {
    cacheAudioFilters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
    cacheAudioFilters.push("aresample=async=1:first_pts=0");
  }

  const tmpPath = cachePath + ".tmp";

  const args = [
    "ffmpeg", "-y",
    "-i", sourcePath,
    "-fflags", "+genpts",
    "-map", "0:v:0",
    ...(selectedAudio ? ["-map", `0:${selectedAudio.index}`] : []),
    ...(canCopyVideo
      ? ["-c:v", "copy"]
      : ["-c:v", "libx264", "-preset", "medium", "-crf", "20"]),
    ...(canCopyAudio
      ? ["-c:a", "copy"]
      : ["-c:a", "aac", "-b:a", audioBitrate,
         "-af", cacheAudioFilters.join(",")]),
    "-avoid_negative_ts", "make_zero",
    "-max_muxing_queue_size", "9999",
    "-movflags", "+faststart",
    "-f", "mp4", tmpPath,
  ];

  const ffmpeg = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
  });

  const job = {
    process: ffmpeg,
    bytesWritten: 0,
    duration,
    done: false,
    error: false,
  };
  activeTranscodes.set(cacheKey, job);

  // Monitor progress by polling tmp file size
  const progressInterval = setInterval(async () => {
    try {
      const tmpFile = Bun.file(tmpPath);
      if (await tmpFile.exists()) {
        job.bytesWritten = tmpFile.size;
      }
    } catch {}
  }, 1000);

  // Drain stderr to prevent pipe blocking
  (async () => {
    try {
      const reader = ffmpeg.stderr.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {}
  })();

  // Wait for completion
  ffmpeg.exited.then(async (code) => {
    clearInterval(progressInterval);
    if (code === 0) {
      // Rename tmp to final
      try {
        const { rename } = await import("node:fs/promises");
        await rename(tmpPath, cachePath);
        job.done = true;
        const finalFile = Bun.file(cachePath);
        job.bytesWritten = finalFile.size;
        // Enforce cache size limit after successful transcode
        enforceCacheLimit();
      } catch {
        job.error = true;
      }
    } else {
      job.error = true;
      // Clean up tmp file
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(tmpPath);
      } catch {}
    }
    // Clean up active transcodes after a short delay (keep status available briefly)
    setTimeout(() => {
      if (job.done || job.error) {
        activeTranscodes.delete(cacheKey);
      }
    }, 5000);
  });

  return cacheKey;
}

// Resolve media into SQLite on startup using profile-stored directories
await resolveToDb();

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/home": index,
    "/tvshows": index,
    "/movies": index,
    "/anime": index,
    "/genre/*": index,
    "/profiles": index,
    "/history": index,
    "/mylist": index,
    "/explore": index,
    "/foryou": index,
    "/stats": index,
    "/api/stream": {
      async GET(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        const startTime = parseFloat(url.searchParams.get("start") || "0") || 0;
        if (!srcParam) {
          return Response.json({ error: "Missing src parameter" }, { status: 400 });
        }
        const sourcePath = resolveSourcePath(srcParam);
        if (!sourcePath) {
          return new Response("Not found", { status: 404 });
        }
        const file = Bun.file(sourcePath);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }

        const audioIndex = parseInt(url.searchParams.get("audio") || "0") || 0;

        // Check if we have a completed cache for this file
        const cache = await getCacheStatus(sourcePath, audioIndex);
        if (cache.cached && !cache.transcoding) {
          // Serve from cache with range request support for instant seeking
          const cachedFile = Bun.file(cache.cachePath);
          const fileSize = cachedFile.size;

          // Start background cache for this file (no-op if already cached)
          // This ensures future plays are also instant
          const probeDuration = await (async () => {
            const p = Bun.spawnSync([
              "ffprobe", "-v", "quiet",
              "-show_entries", "format=duration",
              "-of", "json",
              sourcePath,
            ]);
            return JSON.parse(p.stdout.toString() || "{}").format?.duration || "";
          })();

          const rangeHeader = req.headers.get("range");
          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
              const chunkSize = end - start + 1;
              return new Response(cachedFile.slice(start, end + 1), {
                status: 206,
                headers: {
                  "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                  "Accept-Ranges": "bytes",
                  "Content-Length": String(chunkSize),
                  "Content-Type": "video/mp4",
                  ...(probeDuration ? { "X-Duration": probeDuration } : {}),
                  "X-Cache": "hit",
                },
              });
            }
          }

          return new Response(cachedFile, {
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Length": String(fileSize),
              "Content-Type": "video/mp4",
              ...(probeDuration ? { "X-Duration": probeDuration } : {}),
              "X-Cache": "hit",
            },
          });
        }

        // No cache — live transcode (and start background full-file cache)
        const probe = Bun.spawnSync([
          "ffprobe", "-v", "quiet",
          "-show_entries", "stream=index,codec_name,codec_type,channels",
          "-show_entries", "format=duration",
          "-of", "json",
          sourcePath,
        ]);
        const probeData = JSON.parse(probe.stdout.toString() || "{}");
        const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");
        const videoCodec = videoStream?.codec_name || "";
        const probeDuration = probeData.format?.duration || "";
        const canCopyVideo = ["h264", "h265", "hevc"].includes(videoCodec);

        const audioStreams = probeData.streams?.filter((s: any) => s.codec_type === "audio") || [];
        const selectedAudio = audioStreams[audioIndex] || audioStreams[0];
        const audioCodec = selectedAudio?.codec_name || "";
        const audioChannels = selectedAudio?.channels || 2;
        const canCopyAudio = audioCodec === "aac";
        const audioBitrate = audioChannels > 2 ? "448k" : "256k";

        // Build audio filter chain for live transcode
        const liveAudioFilters: string[] = [];
        if (!canCopyAudio && audioChannels > 2) {
          liveAudioFilters.push("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE");
        }
        if (!canCopyAudio) {
          liveAudioFilters.push("aresample=async=1:first_pts=0");
        }

        // Start background full-file cache transcode (no seek, full file)
        startCacheTranscode(sourcePath, audioIndex).catch(() => {});

        // Hybrid seek: fast-seek to ~30s before target, then accurate-seek the rest
        const seekWindow = 30;
        const preSeek = startTime > 0 ? Math.max(0, startTime - seekWindow) : 0;
        const postSeek = startTime > 0 ? startTime - preSeek : 0;

        // Remux when possible (near-instant), transcode only when needed
        const args = [
          "ffmpeg",
          ...(preSeek > 0 ? ["-ss", String(preSeek)] : []),
          "-i", sourcePath,
          ...(postSeek > 0 ? ["-ss", String(postSeek), "-accurate_seek"] : []),
          "-fflags", "+genpts",
          "-map", "0:v:0",
          ...(selectedAudio ? ["-map", `0:${selectedAudio.index}`] : []),
          ...(canCopyVideo
            ? ["-c:v", "copy"]
            : ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "23"]),
          ...(canCopyAudio
            ? ["-c:a", "copy"]
            : ["-c:a", "aac", "-b:a", audioBitrate,
               "-af", liveAudioFilters.join(",")]),
          "-avoid_negative_ts", "make_zero",
          "-max_muxing_queue_size", "9999",
          "-movflags", "frag_keyframe+empty_moov+faststart",
          "-f", "mp4", "-",
        ];

        const ffmpeg = Bun.spawn(args, {
          stdout: "pipe",
          stderr: "ignore",
        });

        // Kill live transcode FFmpeg when client disconnects
        if (req.signal) {
          req.signal.addEventListener("abort", () => {
            try { ffmpeg.kill(); } catch {}
          });
        }

        const headers: Record<string, string> = {
          "Content-Type": "video/mp4",
          "Transfer-Encoding": "chunked",
          "X-Cache": "miss",
        };
        if (probeDuration) {
          headers["X-Duration"] = probeDuration;
        }

        return new Response(ffmpeg.stdout, { headers });
      },
    },
    "/api/stream/cache/status": {
      async GET(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        if (!srcParam) {
          return Response.json({ error: "Missing src parameter" }, { status: 400 });
        }
        const sourcePath = resolveSourcePath(srcParam);
        if (!sourcePath) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const audioIndex = parseInt(url.searchParams.get("audio") || "0") || 0;
        const status = await getCacheStatus(sourcePath, audioIndex);
        return Response.json({
          cached: status.cached,
          transcoding: status.transcoding,
          bytesWritten: status.bytesWritten,
          duration: status.duration,
          fileSize: status.fileSize,
        });
      },
    },
    "/api/stream/prefetch": {
      async GET(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        if (!srcParam) {
          return Response.json({ error: "Missing src parameter" }, { status: 400 });
        }
        const sourcePath = resolveSourcePath(srcParam);
        if (!sourcePath) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const audioIndex = parseInt(url.searchParams.get("audio") || "0") || 0;
        startCacheTranscode(sourcePath, audioIndex).catch(() => {});
        return Response.json({ prefetching: true });
      },
    },
    "/api/stream/cache/clear": {
      async DELETE(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        if (srcParam) {
          // Clear specific file cache
          const sourcePath = resolveSourcePath(srcParam);
          if (!sourcePath) {
            return Response.json({ error: "Not found" }, { status: 404 });
          }
          const audioIndex = parseInt(url.searchParams.get("audio") || "0") || 0;
          const cacheKey = getCacheKey(sourcePath, audioIndex);
          const cachePath = getCachePath(cacheKey);
          const active = activeTranscodes.get(cacheKey);
          if (active && !active.done) {
            active.process.kill();
          }
          activeTranscodes.delete(cacheKey);
          try {
            const { unlink } = await import("node:fs/promises");
            await unlink(cachePath);
            await unlink(cachePath + ".tmp").catch(() => {});
          } catch {}
          return Response.json({ cleared: true });
        }
        // Clear all cache
        const { readdir: rd, unlink } = await import("node:fs/promises");
        for (const [key, job] of activeTranscodes) {
          if (!job.done) job.process.kill();
        }
        activeTranscodes.clear();
        try {
          const files = await rd(CACHE_DIR);
          for (const f of files) {
            await unlink(join(CACHE_DIR, f)).catch(() => {});
          }
        } catch {}
        return Response.json({ cleared: true });
      },
    },
    "/api/stream/probe": {
      async GET(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        if (!srcParam) {
          return Response.json({ error: "Missing src parameter" }, { status: 400 });
        }
        const sourcePath = resolveSourcePath(srcParam);
        if (!sourcePath) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const probe = Bun.spawnSync([
          "ffprobe", "-v", "quiet",
          "-show_entries", "format=duration",
          "-show_entries", "stream=index,codec_name,codec_type,channels,channel_layout",
          "-show_entries", "stream_tags=language,title",
          "-of", "json",
          sourcePath,
        ]);
        const data = JSON.parse(probe.stdout.toString() || "{}");
        const duration = parseFloat(data.format?.duration || "0");
        const audioTracks = (data.streams || [])
          .filter((s: any) => s.codec_type === "audio")
          .map((s: any) => ({
            index: s.index,
            codec: s.codec_name,
            channels: s.channels || 2,
            channelLayout: s.channel_layout || "",
            language: s.tags?.language || "und",
            title: s.tags?.title || "",
          }));
        return Response.json({ duration, audioTracks });
      },
    },
    "/api/media/resolve": {
      async GET() {
        await resolveToDb();
        const rows = getCategoriesFromDb();
        return Response.json(rows);
      },
    },
    "/api/media/categories": {
      GET() {
        const rows = getCategoriesFromDb();
        return Response.json(rows);
      },
    },
    "/api/media/categories/type": {
      GET(req) {
        const url = new URL(req.url);
        const type = url.searchParams.get("type");
        if (!type) {
          return Response.json({ error: "Missing type parameter" }, { status: 400 });
        }
        const types = type.split(",").map(t => t.trim());
        const rows = getCategoriesByType(types);
        return Response.json(rows);
      },
    },
    "/api/media/categories/genre-tag": {
      GET(req) {
        const url = new URL(req.url);
        const tags = url.searchParams.get("tags");
        if (!tags) {
          return Response.json({ error: "Missing tags parameter" }, { status: 400 });
        }
        const tagList = tags.split(",").map(t => t.trim());
        const rows = getCategoriesByGenreTag(tagList);
        return Response.json(rows);
      },
    },
    "/api/media/search": {
      GET(req) {
        const url = new URL(req.url);
        const q = url.searchParams.get("q")?.trim();
        if (!q || q.length < 1) {
          return Response.json({ titles: [], genres: [] });
        }
        const titles = searchTitles(q);
        const genres = searchGenres(q);
        return Response.json({ titles, genres });
      },
    },
    "/api/media/info": {
      GET(req) {
        const url = new URL(req.url);
        const dirParam = url.searchParams.get("dir");
        if (!dirParam) {
          return Response.json({ error: "Missing dir parameter" }, { status: 400 });
        }
        const title = getTitleFromDb(dirParam);
        if (!title) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({
          name: title.name,
          description: title.description,
          type: title.type,
          bannerImage: title.bannerImage,
          dirPath: title.dirPath,
          genre: title.genres,
          cast: title.castList ? title.castList.split(", ") : [],
          season: title.season,
          episodes: title.episodes,
          videos: title.videos ? JSON.parse(title.videos) : [],
          subtitles: title.subtitles ? JSON.parse(title.subtitles) : [],
        });
      },
    },
    "/api/profile": {
      GET(req) {
        const profile = getProfileFromReq(req);
        return Response.json(profile);
      },
      async PUT(req) {
        try {
          const profile = getProfileFromReq(req);
          const body = await req.json();
          const updated = updateProfile(profile.id, body);

          // Re-scan if directories changed
          if (body.movies_directory !== undefined || body.tvshows_directory !== undefined) {
            await resolveToDb();
          }

          return Response.json(updated);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/profiles": {
      GET() {
        const profiles = getAllProfiles();
        return Response.json(profiles);
      },
      async POST(req) {
        try {
          const body = await req.json();
          const { name } = body;
          if (!name || name.trim().length < 1 || name.trim().length > 25) {
            return Response.json({ error: "Name must be between 1 and 25 characters" }, { status: 400 });
          }
          const profile = createProfile(name.trim());
          return Response.json(profile);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/profiles/delete": {
      async POST(req) {
        try {
          const body = await req.json();
          const { id } = body;
          if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
          const all = getAllProfiles();
          if (all.length <= 1) return Response.json({ error: "Cannot delete the last profile" }, { status: 400 });
          deleteProfile(id);
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/global-settings": {
      GET() {
        const settings = getGlobalSettings();
        return Response.json(settings);
      },
      async PUT(req) {
        try {
          const body = await req.json();
          const updated = updateGlobalSettings(body);

          // Re-scan if directories changed
          if (body.movies_directory !== undefined || body.tvshows_directory !== undefined) {
            await resolveToDb();
          }

          return Response.json(updated);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/playback/progress": {
      GET(req) {
        const url = new URL(req.url);
        const src = url.searchParams.get("src");
        const dir = url.searchParams.get("dir");
        const profile = getProfileFromReq(req);

        if (src) {
          const row = db.query(
            "SELECT video_src, dir_path, playback_progress.current_time AS current_time, duration, updated_at FROM playback_progress WHERE profile_id = ? AND video_src = ?"
          ).get(profile.id, src) as any;
          return Response.json(row || null);
        }

        if (dir) {
          const rows = db.query(
            "SELECT video_src, dir_path, playback_progress.current_time AS current_time, duration, updated_at FROM playback_progress WHERE profile_id = ? AND dir_path = ? ORDER BY updated_at DESC"
          ).all(profile.id, dir) as any[];
          return Response.json(rows);
        }

        // Return most recent playback entries for "continue watching"
        const rows = db.query(
          "SELECT video_src, dir_path, playback_progress.current_time AS current_time, duration, updated_at FROM playback_progress WHERE profile_id = ? AND playback_progress.current_time > 0 AND (duration = 0 OR playback_progress.current_time < duration - 5) ORDER BY updated_at DESC LIMIT 20"
        ).all(profile.id) as any[];
        return Response.json(rows);
      },
      async PUT(req) {
        try {
          const profile = getProfileFromReq(req);
          const body = await req.json();
          const { video_src, dir_path, current_time, duration } = body;
          if (!video_src || current_time == null) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
          }
          db.run(
            `INSERT INTO playback_progress (profile_id, video_src, dir_path, "current_time", duration, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(profile_id, video_src) DO UPDATE SET
               "current_time" = excluded."current_time",
               duration = excluded.duration,
               updated_at = datetime('now')`,
            [profile.id, video_src, dir_path || "", current_time, duration || 0]
          );
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/playback/continue-watching": {
      GET(req) {
        const profile = getProfileFromReq(req);
        const titles = db.query(`
          SELECT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
          FROM playback_progress pp
          JOIN titles t ON t.dir_path = pp.dir_path
          WHERE pp.profile_id = ?
            AND pp.current_time > 0
            AND (pp.duration = 0 OR pp.current_time < pp.duration - 5)
          GROUP BY pp.dir_path
          ORDER BY MAX(pp.updated_at) DESC
          LIMIT 20
        `).all(profile.id) as any[];
        return Response.json({ genre: "Continue Watching", titles });
      },
    },
    "/api/playback/history": {
      GET(req) {
        const profile = getProfileFromReq(req);
        const rows = db.query(`
          SELECT pp.video_src, pp.dir_path, pp.current_time, pp.duration, pp.updated_at,
                 t.name, t.image_path AS imagePath, t.type
          FROM playback_progress pp
          LEFT JOIN titles t ON t.dir_path = pp.dir_path
          WHERE pp.profile_id = ?
          ORDER BY pp.updated_at DESC
          LIMIT 100
        `).all(profile.id) as any[];
        return Response.json(rows);
      },
      async DELETE(req) {
        const profile = getProfileFromReq(req);
        const body = await req.json();
        if (body.clear_all) {
          db.run("DELETE FROM playback_progress WHERE profile_id = ?", [profile.id]);
        } else if (body.video_src) {
          db.run("DELETE FROM playback_progress WHERE profile_id = ? AND video_src = ?", [profile.id, body.video_src]);
        } else {
          return Response.json({ error: "Missing video_src or clear_all" }, { status: 400 });
        }
        return Response.json({ ok: true });
      },
    },
    "/api/watchlist": {
      GET(req) {
        const profile = getProfileFromReq(req);
        const titles = db.query(`
          SELECT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir
          FROM watchlist w
          JOIN titles t ON t.dir_path = w.dir_path
          WHERE w.profile_id = ?
          ORDER BY w.added_at DESC
        `).all(profile.id) as any[];
        return Response.json({ genre: "My List", titles });
      },
      async POST(req) {
        const profile = getProfileFromReq(req);
        const body = await req.json();
        if (!body.dir_path) return Response.json({ error: "Missing dir_path" }, { status: 400 });
        db.run("INSERT OR IGNORE INTO watchlist (profile_id, dir_path) VALUES (?, ?)", [profile.id, body.dir_path]);
        return Response.json({ ok: true });
      },
      async DELETE(req) {
        const profile = getProfileFromReq(req);
        const body = await req.json();
        if (!body.dir_path) return Response.json({ error: "Missing dir_path" }, { status: 400 });
        db.run("DELETE FROM watchlist WHERE profile_id = ? AND dir_path = ?", [profile.id, body.dir_path]);
        return Response.json({ ok: true });
      },
    },
    "/api/watchlist/check": {
      GET(req) {
        const profile = getProfileFromReq(req);
        const url = new URL(req.url);
        const dir = url.searchParams.get("dir");
        if (!dir) return Response.json({ error: "Missing dir" }, { status: 400 });
        const row = db.query("SELECT id FROM watchlist WHERE profile_id = ? AND dir_path = ?").get(profile.id, dir);
        return Response.json({ inList: !!row });
      },
    },
    "/api/subtitles": {
      async GET(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        if (!srcParam) return Response.json({ error: "Missing src parameter" }, { status: 400 });
        const sourcePath = resolveSourcePath(srcParam);
        if (!sourcePath) return new Response("Not found", { status: 404 });
        const file = Bun.file(sourcePath);
        if (!(await file.exists())) return new Response("Not found", { status: 404 });
        let content = await file.text();
        const ext = srcParam.split(".").pop()?.toLowerCase();
        // Convert SRT to WebVTT on-the-fly
        if (ext === "srt") {
          content = "WEBVTT\n\n" + content
            .replace(/\r\n/g, "\n")
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
        }
        return new Response(content, {
          headers: { "Content-Type": "text/vtt; charset=utf-8" },
        });
      },
    },
    "/api/episode/timings": {
      GET(req) {
        const url = new URL(req.url);
        const src = url.searchParams.get("src");
        if (!src) {
          return Response.json({ error: "Missing src parameter" }, { status: 400 });
        }
        const row = db.query(
          "SELECT video_src, intro_start, intro_end, outro_start, outro_end FROM episode_timings WHERE video_src = ?"
        ).get(src) as any;
        return Response.json(row || { video_src: src, intro_start: null, intro_end: null, outro_start: null, outro_end: null });
      },
      async PUT(req) {
        try {
          const body = await req.json();
          const { video_src, intro_start, intro_end, outro_start, outro_end } = body;
          if (!video_src) {
            return Response.json({ error: "Missing video_src" }, { status: 400 });
          }
          db.run(
            `INSERT INTO episode_timings (video_src, intro_start, intro_end, outro_start, outro_end)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(video_src) DO UPDATE SET
               intro_start = excluded.intro_start,
               intro_end = excluded.intro_end,
               outro_start = excluded.outro_start,
               outro_end = excluded.outro_end`,
            [video_src, intro_start ?? null, intro_end ?? null, outro_start ?? null, outro_end ?? null]
          );
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/episode/timings/batch": {
      GET(req) {
        const url = new URL(req.url);
        const dir = url.searchParams.get("dir");
        if (!dir) {
          return Response.json({ error: "Missing dir parameter" }, { status: 400 });
        }
        const rows = db.query(
          "SELECT video_src, intro_start, intro_end, outro_start, outro_end FROM episode_timings WHERE video_src LIKE ?"
        ).all(`${dir}%`) as any[];
        return Response.json(rows);
      },
      DELETE(req) {
        const url = new URL(req.url);
        const dir = url.searchParams.get("dir");
        if (!dir) {
          return Response.json({ error: "Missing dir parameter" }, { status: 400 });
        }
        db.run("DELETE FROM episode_timings WHERE video_src LIKE ?", [`${dir}%`]);
        return Response.json({ ok: true });
      },
    },
    "/api/episode/timings/parse": {
      async POST(req) {
        try {
          const toml = await import("toml");
          const text = await req.text();
          const parsed = toml.parse(text);
          const result: Record<string, { intro_start: number | null; intro_end: number | null; outro_start: number | null; outro_end: number | null }> = {};
          const parseMinSec = (v: unknown): number | null => {
            if (typeof v === "number") return v;
            if (typeof v !== "string") return null;
            const m = v.match(/^(\d+):(\d{1,2})$/);
            if (!m) return null;
            return Number(m[1]) * 60 + Number(m[2]);
          };
          for (const [key, value] of Object.entries(parsed)) {
            if (!/^s\d+e\d+$/i.test(key) || typeof value !== "object" || !value) continue;
            const entry = value as Record<string, unknown>;
            result[key.toLowerCase()] = {
              intro_start: parseMinSec(entry.intro_start),
              intro_end: parseMinSec(entry.intro_end),
              outro_start: parseMinSec(entry.outro_start),
              outro_end: parseMinSec(entry.outro_end),
            };
          }
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/episode/timings/parse-file": {
      async POST(req) {
        try {
          const body = await req.json();
          const filePath = body.path as string;
          if (!filePath) {
            return Response.json({ error: "Missing path" }, { status: 400 });
          }
          const file = Bun.file(filePath);
          if (!(await file.exists())) {
            return Response.json({ error: "File not found" }, { status: 404 });
          }
          const toml = await import("toml");
          const text = await file.text();
          const parsed = toml.parse(text);
          const result: Record<string, { intro_start: number | null; intro_end: number | null; outro_start: number | null; outro_end: number | null }> = {};
          const parseMinSec = (v: unknown): number | null => {
            if (typeof v === "number") return v;
            if (typeof v !== "string") return null;
            const m = v.match(/^(\d+):(\d{1,2})$/);
            if (!m) return null;
            return Number(m[1]) * 60 + Number(m[2]);
          };
          for (const [key, value] of Object.entries(parsed)) {
            if (!/^s\d+e\d+$/i.test(key) || typeof value !== "object" || !value) continue;
            const entry = value as Record<string, unknown>;
            result[key.toLowerCase()] = {
              intro_start: parseMinSec(entry.intro_start),
              intro_end: parseMinSec(entry.intro_end),
              outro_start: parseMinSec(entry.outro_start),
              outro_end: parseMinSec(entry.outro_end),
            };
          }
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/migrator/add": {
      async POST(req) {
        try {
          const body = await req.json();
          const { sourcePath, files: fileList, updateEpisodeCount } = body;

          if (!sourcePath || !fileList?.length) {
            return Response.json({ error: "Missing source path or files" }, { status: 400 });
          }

          // Copy files into the existing title directory
          for (const file of fileList) {
            if (!file.sourcePath) continue;
            const destPath = join(sourcePath, file.newName);
            await copyFile(file.sourcePath, destPath);
          }

          // Update episode count in TOML to match actual video files
          if (updateEpisodeCount) {
            const dirEntries = await readdir(sourcePath);
            const tomlFile = dirEntries.find((f) => f.endsWith(".toml") && f.toLowerCase() !== "timing.toml");
            if (tomlFile) {
              const tomlPath = join(sourcePath, tomlFile);
              let content = await Bun.file(tomlPath).text();
              const VIDEO_EXTS_SET = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".wmv"]);
              const videoCount = dirEntries.filter((f) => VIDEO_EXTS_SET.has(extname(f).toLowerCase())).length;
              if (content.match(/episodes\s*=\s*\d+/)) {
                content = content.replace(/episodes\s*=\s*\d+/, `episodes = ${videoCount}`);
              }
              await Bun.write(tomlPath, content);
            }
          }

          // Re-scan
          await resolveToDb();

          return Response.json({
            message: `Added ${fileList.length} file(s) to ${sourcePath}`,
          });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
    "/api/migrator/create": {
      async POST(req) {
        try {
          const body = await req.json();
          const { mediaType, toml: tomlData, files: fileList } = body;

          if (!tomlData?.name || !fileList?.length) {
            return Response.json({ error: "Missing title name or files" }, { status: 400 });
          }

          // Determine destination directory from profile settings (respects global vs per-profile)
          const profile = getProfileFromReq(req);
          const dirs = getEffectiveDirs(profile.id);
          const baseDir = mediaType === "Movie"
            ? (dirs.movies_directory || resolve("./TestDir/Movies"))
            : (dirs.tvshows_directory || resolve("./TestDir/TV Shows"));

          const folderName = tomlData.name.replace(/\s+/g, "");
          const destDir = join(baseDir, folderName);

          // Create the directory
          await mkdir(destDir, { recursive: true });

          // Build TOML content
          let tomlContent = "[series]\n";
          tomlContent += `name = "${tomlData.name}"\n`;
          tomlContent += `type = "${tomlData.type}"\n`;
          tomlContent += `description = """${tomlData.description}"""\n`;
          tomlContent += `genre = [${tomlData.genre.map((g: string) => `"${g}"`).join(", ")}]\n`;
          tomlContent += `cast = [${(tomlData.cast || []).map((c: string) => `"${c}"`).join(", ")}]\n`;

          if (mediaType === "tv show") {
            tomlContent += `season = ${tomlData.season || 1}\n`;
            tomlContent += `episodes = ${fileList.length}\n`;
          }

          // Add episode names as a map if provided
          if (mediaType === "tv show" && tomlData.episodeNames?.length > 0) {
            const namedEps = tomlData.episodeNames.filter((e: any) => e.name?.trim());
            if (namedEps.length > 0) {
              tomlContent += "\n[series.episode_names]\n";
              for (const ep of namedEps) {
                tomlContent += `${ep.number} = "${ep.name}"\n`;
              }
            }
          }

          // Write TOML file
          const tomlFilename = tomlData.name.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".toml";
          await Bun.write(join(destDir, tomlFilename), tomlContent);

          // Copy and rename files
          for (const file of fileList) {
            if (!file.sourcePath) continue;
            const destPath = join(destDir, file.newName);
            await copyFile(file.sourcePath, destPath);
          }

          // Re-scan media library
          await resolveToDb();

          return Response.json({
            message: `Successfully created "${tomlData.name}" with ${fileList.length} file(s) in ${destDir}`,
            path: destDir,
          });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
    // Recommendations
    "/api/recommendations": {
      GET(req) {
        const profile = getProfileFromReq(req);
        const url = new URL(req.url);
        const limit = parseInt(url.searchParams.get("limit") || "6", 10);
        const recs = getRecommendations(profile.id, Math.min(limit, 20));
        return Response.json(recs);
      },
    },
    "/api/stats": {
      GET(req) {
        const profile = getProfileFromReq(req);
        const pid = profile.id;

        // Total hours watched
        const totalRow = db.prepare(`
          SELECT COALESCE(SUM(current_time), 0) AS total_seconds
          FROM playback_progress WHERE profile_id = ?
        `).get(pid) as { total_seconds: number };
        const totalHours = Math.round((totalRow.total_seconds / 3600) * 10) / 10;

        // Titles completed
        const completedRow = db.prepare(`
          SELECT COUNT(DISTINCT dir_path) AS count
          FROM playback_progress
          WHERE profile_id = ? AND duration > 0 AND current_time >= duration - 5
        `).get(pid) as { count: number };

        // Top genres
        const topGenres = db.prepare(`
          SELECT g.name, COUNT(DISTINCT pp.dir_path) AS count
          FROM playback_progress pp
          JOIN titles t ON t.dir_path = pp.dir_path
          JOIN title_genres tg ON tg.title_id = t.id
          JOIN genres g ON g.id = tg.genre_id
          WHERE pp.profile_id = ?
          GROUP BY g.name
          ORDER BY count DESC
          LIMIT 5
        `).all(pid) as { name: string; count: number }[];

        // Total titles watched (any progress)
        const watchedRow = db.prepare(`
          SELECT COUNT(DISTINCT dir_path) AS count
          FROM playback_progress WHERE profile_id = ?
        `).get(pid) as { count: number };

        // Watch streak (consecutive days with activity)
        const recentDays = db.prepare(`
          SELECT DISTINCT DATE(updated_at) AS day
          FROM playback_progress
          WHERE profile_id = ?
          ORDER BY day DESC
          LIMIT 30
        `).all(pid) as { day: string }[];

        let streak = 0;
        if (recentDays.length > 0) {
          const today = new Date().toISOString().split("T")[0];
          let expected = today;
          for (const row of recentDays) {
            if (row.day === expected || (streak === 0 && row.day <= expected)) {
              streak++;
              const d = new Date(row.day);
              d.setDate(d.getDate() - 1);
              expected = d.toISOString().split("T")[0];
            } else {
              break;
            }
          }
        }

        // Library stats (always available)
        const libraryTitles = db.prepare(`SELECT COUNT(*) AS count FROM titles`).get() as { count: number };
        const libraryMovies = db.prepare(`SELECT COUNT(*) AS count FROM titles WHERE LOWER(type) = 'movie'`).get() as { count: number };
        const libraryShows = db.prepare(`SELECT COUNT(*) AS count FROM titles WHERE LOWER(type) != 'movie'`).get() as { count: number };
        const libraryGenres = db.prepare(`SELECT COUNT(*) AS count FROM genres`).get() as { count: number };

        // All genres with title counts for the library
        const allGenreStats = db.prepare(`
          SELECT g.name, COUNT(DISTINCT tg.title_id) AS count
          FROM genres g
          JOIN title_genres tg ON tg.genre_id = g.id
          GROUP BY g.name
          ORDER BY count DESC
          LIMIT 10
        `).all() as { name: string; count: number }[];

        // Watchlist count
        const watchlistCount = db.prepare(`
          SELECT COUNT(*) AS count FROM watchlist WHERE profile_id = ?
        `).get(pid) as { count: number };

        return Response.json({
          totalHours,
          titlesCompleted: completedRow.count,
          titlesWatched: watchedRow.count,
          topGenres,
          watchStreak: streak,
          library: {
            totalTitles: libraryTitles.count,
            movies: libraryMovies.count,
            shows: libraryShows.count,
            genres: libraryGenres.count,
            genreBreakdown: allGenreStats,
          },
          watchlistCount: watchlistCount.count,
        });
      },
    },
    "/api/media/titles": {
      GET(req) {
        const url = new URL(req.url);
        const type = url.searchParams.get("type");
        const sort = url.searchParams.get("sort") || "name";
        const genre = url.searchParams.get("genre");

        // Anime is a genre tag, not a type in the DB
        const isAnimeFilter = type && type.toLowerCase() === "anime";

        let joins = "";
        const conditions: string[] = [];
        const params: any[] = [];

        if (genre || isAnimeFilter) {
          joins += ` JOIN title_genres tg ON tg.title_id = t.id JOIN genres g ON g.id = tg.genre_id`;
        }
        if (genre) {
          conditions.push("LOWER(g.name) = ?");
          params.push(genre.toLowerCase());
        }
        if (isAnimeFilter) {
          // Match titles tagged with Anime or Animation
          conditions.push("LOWER(g.name) IN ('anime', 'animation')");
        } else if (type) {
          conditions.push("LOWER(t.type) = ?");
          params.push(type.toLowerCase());
        }

        let query = `SELECT DISTINCT t.name, t.image_path AS imagePath, t.dir_path AS pathToDir, t.type, t.created_at FROM titles t${joins}`;
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(" AND ")}`;
        }
        if (sort === "recent") {
          query += ` ORDER BY t.created_at DESC`;
        } else {
          query += ` ORDER BY t.name COLLATE NOCASE`;
        }

        const results = db.prepare(query).all(...params);
        return Response.json(results);
      },
    },
    // Feature 1: Genre exploration
    "/api/genres/all": {
      GET() {
        const genres = getAllGenreNames();
        return Response.json(genres);
      },
    },
    "/api/media/filter": {
      GET(req) {
        const url = new URL(req.url);
        const genresParam = url.searchParams.get("genres");
        if (!genresParam) {
          return Response.json({ error: "Missing genres parameter" }, { status: 400 });
        }
        const genreNames = genresParam.split(",").map(g => g.trim()).filter(Boolean);
        if (genreNames.length === 0) {
          return Response.json([]);
        }
        const titles = getTitlesByMultipleGenres(genreNames);
        return Response.json(titles);
      },
    },
    // Feature 2: Sleep detection
    "/api/playback/sleep-detect": {
      GET(req) {
        const url = new URL(req.url);
        const dir = url.searchParams.get("dir");
        if (!dir) return Response.json({ error: "Missing dir parameter" }, { status: 400 });
        const profile = getProfileFromReq(req);
        const pHeaders: Record<string, string> = { "x-profile-id": String(profile.id) };

        // Get progress entries for this dir
        const entries = db.query(
          "SELECT video_src, current_time, duration, updated_at FROM playback_progress WHERE profile_id = ? AND dir_path = ? ORDER BY updated_at"
        ).all(profile.id, dir) as any[];

        // Get videos for this title
        const title = db.prepare("SELECT videos FROM titles WHERE dir_path = ?").get(dir) as { videos: string | null } | null;
        const videos: string[] = title?.videos ? JSON.parse(title.videos) : [];

        const result = detectSleepPattern(entries, videos);
        return Response.json(result);
      },
    },
    // Feature 3: TMDB integration
    "/api/tmdb/search": {
      async GET(req) {
        const url = new URL(req.url);
        const q = url.searchParams.get("q");
        const type = url.searchParams.get("type") as "movie" | "tv" | null;
        if (!q) return Response.json({ error: "Missing q parameter" }, { status: 400 });
        const settings = getGlobalSettings();
        if (!settings.tmdb_api_key) return Response.json({ error: "TMDB API key not configured" }, { status: 400 });
        try {
          const results = await searchTMDB(q, settings.tmdb_api_key, type || undefined);
          return Response.json(results);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
    "/api/tmdb/details": {
      async GET(req) {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");
        const type = url.searchParams.get("type") as "movie" | "tv" | null;
        if (!id || !type) return Response.json({ error: "Missing id or type parameter" }, { status: 400 });
        const settings = getGlobalSettings();
        if (!settings.tmdb_api_key) return Response.json({ error: "TMDB API key not configured" }, { status: 400 });
        try {
          const details = await getTMDBDetails(parseInt(id, 10), type, settings.tmdb_api_key);
          return Response.json(details);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
    "/api/tmdb/apply": {
      async POST(req) {
        try {
          const body = await req.json();
          const { dirPath, tmdbId, mediaType } = body;
          if (!dirPath || !tmdbId || !mediaType) {
            return Response.json({ error: "Missing dirPath, tmdbId, or mediaType" }, { status: 400 });
          }
          const settings = getGlobalSettings();
          if (!settings.tmdb_api_key) return Response.json({ error: "TMDB API key not configured" }, { status: 400 });

          const details = await getTMDBDetails(tmdbId, mediaType, settings.tmdb_api_key);

          // Resolve the actual source path for the title
          const title = db.prepare("SELECT source_path FROM titles WHERE dir_path = ?").get(dirPath) as { source_path: string } | null;
          if (!title) return Response.json({ error: "Title not found" }, { status: 404 });

          const updates: Record<string, any> = {};
          const name = details.title || details.name;
          if (name) updates.name = name;
          if (details.overview) updates.description = details.overview;
          if (details.genres?.length > 0) {
            updates.genre = details.genres.map(g => g.name);
          }
          if (details.credits?.cast?.length) {
            updates.cast = details.credits.cast
              .sort((a, b) => a.order - b.order)
              .slice(0, 10)
              .map(c => c.name);
          }
          updates.type = mediaType === "movie" ? "Movie" : "TV Show";
          if (mediaType === "tv" && details.number_of_seasons) {
            updates.season = details.number_of_seasons;
          }
          if (mediaType === "tv" && details.number_of_episodes) {
            updates.episodes = details.number_of_episodes;
          }

          await updateTomlFile(title.source_path, updates);

          // Download poster if available
          if (details.poster_path) {
            try {
              await downloadImage(details.poster_path, title.source_path, "poster");
            } catch {
              // Non-fatal if image download fails
            }
          }

          // Re-resolve library
          await resolveToDb();

          return Response.json({ ok: true, name });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
    // Feature 4: Auto intro/outro detection
    "/api/detect/intros": {
      async POST(req) {
        try {
          const body = await req.json();
          const { dirPath } = body;
          if (!dirPath) return Response.json({ error: "Missing dirPath" }, { status: 400 });
          const jobId = createJob("intro_detection", dirPath);
          // Run detection async (don't await)
          detectIntros(dirPath, jobId);
          return Response.json({ jobId });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
    "/api/detect/status": {
      GET(req) {
        const url = new URL(req.url);
        const jobId = url.searchParams.get("jobId");
        if (!jobId) return Response.json({ error: "Missing jobId" }, { status: 400 });
        const job = getJob(parseInt(jobId, 10));
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
        return Response.json(job);
      },
    },
    "/api/browse": {
      async GET(req) {
        const url = new URL(req.url);
        const dir = url.searchParams.get("path") || "/";
        const mode = url.searchParams.get("mode") || "directories";
        const resolved = resolve(dir);
        try {
          const entries = await readdir(resolved, { withFileTypes: true });
          const dirs = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith("."))
            .map((e) => ({
              name: e.name,
              path: join(resolved, e.name),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

          let files: { name: string; path: string }[] = [];
          if (mode === "images") {
            files = entries
              .filter((e) => e.isFile() && IMAGE_EXTS.has(extname(e.name).toLowerCase()))
              .map((e) => ({
                name: e.name,
                path: join(resolved, e.name),
              }))
              .sort((a, b) => a.name.localeCompare(b.name));
          } else if (mode === "all") {
            files = entries
              .filter((e) => e.isFile() && !e.name.startsWith("."))
              .map((e) => ({
                name: e.name,
                path: join(resolved, e.name),
              }))
              .sort((a, b) => a.name.localeCompare(b.name));
          } else if (mode === "toml") {
            files = entries
              .filter((e) => e.isFile() && extname(e.name).toLowerCase() === ".toml")
              .map((e) => ({
                name: e.name,
                path: join(resolved, e.name),
              }))
              .sort((a, b) => a.name.localeCompare(b.name));
          }

          return Response.json({
            current: resolved,
            parent: dirname(resolved) !== resolved ? dirname(resolved) : null,
            directories: dirs,
            files,
          });
        } catch {
          return Response.json({ error: "Cannot read directory" }, { status: 400 });
        }
      },
    },
    "/api/profile/avatar": {
      async POST(req) {
        try {
          const formData = await req.formData();
          const file = formData.get("avatar") as File | null;
          if (!file) {
            return Response.json({ error: "No file provided" }, { status: 400 });
          }
          const ext = extname(file.name).toLowerCase();
          if (!IMAGE_EXTS.has(ext)) {
            return Response.json({ error: "Invalid image format" }, { status: 400 });
          }
          const filename = `avatar_${Date.now()}${ext}`;
          const savePath = join(AVATARS_BASE, filename);
          await Bun.write(savePath, file);

          const profile = getProfileFromReq(req);
          const updated = updateProfile(profile.id, { image_path: `/avatars/${filename}` });
          return Response.json(updated);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/profile/avatar/browse": {
      async POST(req) {
        try {
          const body = await req.json();
          const filePath = body.path as string;
          if (!filePath) {
            return Response.json({ error: "No path provided" }, { status: 400 });
          }
          const ext = extname(filePath).toLowerCase();
          if (!IMAGE_EXTS.has(ext)) {
            return Response.json({ error: "Invalid image format" }, { status: 400 });
          }
          const sourceFile = Bun.file(filePath);
          if (!(await sourceFile.exists())) {
            return Response.json({ error: "File not found" }, { status: 404 });
          }
          // Copy to avatars directory
          const filename = `avatar_${Date.now()}${ext}`;
          const savePath = join(AVATARS_BASE, filename);
          await Bun.write(savePath, sourceFile);

          const profile = getProfileFromReq(req);
          const updated = updateProfile(profile.id, { image_path: `/avatars/${filename}` });
          return Response.json(updated);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/avatars/*": {
      async GET(req) {
        const url = new URL(req.url);
        const avatarPath = decodeURIComponent(url.pathname.replace("/avatars/", ""));
        const filePath = join(AVATARS_BASE, avatarPath);
        const resolved = resolve(filePath);
        if (!resolved.startsWith(AVATARS_BASE)) {
          return new Response("Forbidden", { status: 403 });
        }
        const file = Bun.file(resolved);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }
        const etag = `"${file.lastModified}-${file.size}"`;
        if (req.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304 });
        }
        return new Response(file, {
          headers: {
            "Cache-Control": "public, max-age=86400",
            "ETag": etag,
          },
        });
      },
    },
    "/images/*": {
      async GET(req) {
        const url = new URL(req.url);
        const imgPath = decodeURIComponent(url.pathname.replace("/images/", ""));
        const filePath = join(IMAGES_BASE, imgPath);
        const resolved = resolve(filePath);
        if (!resolved.startsWith(IMAGES_BASE)) {
          return new Response("Forbidden", { status: 403 });
        }
        const file = Bun.file(resolved);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }
        const etag = `"${file.lastModified}-${file.size}"`;
        if (req.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304 });
        }
        return new Response(file, {
          headers: {
            "Cache-Control": "public, max-age=86400",
            "ETag": etag,
          },
        });
      },
    },
    "/media/*": {
      async GET(req) {
        const url = new URL(req.url);
        const servePath = decodeURIComponent(url.pathname);
        const sourcePath = resolveSourcePath(servePath);
        if (!sourcePath) {
          return new Response("Not found", { status: 404 });
        }
        const file = Bun.file(sourcePath);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }
        const fileSize = file.size;
        const fileExt = extname(sourcePath).toLowerCase();
        const isImage = IMAGE_EXTS.has(fileExt);

        // Cache headers for image files (posters, thumbnails)
        if (isImage) {
          const etag = `"${file.lastModified}-${file.size}"`;
          if (req.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304 });
          }
          return new Response(file, {
            headers: {
              "Cache-Control": "public, max-age=86400",
              "ETag": etag,
            },
          });
        }

        const rangeHeader = req.headers.get("range");

        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            const slice = file.slice(start, end + 1);
            return new Response(slice, {
              status: 206,
              headers: {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": String(chunkSize),
                "Content-Type": file.type || "application/octet-stream",
              },
            });
          }
        }

        return new Response(file, {
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Length": String(fileSize),
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});
