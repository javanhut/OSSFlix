import * as toml from 'toml';

interface MediaInfo {
  name: string;
  description: string;
  genre: string[];
  type: string;
  cast?: string[];
}
interface TvShowInfo extends MediaInfo {
  season: number;
  episodes: number;
}

interface MovieInfo extends MediaInfo{};


export function parseTomlString(content: string): MediaInfo | TvShowInfo | null {
  let fileInformation: any = null;
  const parsed = toml.parse(content);
  const series = parsed.series;
  if (!series) return null;
  const mediaName: string = series.name;
  const description: string = series.description;
  const genre: Array<string> = series.genre;
  const type: string = series.type;
  if (type.toLowerCase() === "tv show") {
    const show: TvShowInfo = {
      name: mediaName,
      description: description,
      genre: genre,
      type: type,
      season: series.season,
      episodes: series.episodes,
    };
    fileInformation = show;
  } else if (type.toLowerCase() === "movie") {
    const movie: MovieInfo = {
      name: mediaName,
      description: description,
      genre: genre,
      type: type,
      cast: series.cast,
    };
    fileInformation = movie;
  }
  return fileInformation;
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
