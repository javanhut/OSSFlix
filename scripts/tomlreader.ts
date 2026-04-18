import * as toml from "toml";

export interface MediaInfo {
  name: string;
  description: string;
  genre: string[];
  type: string;
  cast?: string[];
}

export interface SeasonMeta {
  season: number;
  description?: string;
  logo?: string;
}

export interface TvShowInfo extends MediaInfo {
  season?: number;
  episodes?: number;
  seasons?: SeasonMeta[];
}

export interface MovieInfo extends MediaInfo {}

const TV_ALIASES = new Set(["tvshow", "tv", "series", "show", "tvseries"]);
const MOVIE_ALIASES = new Set(["movie", "film"]);

export function normalizeType(raw: unknown): "tv" | "movie" | null {
  if (typeof raw !== "string") return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  if (TV_ALIASES.has(key)) return "tv";
  if (MOVIE_ALIASES.has(key)) return "movie";
  return null;
}

function parseSeasonsArray(raw: unknown): SeasonMeta[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SeasonMeta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const seasonNum = typeof rec.season === "number" ? rec.season : Number(rec.season);
    if (!Number.isFinite(seasonNum)) continue;
    const meta: SeasonMeta = { season: Math.trunc(seasonNum) };
    if (typeof rec.description === "string") meta.description = rec.description;
    if (typeof rec.logo === "string") meta.logo = rec.logo;
    out.push(meta);
  }
  return out.length > 0 ? out : undefined;
}

export function parseTomlString(content: string): TvShowInfo | MovieInfo | null {
  const parsed = toml.parse(content);
  const series = parsed.series;
  if (!series) return null;
  const typeRaw: unknown = series.type;
  const normalized = normalizeType(typeRaw);
  if (!normalized) return null;
  const typeStr = typeof typeRaw === "string" ? typeRaw : "";

  if (normalized === "tv") {
    // Accept [[seasons]] at the top level (idiomatic TOML) OR nested under [series].
    const seasonsRaw = (parsed as { seasons?: unknown }).seasons ?? series.seasons;
    const show: TvShowInfo = {
      name: series.name,
      description: series.description,
      genre: series.genre || [],
      type: typeStr,
      cast: series.cast,
      season: typeof series.season === "number" ? series.season : undefined,
      episodes: typeof series.episodes === "number" ? series.episodes : undefined,
      seasons: parseSeasonsArray(seasonsRaw),
    };
    return show;
  }
  const movie: MovieInfo = {
    name: series.name,
    description: series.description,
    genre: series.genre || [],
    type: typeStr,
    cast: series.cast,
  };
  return movie;
}

export async function readTomlFile(filePath: string) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`File not found: ${filePath}`);
    return null;
  }
  const fileContents = await file.text();
  const result = parseTomlString(fileContents);
  if (result) console.log(result);
  return result;
}

export default readTomlFile;
