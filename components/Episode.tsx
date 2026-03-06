import { Image, Button } from "react-bootstrap";

type EpisodePathProps = {
  episodeString: string;
}

function parseFilename(filename: string) {
  const episodeMatch = filename.match(/^(.*?)_s(\d+)_ep(\d+)\.[^.]+$/i);

  if (episodeMatch) {
    return {
      type: "episode",
      title: episodeMatch[1],
      season: Number(episodeMatch[2]),
      episode: Number(episodeMatch[3])
    };
  }

  const movieTitle = filename.replace(/\.[^/.]+$/, "");

  return {
    type: "movie",
    title: movieTitle
  };
}




export function Episode({ episodeString }: EpisodePathProps) {
  const placeholderDescription = "Placholder description";
  const parsedFile = parseFilename(episodeString);
  if (parsedFile.type === "movie") {
  return (<>
          <div><Image src="../images/placeholders.dev-1280x720.webp" /> {parsedFile.title} {placeholderDescription} </div>
          </>);
  } else if (parsedFile.type === "episode") {
  
  return (<>
          <div><Image src="../images/placeholders.dev-1280x720.webp" />{parsedFile.episode}. {parsedFile.title}: {placeholderDescription} </div>
          </>);

  }
}

export default Episode;
