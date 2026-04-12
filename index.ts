import index from "./index.html";
import { resolve, join, dirname, extname, basename } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readTomlFile } from "./scripts/tomlreader";
import { resolveToDb, getCategoriesFromDb, getCategoriesByType, getCategoriesByGenreTag, getTitleFromDb, resolveSourcePath, searchTitles, searchGenres, listAllTitles, getAllGenreNames, getTitlesByMultipleGenres } from "./scripts/autoresolver";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { getOrCreateDefaultProfile, updateProfile, getProfile, getAllProfiles, createProfile, deleteProfile, getGlobalSettings, updateGlobalSettings, getEffectiveDirs, getProfileWithHash, setProfilePassword, profileHasPassword } from "./scripts/profile";
import { detectSleepPattern } from "./scripts/sleepdetect";
import { searchTMDB, getTMDBDetails, downloadImage } from "./scripts/tmdb";
import { updateTomlFile } from "./scripts/tomlwriter";
import { createJob, updateJobStatus, getJob, detectIntros } from "./scripts/introdetector";
import { getRecommendations } from "./scripts/recommend";
import db, { DATA_DIR } from "./scripts/db";
import { authenticateRequest, hashPassword, verifyPassword, createSession, deleteSession, deleteAllSessionsForProfile, cleanExpiredSessions, sessionCookie, clearSessionCookie } from "./scripts/auth";
import { kaidadbHealthCheck, kaidadbStream, kaidadbUpload, getKaidadbKey, setKaidadbMapping, getKaidadbStatus, videoSrcToKaidadbKey, kaidadbMediaUrl } from "./scripts/kaidadb";
import type { ProfileData } from "./scripts/profile";
import { buildCacheTranscodeArgs, buildLiveTranscodeArgs, selectAudioStream, selectVideoStream, type SelectedAudioStream, type SelectedVideoStream } from "./scripts/streamingProfile";

function getProfileFromReq(req: Request): ProfileData {
  // Try session-based auth first
  const auth = authenticateRequest(req);
  if (auth) return auth.profile;
  // Fallback to header-based auth for backward compatibility during migration
  const id = req.headers.get("x-profile-id");
  if (id) {
    const profile = getProfile(parseInt(id, 10));
    if (profile) return profile;
  }
  return getOrCreateDefaultProfile();
}

function requireAuth(handler: (req: Request, profile: ProfileData) => Response | Promise<Response>) {
  return async (req: Request) => {
    const auth = authenticateRequest(req);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(req, auth.profile);
  };
}

// Hourly session cleanup
setInterval(() => cleanExpiredSessions(), 3600_000);

