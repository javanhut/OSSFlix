import { useEffect, useState, useCallback } from "react";
import SelectorMenu from "../components/SelectorMenu";
import FilterBar from "../components/FilterBar";
import PageHero from "../components/PageHero";
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener("ossflix-media-updated", handler);
    return () => window.removeEventListener("ossflix-media-updated", handler);
  }, [loadData]);

  if (loading) {
    return (
      <>
        <PageHero title="Movies" subtitle="Every film in your library, ready when you are." />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  }

  const defaultRows = [...(allMoviesRow ? [allMoviesRow] : []), ...genreRows];

  const displayRows = filteredRows ?? defaultRows;

  return (
    <>
      <PageHero
        title="Movies"
        subtitle={`${allMoviesRow?.titles.length ?? 0} ${(allMoviesRow?.titles.length ?? 0) === 1 ? "movie" : "movies"} · Every film in your library, ready when you are.`}
        images={allMoviesRow?.titles.map((t) => t.imagePath) ?? []}
      />
      <FilterBar type="Movie" onResults={setFilteredRows} />
      {displayRows.length > 0 && <SelectorMenu rows={displayRows} />}
      {displayRows.length === 0 && <p className="oss-empty">No movies found.</p>}
    </>
  );
}
