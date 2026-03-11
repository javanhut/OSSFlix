import { Link, useNavigate } from "react-router-dom";
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

type GenreResult = {
  name: string;
};

export function NavBar() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [genreResults, setGenreResults] = useState<GenreResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedDir, setSelectedDir] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when mobile menu or genre dropdown is open
  useEffect(() => {
    if (navOpen || genreOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [navOpen, genreOpen]);

  // Close search on outside click
  useEffect(() => {
    if (!showResults && !searchExpanded) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
        if (searchExpanded && !query.trim()) setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showResults, searchExpanded, query]);

  const doSearch = (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setGenreResults([]);
      setShowResults(false);
      return;
    }
    fetch(`/api/media/search?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then((data: { titles: SearchResult[]; genres: GenreResult[] }) => {
        setResults(data.titles);
        setGenreResults(data.genres);
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

  const handleSelectTitle = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setGenreResults([]);
    setShowResults(false);
    setSelectedDir(result.pathToDir);
  };

  const handleSelectGenre = (genre: GenreResult) => {
    setQuery("");
    setResults([]);
    setGenreResults([]);
    setShowResults(false);
    navigate(`/genre/${encodeURIComponent(genre.name)}`);
  };

  const totalResults = genreResults.length + results.length;

  const handleRescan = () => {
    setRescanning(true);
    fetch("/api/media/resolve")
      .then(() => window.location.reload())
      .catch(() => setRescanning(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || totalResults === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < totalResults - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : totalResults - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      if (activeIndex < genreResults.length) {
        handleSelectGenre(genreResults[activeIndex]);
      } else {
        handleSelectTitle(results[activeIndex - genreResults.length]);
      }
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  };

  return (
    <>
      <nav className={`oss-navbar${scrolled ? " scrolled" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            className="oss-hamburger"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {navOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
          <Link to="/home" className="oss-navbar-brand">Reelscape</Link>
          <ul ref={navRef} className={`oss-nav-links${navOpen ? " oss-nav-open" : ""}`}>
            <li className="oss-nav-brand-mobile">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
                <span>Reelscape</span>
                <button
                  onClick={() => { setNavOpen(false); setGenreOpen(false); }}
                  style={{
                    background: "none", border: "none", color: "var(--oss-text-muted)",
                    cursor: "pointer", padding: "4px", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                  aria-label="Close menu"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </li>
            <li><Link to="/movies" className="oss-nav-link" onClick={() => setNavOpen(false)}>Movies</Link></li>
            <li><Link to="/tvshows" className="oss-nav-link" onClick={() => setNavOpen(false)}>TV Shows</Link></li>
            <li><Link to="/anime" className="oss-nav-link" onClick={() => setNavOpen(false)}>Anime</Link></li>
            <li><Link to="/mylist" className="oss-nav-link" onClick={() => setNavOpen(false)}>My List</Link></li>
            <li><Link to="/foryou" className="oss-nav-link" onClick={() => setNavOpen(false)}>For You</Link></li>
            <li><Link to="/history" className="oss-nav-link" onClick={() => setNavOpen(false)}>History</Link></li>
            <li><Link to="/explore" className="oss-nav-link" onClick={() => setNavOpen(false)}>Explore</Link></li>
            <li
              className={`oss-genre-trigger${genreOpen ? " oss-genre-open" : ""}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest(".oss-genre-dropdown")) return;
                setGenreOpen((v) => !v);
              }}
            >
              <span className="oss-nav-link">Genres</span>
              <div className="oss-genre-dropdown">
                <div className="oss-genre-header">
                  <span>Genres</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setGenreOpen(false); }}
                    className="oss-genre-close"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                {movieGenres.map((genre) => (
                  <Link
                    key={genre}
                    to={`/genre/${encodeURIComponent(genre)}`}
                    className="oss-genre-item"
                    onClick={() => { setNavOpen(false); setGenreOpen(false); }}
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            </li>

            {/* Rescan — inside overlay on mobile, visible in navbar on desktop */}
            <li className="oss-nav-menu-rescan">
              <button
                onClick={() => { handleRescan(); setNavOpen(false); }}
                disabled={rescanning}
                className="oss-nav-link"
                style={{ background: "none", border: "none", cursor: rescanning ? "not-allowed" : "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={rescanning ? { animation: "spin 1s linear infinite" } : {}}
                >
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                {rescanning ? "Scanning..." : "Rescan Library"}
              </button>
            </li>

            {/* Profile — inside overlay on mobile */}
            <li className="oss-nav-menu-profile">
              <Profile />
            </li>
          </ul>
        </div>

        {/* Right side: search + rescan + profile (desktop), search icon only (mobile) */}
        <div className="oss-navbar-right">
          {/* Search icon button — mobile only */}
          <button
            className="oss-search-toggle"
            onClick={() => {
              setSearchExpanded(true);
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            aria-label="Open search"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>

          <div className={`oss-search${searchExpanded ? " oss-search-expanded" : ""}`} ref={searchRef}>
            <svg className="oss-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search..."
              aria-label="Search"
              value={query}
              onChange={handleChange}
              onFocus={() => { if (results.length > 0) setShowResults(true); }}
              onKeyDown={(e) => {
                handleKeyDown(e);
                if (e.key === "Escape" && searchExpanded) {
                  setSearchExpanded(false);
                  setShowResults(false);
                }
              }}
            />
            {/* Close button inside expanded search — mobile only */}
            {searchExpanded && (
              <button
                className="oss-search-close"
                onClick={() => { setSearchExpanded(false); setShowResults(false); setQuery(""); setResults([]); setGenreResults([]); }}
                aria-label="Close search"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
            {showResults && totalResults > 0 && (
              <div className="oss-search-results">
                {genreResults.map((g, i) => (
                  <button
                    key={`genre-${g.name}`}
                    className={`oss-search-result-item${i === activeIndex ? " active" : ""}`}
                    onClick={() => handleSelectGenre(g)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <div className="oss-search-result-img oss-search-result-placeholder" style={{
                      background: "rgba(59,130,246,0.15)",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M4 12h16M4 17h10"/>
                      </svg>
                    </div>
                    <div className="oss-search-result-info">
                      <span className="oss-search-result-name">{g.name}</span>
                      <span className="oss-search-result-type" style={{ color: "#60a5fa" }}>Genre</span>
                    </div>
                  </button>
                ))}
                {results.map((r, i) => (
                  <button
                    key={r.pathToDir}
                    className={`oss-search-result-item${(i + genreResults.length) === activeIndex ? " active" : ""}`}
                    onClick={() => handleSelectTitle(r)}
                    onMouseEnter={() => setActiveIndex(i + genreResults.length)}
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
            {showResults && query.trim().length >= 1 && totalResults === 0 && (
              <div className="oss-search-results">
                <div className="oss-search-empty">No results for "{query}"</div>
              </div>
            )}
          </div>
          <div className="oss-navbar-profile">
            <Profile />
          </div>
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
