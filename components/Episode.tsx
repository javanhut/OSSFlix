import { parseEpisodePath } from "../scripts/episodeNaming";

type Progress = {
  current_time: number;
  duration: number;
};

type EpisodeProps = {
  filename: string;
  progress?: Progress | null;
  onPlay: () => void;
  onRestart?: () => void;
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

export function Episode({ filename, progress, onPlay, onRestart }: EpisodeProps) {
  const parsed = parseFilename(filename);
  const isInProgress =
    !!progress &&
    progress.current_time > 0 &&
    (progress.duration === 0 || progress.current_time < progress.duration - 5);
  const isWatched = !!progress && progress.duration > 0 && progress.current_time >= progress.duration - 5;
  const pct = progress && progress.duration > 0 ? (progress.current_time / progress.duration) * 100 : 0;

  const titleText = parsed.type === "episode" ? parsed.title || `Episode ${parsed.episode}` : parsed.title;
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
    <div className={`oss-episode${stateClass}`}>
      <button type="button" className="oss-episode-main" onClick={onPlay} aria-label={ariaLabel}>
        <span className="oss-episode-num" aria-hidden="true">
          {parsed.type === "episode" ? `Episode ${parsed.episode}` : "Movie"}
          {isWatched && <span className="oss-episode-num-check"> &#10003;</span>}
        </span>
        <span className="oss-episode-info">
          <span className="oss-episode-title">{titleText}</span>
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
