import { useState, useEffect } from "react";
import { PREDEFINED_GENRES } from "../constants/Genres";
import Card from "../components/Card";

type TitleResult = {
  name: string;
  imagePath: string | null;
  pathToDir: string;
  type: string;
};

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

  const customGenres = allGenres.filter((g) => !PREDEFINED_GENRES.has(g));
  const predefined = allGenres.filter((g) => PREDEFINED_GENRES.has(g));

  return (
    <div style={{ padding: "2rem 4%", minHeight: "100vh" }}>
      <h2 style={{ color: "var(--oss-text)", marginBottom: "0.5rem", fontSize: "1.5rem" }}>Explore Tags</h2>
      <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        Select one or more genres to find titles matching all of them.
      </p>

      {customGenres.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ color: "var(--oss-text)", fontSize: "0.9rem", marginBottom: "10px", fontWeight: 600 }}>
            Custom Tags
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {customGenres.map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => toggleGenre(g)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: selectedGenres.has(g) ? "1px solid var(--oss-accent)" : "1px solid var(--oss-border)",
                  background: selectedGenres.has(g) ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
                  color: selectedGenres.has(g) ? "#60a5fa" : "var(--oss-text-muted)",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {predefined.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ color: "var(--oss-text)", fontSize: "0.9rem", marginBottom: "10px", fontWeight: 600 }}>
            Standard Genres
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {predefined.map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => toggleGenre(g)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: selectedGenres.has(g) ? "1px solid var(--oss-accent)" : "1px solid var(--oss-border)",
                  background: selectedGenres.has(g) ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
                  color: selectedGenres.has(g) ? "#60a5fa" : "var(--oss-text-muted)",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedGenres.size > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
            <h3 style={{ color: "var(--oss-text)", fontSize: "1.1rem", margin: 0 }}>Results</h3>
            <button
              type="button"
              onClick={() => setSelectedGenres(new Set())}
              style={{
                background: "rgba(239,68,68,0.12)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.25)",
                padding: "4px 12px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear All
            </button>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  margin: "0 auto",
                  border: "3px solid rgba(255,255,255,0.1)",
                  borderTopColor: "#3b82f6",
                  borderRadius: "50%",
                  animation: "vpSpin 0.8s linear infinite",
                }}
              />
            </div>
          )}

          {!loading && results.length === 0 && (
            <p style={{ color: "var(--oss-text-muted)", fontSize: "0.9rem", textAlign: "center", padding: "2rem" }}>
              No titles match all selected genres.
            </p>
          )}

          {!loading && results.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "16px",
              }}
            >
              {results.map((r) => (
                <div
                  key={r.pathToDir}
                  onClick={() => setSelectedDir(r.pathToDir)}
                  style={{
                    cursor: "pointer",
                    borderRadius: "var(--oss-radius)",
                    overflow: "hidden",
                    background: "var(--oss-bg-card)",
                    border: "1px solid var(--oss-border)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.03)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {r.imagePath ? (
                    <img
                      src={r.imagePath}
                      alt={r.name}
                      style={{
                        width: "100%",
                        height: "220px",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "220px",
                        background: "var(--oss-bg-elevated)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--oss-text-muted)",
                        fontSize: "2rem",
                      }}
                    >
                      ?
                    </div>
                  )}
                  <div style={{ padding: "10px 12px" }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "var(--oss-text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.name}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "0.72rem",
                        color: "var(--oss-text-muted)",
                      }}
                    >
                      {r.type}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Card show={!!selectedDir} onHide={() => setSelectedDir("")} dirPath={selectedDir} />
    </div>
  );
}
