import { Carousel, CarouselItem, Image, Spinner } from "react-bootstrap";
import { useState, useEffect, useRef } from "react";
import VideoPlayer from "./VideoPlayer";

type MediaItem = {
  imagePath: string;
  title: string;
  description: string;
  pathToDir: string;
};

type MediaCarouselProps = {
  mediaList: MediaItem[];
};

function CarouselSlide({ item }: { item: MediaItem }) {
  const [hovered, setHovered] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [videos, setVideos] = useState<string[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (hovered && !fetchedRef.current) {
      fetchedRef.current = true;
      fetch(`/api/media/info?dir=${encodeURIComponent(item.pathToDir)}`)
        .then((res) => res.json())
        .then((data) => {
          setDescription(data.description);
          setVideos(data.videos || []);
        })
        .catch(() => {});
    }
  }, [hovered, item.pathToDir]);

  return { hovered, setHovered, description, videos };
}

export default function MediaCarousel({ mediaList }: MediaCarouselProps) {
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerTitle, setPlayerTitle] = useState("");
  const [playerDir, setPlayerDir] = useState("");
  const [playerInitialTime, setPlayerInitialTime] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [infoCache, setInfoCache] = useState<Record<string, { description: string; videos: string[] }>>({});
  const [progressCache, setProgressCache] = useState<Record<string, { video_src: string; current_time: number; duration: number }>>({});
  const fetchedDirs = useRef(new Set<string>());

  const handleHover = (item: MediaItem) => {
    if (fetchedDirs.current.has(item.pathToDir)) return;
    fetchedDirs.current.add(item.pathToDir);
    fetch(`/api/media/info?dir=${encodeURIComponent(item.pathToDir)}`)
      .then((res) => res.json())
      .then((data) => {
        setInfoCache((prev) => ({
          ...prev,
          [item.pathToDir]: { description: data.description || "", videos: data.videos || [] },
        }));
      })
      .catch(() => {});
    fetchProgressForDir(item.pathToDir);
  };

  const handlePlay = (item: MediaItem) => {
    const cached = infoCache[item.pathToDir];
    if (!cached?.videos?.length) return;

    // Check if there's a saved progress for this title
    const prog = progressCache[item.pathToDir];
    if (prog && prog.current_time > 0 && (prog.duration === 0 || prog.current_time < prog.duration - 10)) {
      setPlayerSrc(prog.video_src);
      setPlayerInitialTime(prog.current_time);
    } else {
      setPlayerSrc(cached.videos[0]);
      setPlayerInitialTime(0);
    }
    setPlayerTitle(item.title);
    setPlayerDir(item.pathToDir);
  };

  const fetchProgressForDir = (dirPath: string) => {
    fetch(`/api/playback/progress?dir=${encodeURIComponent(dirPath)}`)
      .then((res) => res.json())
      .then((entries: any[]) => {
        if (entries.length > 0) {
          setProgressCache((prev) => ({ ...prev, [dirPath]: entries[0] }));
        }
      })
      .catch(() => {});
  };

  return (
    <>
      <Carousel>
        {mediaList.map((element, idx) => {
          const cached = infoCache[element.pathToDir];
          const isHovered = hoveredIndex === idx;

          return (
            <CarouselItem
              key={element.imagePath}
              onMouseEnter={() => { setHoveredIndex(idx); handleHover(element); }}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ position: "relative" }}
            >
              <Image
                src={element.imagePath}
                alt={element.title}
                style={{ width: "100%", height: "500px", objectFit: "cover" }}
              />
              {/* Dark overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: isHovered ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
                  transition: "background 0.3s",
                  padding: "40px",
                  zIndex: 1,
                  pointerEvents: isHovered ? "auto" : "none",
                }}
              >
                  {/* Title - bottom left */}
                  <h2 style={{
                    color: "#fff", fontWeight: 700, fontSize: "2rem",
                    textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                    position: "absolute", bottom: "40px", left: "40px",
                  }}>
                    {element.title}
                  </h2>
                  {/* Description + Play - centered */}
                  {isHovered && (
                    <div style={{
                      position: "absolute",
                      top: "50%", left: "50%",
                      transform: "translate(-50%, -50%)",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      textAlign: "center",
                    }}>
                      <p style={{
                        color: "rgba(255,255,255,0.9)",
                        fontSize: "1rem",
                        maxWidth: "600px",
                        marginBottom: "16px",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {cached?.description ?? "Loading..."}
                      </p>
                      <button
                        onClick={() => handlePlay(element)}
                        disabled={!cached?.videos?.length}
                        style={{
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "10px 24px",
                          fontSize: "1rem",
                          fontWeight: 600,
                          cursor: cached?.videos?.length ? "pointer" : "default",
                          opacity: cached?.videos?.length ? 1 : 0.5,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
                        {progressCache[element.pathToDir]?.current_time > 0 ? "Resume" : "Play"}
                      </button>
                    </div>
                  )}
                </div>
            </CarouselItem>
          );
        })}
      </Carousel>

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
      />
    </>
  );
}
