import { useState, useEffect } from "react";

type StatsData = {
  totalHours: number;
  titlesCompleted: number;
  titlesWatched: number;
  topGenres: { name: string; count: number }[];
  watchStreak: number;
  library: {
    totalTitles: number;
    movies: number;
    shows: number;
    genres: number;
    genreBreakdown: { name: string; count: number }[];
  };
  watchlistCount: number;
};

export default function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: StatsData) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "2rem 4%", minHeight: "100vh" }}>
        <h2 style={{ color: "var(--oss-text)", fontSize: "1.5rem", marginBottom: "2rem" }}>Stats</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: loading skeleton; items are identical placeholders
            <div key={i} className="skeleton-shimmer" style={{ height: "120px", borderRadius: "12px" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cardStyle = {
    background: "var(--oss-bg-card)",
    border: "1px solid var(--oss-border)",
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center" as const,
  };

  const hasWatchData = stats.titlesWatched > 0;

  return (
    <div style={{ padding: "2rem 4%", minHeight: "100vh", maxWidth: "1000px", margin: "0 auto" }}>
      <h2 style={{ color: "var(--oss-text)", fontSize: "1.5rem", marginBottom: "2rem" }}>Stats</h2>

      {/* Library Overview */}
      <h3
        style={{
          fontWeight: 600,
          color: "var(--oss-text-muted)",
          marginBottom: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          fontSize: "0.78rem",
        }}
      >
        Library
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px",
          marginBottom: "2rem",
        }}
      >
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--oss-accent)", lineHeight: 1.2 }}>
            {stats.library.totalTitles}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Total Titles</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--oss-text)", lineHeight: 1.2 }}>
            {stats.library.movies}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Movies</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--oss-text)", lineHeight: 1.2 }}>
            {stats.library.shows}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>TV Shows</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--oss-text)", lineHeight: 1.2 }}>
            {stats.library.genres}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Genres</div>
        </div>
      </div>

      {/* Genre Breakdown */}
      {stats.library.genreBreakdown.length > 0 && (
        <div style={{ ...cardStyle, textAlign: "left" as const, marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--oss-text)", marginBottom: "16px" }}>
            Library by Genre
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {stats.library.genreBreakdown.map((genre) => (
              <div key={genre.name}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ color: "var(--oss-text)" }}>{genre.name}</span>
                  <span style={{ color: "var(--oss-text-muted)" }}>
                    {genre.count} title{genre.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(genre.count / (stats.library.genreBreakdown[0]?.count || 1)) * 100}%`,
                      background: "var(--oss-accent)",
                      borderRadius: "3px",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watch Activity */}
      <h3
        style={{
          fontSize: "0.78rem",
          fontWeight: 600,
          color: "var(--oss-text-muted)",
          marginBottom: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Your Activity
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px",
          marginBottom: "2rem",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: hasWatchData ? "var(--oss-accent)" : "var(--oss-text-muted)",
              lineHeight: 1.2,
            }}
          >
            {stats.totalHours}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Hours Watched</div>
        </div>
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: hasWatchData ? "var(--oss-green)" : "var(--oss-text-muted)",
              lineHeight: 1.2,
            }}
          >
            {stats.titlesCompleted}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Completed</div>
        </div>
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: hasWatchData ? "var(--oss-text)" : "var(--oss-text-muted)",
              lineHeight: 1.2,
            }}
          >
            {stats.titlesWatched}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Started</div>
        </div>
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: hasWatchData ? "var(--oss-text)" : "var(--oss-text-muted)",
              lineHeight: 1.2,
            }}
          >
            {stats.watchlistCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>In Watchlist</div>
        </div>
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: stats.watchStreak > 0 ? "#f59e0b" : "var(--oss-text-muted)",
              lineHeight: 1.2,
            }}
          >
            {stats.watchStreak}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>Day Streak</div>
        </div>
      </div>

      {/* Top Genres Watched */}
      {stats.topGenres.length > 0 && (
        <div style={{ ...cardStyle, textAlign: "left" as const, marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--oss-text)", marginBottom: "16px" }}>
            Most Watched Genres
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {stats.topGenres.map((genre) => (
              <div key={genre.name}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ color: "var(--oss-text)" }}>{genre.name}</span>
                  <span style={{ color: "var(--oss-text-muted)" }}>
                    {genre.count} title{genre.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(genre.count / (stats.topGenres[0]?.count || 1)) * 100}%`,
                      background: "var(--oss-green)",
                      borderRadius: "3px",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasWatchData && (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "12px",
            border: "1px solid var(--oss-border)",
          }}
        >
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.9rem", margin: 0 }}>
            Start watching to build up your personal stats!
          </p>
        </div>
      )}
    </div>
  );
}
