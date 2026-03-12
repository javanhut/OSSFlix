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

export default function Anime() {
  const [allAnimeRow, setAllAnimeRow] = useState<MenuRow | null>(null);
  const [genreRows, setGenreRows] = useState<MenuRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<MenuRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [catRes, genreRes] = await Promise.all([
        fetch("/api/media/categories"),
        fetch("/api/media/categories/genre-tag?tags=Anime,Animation"),
      ]);
      const categories: MenuRow[] = await catRes.json();
      const genres: MenuRow[] = await genreRes.json();

      // Build an "All Anime" row from titles tagged Anime or Animation
      const animeRow = categories.find((r) => r.genre === "Anime");
      const animationRow = categories.find((r) => r.genre === "Animation");
      const seen = new Set<string>();
      const allTitles: TitleInfo[] = [];
      for (const row of [animeRow, animationRow]) {
        if (!row) continue;
        for (const t of row.titles) {
          if (!seen.has(t.pathToDir)) {
            seen.add(t.pathToDir);
            allTitles.push(t);
          }
        }
      }
      setAllAnimeRow(allTitles.length > 0 ? { genre: "All Anime", titles: allTitles } : null);
      setGenreRows(genres);
    } catch (err) {
      console.error("Failed to load anime:", err);
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
        <h1 className="oss-page-title">Anime</h1>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  }

  const defaultRows = [
    ...(allAnimeRow ? [allAnimeRow] : []),
    ...genreRows,
  ];

  const displayRows = filteredRows ?? defaultRows;

  return (
    <>
      <h1 className="oss-page-title">Anime</h1>
      <FilterBar type="Anime" onResults={setFilteredRows} />
      {displayRows.length > 0 && <SelectorMenu rows={displayRows} />}
      {displayRows.length === 0 && <p className="oss-empty">No anime found.</p>}
    </>
  );
}
