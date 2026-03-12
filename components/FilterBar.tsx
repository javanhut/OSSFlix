import { useState, useEffect } from "react";

type FilterBarProps = {
  type: string;
  onResults: (rows: { genre: string; titles: any[] }[] | null) => void;
};

export default function FilterBar({ type, onResults }: FilterBarProps) {
  const [sort, setSort] = useState("name");
  const [genreFilter, setGenreFilter] = useState("");
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [active, setActive] = useState(false);

  useEffect(() => {
    fetch("/api/genres/all")
      .then((r) => r.json())
      .then((data: string[]) => setAvailableGenres(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active && sort === "name" && !genreFilter) return;

    const params = new URLSearchParams({ sort, type });
    if (genreFilter) params.set("genre", genreFilter);

    fetch(`/api/media/titles?${params}`)
      .then((r) => r.json())
      .then((data: any[]) => {
        if (data.length > 0) {
          onResults([{ genre: genreFilter || (sort === "recent" ? "Recently Added" : "All"), titles: data }]);
        } else {
          onResults([]);
        }
      })
      .catch(() => {});
  }, [sort, genreFilter, type]);

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    setActive(true);
  };

  const handleGenreClick = (genre: string) => {
    if (genreFilter === genre) {
      setGenreFilter("");
      if (sort === "name") {
        setActive(false);
        onResults(null);
      }
    } else {
      setGenreFilter(genre);
      setActive(true);
    }
  };

  const clearAll = () => {
    setSort("name");
    setGenreFilter("");
    setActive(false);
    onResults(null);
  };

  return (
    <div className="oss-filter-bar">
      <select
        className="oss-filter-sort"
        value={sort}
        onChange={(e) => handleSortChange(e.target.value)}
        aria-label="Sort order"
      >
        <option value="name">Sort: A-Z</option>
        <option value="recent">Sort: Recently Added</option>
      </select>
      {availableGenres.slice(0, 12).map((g) => (
        <button
          key={g}
          className={`oss-filter-pill${genreFilter === g ? " active" : ""}`}
          onClick={() => handleGenreClick(g)}
        >
          {g}
        </button>
      ))}
      {active && (
        <button
          className="oss-filter-pill"
          onClick={clearAll}
          style={{ color: "#f87171", borderColor: "rgba(239,68,68,0.25)" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
