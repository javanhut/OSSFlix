import { useEffect, useState, useCallback } from "react";
import SelectorMenu from "../components/SelectorMenu";
import FilterBar from "../components/FilterBar";
import { SkeletonRow } from "../components/SkeletonCard";

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
  const [allMoviesRow, setAllMoviesRow] = useState<MenuRow | null>(null);
  const [genreRows, setGenreRows] = useState<MenuRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<MenuRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [catRes, genreRes] = await Promise.all([
        fetch("/api/media/categories"),
        fetch("/api/media/categories/type?type=Movie"),
      ]);
      const categories: MenuRow[] = await catRes.json();
      const genres: MenuRow[] = await genreRes.json();

      const moviesRow = categories.find((r) => r.genre === "Movies") || null;
      setAllMoviesRow(moviesRow);
      setGenreRows(genres);
    } catch (err) {
      console.error("Failed to load movies:", err);
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
      <>
        <h1 className="oss-page-title">Movies</h1>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  }

  const defaultRows = [
    ...(allMoviesRow ? [allMoviesRow] : []),
    ...genreRows,
  ];

  const displayRows = filteredRows ?? defaultRows;

  return (
    <>
      <h1 className="oss-page-title">Movies</h1>
      <FilterBar type="Movie" onResults={setFilteredRows} />
      {displayRows.length > 0 && <SelectorMenu rows={displayRows} />}
      {displayRows.length === 0 && <p className="oss-empty">No movies found.</p>}
    </>
  );
}
