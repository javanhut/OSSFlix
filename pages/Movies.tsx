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

export default function Movies() {
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/media/categories")
      .then((res) => res.json())
      .then((categories: MenuRow[]) => {
        const moviesRow = categories.find((r) => r.genre === "Movies");
        setRows(moviesRow ? [moviesRow] : []);
      })
      .catch((err) => console.error("Failed to load movies:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="spinner-border" role="status" />
      </div>
    );
  }

  return (
    <>
      <h1 className="oss-page-title">Movies</h1>
      {rows.length > 0 && <SelectorMenu rows={rows} />}
      {rows.length === 0 && <p className="oss-empty">No movies found.</p>}
    </>
  );
}
