import { useEffect, useState, useCallback } from "react";
import SelectorMenu from "../components/SelectorMenu";
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

export default function MyList() {
  const [row, setRow] = useState<MenuRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist", { credentials: "same-origin" });
      const data = (await res.json()) as MenuRow;
      setRow(data.titles.length > 0 ? data : null);
    } catch (err) {
      console.error("Failed to load watchlist:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <>
        <h1 className="oss-page-title">My List</h1>
        <SkeletonRow />
      </>
    );
  }

  const handleWatchlistChange = useCallback((dirPath: string, inList: boolean) => {
    if (!inList) {
      setRow((prev) => {
        if (!prev) return prev;
        const filtered = prev.titles.filter((t) => t.pathToDir !== dirPath);
        return filtered.length > 0 ? { ...prev, titles: filtered } : null;
      });
    }
  }, []);

  return (
    <>
      <h1 className="oss-page-title">My List</h1>
      {row && <SelectorMenu rows={[row]} onWatchlistChange={handleWatchlistChange} />}
      {!row && <p className="oss-empty">Your list is empty. Add titles from their detail page.</p>}
    </>
  );
}
