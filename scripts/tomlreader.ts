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


export async function readTomlFile(filePath: string) {
  const file = Bun.file(filePath);
  let fileInformation: any;
  if (!(await file.exists())) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const fileContents = await file.text();
  const parsed = toml.parse(fileContents);
  const series = parsed.series;
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
    console.log(show);
    fileInformation = show;
  } else if (type.toLowerCase() === "movie") {
    const movie: MovieInfo = {
      name: mediaName,
      description: description,
      genre: genre,
      type: type,
      cast: series.cast,
    };
    console.log(movie);
    fileInformation = movie;
  }

  return fileInformation;
}


export default readTomlFile;
