import { useEffect, useState } from "react";
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

export default function TVShows() {
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/media/categories")
      .then((res) => res.json())
      .then((categories: MenuRow[]) => {
        const tvRow = categories.find((r) => r.genre === "TV Shows");
        setRows(tvRow ? [tvRow] : []);
      })
      .catch((err) => console.error("Failed to load TV shows:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="px-3 pt-3">TV Shows</h1>
      {!loading && rows.length > 0 && <SelectorMenu rows={rows} />}
      {!loading && rows.length === 0 && <p className="px-3 text-muted">No TV shows found.</p>}
    </div>
  );
}
