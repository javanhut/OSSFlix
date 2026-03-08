import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Profile from "./ProfileSettings";
import { movieGenres } from "../constants/Genres";
import Card from "./Card";

type SearchResult = {
  name: string;
  imagePath: string | null;
  pathToDir: string;
  type: string;
};

export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedDir, setSelectedDir] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!showResults) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showResults]);

  const doSearch = (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }
    fetch(`/api/media/search?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then((data: SearchResult[]) => {
        setResults(data);
        setShowResults(true);
        setActiveIndex(-1);
      })
      .catch(() => {});
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 200);
  };

  const handleSelect = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    setSelectedDir(result.pathToDir);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  };

  return (
    <>
      <nav className={`oss-navbar${scrolled ? " scrolled" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <Link to="/" className="oss-navbar-brand">OSSFlix</Link>
          <ul className="oss-nav-links">
            <li><Link to="/movies" className="oss-nav-link">Movies</Link></li>
            <li><Link to="/tvshows" className="oss-nav-link">TV Shows</Link></li>
            <li><Link to="/anime" className="oss-nav-link">Anime</Link></li>
            <li className="oss-genre-trigger">
              <span className="oss-nav-link">Genres</span>
              <div className="oss-genre-dropdown">
                {movieGenres.map((genre) => (
                  <Link
                    key={genre}
                    to={`/genre/${encodeURIComponent(genre)}`}
                    className="oss-genre-item"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            </li>
          </ul>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="oss-search" ref={searchRef}>
            <svg className="oss-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              placeholder="Search..."
              aria-label="Search"
              value={query}
              onChange={handleChange}
              onFocus={() => { if (results.length > 0) setShowResults(true); }}
              onKeyDown={handleKeyDown}
            />
            {showResults && results.length > 0 && (
              <div className="oss-search-results">
                {results.map((r, i) => (
                  <button
                    key={r.pathToDir}
                    className={`oss-search-result-item${i === activeIndex ? " active" : ""}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    {r.imagePath ? (
                      <img src={r.imagePath} alt="" className="oss-search-result-img" />
                    ) : (
                      <div className="oss-search-result-img oss-search-result-placeholder">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                          <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
                          <line x1="2" y1="12" x2="22" y2="12"/>
                        </svg>
                      </div>
                    )}
                    <div className="oss-search-result-info">
                      <span className="oss-search-result-name">{r.name}</span>
                      <span className="oss-search-result-type">{r.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showResults && query.trim().length >= 1 && results.length === 0 && (
              <div className="oss-search-results">
                <div className="oss-search-empty">No results for "{query}"</div>
              </div>
            )}
          </div>
          <Profile />
        </div>
      </nav>

      {createPortal(
        <Card
          show={!!selectedDir}
          onHide={() => setSelectedDir("")}
          dirPath={selectedDir}
        />,
        document.body
      )}
    </>
  );
}

export default NavBar;
