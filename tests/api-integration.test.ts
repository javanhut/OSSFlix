import { describe, test, expect, beforeAll } from "bun:test";

// ── Integration tests for API endpoints ──
// These test the running server. Requires the server to be running on port 3000.
// Run with: bun test tests/api-integration.test.ts

const BASE_URL = "http://localhost:3000";

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/media/categories`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe("API Integration Tests", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await isServerRunning();
    if (!serverAvailable) {
      console.warn("⚠ Server not running on port 3000 — skipping integration tests");
    }
  });

  // ── Media endpoints ──
  test("GET /api/media/categories returns array", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/categories`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("GET /api/media/categories/type filters by type", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/categories/type?type=Movie`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("GET /api/media/categories/type requires type param", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/categories/type`);
    expect(res.status).toBe(400);
  });

  test("GET /api/media/search returns results", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/search?q=test`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("titles");
    expect(data).toHaveProperty("genres");
  });

  test("GET /api/media/search with empty query returns empty", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/search?q=`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.titles).toEqual([]);
    expect(data.genres).toEqual([]);
  });

  test("GET /api/media/info requires dir param", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/info`);
    expect(res.status).toBe(400);
  });

  test("GET /api/media/info returns 404 for missing dir", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/media/info?dir=/nonexistent`);
    expect(res.status).toBe(404);
  });

  // ── Profile endpoints ──
  test("GET /api/profiles returns profiles array", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/profiles`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect((data as any[]).length).toBeGreaterThan(0);
  });

  test("GET /api/profile returns default profile", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/profile`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
  });

  test("GET /api/global-settings returns settings", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/global-settings`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("movies_directory");
    expect(data).toHaveProperty("tvshows_directory");
  });

  // ── Streaming endpoints ──
  test("GET /api/stream requires src param", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream`);
    expect(res.status).toBe(400);
  });

  test("GET /api/stream returns 404 for missing file", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream?src=/nonexistent.mkv`);
    expect(res.status).toBe(404);
  });

  test("GET /api/stream/probe requires src param", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream/probe`);
    expect(res.status).toBe(400);
  });

  test("GET /api/stream/cache/status without src returns 400 or 404", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream/cache/status`);
    // Bun routes may return 404 when no query params trigger a handler match
    expect([400, 404]).toContain(res.status);
  });

  test("GET /api/stream/cache/status returns 404 for missing file", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream/cache/status?src=/nonexistent.mkv`);
    expect(res.status).toBe(404);
  });

  // ── Prefetch endpoint (new) ──
  test("GET /api/stream/prefetch without src returns 400 or 404", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream/prefetch`);
    expect([400, 404]).toContain(res.status);
  });

  test("GET /api/stream/prefetch returns 404 for missing file", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stream/prefetch?src=/nonexistent.mkv`);
    expect(res.status).toBe(404);
  });

  // ── Playback progress ──
  test("GET /api/playback/progress returns null for unknown src", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/playback/progress?src=/nonexistent.mp4`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });

  test("PUT /api/playback/progress saves and retrieves progress", async () => {
    if (!serverAvailable) return;
    const testSrc = `/test_${Date.now()}.mp4`;
    const putRes = await fetch(`${BASE_URL}/api/playback/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_src: testSrc,
        dir_path: "/test",
        current_time: 42.5,
        duration: 1200,
      }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await fetch(`${BASE_URL}/api/playback/progress?src=${encodeURIComponent(testSrc)}`);
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as any;
    expect(data).toBeTruthy();
    expect(data.current_time).toBe(42.5);
    expect(data.duration).toBe(1200);
  });

  // ── Static routes ──
  test("GET / returns HTML", async () => {
    if (!serverAvailable) return;
    const res = await fetch(BASE_URL);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") || "";
    expect(ct).toContain("text/html");
  });

  test("GET /home returns HTML (SPA route)", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/home`);
    expect(res.status).toBe(200);
  });

  test("GET /tvshows returns HTML (SPA route)", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/tvshows`);
    expect(res.status).toBe(200);
  });

  test("GET /movies returns HTML (SPA route)", async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/movies`);
    expect(res.status).toBe(200);
  });
});
