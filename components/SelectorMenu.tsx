import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Card } from "./Card";
import { RowCarousel } from "./RowCarousel";

function seeAllHrefFor(genre: string, isContinueWatching?: boolean): string | null {
  if (isContinueWatching) return null;
  if (genre === "Continue Watching") return null;
  if (genre === "Watchlist") return "/mylist";
  if (genre === "Movies") return "/movies";
  if (genre === "TV Shows" || genre === "TVShows" || genre === "TV") return "/tvshows";
  if (genre.startsWith("Because you watch")) return null;
  return `/genre/${encodeURIComponent(genre)}`;
}

type TitleInfo = {
  name: string;
  imagePath: string;
  pathToDir: string;
  progressPct?: number;
};

type MenuRow = {
  genre: string;
  titles: TitleInfo[];
};

type SelectorMenuProps = {
  rows: MenuRow[];
  isContinueWatching?: boolean;
  onWatchlistChange?: (dirPath: string, inList: boolean) => void;
};

const PREVIEWABLE_VIDEO_EXTS = new Set(["mp4", "webm", "m4v", "ogv", "mov"]);
function isPreviewableSrc(src: string | null): src is string {
  if (!src) return false;
  const ext = (src.split(".").pop() || "").toLowerCase();
  return PREVIEWABLE_VIDEO_EXTS.has(ext);
}

