import {Button, Modal, ModalHeader, ModalBody, ModalTitle, ModalFooter} from 'react-bootstrap';
import { useEffect, useState } from "react";
import {Episode} from "./Episode"
interface MediaInfo {
  name: string;
  description: string;
  genre: string[];
  type: string;
  cast?: string[];
}

export function Card({ show, onHide }: { show: boolean; onHide: () => void }) {
  const [information, setInformation] = useState<MediaInfo | null>(null);
  const played = false;

  useEffect(() => {
    if (show) {
      fetch("/api/media?path=TestDir/Movies/MaryPoppins/marypoppins.toml")
        .then((res) => res.json())
        .then((data) => setInformation(data));
    }
  }, [show]);

  if (!information) {
    return null;
  }
  const examplePath = "marypoppins.mp4"

return (
  <>
  <Modal show={show} onHide={onHide}>
          <ModalHeader>
              <ModalTitle>Title: {information.name}</ModalTitle>
          </ModalHeader>
          <ModalBody>
              <p>Description {information.description}</p>
              <p>Cast: {information.cast?.join(", ")}</p>
              <Episode episodeString={examplePath} />
          </ModalBody>
          <ModalFooter>
          <Button>{played ? "Resume" : "Play"}</Button>
          </ModalFooter>
   </Modal>
  </>
);
};


export default Card;


