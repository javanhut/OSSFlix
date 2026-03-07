import { useEffect, useState } from "react";
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/media/categories");
        const categories: MenuRow[] = await res.json();
        setRows(categories.filter((r) => !EXCLUDED_CATEGORIES.has(r.genre)));

        const allTitles = categories.flatMap((r) => r.titles);
        const seen = new Set<string>();
        const items: MediaItem[] = [];
        for (const t of allTitles) {
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
      } catch (err) {
        console.error("Failed to load media library:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div>
      {!loading && mediaList.length > 0 && <MediaCarousel mediaList={mediaList} />}
      {!loading && rows.length > 0 && <SelectorMenu rows={rows} />}
    </div>
  );
}
