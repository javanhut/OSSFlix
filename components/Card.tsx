import { Button, Modal, ModalHeader, ModalBody, ModalTitle, ModalFooter, Image, Spinner } from 'react-bootstrap';
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
    // Find the most recently watched video for this title
    const entries = Object.values(progressMap).filter(
      (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 10)
    );
    if (entries.length > 0) {
      const latest = entries[0]; // already sorted by updated_at DESC from API
      setPlayerInitialTime(latest.current_time);
      setPlayerSrc(latest.video_src);
    } else {
      handlePlay();
    }
  };

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
                <Image
                  src={information.bannerImage}
                  alt={information.name}
                  style={{ width: "100%", height: "300px", objectFit: "cover", borderRadius: "8px" }}
                  className="mb-3"
                />
              )}
              <p><strong>Type:</strong> {information.type.replace(/\b\w+/g, w => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))}</p>
              <p><strong>Description:</strong> {information.description}</p>
              {information.genre?.length > 0 && (
                <p><strong>Genre:</strong> {information.genre.join(", ")}</p>
              )}
              {information.cast && information.cast.filter(c => c).length > 0 && (
                <p><strong>Cast:</strong> {information.cast.filter(c => c).join(", ")}</p>
              )}
              {information.season != null && (
                <p><strong>Season:</strong> {information.season} &mdash; <strong>Episodes:</strong> {information.episodes}</p>
              )}
              {information.videos?.length > 0 && (
                <div className="mt-2">
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
                          <div style={{ height: "3px", background: "rgba(0,0,0,0.1)", borderRadius: "2px", margin: "0 8px 4px" }}>
                            <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: "#2563eb", borderRadius: "2px" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={onHide}>Close</Button>
              {information.videos?.length > 0 && (
                <>
                  {Object.values(progressMap).some(e => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 10)) && (
                    <Button variant="success" onClick={handleResume}>
                      &#9654; Resume
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => handlePlay()}>
                    &#9654; Play
                  </Button>
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
