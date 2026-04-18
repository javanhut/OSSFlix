const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";

export type TMDBSearchResult = {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
};

export type TMDBDetails = {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  genres: { id: number; name: string }[];
  credits?: {
    cast: { name: string; order: number }[];
  };
  number_of_seasons?: number;
  number_of_episodes?: number;
};

export async function searchTMDB(query: string, apiKey: string, type?: "movie" | "tv"): Promise<TMDBSearchResult[]> {
  const endpoint = type ? `${TMDB_BASE}/search/${type}` : `${TMDB_BASE}/search/multi`;
  const url = `${endpoint}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter((r: any) => r.media_type !== "person");
}

export async function getTMDBDetails(id: number, mediaType: "movie" | "tv", apiKey: string): Promise<TMDBDetails> {
  const url = `${TMDB_BASE}/${mediaType}/${id}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB details failed: ${res.status}`);
  return await res.json();
}

export async function downloadImage(tmdbPath: string, destDir: string, filename: string): Promise<string> {
  const url = `${TMDB_IMG_BASE}/w500${tmdbPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const ext = tmdbPath.split(".").pop() || "jpg";
  const destFile = `${destDir}/${filename}.${ext}`;
  await Bun.write(destFile, res);
  return destFile;
}
