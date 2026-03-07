type EpisodeProps = {
  filename: string;
  thumbnail: string | null;
  onClick: () => void;
};

function parseFilename(filename: string) {
  const episodeMatch = filename.match(/^(.*?)_s(\d+)_ep(\d+)\.[^.]+$/i);

  if (episodeMatch) {
    return {
      type: "episode" as const,
      title: episodeMatch[1].replace(/_/g, " "),
      season: Number(episodeMatch[2]),
      episode: Number(episodeMatch[3]),
    };
  }

  const movieTitle = filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  return { type: "movie" as const, title: movieTitle };
}

export function Episode({ filename, thumbnail, onClick }: EpisodeProps) {
  const parsed = parseFilename(filename);
  const label =
    parsed.type === "episode"
      ? `S${parsed.season} E${parsed.episode} - ${parsed.title}`
      : parsed.title;

  return (
    <div className="oss-episode" role="button" onClick={onClick}>
      <img
        src={thumbnail || "/images/placeholders.dev-1280x720.webp"}
        alt={label}
        className="oss-episode-thumb"
      />
      <div className="oss-episode-info">
        <p className="oss-episode-title">{label}</p>
        <p className="oss-episode-sub">
          {parsed.type === "episode" ? `Season ${parsed.season}` : "Movie"}
        </p>
      </div>
      <span className="oss-episode-play">&#9654;</span>
    </div>
  );
}

export default Episode;