// Graceful shutdown — flush WAL to main database file
function gracefulShutdown(signal: string) {
  console.log(`[ossflix] received ${signal}, checkpointing database...`);
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (e) {
    console.error("[ossflix] WAL checkpoint failed:", e);
  }
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const IMAGES_BASE = resolve("./images");
const AVATARS_BASE = join(DATA_DIR, "avatars");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

// ── Transcode cache ──
const CACHE_DIR = join(DATA_DIR, "cache");
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

const MAX_CONCURRENT_CACHE_JOBS = 1;
const CACHE_PREWARM_DELAY_MS = 8_000;
const WEB_SAFE_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const CACHE_QUEUE_POLL_MS = 2_000;
const CACHE_RETRY_DELAY_MS = 20_000;
const MAX_CACHE_JOB_RETRIES = 2;

type PendingCacheJob = {
  sourcePath: string;
  audioIndex: number;
  reason: string;
  timer: ReturnType<typeof setTimeout>;
  readyAt: number;
};

const pendingCacheJobs = new Map<string, PendingCacheJob>();
const cacheRetryCounts = new Map<string, number>();
const activeLiveStreams = new Map<string, number>();

function getCacheKey(sourcePath: string, audioIndex: number): string {
  const hash = createHash("sha256").update(`${sourcePath}:audio=${audioIndex}`).digest("hex").slice(0, 16);
  const baseName = sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "video";
  return `${baseName}_${hash}`;
}

function getCachePath(cacheKey: string): string {
  return join(CACHE_DIR, `${cacheKey}.mp4`);
}

function getLiveStreamKey(sourcePath: string, audioIndex: number): string {
  return `${sourcePath}:audio=${audioIndex}`;
}

function registerLiveStream(sourcePath: string, audioIndex: number): void {
  const key = getLiveStreamKey(sourcePath, audioIndex);
  activeLiveStreams.set(key, (activeLiveStreams.get(key) ?? 0) + 1);
}

function unregisterLiveStream(sourcePath: string, audioIndex: number): void {
  const key = getLiveStreamKey(sourcePath, audioIndex);
  const current = activeLiveStreams.get(key) ?? 0;
  if (current <= 1) {
    activeLiveStreams.delete(key);
    return;
  }
  activeLiveStreams.set(key, current - 1);
}

function getActiveCacheTranscodeCount(): number {
  let count = 0;
  for (const job of activeTranscodes.values()) {
    if (!job.done && !job.error) count += 1;
  }
  return count;
}

function clearPendingCacheJob(cacheKey: string): void {
  const pending = pendingCacheJobs.get(cacheKey);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingCacheJobs.delete(cacheKey);
}

function scheduleCacheRetry(sourcePath: string, audioIndex: number, cacheKey: string, reason: string): void {
  const attempts = cacheRetryCounts.get(cacheKey) ?? 0;
  if (attempts >= MAX_CACHE_JOB_RETRIES) {
    cacheRetryCounts.delete(cacheKey);
    console.error(`[stream] cache transcode retries exhausted for ${basename(sourcePath)} (audio=${audioIndex}, reason=${reason})`);
    return;
  }
  cacheRetryCounts.set(cacheKey, attempts + 1);
  const retryReason = reason.startsWith("prefetch")
    ? `prefetch-retry-${attempts + 1}`
    : `retry-${attempts + 1}`;
  queueCacheTranscode(sourcePath, audioIndex, CACHE_RETRY_DELAY_MS, retryReason);
}

function queueCacheTranscode(
  sourcePath: string,
  audioIndex: number,
  delayMs = CACHE_PREWARM_DELAY_MS,
  reason = "stream"
): string {
  const cacheKey = getCacheKey(sourcePath, audioIndex);
  if (activeTranscodes.has(cacheKey)) return cacheKey;

  const existing = pendingCacheJobs.get(cacheKey);
  if (existing) {
    const remaining = Math.max(0, existing.readyAt - Date.now());
    if (remaining <= delayMs) return cacheKey;
    clearPendingCacheJob(cacheKey);
  }

  const runQueuedJob = async () => {
    const queued = pendingCacheJobs.get(cacheKey);
    if (!queued) return;

    const liveStreams = activeLiveStreams.size;
    const cacheBusy = getActiveCacheTranscodeCount() >= MAX_CONCURRENT_CACHE_JOBS;
    const allowDuringPlayback = queued.reason.startsWith("prefetch");
    const sameSourceLive = activeLiveStreams.has(getLiveStreamKey(queued.sourcePath, queued.audioIndex));
    const shouldDeferForPlayback = (!allowDuringPlayback && liveStreams > 0) || (allowDuringPlayback && (liveStreams > 1 || sameSourceLive));

    if (cacheBusy || shouldDeferForPlayback) {
      queued.readyAt = Date.now() + CACHE_QUEUE_POLL_MS;
      queued.timer = setTimeout(() => { void runQueuedJob(); }, CACHE_QUEUE_POLL_MS);
      return;
    }

    pendingCacheJobs.delete(cacheKey);

    try {
      await startCacheTranscode(sourcePath, audioIndex);
      cacheRetryCounts.delete(cacheKey);
    } catch (err) {
      console.error(`[stream] queued cache start failed for ${basename(sourcePath)} (audio=${audioIndex}, reason=${reason}): ${String(err)}`);
      scheduleCacheRetry(sourcePath, audioIndex, cacheKey, "start-failed");
    }
  };

  const entry: PendingCacheJob = {
    sourcePath,
    audioIndex,
    reason,
    timer: setTimeout(() => { void runQueuedJob(); }, delayMs),
    readyAt: Date.now() + delayMs,
  };
  pendingCacheJobs.set(cacheKey, entry);
  return cacheKey;
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

type FfprobeResult =
  | { ok: true; data: any }
  | { ok: false; error: string };

function parseJsonSafe(raw: string): any | null {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

function runFfprobe(sourcePath: string, showEntries: string[]): FfprobeResult {
  const args = ["ffprobe", "-v", "quiet"] as string[];
  for (const entry of showEntries) {
    args.push("-show_entries", entry);
  }
  args.push("-of", "json", sourcePath);

  const probe = Bun.spawnSync(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (probe.exitCode !== 0) {
    const stderrText = probe.stderr.toString().trim();
    console.error(`[stream] ffprobe failed for ${basename(sourcePath)}: ${stderrText || `exit code ${probe.exitCode}`}`);
    return { ok: false, error: "Unable to inspect media file" };
  }

  const parsed = parseJsonSafe(probe.stdout.toString());
  if (!parsed) {
    console.error(`[stream] ffprobe returned invalid JSON for ${basename(sourcePath)}`);
    return { ok: false, error: "Unable to inspect media file" };
  }

  return { ok: true, data: parsed };
}

function drainFfmpegStderr(process: ReturnType<typeof Bun.spawn>, maxChars = 4000): () => string {
  let stderrTail = "";
  const decoder = new TextDecoder();

  (async () => {
    try {
      const reader = process.stderr?.getReader();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          stderrTail += decoder.decode(value, { stream: true });
          if (stderrTail.length > maxChars) {
            stderrTail = stderrTail.slice(-maxChars);
          }
        }
      }
      stderrTail += decoder.decode();
      if (stderrTail.length > maxChars) {
        stderrTail = stderrTail.slice(-maxChars);
      }
    } catch {}
  })();

  return () => stderrTail.trim();
}

// Start a background full-file transcode and save to cache
async function startCacheTranscode(sourcePath: string, audioIndex: number): Promise<string> {
  const cacheKey = getCacheKey(sourcePath, audioIndex);
  const cachePath = getCachePath(cacheKey);
  clearPendingCacheJob(cacheKey);

  // Already cached or in-progress
  if (activeTranscodes.has(cacheKey)) return cacheKey;
  const file = Bun.file(cachePath);
  if (await file.exists()) return cacheKey;

  const probe = runFfprobe(sourcePath, [
    "stream=index,codec_type,channels",
    "format=duration",
  ]);
  if (!probe.ok) {
    throw new Error(probe.error);
  }
  const selectedAudio = selectAudioStream(probe.data.streams || [], audioIndex);
  const duration = parseFloat(probe.data.format?.duration || "0");

  const tmpPath = cachePath + ".tmp";
  const args = buildCacheTranscodeArgs(sourcePath, selectedAudio, tmpPath);

  const ffmpeg = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
  });
  const getStderrTail = drainFfmpegStderr(ffmpeg);

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
        console.error(`[stream] cache finalize failed for ${basename(sourcePath)} (audio=${audioIndex})`);
      }
    } else {
      job.error = true;
      console.error(
        `[stream] ffmpeg cache transcode failed for ${basename(sourcePath)} (audio=${audioIndex}, code=${code})` +
        (getStderrTail() ? `: ${getStderrTail()}` : "")
      );
      scheduleCacheRetry(sourcePath, audioIndex, cacheKey, `ffmpeg-exit-${code}`);
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
    "/api/auth/login": {
      async POST(req) {
        try {
          const body = await req.json();
          const { profileId, password } = body;
          if (!profileId) return Response.json({ error: "Missing profileId" }, { status: 400 });
          const profileWithHash = getProfileWithHash(profileId);
          if (!profileWithHash) return Response.json({ error: "Profile not found" }, { status: 404 });
          if (!profileWithHash.password_hash) {
            return Response.json({ error: "password_not_set" }, { status: 200 });
          }
          if (!password) return Response.json({ error: "Missing password" }, { status: 400 });
          const valid = await verifyPassword(password, profileWithHash.password_hash);
          if (!valid) return Response.json({ error: "Invalid password" }, { status: 401 });
          const token = createSession(profileWithHash.id, req.headers.get("user-agent") || undefined);
          const profile = getProfile(profileWithHash.id)!;
          return Response.json({ profile }, {
            headers: { "Set-Cookie": sessionCookie(token) },
          });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/auth/register": {
      async POST(req) {
        try {
          const body = await req.json();
          const { name, password } = body;
          if (!name || name.trim().length < 1 || name.trim().length > 25) {
            return Response.json({ error: "Name must be between 1 and 25 characters" }, { status: 400 });
          }
          if (!password || password.length < 4) {
            return Response.json({ error: "Password must be at least 4 characters" }, { status: 400 });
          }
          const hash = await hashPassword(password);
          const profile = createProfile(name.trim(), hash);
          const token = createSession(profile.id, req.headers.get("user-agent") || undefined);
          return Response.json({ profile }, {
            headers: { "Set-Cookie": sessionCookie(token) },
          });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/auth/set-password": {
      async POST(req) {
        try {
          const body = await req.json();
          const { profileId, password } = body;
          if (!profileId) return Response.json({ error: "Missing profileId" }, { status: 400 });
          if (!password || password.length < 4) {
            return Response.json({ error: "Password must be at least 4 characters" }, { status: 400 });
          }
          const profileWithHash = getProfileWithHash(profileId);
          if (!profileWithHash) return Response.json({ error: "Profile not found" }, { status: 404 });
          if (profileWithHash.password_hash) {
            return Response.json({ error: "Password already set. Use change-password instead." }, { status: 400 });
          }
          const hash = await hashPassword(password);
          setProfilePassword(profileId, hash);
          const token = createSession(profileId, req.headers.get("user-agent") || undefined);
          const profile = getProfile(profileId)!;
          return Response.json({ profile }, {
            headers: { "Set-Cookie": sessionCookie(token) },
          });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
    "/api/auth/logout": {
      async POST(req) {
        const auth = authenticateRequest(req);
        if (auth) deleteSession(auth.sessionId);
        return Response.json({ ok: true }, {
          headers: { "Set-Cookie": clearSessionCookie() },
        });
      },
    },
    "/api/auth/me": {
      GET(req) {
        const auth = authenticateRequest(req);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json({ profile: auth.profile });
      },
    },
    "/api/auth/sessions": {
      GET(req) {
        const auth = authenticateRequest(req);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const sessions = db.query(
          "SELECT id, user_agent, created_at, last_active FROM sessions WHERE profile_id = ? AND expires_at > datetime('now') ORDER BY last_active DESC"
        ).all(auth.profile.id) as { id: string; user_agent: string | null; created_at: string; last_active: string | null }[];
        return Response.json({
          sessions: sessions.map((s) => ({
            id: s.id,
            userAgent: s.user_agent,
            createdAt: s.created_at,
            lastActive: s.last_active,
            isCurrent: s.id === auth.sessionId,
          })),
          count: sessions.length,
          maxSessions: 6,
        });
      },
      async DELETE(req) {
        const auth = authenticateRequest(req);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = await req.json();
        const { sessionId } = body;
        if (!sessionId) return Response.json({ error: "Missing sessionId" }, { status: 400 });
        // Don't allow revoking current session via this endpoint
        if (sessionId === auth.sessionId) {
          return Response.json({ error: "Use logout to end your current session" }, { status: 400 });
        }
        // Ensure the session belongs to this profile
        const session = db.prepare(
          "SELECT profile_id FROM sessions WHERE id = ?"
        ).get(sessionId) as { profile_id: number } | null;
        if (!session || session.profile_id !== auth.profile.id) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
        deleteSession(sessionId);
        return Response.json({ ok: true });
      },
    },
    "/api/auth/change-password": {
      async POST(req) {
        const auth = authenticateRequest(req);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const body = await req.json();
          const { currentPassword, newPassword } = body;
          if (!newPassword || newPassword.length < 4) {
            return Response.json({ error: "New password must be at least 4 characters" }, { status: 400 });
          }
          const profileWithHash = getProfileWithHash(auth.profile.id);
          if (!profileWithHash) return Response.json({ error: "Profile not found" }, { status: 404 });
          if (profileWithHash.password_hash) {
            if (!currentPassword) return Response.json({ error: "Current password required" }, { status: 400 });
            const valid = await verifyPassword(currentPassword, profileWithHash.password_hash);
            if (!valid) return Response.json({ error: "Current password is incorrect" }, { status: 401 });
          }
          const hash = await hashPassword(newPassword);
          setProfilePassword(auth.profile.id, hash);
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      },
    },
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

        const isRemoteSource = sourcePath.startsWith("kaidadb:");
        const audioIndex = parseInt(url.searchParams.get("audio") || "0") || 0;

        // Check KaidaDB first (handles both remote-only and locally-ingested content)
        const kaidadbKey = getKaidadbKey(srcParam);
        if (kaidadbKey) {
          // Check if the stored content is browser-safe (mp4/webm) — only serve directly if so
          const kStatus = getKaidadbStatus(srcParam);
          const isWebSafe = kStatus.content_type ? WEB_SAFE_VIDEO_TYPES.has(kStatus.content_type) : false;

          if (isWebSafe) {
            try {
              const rangeHeader = req.headers.get("range");
              const kaidaRes = await kaidadbStream(kaidadbKey, rangeHeader);
              if (kaidaRes.ok || kaidaRes.status === 206) {
                const headers: Record<string, string> = {
                  "Content-Type": kaidaRes.headers.get("content-type") || "video/mp4",
                  "Accept-Ranges": "bytes",
                  "X-Cache": "kaidadb",
                };
                if (kaidaRes.headers.has("content-range")) headers["Content-Range"] = kaidaRes.headers.get("content-range")!;
                if (kaidaRes.status === 200 && kStatus.total_size) {
                  headers["Content-Length"] = String(kStatus.total_size);
                }
                return new Response(kaidaRes.body, { status: kaidaRes.status, headers });
              }
              if (kaidaRes.status === 416 && rangeHeader) {
                const retryRes = await kaidadbStream(kaidadbKey, null);
                if (retryRes.ok) {
                  const headers: Record<string, string> = {
                    "Content-Type": retryRes.headers.get("content-type") || "video/mp4",
                    "Accept-Ranges": "bytes",
                    "X-Cache": "kaidadb",
                  };
                  if (kStatus.total_size) headers["Content-Length"] = String(kStatus.total_size);
                  return new Response(retryRes.body, { status: 200, headers });
                }
              }
              if (isRemoteSource) {
                return new Response("KaidaDB stream error", { status: 502 });
              }
            } catch {
              if (isRemoteSource) {
                return new Response("KaidaDB unreachable", { status: 502 });
              }
            }
          } else if (isRemoteSource) {
            // Non web-safe remote content (mkv, avi, etc.) — transcode via kaidadb URL
            const remoteUrl = kaidadbMediaUrl(kaidadbKey);
            if (!remoteUrl) {
              return new Response("KaidaDB URL not configured", { status: 502 });
            }

            // Check if we have a completed cache for this remote source
            const cache = await getCacheStatus(srcParam, audioIndex);
            if (cache.cached && !cache.transcoding) {
              const cachedFile = Bun.file(cache.cachePath);
              const fileSize = cachedFile.size;
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
                  "X-Cache": "hit",
                },
              });
            }

            // Live transcode from kaidadb URL — skip ffprobe (saves ~3-5s of sync network I/O).
            // Always transcode (never codec-copy) since remote MKV is unlikely to be h264+yuv420p,
            // and the probe would need to read ~10MB over the network to check.
            // Use stream-relative audio mapping (0:a:N) since we don't know absolute indices.
            const selectedAudio: SelectedAudioStream = { index: -1, channels: 6, codecName: "unknown" };

            queueCacheTranscode(remoteUrl, audioIndex, 2_000, "stream-start");

            const args = buildLiveTranscodeArgs(remoteUrl, selectedAudio, null, startTime, true);
            // Fix audio mapping: replace the absolute `-map 0:-1` with stream-relative `-map 0:a:N`
            for (let i = 0; i < args.length; i++) {
              if (args[i] === "-map" && args[i + 1] === "0:-1") {
                args[i + 1] = `0:a:${audioIndex}`;
                break;
              }
            }

            registerLiveStream(srcParam, audioIndex);
            const ffmpeg = Bun.spawn(args, {
              stdout: "pipe",
              stderr: "pipe",
            });
            const getStderrTail = drainFfmpegStderr(ffmpeg);
            let liveStreamReleased = false;
            const releaseLiveStream = () => {
              if (liveStreamReleased) return;
              liveStreamReleased = true;
              unregisterLiveStream(srcParam, audioIndex);
            };
            ffmpeg.exited.then((code) => {
              releaseLiveStream();
              if (code !== 0) {
                console.error(
                  `[stream] ffmpeg kaidadb transcode failed for ${kaidadbKey} (audio=${audioIndex}, code=${code})` +
                  (getStderrTail() ? `: ${getStderrTail()}` : "")
                );
              }
            });
            if (req.signal) {
              req.signal.addEventListener("abort", () => {
                try { ffmpeg.kill(); } catch {}
                releaseLiveStream();
              });
            }

            return new Response(ffmpeg.stdout, {
              headers: {
                "Content-Type": "video/mp4",
                "Transfer-Encoding": "chunked",
                "X-Cache": "miss",
                "X-Source": "kaidadb-transcode",
              },
            });
          }
        }

        // Remote-only content with no KaidaDB key — nothing more we can do
        if (isRemoteSource) {
          return new Response("Remote media not available", { status: 404 });
        }

        const file = Bun.file(sourcePath);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }

        // Check if we have a completed cache for this file
        const cache = await getCacheStatus(sourcePath, audioIndex);
        if (cache.cached && !cache.transcoding) {
          // Serve from cache with range request support for instant seeking
          const cachedFile = Bun.file(cache.cachePath);
          const fileSize = cachedFile.size;
          const probeDuration = "";

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
                  "X-Transcode-Profile": "web-safe-v1",
                  "X-Cache-Policy": "playback-first",
                  "X-Cache-Queued": "false",
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
              "X-Transcode-Profile": "web-safe-v1",
              "X-Cache-Policy": "playback-first",
              "X-Cache-Queued": "false",
            },
          });
        }

        // No cache — live transcode using a strict web-safe profile.
        const probe = runFfprobe(sourcePath, [
          "stream=index,codec_type,codec_name,channels,pix_fmt",
          "format=duration",
        ]);
        if (!probe.ok) {
          return Response.json({ error: probe.error }, { status: 500 });
        }
        const probeData = probe.data;
        const probeDuration = probeData.format?.duration || "";
        const selectedAudio = selectAudioStream(probeData.streams || [], audioIndex);
        const selectedVideo = selectVideoStream(probeData.streams || []);

        const queuedCacheKey = queueCacheTranscode(sourcePath, audioIndex, CACHE_PREWARM_DELAY_MS, "stream-start");

        const args = buildLiveTranscodeArgs(sourcePath, selectedAudio, selectedVideo, startTime);

        registerLiveStream(sourcePath, audioIndex);
        const ffmpeg = Bun.spawn(args, {
          stdout: "pipe",
          stderr: "pipe",
        });
        const getStderrTail = drainFfmpegStderr(ffmpeg);
        let liveStreamReleased = false;
        const releaseLiveStream = () => {
          if (liveStreamReleased) return;
          liveStreamReleased = true;
          unregisterLiveStream(sourcePath, audioIndex);
        };
        ffmpeg.exited.then((code) => {
          releaseLiveStream();
          if (code !== 0) {
            console.error(
              `[stream] ffmpeg live transcode failed for ${basename(sourcePath)} (audio=${audioIndex}, code=${code})` +
              (getStderrTail() ? `: ${getStderrTail()}` : "")
            );
          }
        });

        // Kill live transcode FFmpeg when client disconnects
        if (req.signal) {
          req.signal.addEventListener("abort", () => {
            try { ffmpeg.kill(); } catch {}
            releaseLiveStream();
          });
        }

        const headers: Record<string, string> = {
          "Content-Type": "video/mp4",
          "Transfer-Encoding": "chunked",
          "X-Cache": "miss",
          "X-Transcode-Profile": "web-safe-v1",
          "X-Cache-Policy": "playback-first",
          "X-Cache-Queued": "true",
          "X-Cache-Key": queuedCacheKey,
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

        // For remote sources, check KaidaDB
        if (sourcePath.startsWith("kaidadb:")) {
          const kaidadbKey = getKaidadbKey(srcParam);
          if (kaidadbKey) {
            const kStatus = getKaidadbStatus(srcParam);
            const isWebSafe = kStatus.content_type ? WEB_SAFE_VIDEO_TYPES.has(kStatus.content_type) : false;
            if (isWebSafe) {
              return Response.json({
                cached: true,
                transcoding: false,
                bytesWritten: 0,
                duration: "",
                fileSize: 0,
                kaidadb: true,
              });
            }
            // Non-web-safe remote content — check local transcode cache
            const remoteUrl = kaidadbMediaUrl(kaidadbKey);
            if (remoteUrl) {
              const cache = await getCacheStatus(remoteUrl, audioIndex);
              return Response.json({
                cached: cache.cached,
                transcoding: cache.transcoding,
                bytesWritten: cache.bytesWritten,
                duration: cache.duration,
                fileSize: cache.fileSize,
                kaidadb: true,
              });
            }
          }
          return Response.json({
            cached: false,
            transcoding: false,
            bytesWritten: 0,
            duration: "",
            fileSize: 0,
          });
        }

        const status = await getCacheStatus(sourcePath, audioIndex);

        // If not locally cached, check KaidaDB (only treat as cached if web-safe)
        if (!status.cached && !status.transcoding) {
          const kaidadbKey = getKaidadbKey(srcParam);
          if (kaidadbKey) {
            const kStatus = getKaidadbStatus(srcParam);
            const isWebSafe = kStatus.content_type ? WEB_SAFE_VIDEO_TYPES.has(kStatus.content_type) : false;
            if (isWebSafe) {
              return Response.json({
                cached: true,
                transcoding: false,
                bytesWritten: 0,
                duration: status.duration,
                fileSize: status.fileSize,
                kaidadb: true,
              });
            }
          }
        }

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
        const cacheKey = queueCacheTranscode(sourcePath, audioIndex, 0, "prefetch");
        return Response.json({ prefetching: true, queued: true, cacheKey });
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
          clearPendingCacheJob(cacheKey);
          cacheRetryCounts.delete(cacheKey);
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
        for (const pending of pendingCacheJobs.values()) {
          clearTimeout(pending.timer);
        }
        pendingCacheJobs.clear();
        cacheRetryCounts.clear();
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
        const showEntries = [
          "format=duration",
          "stream=index,codec_name,codec_type,channels,channel_layout",
          "stream_tags=language,title",
        ];

        // For KaidaDB sources, download partial content to probe
        let probe: FfprobeResult;
        if (sourcePath.startsWith("kaidadb:")) {
          const kaidadbKey = getKaidadbKey(srcParam);
          if (!kaidadbKey) {
            return Response.json({ error: "KaidaDB key not found" }, { status: 404 });
          }
          const tmpPath = join(CACHE_DIR, `probe_${createHash("md5").update(kaidadbKey).digest("hex")}.tmp`);
          try {
            const partial = await kaidadbStream(kaidadbKey, "bytes=0-2097151");
            if (!partial.ok && partial.status !== 206) {
              return Response.json({ error: "KaidaDB probe unavailable" }, { status: 502 });
            }
            await Bun.write(tmpPath, partial);
            probe = runFfprobe(tmpPath, showEntries);
          } catch {
            return Response.json({ error: "KaidaDB unreachable" }, { status: 502 });
          } finally {
            await unlink(tmpPath).catch(() => {});
          }
        } else {
          probe = runFfprobe(sourcePath, showEntries);
        }

        if (!probe.ok) {
          return Response.json({ error: probe.error }, { status: 500 });
        }
        const data = probe.data;
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
        const profiles = getAllProfiles().map(p => ({
          id: p.id,
          name: p.name,
          image_path: p.image_path,
          has_password: profileHasPassword(p.id),
        }));
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
    "/api/kaidadb/health": {
      async GET() {
        const result = await kaidadbHealthCheck();
        return Response.json(result);
      },
    },
    "/api/kaidadb/status": {
      GET(req) {
        const url = new URL(req.url);
        const src = url.searchParams.get("src");
        if (!src) return Response.json({ error: "Missing src" }, { status: 400 });
        const status = getKaidadbStatus(src);
        return Response.json(status);
      },
    },
    "/api/kaidadb/ingest": {
      async POST(req) {
        try {
          const body = await req.json();
          const { src } = body;
          if (!src) return Response.json({ error: "Missing src" }, { status: 400 });

          const sourcePath = resolveSourcePath(src);
          if (!sourcePath) return Response.json({ error: "Source not found" }, { status: 404 });

          const ext = src.split(".").pop()?.toLowerCase();
          let filePath = sourcePath;
          let contentType = "video/mp4";

          if (ext !== "mp4") {
            const audioIndex = parseInt(body.audio || "0") || 0;
            const cache = await getCacheStatus(sourcePath, audioIndex);
            if (!cache.cached) {
              return Response.json({
                error: "No cached transcode available. Play the file first to generate a transcode, then try again.",
              }, { status: 400 });
            }
            filePath = cache.cachePath;
          }

          const file = Bun.file(filePath);
          if (!(await file.exists())) return Response.json({ error: "File not found" }, { status: 404 });

          const kaidadbKey = videoSrcToKaidadbKey(src).replace(/\.[^.]+$/, ".mp4");
          const data = new Uint8Array(await file.arrayBuffer());

          const result = await kaidadbUpload(kaidadbKey, data, contentType, {
            source: src,
            "original-ext": ext || "mp4",
          });

          setKaidadbMapping(src, kaidadbKey, contentType, result.total_size, result.checksum);

          return Response.json({ ok: true, key: kaidadbKey, total_size: result.total_size });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
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

          // Re-scan if directories or KaidaDB prefixes changed
          if (body.movies_directory !== undefined || body.tvshows_directory !== undefined ||
              body.kaidadb_movies_prefix !== undefined || body.kaidadb_tvshows_prefix !== undefined ||
              body.kaidadb_root_prefix !== undefined) {
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
               updated_at = datetime('now')
             WHERE excluded."current_time" >= playback_progress."current_time"
               OR (julianday('now') - julianday(playback_progress.updated_at)) * 86400 > 5`,
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

        let content: string;
        if (sourcePath.startsWith("kaidadb:")) {
          // Serve subtitle from KaidaDB
          const kaidadbKey = getKaidadbKey(srcParam);
          if (!kaidadbKey) return new Response("Not found", { status: 404 });
          try {
            const { kaidadbFetchText } = await import("./scripts/kaidadb");
            content = await kaidadbFetchText(kaidadbKey);
          } catch {
            return new Response("KaidaDB unreachable", { status: 502 });
          }
        } else {
          const file = Bun.file(sourcePath);
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          content = await file.text();
        }

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

        // Remote content — serve ALL file types from KaidaDB
        if (sourcePath.startsWith("kaidadb:")) {
          const kaidadbKey = getKaidadbKey(servePath);
          if (!kaidadbKey) return new Response("Not found", { status: 404 });
          try {
            const rangeHeader = req.headers.get("range");
            // For non-range requests, include total size from DB so the browser knows the file size
            const kStatus = getKaidadbStatus(servePath);
            const kaidaRes = await kaidadbStream(kaidadbKey, rangeHeader);
            if (!kaidaRes.ok && kaidaRes.status !== 206) {
              return new Response("Not found", { status: 404 });
            }
            const headers: Record<string, string> = {
              "Content-Type": kaidaRes.headers.get("content-type") || "application/octet-stream",
              "Accept-Ranges": "bytes",
              "X-Source": "kaidadb",
            };
            const fileExt = extname(servePath).toLowerCase();
            if (IMAGE_EXTS.has(fileExt)) {
              headers["Cache-Control"] = "public, max-age=86400";
            }
            if (kaidaRes.headers.has("content-range")) {
              headers["Content-Range"] = kaidaRes.headers.get("content-range")!;
            }
            // For non-range 200 responses, set Content-Length from DB metadata so
            // the browser knows the total file size for seeking. For 206 responses,
            // the browser uses Content-Range instead. Avoid setting Content-Length
            // on stream bodies (206) to prevent chunked encoding conflicts.
            if (kaidaRes.status === 200 && kStatus.total_size) {
              headers["Content-Length"] = String(kStatus.total_size);
            }
            return new Response(kaidaRes.body, { status: kaidaRes.status, headers });
          } catch {
            return new Response("KaidaDB unreachable", { status: 502 });
          }
        }

        const file = Bun.file(sourcePath);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }
        const fileSize = file.size;
        const fileExt = extname(sourcePath).toLowerCase();
        const isImage = IMAGE_EXTS.has(fileExt);

        // Check KaidaDB for non-image files (local titles with remote video cache)
        if (!isImage) {
          const kaidadbKey = getKaidadbKey(servePath);
          if (kaidadbKey) {
            try {
              const rangeHeader = req.headers.get("range");
              const kaidaRes = await kaidadbStream(kaidadbKey, rangeHeader);
              if (kaidaRes.ok || kaidaRes.status === 206) {
                const headers: Record<string, string> = {
                  "Content-Type": kaidaRes.headers.get("content-type") || "video/mp4",
                  "Accept-Ranges": "bytes",
                  "X-Source": "kaidadb",
                };
                if (kaidaRes.headers.has("content-range")) headers["Content-Range"] = kaidaRes.headers.get("content-range")!;
                // For 200 responses, use known file size for Content-Length.
                // For 206 responses, omit Content-Length to avoid chunked encoding conflicts.
                if (kaidaRes.status === 200) {
                  const kStatus = getKaidadbStatus(servePath);
                  if (kStatus.total_size) headers["Content-Length"] = String(kStatus.total_size);
                }
                return new Response(kaidaRes.body, { status: kaidaRes.status, headers });
              }
            } catch {
              // KaidaDB unreachable, fall through to filesystem
            }
          }
        }

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
  development: process.env.NODE_ENV !== "production" ? {
    hmr: true,
    console: true,
  } : false,
});
