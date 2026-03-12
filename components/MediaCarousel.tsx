import { useState, useEffect, useRef, useCallback } from "react";
import VideoPlayer from "./VideoPlayer";
import Card from "./Card";

type MediaItem = {
  imagePath: string;
  title: string;
  description: string;
  pathToDir: string;
};

type MediaCarouselProps = {
  mediaList: MediaItem[];
};

export default function MediaCarousel({ mediaList }: MediaCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerTitle, setPlayerTitle] = useState("");
  const [playerDir, setPlayerDir] = useState("");
  const [playerInitialTime, setPlayerInitialTime] = useState(0);
  const [infoCache, setInfoCache] = useState<Record<string, { description: string; videos: string[] }>>({});
  const [progressCache, setProgressCache] = useState<Record<string, { video_src: string; current_time: number; duration: number }>>({});
  const [cardDir, setCardDir] = useState("");
  const fetchedDirs = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const advance = useCallback(() => {
    setActiveIndex((i) => (i + 1) % mediaList.length);
  }, [mediaList.length]);

  // Clear caches when media is updated
  useEffect(() => {
    const handler = () => {
      fetchedDirs.current.clear();
      setInfoCache({});
      setProgressCache({});
    };
    window.addEventListener("ossflix-media-updated", handler);
    return () => window.removeEventListener("ossflix-media-updated", handler);
  }, []);

  // Auto-rotate every 8s
  useEffect(() => {
    if (mediaList.length <= 1) return;
    timerRef.current = setInterval(advance, 8000);
    return () => clearInterval(timerRef.current);
  }, [advance, mediaList.length]);

  const goTo = (idx: number) => {
    setActiveIndex(idx);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(advance, 8000);
  };

  // Prefetch info for current slide
  useEffect(() => {
    const item = mediaList[activeIndex];
    if (!item || fetchedDirs.current.has(item.pathToDir)) return;
    fetchedDirs.current.add(item.pathToDir);
    fetch(`/api/media/info?dir=${encodeURIComponent(item.pathToDir)}`)
      .then((r) => r.json())
      .then((data) => {
        setInfoCache((prev) => ({
          ...prev,
          [item.pathToDir]: { description: data.description || "", videos: data.videos || [] },
        }));
      })
      .catch(() => {});
    fetchProgressForDir(item.pathToDir);
  }, [activeIndex, mediaList]);

  const fetchProgressForDir = (dirPath: string) => {
    fetch(`/api/playback/progress?dir=${encodeURIComponent(dirPath)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((entries: any[]) => {
        if (entries.length > 0) {
          setProgressCache((prev) => ({ ...prev, [dirPath]: entries[0] }));
        }
      })
      .catch(() => {});
  };

  const handlePlay = (item: MediaItem) => {
    const cached = infoCache[item.pathToDir];
    if (!cached?.videos?.length) return;
    const prog = progressCache[item.pathToDir];
    if (prog && prog.current_time > 0 && (prog.duration === 0 || prog.current_time < prog.duration - 5)) {
      setPlayerSrc(prog.video_src);
      setPlayerInitialTime(prog.current_time);
    } else {
      setPlayerSrc(cached.videos[0]);
      setPlayerInitialTime(0);
    }
    setPlayerTitle(item.title);
    setPlayerDir(item.pathToDir);
  };

  const currentItem = mediaList[activeIndex];
  const currentInfo = currentItem ? infoCache[currentItem.pathToDir] : null;
  const hasProgress = currentItem && progressCache[currentItem.pathToDir]?.current_time > 0;

  return (
    <>
      <div className="oss-hero">
        {mediaList.map((item, idx) => (
          <div key={item.pathToDir} className={`oss-hero-slide${idx === activeIndex ? " active" : ""}`}>
            <img src={item.imagePath} alt={item.title} loading={idx === 0 ? "eager" : "lazy"} />
          </div>
        ))}
        <div className="oss-hero-vignette" />
        {currentItem && (
          <div className="oss-hero-content">
            <h1 className="oss-hero-title">{currentItem.title}</h1>
            <p className="oss-hero-desc">
              {currentInfo?.description || ""}
            </p>
            <div className="oss-hero-actions">
              <button
                className="oss-btn oss-btn-primary"
                onClick={() => handlePlay(currentItem)}
                disabled={!currentInfo?.videos?.length}
                style={{ opacity: currentInfo?.videos?.length ? 1 : 0.5 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
                {hasProgress ? "Resume" : "Play"}
              </button>
              <button className="oss-btn oss-btn-secondary" onClick={() => setCardDir(currentItem.pathToDir)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                More Info
              </button>
            </div>
          </div>
        )}
        {mediaList.length > 1 && (
          <div className="oss-hero-indicators">
            {mediaList.map((_, idx) => (
              <button
                key={idx}
                className={`oss-hero-dot${idx === activeIndex ? " active" : ""}`}
                onClick={() => goTo(idx)}
              />
            ))}
          </div>
        )}
      </div>

      <VideoPlayer
        show={!!playerSrc}
        onHide={() => { setPlayerSrc(null); if (playerDir) fetchProgressForDir(playerDir); }}
        src={playerSrc || ""}
        title={playerTitle}
        dirPath={playerDir}
        initialTime={playerInitialTime}
        onNext={() => {
          const cached = infoCache[playerDir];
          if (!cached?.videos || !playerSrc) return;
          const currentIndex = cached.videos.indexOf(playerSrc);
          if (currentIndex >= 0 && currentIndex < cached.videos.length - 1) {
            setPlayerInitialTime(0);
            setPlayerSrc(cached.videos[currentIndex + 1]);
          } else {
            setPlayerSrc(null);
            if (playerDir) fetchProgressForDir(playerDir);
          }
        }}
        profileId={undefined}
      />

      <Card
        show={!!cardDir}
        onHide={() => setCardDir("")}
        dirPath={cardDir}
      />
    </>
  );
}
