import { getGlobalSettings } from "./profile";
import db from "./db";

function getBaseUrl(): string | null {
  const settings = getGlobalSettings();
  return settings.kaidadb_url || null;
}

<<<<<<< HEAD
export function kaidadbAuthHeaders(): Record<string, string> {
  const password = getGlobalSettings().kaidadb_password;
  return password ? { "X-Server-Pass": password } : {};
}

export async function kaidadbHealthCheck(): Promise<{ ok: boolean; error?: string }> {
=======
// Classify a fetch() failure so callers can surface a useful message.
// Bun's "Unable to connect. Is the computer able to access the url?" ends up
// as a TypeError here; an AbortSignal.timeout firing shows up as AbortError.
type ErrorKind = "timeout" | "unreachable" | "not_configured" | "http" | "other";
function classifyError(e: any): ErrorKind {
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return "timeout";
  if (e?.name === "TypeError") return "unreachable";
  return "other";
}

export async function kaidadbHealthCheck(): Promise<{ ok: boolean; error?: string; error_kind?: ErrorKind }> {
>>>>>>> eeed6b4 (feat: fixed the website to be more robutst)
  const baseUrl = getBaseUrl();
  if (!baseUrl) return { ok: false, error: "KaidaDB URL not configured", error_kind: "not_configured" };
  try {
<<<<<<< HEAD
    const res = await fetch(`${baseUrl}/v1/health`, { headers: kaidadbAuthHeaders() });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `Auth failed (HTTP ${res.status})` };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
=======
    const res = await fetch(`${baseUrl}/v1/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, error_kind: "http" };
>>>>>>> eeed6b4 (feat: fixed the website to be more robutst)
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message, error_kind: classifyError(e) };
  }
}

export async function kaidadbStream(
  key: string,
  rangeHeader?: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
<<<<<<< HEAD
  const headers: Record<string, string> = { ...kaidadbAuthHeaders() };
  if (rangeHeader) headers.Range = rangeHeader;
  return fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, { headers });
=======
  const headers: Record<string, string> = {};
  if (rangeHeader) headers["Range"] = rangeHeader;
  return fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, { headers, signal });
>>>>>>> eeed6b4 (feat: fixed the website to be more robutst)
}

export function kaidadbMediaUrl(key: string): string | null {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/v1/media/${encodeURIComponent(key)}`;
}

export async function kaidadbUpload(
  key: string,
  body: ReadableStream | Uint8Array,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<{ key: string; total_size: number; checksum: string }> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
  const headers: Record<string, string> = { "Content-Type": contentType, ...kaidadbAuthHeaders() };
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      headers[`X-KaidaDB-Meta-${k}`] = v;
    }
  }
  const res = await fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers,
    body,
    // Large media uploads can take a while; 30 min ceiling for a stuck socket.
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`KaidaDB upload failed: ${res.status}`);
  return res.json();
}

// ── List & fetch functions ──

export interface KaidaDBListItem {
  key: string;
  total_size: number;
  content_type: string;
  checksum: string;
  created_at: number;
}

export async function kaidadbList(prefix: string): Promise<KaidaDBListItem[]> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
  const authHeaders = kaidadbAuthHeaders();
  const allItems: KaidaDBListItem[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ prefix, limit: "200" });
    if (cursor) params.set("cursor", cursor);
<<<<<<< HEAD
    const res = await fetch(`${baseUrl}/v1/media?${params}`, { headers: authHeaders });
=======
    const res = await fetch(`${baseUrl}/v1/media?${params}`, { signal: AbortSignal.timeout(10_000) });
>>>>>>> eeed6b4 (feat: fixed the website to be more robutst)
    if (!res.ok) throw new Error(`KaidaDB list failed: ${res.status}`);
    const data = (await res.json()) as { items: KaidaDBListItem[]; next_cursor: string | null };
    allItems.push(...data.items);
    cursor = data.next_cursor;
  } while (cursor);
  return allItems;
}

export async function kaidadbFetchText(key: string): Promise<string> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
<<<<<<< HEAD
  const res = await fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, { headers: kaidadbAuthHeaders() });
=======
  const res = await fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(10_000),
  });
>>>>>>> eeed6b4 (feat: fixed the website to be more robutst)
  if (!res.ok) throw new Error(`KaidaDB fetch failed for ${key}: ${res.status}`);
  return res.text();
}

// ── DB mapping functions ──

export function getKaidadbKey(videoSrc: string): string | null {
  const row = db.prepare("SELECT kaidadb_key FROM kaidadb_media WHERE video_src = ?").get(videoSrc) as {
    kaidadb_key: string;
  } | null;
  return row?.kaidadb_key || null;
}

export function setKaidadbMapping(
  videoSrc: string,
  kaidadbKey: string,
  contentType: string,
  totalSize?: number,
  checksum?: string,
): void {
  db.prepare(`
    INSERT INTO kaidadb_media (video_src, kaidadb_key, content_type, total_size, checksum)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(video_src) DO UPDATE SET
      kaidadb_key = excluded.kaidadb_key,
      content_type = excluded.content_type,
      total_size = excluded.total_size,
      checksum = excluded.checksum,
      created_at = datetime('now')
  `).run(videoSrc, kaidadbKey, contentType, totalSize ?? null, checksum ?? null);
}

export function removeKaidadbMapping(videoSrc: string): void {
  db.run("DELETE FROM kaidadb_media WHERE video_src = ?", [videoSrc]);
}

export function getKaidadbStatus(videoSrc: string): {
  hasKaidadb: boolean;
  kaidadb_key?: string;
  content_type?: string;
  total_size?: number;
} {
  const row = db
    .prepare("SELECT kaidadb_key, content_type, total_size FROM kaidadb_media WHERE video_src = ?")
    .get(videoSrc) as any;
  if (!row) return { hasKaidadb: false };
  return {
    hasKaidadb: true,
    kaidadb_key: row.kaidadb_key,
    content_type: row.content_type,
    total_size: row.total_size,
  };
}

export function videoSrcToKaidadbKey(videoSrc: string): string {
  return videoSrc.replace(/^\/media\//, "");
}
