import { useState, useEffect, useRef } from "react";
import { Card } from "./Card";

type TitleInfo = {
  name: string;
  imagePath: string;
  pathToDir: string;
};

type MenuRow = {
  genre: string;
  titles: TitleInfo[];
};

type SelectorMenuProps = {
  rows: MenuRow[];
  isContinueWatching?: boolean;
};

function TitleCard({ title, onClick, showQuickAdd }: { title: TitleInfo; onClick: () => void; showQuickAdd?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (hovered && !fetchedRef.current) {
      fetchedRef.current = true;
      fetch(`/api/media/info?dir=${encodeURIComponent(title.pathToDir)}`)
        .then((res) => res.json())
        .then((data) => setDescription(data.description))
        .catch(() => {});
    }
  }, [hovered, title.pathToDir]);

  const handleWatchlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const method = inWatchlist ? "DELETE" : "POST";
    fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ dir_path: title.pathToDir }),
    })
      .then(() => setInWatchlist(!inWatchlist))
      .catch(() => {});
  };

  return (
    <div
      role="button"
      className="oss-card"
      aria-label={title.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <img
        src={title.imagePath}
        alt={title.name}
        className="oss-card-img"
        loading="lazy"
      />
      <div className="oss-card-overlay">
        <p>{hovered ? (description ?? "Loading...") : ""}</p>
      </div>
      <div className="oss-card-title-bar">
        <span>{title.name}</span>
      </div>
      {showQuickAdd && (
        <button
          className={`watchlist-quick${inWatchlist ? " in-list" : ""}`}
          onClick={handleWatchlistToggle}
          aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
        >
          {inWatchlist ? "\u2713" : "+"}
        </button>
      )}
    </div>
  );
}

export function SelectorMenu({ rows, isContinueWatching }: SelectorMenuProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDir, setSelectedDir] = useState("");

  const handleTitleClick = (pathToDir: string) => {
    setSelectedDir(pathToDir);
    setModalOpen(true);
  };

  return (
    <>
      {rows.map((row, rowIdx) => (
        <section
          key={row.genre}
          className="oss-section"
          style={rows.length > 1 ? { animationDelay: `${rowIdx * 50}ms` } : undefined}
        >
          <h2 className="oss-section-title">
            {row.genre}
            {isContinueWatching && <span className="oss-resume-badge">Resume</span>}
          </h2>
          <div className="oss-row" role="list">
            {row.titles.map((title) => (
              <TitleCard
                key={title.pathToDir}
                title={title}
                onClick={() => handleTitleClick(title.pathToDir)}
                showQuickAdd={!isContinueWatching}
              />
            ))}
          </div>
        </section>
      ))}
      <Card
        show={modalOpen}
        onHide={() => setModalOpen(false)}
        dirPath={selectedDir}
      />
    </>
  );
}

export default SelectorMenu;
