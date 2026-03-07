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
};

function TitleCard({ title, onClick }: { title: TitleInfo; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
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

  return (
    <div
      role="button"
      className="oss-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <img
        src={title.imagePath}
        alt={title.name}
        className="oss-card-img"
      />
      <div className="oss-card-overlay">
        <p>{hovered ? (description ?? "Loading...") : ""}</p>
      </div>
      <div className="oss-card-title-bar">
        <span>{title.name}</span>
      </div>
    </div>
  );
}

export function SelectorMenu({ rows }: SelectorMenuProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDir, setSelectedDir] = useState("");

  const handleTitleClick = (pathToDir: string) => {
    setSelectedDir(pathToDir);
    setModalOpen(true);
  };

  return (
    <>
      {rows.map((row) => (
        <section key={row.genre} className="oss-section">
          <h2 className="oss-section-title">{row.genre}</h2>
          <div className="oss-row">
            {row.titles.map((title) => (
              <TitleCard
                key={title.pathToDir}
                title={title}
                onClick={() => handleTitleClick(title.pathToDir)}
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
