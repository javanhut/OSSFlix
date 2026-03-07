import { Modal, ModalHeader, ModalBody, ModalTitle, ModalFooter, Spinner } from 'react-bootstrap';
import { useEffect, useState } from "react";
import { Episode } from "./Episode";
import VideoPlayer from "./VideoPlayer";

interface MediaInfo {
  name: string;
  description: string;
  genre: string[];
  type: string;
  cast?: string[];
  season?: number;
  episodes?: number;
  bannerImage: string | null;
  videos: string[];
  dirPath: string;
}

type CardProps = {
  show: boolean;
  onHide: () => void;
  dirPath: string;
};

type ProgressEntry = {
  video_src: string;
  current_time: number;
  duration: number;
};

export function Card({ show, onHide, dirPath }: CardProps) {
  const [information, setInformation] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerInitialTime, setPlayerInitialTime] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressEntry>>({});

  const fetchProgress = () => {
    if (!dirPath) return;
    fetch(`/api/playback/progress?dir=${encodeURIComponent(dirPath)}`)
      .then((res) => res.json())
      .then((entries: ProgressEntry[]) => {
        const map: Record<string, ProgressEntry> = {};
        for (const e of entries) map[e.video_src] = e;
        setProgressMap(map);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (show && dirPath) {
      setLoading(true);
      setInformation(null);
      fetch(`/api/media/info?dir=${encodeURIComponent(dirPath)}`)
        .then((res) => res.json())
        .then((data) => setInformation(data))
        .finally(() => setLoading(false));
      fetchProgress();
    }
  }, [show, dirPath]);

  const handlePlay = (videoSrc?: string) => {
    const src = videoSrc || information?.videos?.[0];
    if (!src) return;
    const saved = progressMap[src];
    setPlayerInitialTime(saved?.current_time || 0);
    setPlayerSrc(src);
  };

  const handleResume = () => {
    const entries = Object.values(progressMap).filter(
      (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 10)
    );
    if (entries.length > 0) {
      const latest = entries[0];
      setPlayerInitialTime(latest.current_time);
      setPlayerSrc(latest.video_src);
    } else {
      handlePlay();
    }
  };

  const hasResumable = Object.values(progressMap).some(
    (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 10)
  );

  return (
    <>
      <Modal show={show && !playerSrc} onHide={onHide} size="lg" centered>
        {loading && (
          <ModalBody className="text-center py-5">
            <Spinner animation="border" />
          </ModalBody>
        )}
        {!loading && information && (
          <>
            <ModalHeader closeButton>
              <ModalTitle>{information.name}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              {information.bannerImage && (
                <div style={{ position: "relative", marginBottom: "1rem", borderRadius: "var(--oss-radius)", overflow: "hidden" }}>
                  <img
                    src={information.bannerImage}
                    alt={information.name}
                    style={{ width: "100%", height: "300px", objectFit: "cover", display: "block" }}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(transparent 50%, var(--oss-bg-card))",
                  }} />
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                <span style={{
                  background: "var(--oss-accent)", color: "#fff",
                  padding: "3px 10px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600,
                  textTransform: "uppercase",
                }}>
                  {information.type}
                </span>
                {information.genre?.map((g) => (
                  <span key={g} style={{
                    background: "rgba(255,255,255,0.08)", color: "var(--oss-text-muted)",
                    padding: "3px 10px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 500,
                  }}>
                    {g}
                  </span>
                ))}
              </div>

              <p style={{ color: "var(--oss-text-muted)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem" }}>
                {information.description}
              </p>

              {information.cast && information.cast.filter(c => c).length > 0 && (
                <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Cast: </span>
                  {information.cast.filter(c => c).join(", ")}
                </p>
              )}
              {information.season != null && (
                <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                  <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Season {information.season}</span>
                  {" · "}
                  {information.episodes} episode{information.episodes !== 1 ? "s" : ""}
                </p>
              )}

              {information.videos?.length > 0 && (
                <div style={{ borderTop: "1px solid var(--oss-border)", paddingTop: "12px", marginTop: "8px" }}>
                  {information.videos.map((v) => {
                    const prog = progressMap[v];
                    const pct = prog && prog.duration > 0 ? (prog.current_time / prog.duration) * 100 : 0;
                    return (
                      <div key={v}>
                        <Episode
                          filename={v.split("/").pop()!}
                          thumbnail={information.bannerImage}
                          onClick={() => handlePlay(v)}
                        />
                        {pct > 0 && (
                          <div className="oss-progress-track">
                            <div className="oss-progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <button className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onHide}>Close</button>
              {information.videos?.length > 0 && (
                <>
                  {hasResumable && (
                    <button className="oss-btn oss-btn-success oss-btn-sm" onClick={handleResume}>
                      &#9654; Resume
                    </button>
                  )}
                  <button className="oss-btn oss-btn-primary oss-btn-sm" onClick={() => handlePlay()}>
                    &#9654; Play
                  </button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>

      <VideoPlayer
        show={!!playerSrc}
        onHide={() => { setPlayerSrc(null); fetchProgress(); }}
        src={playerSrc || ""}
        title={information?.name || ""}
        dirPath={dirPath}
        initialTime={playerInitialTime}
        onNext={() => {
          if (!information?.videos || !playerSrc) return;
          const currentIndex = information.videos.indexOf(playerSrc);
          if (currentIndex >= 0 && currentIndex < information.videos.length - 1) {
            const nextSrc = information.videos[currentIndex + 1];
            const saved = progressMap[nextSrc];
            setPlayerInitialTime(saved?.current_time || 0);
            setPlayerSrc(nextSrc);
          } else {
            setPlayerSrc(null);
            fetchProgress();
          }
        }}
      />
    </>
  );
}

export default Card;
