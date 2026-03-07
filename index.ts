import index from "./index.html";
import { resolve, join, dirname } from "node:path";
import { readdir } from "node:fs/promises";
import { extname } from "node:path";
import { readTomlFile } from "./scripts/tomlreader";
import { resolveToDb, getCategoriesFromDb, getTitleFromDb, resolveSourcePath, searchTitles } from "./scripts/autoresolver";
import { getOrCreateDefaultProfile, updateProfile } from "./scripts/profile";
import db from "./scripts/db";

const IMAGES_BASE = resolve("./images");
const AVATARS_BASE = resolve("./data/avatars");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

// Resolve media into SQLite on startup using profile-stored directories
await resolveToDb();

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/tvshows": index,
    "/movies": index,
    "/genre/*": index,
    "/api/stream": {
      async GET(req) {
        const url = new URL(req.url);
        const srcParam = url.searchParams.get("src");
        if (!srcParam) {
          return Response.json({ error: "Missing src parameter" }, { status: 400 });
        }
        // Resolve the actual file path from the serve path
        const sourcePath = resolveSourcePath(srcParam);
        if (!sourcePath) {
          return new Response("Not found", { status: 404 });
        }
        const file = Bun.file(sourcePath);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }

        // Use ffmpeg to transcode to mp4 for browser playback
        const ffmpeg = Bun.spawn([
          "ffmpeg",
          "-i", sourcePath,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-tune", "zerolatency",
          "-crf", "23",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "frag_keyframe+empty_moov+faststart",
          "-f", "mp4",
          "-",
        ], {
          stdout: "pipe",
          stderr: "ignore",
        });

        return new Response(ffmpeg.stdout, {
          headers: {
            "Content-Type": "video/mp4",
            "Transfer-Encoding": "chunked",
          },
        });
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
    "/api/media/search": {
      GET(req) {
        const url = new URL(req.url);
        const q = url.searchParams.get("q")?.trim();
        if (!q || q.length < 1) {
          return Response.json([]);
        }
        const results = searchTitles(q);
        return Response.json(results);
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
        });
      },
    },
    "/api/profile": {
      GET() {
        const profile = getOrCreateDefaultProfile();
        return Response.json(profile);
      },
      async PUT(req) {
        try {
          const profile = getOrCreateDefaultProfile();
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
    "/api/playback/progress": {
      GET(req) {
        const url = new URL(req.url);
        const src = url.searchParams.get("src");
        const dir = url.searchParams.get("dir");
        const profile = getOrCreateDefaultProfile();

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
          "SELECT video_src, dir_path, playback_progress.current_time AS current_time, duration, updated_at FROM playback_progress WHERE profile_id = ? AND playback_progress.current_time > 0 AND (duration = 0 OR playback_progress.current_time < duration - 10) ORDER BY updated_at DESC LIMIT 20"
        ).all(profile.id) as any[];
        return Response.json(rows);
      },
      async PUT(req) {
        try {
          const profile = getOrCreateDefaultProfile();
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

          const profile = getOrCreateDefaultProfile();
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

          const profile = getOrCreateDefaultProfile();
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
        return new Response(file);
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
        return new Response(file);
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
