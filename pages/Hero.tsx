import { useEffect, useState, useCallback } from "react";
import MediaCarousel from "../components/MediaCarousel";
import SelectorMenu from "../components/SelectorMenu";

type MediaItem = {
  imagePath: string;
  title: string;
  description: string;
  pathToDir: string;
};

type TitleInfo = {
  name: string;
  imagePath: string;
  pathToDir: string;
};

type MenuRow = {
  genre: string;
  titles: TitleInfo[];
};

const EXCLUDED_CATEGORIES = new Set(["Movies", "TV Shows"]);

export default function Home() {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/media/categories");
      const categories: MenuRow[] = await res.json();
      setRows(categories.filter((r) => !EXCLUDED_CATEGORIES.has(r.genre)));

      const newlyAdded = categories.find((r) => r.genre === "Newly Added");
      const titles = newlyAdded ? newlyAdded.titles : categories.flatMap((r) => r.titles);
      const seen = new Set<string>();
      const items: MediaItem[] = [];
      for (const t of titles) {
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
    } catch (err) {
      console.error("Failed to load media library:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener("ossflix-media-updated", handler);
    return () => window.removeEventListener("ossflix-media-updated", handler);
  }, [loadData]);

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
      <div style={{ paddingTop: "2rem" }}>
        {rows.length > 0 && <SelectorMenu rows={rows} />}
      </div>
    </>
  );
}
