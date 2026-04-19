import { useState, useEffect, useMemo } from "react";
import { PREDEFINED_GENRES } from "../constants/Genres";
import Card from "../components/Card";

type TitleResult = {
  name: string;
  imagePath: string | null;
  pathToDir: string;
  type: string;
};

const SUGGESTED_COMBOS: string[][] = [
  ["Action", "Thriller"],
  ["Drama", "Romance"],
  ["Science Fiction", "Adventure"],
  ["Comedy", "Family"],
  ["Crime", "Mystery"],
];

export default function Explore() {
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<TitleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDir, setSelectedDir] = useState("");

  useEffect(() => {
    fetch("/api/genres/all")
      .then((r) => r.json())
      .then((data: string[]) => setAllGenres(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedGenres.size === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    const genreParam = [...selectedGenres].join(",");
    fetch(`/api/media/filter?genres=${encodeURIComponent(genreParam)}`)
      .then((r) => r.json())
      .then((data: TitleResult[]) => setResults(data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [selectedGenres]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  };

  const applyCombo = (combo: string[]) => {
    setSelectedGenres(new Set(combo));
  };

  const customGenres = useMemo(() => allGenres.filter((g) => !PREDEFINED_GENRES.has(g)), [allGenres]);
  const predefined = useMemo(() => allGenres.filter((g) => PREDEFINED_GENRES.has(g)), [allGenres]);
  const validCombos = useMemo(
    () => SUGGESTED_COMBOS.filter((combo) => combo.every((g) => allGenres.includes(g))),
    [allGenres],
  );

  const hasResults = selectedGenres.size > 0;

  return (
    <div className="explore-page">
      {/* Hero */}
      <header className="explore-hero">
        <h1 className="explore-hero-title">Explore</h1>
        <p className="explore-hero-tagline">Mix and match tags to find your next watch.</p>
      </header>

      {/* Selected chips strip */}
      {hasResults && (
        <div className="explore-chips-bar">
          <span className="explore-chips-label">Filtering by</span>
          <div className="explore-chips">
            {[...selectedGenres].map((g) => (
              <button
                type="button"
                key={g}
                className="explore-chip"
                onClick={() => toggleGenre(g)}
                aria-label={`Remove ${g}`}
              >
                {g}
                <span className="explore-chip-x" aria-hidden="true">
                  &times;
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="explore-clear" onClick={() => setSelectedGenres(new Set())}>
            Clear all
          </button>
        </div>
      )}

      {/* Genre groups */}
      {predefined.length > 0 && (
        <section className="oss-section explore-section">
          <h2 className="oss-section-title">Standard Genres</h2>
          <div className="explore-tag-grid">
            {predefined.map((g) => (
              <button
                type="button"
                key={g}
                className={`explore-tag${selectedGenres.has(g) ? " active" : ""}`}
                onClick={() => toggleGenre(g)}
                aria-pressed={selectedGenres.has(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </section>
      )}

      {customGenres.length > 0 && (
        <section className="oss-section explore-section">
          <h2 className="oss-section-title">Custom Tags</h2>
          <div className="explore-tag-grid">
            {customGenres.map((g) => (
              <button
                type="button"
                key={g}
                className={`explore-tag${selectedGenres.has(g) ? " active" : ""}`}
                onClick={() => toggleGenre(g)}
                aria-pressed={selectedGenres.has(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Empty state — suggested combos */}
      {!hasResults && validCombos.length > 0 && (
        <section className="oss-section explore-section">
          <h2 className="oss-section-title">Try a combo</h2>
          <div className="explore-combos">
            {validCombos.map((combo) => (
              <button type="button" key={combo.join("+")} className="explore-combo" onClick={() => applyCombo(combo)}>
                <span className="explore-combo-text">
                  {combo.map((g, i) => (
                    <span key={g}>
                      {i > 0 && <span className="explore-combo-plus"> + </span>}
                      {g}
                    </span>
                  ))}
                </span>
                <span className="explore-combo-arrow" aria-hidden="true">
                  &rarr;
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      {hasResults && (
        <section className="oss-section explore-section">
          <h2 className="oss-section-title">
            Results
            {!loading && (
              <span className="explore-results-count">
                {results.length} {results.length === 1 ? "title" : "titles"}
              </span>
            )}
          </h2>

          {loading && (
            <div className="explore-loading">
              <div className="explore-spinner" />
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="explore-empty">
              <p>No titles match all selected tags.</p>
              <p className="explore-empty-hint">Try removing a tag or picking a different combination.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="explore-grid">
              {results.map((r) => (
                <button
                  type="button"
                  key={r.pathToDir}
                  className="explore-card"
                  onClick={() => setSelectedDir(r.pathToDir)}
                  aria-label={r.name}
                >
                  {r.imagePath ? (
                    <img src={r.imagePath} alt="" className="explore-card-img" loading="lazy" decoding="async" />
                  ) : (
                    <div className="explore-card-img explore-card-img-placeholder">?</div>
                  )}
                  <div className="explore-card-meta">
                    <p className="explore-card-title">{r.name}</p>
                    <p className="explore-card-type">{r.type}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <Card show={!!selectedDir} onHide={() => setSelectedDir("")} dirPath={selectedDir} />
    </div>
  );
}
