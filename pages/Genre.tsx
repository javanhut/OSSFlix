import { useEffect, useState, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import MediaCarousel from "../components/MediaCarousel";
import SelectorMenu from "../components/SelectorMenu";

const ANIME_ALIASES = new Set(["anime", "animation"]);

type TitleInfo = {
  name: string;
  imagePath: string;
  pathToDir: string;
};

type MenuRow = {
  genre: string;
  titles: TitleInfo[];
};

type MediaItem = {
  imagePath: string;
  title: string;
  description: string;
  pathToDir: string;
};

export default function Genre() {
  const { genre } = useParams<{ genre: string }>();
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const decodedGenre = genre ? decodeURIComponent(genre) : "";
  const shouldRedirectToAnime = ANIME_ALIASES.has(decodedGenre.toLowerCase());

  const loadData = useCallback(() => {
    if (!genre) return;
    const decodedGenre = decodeURIComponent(genre);

    fetch("/api/media/categories")
      .then((res) => res.json())
      .then((categories: MenuRow[]) => {
        const genreRow = categories.find((r) => r.genre === decodedGenre);
        if (genreRow) {
          setRows([genreRow]);
          const seen = new Set<string>();
          const items: MediaItem[] = [];
          for (const t of genreRow.titles) {
            if (t.imagePath && !seen.has(t.pathToDir)) {
              seen.add(t.pathToDir);
              items.push({
                imagePath: t.imagePath,
                title: t.name,
                description: "",
                pathToDir: t.pathToDir,
              });
            }
            if (items.length >= 6) break;
          }
          setMediaList(items);
        } else {
          setRows([]);
          setMediaList([]);
        }
      })
      .catch((err) => console.error("Failed to load genre:", err))
      .finally(() => setLoading(false));
  }, [genre]);

  useEffect(() => {
    if (shouldRedirectToAnime) return;
    loadData();
  }, [loadData, shouldRedirectToAnime]);

  useEffect(() => {
    if (shouldRedirectToAnime) return;
    const handler = () => loadData();
    window.addEventListener("ossflix-media-updated", handler);
    return () => window.removeEventListener("ossflix-media-updated", handler);
  }, [loadData, shouldRedirectToAnime]);

  if (shouldRedirectToAnime) {
    return <Navigate to="/anime" replace />;
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="spinner-border" role="status" />
      </div>
    );
  }

  return (
    <>
      {mediaList.length > 0 && <MediaCarousel mediaList={mediaList} />}
      {rows.length > 0 && (
        <>
          <h1 className="oss-page-title">{decodedGenre}</h1>
          <SelectorMenu rows={rows} />
        </>
      )}
      {rows.length === 0 && <p className="oss-empty">No titles found for "{decodedGenre}".</p>}
    </>
  );
}
