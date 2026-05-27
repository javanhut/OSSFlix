import { parseEpisodePath, type AudioVariant } from "../scripts/episodeNaming";

type Progress = {
  current_time: number;
  duration: number;
};

type EpisodeProps = {
  filename: string;
  progress?: Progress | null;
  variant?: AudioVariant | null;
  altTitle?: string | null;
  onEditTitle?: () => void;
  onPlay: () => void;
  onRestart?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
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

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Episode({
  filename,
  progress,
  variant,
  altTitle,
  onEditTitle,
  onPlay,
  onRestart,
  onHoverStart,
  onHoverEnd,
}: EpisodeProps) {
  const parsed = parseFilename(filename);
  const isInProgress =
    !!progress &&
    progress.current_time > 0 &&
    (progress.duration === 0 || progress.current_time < progress.duration - 5);
  const isWatched = !!progress && progress.duration > 0 && progress.current_time >= progress.duration - 5;
  const pct = progress && progress.duration > 0 ? (progress.current_time / progress.duration) * 100 : 0;

  const originalTitleText = parsed.type === "episode" ? parsed.title || "Untitled" : parsed.title || "Untitled";
  const titleText = altTitle?.trim() ? altTitle : originalTitleText;
  const ariaLabel = parsed.type === "episode" ? `Play Episode ${parsed.episode}` : `Play ${titleText}`;

  let stateClass = "";
  if (isWatched) stateClass = " watched";
  else if (isInProgress) stateClass = " in-progress";

  let metaText: string | null = null;
  if (progress && progress.duration > 0) {
    if (isInProgress) metaText = `${formatTime(progress.current_time)} / ${formatTime(progress.duration)}`;
    else metaText = formatTime(progress.duration);
  }

  return (
    <div
      className={`oss-episode${stateClass}`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
    >
      <button type="button" className="oss-episode-main" onClick={onPlay} aria-label={ariaLabel}>
        <span className="oss-episode-num" aria-hidden="true">
          {parsed.type === "episode" ? `Episode ${parsed.episode}` : "Movie"}
          {isWatched && <span className="oss-episode-num-check"> &#10003;</span>}
        </span>
        <span className="oss-episode-info">
          <span className="oss-episode-title">
            {titleText}
            {variant && (
              <span
                className={`oss-episode-variant oss-episode-variant-${variant}`}
                style={{
                  marginLeft: "8px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: variant === "sub" ? "rgba(59,130,246,0.18)" : "rgba(168,85,247,0.18)",
                  color: variant === "sub" ? "#93c5fd" : "#d8b4fe",
                  verticalAlign: "middle",
                }}
              >
                {variant}
              </span>
            )}
          </span>
        </span>
        {metaText && <span className="oss-episode-meta">{metaText}</span>}
        <span className="oss-episode-play" aria-hidden="true">
          &#9654;
        </span>
      </button>
      {isInProgress && onRestart && (
        <button
          type="button"
          className="oss-episode-restart"
          onClick={(e) => {
            e.stopPropagation();
            onRestart();
          }}
          title="Play from beginning"
          aria-label="Play from beginning"
        >
          &#8634;
        </button>
      )}
      {onEditTitle && (
        <button
          type="button"
          className={`oss-episode-edit${altTitle ? " has-override" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onEditTitle();
          }}
          title={altTitle ? "Edit display name (override active)" : "Edit display name"}
          aria-label="Edit episode display name"
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325" />
          </svg>
        </button>
      )}
      {pct > 0 && (
        <div className="oss-episode-progress" aria-hidden="true">
          <div
            className={`oss-episode-progress-fill${isWatched ? " complete" : ""}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default Episode;
