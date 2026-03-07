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

export function Card({ show, onHide, dirPath }: CardProps) {
  const [information, setInformation] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);

  useEffect(() => {
    if (show && dirPath) {
      setLoading(true);
      setInformation(null);
      fetch(`/api/media/info?dir=${encodeURIComponent(dirPath)}`)
        .then((res) => res.json())
        .then((data) => setInformation(data))
        .finally(() => setLoading(false));
    }
  }, [show, dirPath]);

  const handlePlay = (videoSrc?: string) => {
    if (videoSrc) {
      setPlayerSrc(videoSrc);
    } else if (information?.videos?.length) {
      setPlayerSrc(information.videos[0]);
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
                  {information.videos.map((v) => (
                    <Episode
                      key={v}
                      filename={v.split("/").pop()!}
                      thumbnail={information.bannerImage}
                      onClick={() => handlePlay(v)}
                    />
                  ))}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={onHide}>Close</Button>
              {information.videos?.length > 0 && (
                <Button variant="primary" onClick={() => handlePlay()}>
                  &#9654; Play
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>

      <VideoPlayer
        show={!!playerSrc}
        onHide={() => setPlayerSrc(null)}
        src={playerSrc || ""}
        title={information?.name || ""}
      />
    </>
  );
}

export default Card;
