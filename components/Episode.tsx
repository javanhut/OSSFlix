import { Image } from "react-bootstrap";

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
    <div
      role="button"
      onClick={onClick}
      className="d-flex align-items-center gap-3 p-2 rounded"
      style={{ cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Image
        src={thumbnail || "/images/placeholders.dev-1280x720.webp"}
        rounded
        style={{ width: "100px", height: "56px", objectFit: "cover", flexShrink: 0 }}
      />
      <div className="flex-grow-1 overflow-hidden">
        <p className="mb-0 fw-medium text-truncate">{label}</p>
        <small className="text-muted">{parsed.type === "episode" ? `Season ${parsed.season}` : "Movie"}</small>
      </div>
      <span style={{ fontSize: "1.4rem", color: "#2563eb", flexShrink: 0 }}>&#9654;</span>
    </div>
  );
}

export default Episode;
