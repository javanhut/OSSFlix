import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MediaCarousel from "../components/MediaCarousel";
import SelectorMenu from "../components/SelectorMenu";

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

  useEffect(() => {
    if (!genre) return;
    const decodedGenre = decodeURIComponent(genre);

    fetch("/api/media/categories")
      .then((res) => res.json())
      .then((categories: MenuRow[]) => {
        // Find the row matching this genre
        const genreRow = categories.find((r) => r.genre === decodedGenre);
        if (genreRow) {
          setRows([genreRow]);

          // Build carousel items from titles with images
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

  const decodedGenre = genre ? decodeURIComponent(genre) : "";

  return (
    <div>
      {!loading && mediaList.length > 0 && <MediaCarousel mediaList={mediaList} />}
      {!loading && rows.length > 0 && (
        <>
          <h1 className="px-3 pt-3">{decodedGenre}</h1>
          <SelectorMenu rows={rows} />
        </>
      )}
      {!loading && rows.length === 0 && (
        <p className="px-3 pt-3 text-muted">No titles found for "{decodedGenre}".</p>
      )}
    </div>
  );
}
