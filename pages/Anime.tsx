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

export default function Anime() {
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    fetch("/api/media/categories")
      .then((res) => res.json())
      .then((categories: MenuRow[]) => {
        const animeRow = categories.find((r) => r.genre === "Anime" || r.genre === "Animation");
        setRows(animeRow ? [animeRow] : []);
      })
      .catch((err) => console.error("Failed to load anime:", err))
      .finally(() => setLoading(false));
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
      <h1 className="oss-page-title">Anime</h1>
      {rows.length > 0 && <SelectorMenu rows={rows} />}
      {rows.length === 0 && <p className="oss-empty">No anime found.</p>}
    </>
  );
}