function TitleCard({
  title,
  onClick,
  showQuickAdd,
  onWatchlistChange,
}: {
  title: TitleInfo;
  onClick: () => void;
  showQuickAdd?: boolean;
  onWatchlistChange?: (dirPath: string, inList: boolean) => void;
}) {
  const [cardHovered, setCardHovered] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [firstVideoSrc, setFirstVideoSrc] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [checkedWatchlist, setCheckedWatchlist] = useState(false);
  const fetchedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (showQuickAdd && !checkedWatchlist) {
      fetch(`/api/watchlist/check?dir=${encodeURIComponent(title.pathToDir)}`, { credentials: "same-origin" })
        .then((res) => res.json())
        .then((data: { inList: boolean }) => {
          setInWatchlist(data.inList);
          setCheckedWatchlist(true);
        })
        .catch(() => {});
    }
  }, [showQuickAdd, title.pathToDir, checkedWatchlist]);

  useEffect(() => {
    if (cardHovered && !fetchedRef.current) {
      fetchedRef.current = true;
      fetch(`/api/media/info?dir=${encodeURIComponent(title.pathToDir)}`)
        .then((res) => res.json())
        .then((data) => {
          setDescription(data.description);
          setFirstVideoSrc(Array.isArray(data.videos) && data.videos.length > 0 ? data.videos[0] : null);
        })
        .catch(() => {});
    }
  }, [cardHovered, title.pathToDir]);

  // Open the preview after 3s of continuous card hover; close the moment the cursor leaves the card.
  useEffect(() => {
    if (!cardHovered) {
      setPreviewOpen(false);
      return;
    }
    const t = setTimeout(() => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(680, window.innerWidth - 32);
      // Center the panel over the card, clamp inside the viewport
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
      // Sit roughly on top of the card; bias upward so the panel hovers around its position
      const estHeight = (width * 9) / 16 + 120;
      let top = rect.top + rect.height / 2 - estHeight / 2;
      top = Math.max(16, Math.min(top, window.innerHeight - estHeight - 16));
      setPreviewPos({ left, top, width });
      setPreviewOpen(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [cardHovered]);

  // Close the preview on scroll or resize — the fixed-position panel wouldn't track the card otherwise.
  useEffect(() => {
    if (!previewOpen) return;
    const close = () => setPreviewOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [previewOpen]);

  const canPreview = isPreviewableSrc(firstVideoSrc);

  const handleWatchlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const method = inWatchlist ? "DELETE" : "POST";
    fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ dir_path: title.pathToDir }),
    })
      .then(() => {
        const newState = !inWatchlist;
        setInWatchlist(newState);
        if (onWatchlistChange) onWatchlistChange(title.pathToDir, newState);
      })
      .catch(() => {});
  };

  const handleCardClick = () => {
    setPreviewOpen(false);
    setCardHovered(false);
    onClick();
  };

  return (
    <>
      <div
        ref={cardRef}
        role="button"
        className="oss-card"
        aria-label={title.name}
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        onClick={handleCardClick}
      >
        <img src={title.imagePath} alt={title.name} className="oss-card-img" loading="lazy" decoding="async" />
        <div className="oss-card-overlay">
          <p>{cardHovered ? (description ?? "Loading...") : ""}</p>
        </div>
        <div className="oss-card-title-bar">
          <span>{title.name}</span>
        </div>
        {showQuickAdd && (
          <button
            type="button"
            className={`watchlist-quick${inWatchlist ? " in-list" : ""}`}
            onClick={handleWatchlistToggle}
            aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          >
            {inWatchlist ? "\u2713" : "+"}
          </button>
        )}
        {title.progressPct != null && title.progressPct > 0 && (
          <div className="oss-card-progress" aria-hidden="true">
            <div className="oss-card-progress-fill" style={{ width: `${title.progressPct}%` }} />
          </div>
        )}
      </div>

      {previewOpen && canPreview && previewPos && firstVideoSrc && typeof document !== "undefined"
        ? createPortal(
            <div
              style={{
                position: "fixed",
                left: previewPos.left,
                top: previewPos.top,
                width: previewPos.width,
                background: "var(--oss-bg-card, #0a0a0e)",
                borderRadius: "var(--oss-radius, 8px)",
                overflow: "hidden",
                boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
                pointerEvents: "none",
                zIndex: 2000,
              }}
            >
              <div style={{ position: "relative", background: "#000" }}>
                <video
                  key={firstVideoSrc}
                  src={`/api/stream?src=${encodeURIComponent(firstVideoSrc)}`}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    const target = Math.min(30, (v.duration || 60) * 0.1);
                    if (Number.isFinite(target) && target > 0) v.currentTime = target;
                  }}
                  style={{ width: "100%", height: "auto", maxHeight: "60vh", objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(transparent 55%, rgba(10,10,14,0.92))",
                  }}
                />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 20px" }}>
                  <h3 style={{ color: "#fff", margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>{title.name}</h3>
                  {description && (
                    <p
                      style={{
                        color: "rgba(255,255,255,0.75)",
                        margin: "6px 0 0",
                        fontSize: "0.85rem",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {description}
                    </p>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function SelectorMenu({ rows, isContinueWatching, onWatchlistChange }: SelectorMenuProps) {
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
            {(() => {
              const href = seeAllHrefFor(row.genre, isContinueWatching);
              return href ? (
                <Link to={href} className="oss-section-title-text">
                  {row.genre}
                </Link>
              ) : (
                <span>{row.genre}</span>
              );
            })()}
            {isContinueWatching && <span className="oss-resume-badge">Resume</span>}
            {(() => {
              const href = seeAllHrefFor(row.genre, isContinueWatching);
              return href ? (
                <Link to={href} className="oss-section-title-link">
                  See all &rarr;
                </Link>
              ) : null;
            })()}
          </h2>
          <RowCarousel role="list">
            {row.titles.map((title) => (
              <TitleCard
                key={title.pathToDir}
                title={title}
                onClick={() => handleTitleClick(title.pathToDir)}
                showQuickAdd={!isContinueWatching}
                onWatchlistChange={onWatchlistChange}
              />
            ))}
          </RowCarousel>
        </section>
      ))}
      <Card
        show={modalOpen}
        onHide={() => setModalOpen(false)}
        dirPath={selectedDir}
        onWatchlistChange={onWatchlistChange}
      />
    </>
  );
}

export default SelectorMenu;
