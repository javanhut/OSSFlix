import { useEffect, useState, useCallback } from "react";
import MediaCarousel from "../components/MediaCarousel";
import SelectorMenu from "../components/SelectorMenu";
import { useProfile } from "../context/ProfileContext";
import { SkeletonRow, SkeletonHero } from "../components/SkeletonCard";

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

// Basic genres to show on the Home page — broad categories only
const BASIC_GENRES = new Set([
  "Newly Added", "Action", "Adventure", "Comedy", "Drama",
  "Fantasy", "Horror", "Romance", "Thriller", "Family",
  "Science Fiction", "Mystery", "Documentary",
]);

export default function Home() {
  const { profileHeaders } = useProfile();
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [continueRow, setContinueRow] = useState<MenuRow | null>(null);
  const [watchlistRow, setWatchlistRow] = useState<MenuRow | null>(null);

  const loadData = useCallback(async () => {
    try {
      const pHeaders = profileHeaders();
      const [catRes, cwRes, wlRes] = await Promise.all([
        fetch("/api/media/categories"),
        fetch("/api/playback/continue-watching", { headers: pHeaders }),
        fetch("/api/watchlist", { headers: pHeaders }),
      ]);
      const categories = (await catRes.json()) as MenuRow[];
      const cw = (await cwRes.json()) as MenuRow;
      const wl = (await wlRes.json()) as MenuRow;

      setContinueRow(cw.titles.length > 0 ? cw : null);
      setWatchlistRow(wl.titles.length > 0 ? wl : null);

      // Filter to only basic genres for the home page
      setRows(categories.filter((r) => BASIC_GENRES.has(r.genre)));

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
      <>
        <SkeletonHero />
        <div style={{ paddingTop: "2rem" }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </>
    );
  }

  return (
    <>
      {mediaList.length > 0 && <MediaCarousel mediaList={mediaList} />}
      <div style={{ paddingTop: "2rem" }}>
        {continueRow && continueRow.titles.length > 0 && (
          <div className="oss-continue-watching">
            <SelectorMenu rows={[{ genre: "Continue Watching", titles: continueRow.titles }]} isContinueWatching />
          </div>
        )}
        {(watchlistRow || rows.length > 0) && (
          <SelectorMenu rows={[
            ...(watchlistRow ? [watchlistRow] : []),
            ...rows,
          ]} />
        )}
      </div>
    </>
  );
}
