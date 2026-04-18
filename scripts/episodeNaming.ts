export interface ParsedEpisode {
  season: number;
  episode: number;
  title: string;
  ext: string;
}

export const SEASON_TOKEN = /^(?:s|season\s?)0*(\d+)$/i;
export const EPISODE_TOKEN = /^(?:e|ep|episode\s?)0*(\d+)$/i;
export const COMBINED_SE_TOKEN = /(?:^|[._\s-])(?:s|season\s?)0*(\d+)[._\s-]*(?:e|ep|episode\s?)0*(\d+)(?=$|[._\s-])/i;
export const CANONICAL_SUFFIX = /_s(\d+)_ep(\d+)\.[^.]+$/i;

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
  return `${slug}_s${pad2(p.season)}_ep${pad2(p.episode)}.${p.ext}`;
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
  const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;

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

  return { season, episode, title, ext };
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
