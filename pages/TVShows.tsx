import { useEffect, useState, useCallback } from "react";
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
  const [allTvRow, setAllTvRow] = useState<MenuRow | null>(null);
  const [genreRows, setGenreRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [catRes, genreRes] = await Promise.all([
        fetch("/api/media/categories"),
        fetch("/api/media/categories/type?type=tv show"),
      ]);
      const categories: MenuRow[] = await catRes.json();
      const genres: MenuRow[] = await genreRes.json();

      const tvRow = categories.find((r) => r.genre === "TV Shows") || null;
      setAllTvRow(tvRow);
      setGenreRows(genres);
    } catch (err) {
      console.error("Failed to load TV shows:", err);
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

  const rows = [
    ...(allTvRow ? [allTvRow] : []),
    ...genreRows,
  ];

  return (
    <>
      <h1 className="oss-page-title">TV Shows</h1>
      {rows.length > 0 && <SelectorMenu rows={rows} />}
      {rows.length === 0 && <p className="oss-empty">No TV shows found.</p>}
    </>
  );
}
