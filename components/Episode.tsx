import { parseEpisodePath, formatEpisodeLabel } from "../scripts/episodeNaming";

type EpisodeProps = {
  filename: string;
  thumbnail: string | null;
  onClick: () => void;
};

function parseFilename(filename: string) {
  const parsed = parseEpisodePath(filename);
  if (parsed) {
    return {
      type: "episode" as const,
      title: parsed.title,
      season: parsed.season,
      episode: parsed.episode,
    };
  }
  const movieTitle = filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  return { type: "movie" as const, title: movieTitle };
}

export function Episode({ filename, thumbnail, onClick }: EpisodeProps) {
  const parsed = parseFilename(filename);
  const label =
    parsed.type === "episode"
      ? formatEpisodeLabel({ season: parsed.season, episode: parsed.episode, title: parsed.title, ext: "" })
      : parsed.title;

  const ariaLabel = parsed.type === "episode" ? `Play Episode ${parsed.episode}` : `Play ${parsed.title}`;

  return (
    <button type="button" className="oss-episode" aria-label={ariaLabel} onClick={onClick}>
      <img src={thumbnail || "/images/placeholders.dev-1280x720.webp"} alt={label} className="oss-episode-thumb" />
      <div className="oss-episode-info">
        <p className="oss-episode-title">{label}</p>
        <p className="oss-episode-sub">{parsed.type === "episode" ? `Season ${parsed.season}` : "Movie"}</p>
      </div>
      <span className="oss-episode-play" aria-hidden="true">
        &#9654;
      </span>
    </button>
  );
}

export default Episode;
