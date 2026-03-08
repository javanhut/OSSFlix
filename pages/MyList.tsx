import { useEffect, useState, useCallback } from "react";
import SelectorMenu from "../components/SelectorMenu";
import { useProfile } from "../context/ProfileContext";

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
  const { profileHeaders } = useProfile();
  const [row, setRow] = useState<MenuRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const pHeaders = profileHeaders();
      const res = await fetch("/api/watchlist", { headers: pHeaders });
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="spinner-border" role="status" />
      </div>
    );
  }

  return (
    <>
      <h1 className="oss-page-title">My List</h1>
      {row && <SelectorMenu rows={[row]} />}
      {!row && <p className="oss-empty">Your list is empty. Add titles from their detail page.</p>}
    </>
  );
}
