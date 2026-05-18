export type AudioVariant = "sub" | "dub";

export interface ParsedEpisode {
  season: number;
  episode: number;
  title: string;
  ext: string;
  variant?: AudioVariant;
}

export const SEASON_TOKEN = /^(?:s|season\s?)0*(\d+)$/i;
export const EPISODE_TOKEN = /^(?:e|ep|episode\s?)0*(\d+)$/i;
export const COMBINED_SE_TOKEN = /(?:^|[._\s-])(?:s|season\s?)0*(\d+)[._\s-]*(?:e|ep|episode\s?)0*(\d+)(?=$|[._\s-])/i;
export const CANONICAL_SUFFIX = /_s(\d+)_ep(\d+)(?:_(?:sub|dub))?\.[^.]+$/i;
export const VARIANT_SUFFIX = /_(sub|dub)\.[^.]+$/i;

export function detectVariant(videoSrc: string): AudioVariant | null {
  const filename = videoSrc.split("/").pop() || videoSrc;
  const match = filename.match(VARIANT_SUFFIX);
  return match ? (match[1].toLowerCase() as AudioVariant) : null;
}

/**
 * Build a variant map for a season's videos, inferring the unmarked partner of
 * an explicitly-tagged episode. When the same (season, episode) has one file
 * tagged `_sub` (or `_dub`) and another file with no tag, the untagged file is
 * inferred as the opposite variant so the audio toggle can pair them up.
 *
 * Files with no partner keep `null` (variant filter is a passthrough).
 */
export function inferEpisodeVariants(videos: string[]): Map<string, AudioVariant | null> {
  const result = new Map<string, AudioVariant | null>();
  const byEpisode = new Map<string, string[]>();

  for (const src of videos) {
    result.set(src, detectVariant(src));
    const filename = src.split("/").pop() || src;
    const parsed = parseEpisodePath(filename);
    if (!parsed) continue;
    const key = `s${parsed.season}e${parsed.episode}`;
    const list = byEpisode.get(key);
    if (list) list.push(src);
    else byEpisode.set(key, [src]);
  }

  for (const group of byEpisode.values()) {
    if (group.length < 2) continue;
    const tagged = new Set<AudioVariant>();
    const untagged: string[] = [];
    for (const src of group) {
      const v = result.get(src) ?? null;
      if (v) tagged.add(v);
      else untagged.push(src);
    }
    if (untagged.length === 0) continue;
    let inferred: AudioVariant | null = null;
    if (tagged.has("sub") && !tagged.has("dub")) inferred = "dub";
    else if (tagged.has("dub") && !tagged.has("sub")) inferred = "sub";
    if (!inferred) continue;
    for (const src of untagged) result.set(src, inferred);
  }

  return result;
}

export function titleFromStem(stem: string): string {
  const cleaned = stem.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function slugTitle(title: string): string {
  return title
    .trim()
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

export function canonicalFilename(p: ParsedEpisode): string {
  // Always keep a leading token before _s{NN}_ep{NN} so the downstream
  // `_s\d+_ep\d+` regex (sort, timing matcher) continues to match.
  const slug = slugTitle(p.title) || "episode";
  const variantSuffix = p.variant ? `_${p.variant}` : "";
  return `${slug}_s${pad2(p.season)}_ep${pad2(p.episode)}${variantSuffix}.${p.ext}`;
}

export function formatEpisodeLabel(p: ParsedEpisode): string {
  const base = `S${p.season} E${p.episode}`;
  return p.title ? `${base} - ${p.title}` : base;
}

/**
 * Parse any of these layouts (relative path inside the title directory):
 *   A: "s1/ep1/pilot.mkv"                 → S1 E1 - Pilot
 *   B: "s1/MyShow_s1_ep02.mkv"            → S1 E2 - MyShow
 *   C: "s01/ep02/The Bank Job.mkv"        → S1 E2 - The Bank Job
 *   Legacy flat: "MyShow_s01_ep02.mkv"    → S1 E2 - MyShow
 * Returns null if season+episode cannot be determined.
 */
export function parseEpisodePath(relPath: string): ParsedEpisode | null {
  const segments = relPath.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  const filename = segments.pop()!;
  const dotIdx = filename.lastIndexOf(".");
  const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1).toLowerCase() : "";
  const rawStem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  // Detect + strip trailing _sub/_dub variant tag so it doesn't leak into the
  // rendered title, but capture it on the parsed result so canonicalization can
  // preserve it (otherwise two paired files collide on the same canonical name).
  const variantMatch = rawStem.match(/_(sub|dub)$/i);
  const variant: AudioVariant | undefined = variantMatch ? (variantMatch[1]!.toLowerCase() as AudioVariant) : undefined;
  const stem = variantMatch ? rawStem.slice(0, rawStem.length - variantMatch[0].length) : rawStem;

  let seasonFromDir: number | null = null;
  let epFromDir: number | null = null;
  for (const seg of segments) {
    const trimmed = seg.trim();
    const sMatch = trimmed.match(SEASON_TOKEN);
    if (sMatch) {
      seasonFromDir = Number(sMatch[1]);
      continue;
    }
    const eMatch = trimmed.match(EPISODE_TOKEN);
    if (eMatch) {
      epFromDir = Number(eMatch[1]);
    }
  }

  let seasonFromFile: number | null = null;
  let epFromFile: number | null = null;
  let titleRemnant = stem;
  const combined = stem.match(COMBINED_SE_TOKEN);
  if (combined) {
    seasonFromFile = Number(combined[1]);
    epFromFile = Number(combined[2]);
    const matchStart = combined.index ?? 0;
    const matchEnd = matchStart + combined[0].length;
    const before = stem.slice(0, matchStart);
    const after = stem.slice(matchEnd);
    titleRemnant = `${before} ${after}`.replace(/[._\s-]+/g, " ").trim();
  }

  const season = seasonFromDir ?? seasonFromFile;
  const episode = epFromDir ?? epFromFile;
  if (season == null || episode == null) return null;

  let title: string;
  if (combined) {
    title = titleFromStem(titleRemnant);
  } else {
    title = titleFromStem(stem);
  }

  return variant ? { season, episode, title, ext, variant } : { season, episode, title, ext };
}

export function compareVideoSrc(a: string, b: string): number {
  const fa = a.split("/").pop() || a;
  const fb = b.split("/").pop() || b;
  const ma = fa.match(CANONICAL_SUFFIX);
  const mb = fb.match(CANONICAL_SUFFIX);
  if (ma && mb) {
    const seasonDiff = Number(ma[1]) - Number(mb[1]);
    if (seasonDiff !== 0) return seasonDiff;
    return Number(ma[2]) - Number(mb[2]);
  }
  return a.localeCompare(b, undefined, { numeric: true });
}
