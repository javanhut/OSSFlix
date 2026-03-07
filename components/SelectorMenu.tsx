import { Image } from "react-bootstrap";
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
      className="text-decoration-none flex-shrink-0 position-relative rounded overflow-hidden"
      style={{
        minWidth: "180px",
        maxWidth: "180px",
        backgroundColor: "#1e3a5f",
        transform: hovered ? "scale(1.15)" : "scale(1)",
        transition: "transform 0.2s ease",
        zIndex: hovered ? 1 : 0,
        cursor: "pointer",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <Image
        src={title.imagePath}
        alt={title.name}
        style={{ width: "100%", height: "260px", objectFit: "cover" }}
      />
      {hovered && (
        <div
          className="position-absolute top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-2"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <p className="mb-0 small text-white text-center" style={{
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
          }}>
            {description ?? "Loading..."}
          </p>
        </div>
      )}
      <div
        className="position-absolute bottom-0 start-0 end-0 p-2"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))", zIndex: 1 }}
      >
        <p className="mb-0 small fw-medium text-white">{title.name}</p>
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
      <section className="w-100 py-3 px-3">
        {rows.map((row) => (
          <div key={row.genre} className="mb-4 rounded p-3" style={{ backgroundColor: "#e0e0e0" }}>
            <h2 className="fs-4 fw-semibold text-dark mb-3 px-2 py-1 rounded d-inline-block" style={{ backgroundColor: "#d0d0d0" }}>{row.genre}</h2>

            <div className="d-flex overflow-auto gap-3 pb-2">
              {row.titles.map((title) => (
                <TitleCard
                  key={title.pathToDir}
                  title={title}
                  onClick={() => handleTitleClick(title.pathToDir)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
      <Card
        show={modalOpen}
        onHide={() => setModalOpen(false)}
        dirPath={selectedDir}
      />
    </>
  );
}

export default SelectorMenu;
