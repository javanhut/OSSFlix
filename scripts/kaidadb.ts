import { getGlobalSettings } from "./profile";
import db from "./db";

function getBaseUrl(): string | null {
  const settings = getGlobalSettings();
  return settings.kaidadb_url || null;
}

export async function kaidadbHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return { ok: false, error: "KaidaDB URL not configured" };
  try {
    const res = await fetch(`${baseUrl}/v1/health`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function kaidadbStream(key: string, rangeHeader?: string | null): Promise<Response> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
  const headers: Record<string, string> = {};
  if (rangeHeader) headers["Range"] = rangeHeader;
  return fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, { headers });
}

export async function kaidadbUpload(
  key: string,
  body: ReadableStream | Uint8Array,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<{ key: string; total_size: number; checksum: string }> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      headers[`X-KaidaDB-Meta-${k}`] = v;
    }
  }
  const res = await fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers,
    body,
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
  const allItems: KaidaDBListItem[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ prefix, limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${baseUrl}/v1/media?${params}`);
    if (!res.ok) throw new Error(`KaidaDB list failed: ${res.status}`);
    const data = await res.json() as { items: KaidaDBListItem[]; next_cursor: string | null };
    allItems.push(...data.items);
    cursor = data.next_cursor;
  } while (cursor);
  return allItems;
}

export async function kaidadbFetchText(key: string): Promise<string> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("KaidaDB URL not configured");
  const res = await fetch(`${baseUrl}/v1/media/${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`KaidaDB fetch failed for ${key}: ${res.status}`);
  return res.text();
}

// ── DB mapping functions ──

export function getKaidadbKey(videoSrc: string): string | null {
  const row = db.prepare("SELECT kaidadb_key FROM kaidadb_media WHERE video_src = ?").get(videoSrc) as { kaidadb_key: string } | null;
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
  const row = db.prepare(
    "SELECT kaidadb_key, content_type, total_size FROM kaidadb_media WHERE video_src = ?"
  ).get(videoSrc) as any;
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
