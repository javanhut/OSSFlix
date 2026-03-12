import { useState, useEffect } from "react";
import { useProfile } from "../context/ProfileContext";

type StatsData = {
  totalHours: number;
  titlesCompleted: number;
  titlesWatched: number;
  topGenres: { name: string; count: number }[];
  watchStreak: number;
};

export default function Stats() {
  const { profileHeaders } = useProfile();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const pHeaders = profileHeaders();
    fetch("/api/stats", { headers: pHeaders })
      .then((r) => r.json())
      .then((data: StatsData) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "2rem 4%", minHeight: "100vh" }}>
        <h2 style={{ color: "var(--oss-text)", fontSize: "1.5rem", marginBottom: "2rem" }}>Watch Stats</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: "120px", borderRadius: "12px" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const maxGenreCount = stats.topGenres.length > 0 ? stats.topGenres[0].count : 1;

  const statCards = [
    { label: "Hours Watched", value: stats.totalHours.toString(), icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z" },
    { label: "Titles Completed", value: stats.titlesCompleted.toString(), icon: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" },
    { label: "Titles Started", value: stats.titlesWatched.toString(), icon: "M4 6H2v14a2 2 0 0 0 2 2h14v-2H4V6zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-8 12.5v-9l6 4.5-6 4.5z" },
    { label: "Watch Streak", value: `${stats.watchStreak} day${stats.watchStreak !== 1 ? "s" : ""}`, icon: "M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z" },
  ];

  return (
    <div style={{ padding: "2rem 4%", minHeight: "100vh", maxWidth: "900px", margin: "0 auto" }}>
      <h2 style={{ color: "var(--oss-text)", fontSize: "1.5rem", marginBottom: "2rem" }}>Watch Stats</h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "16px",
        marginBottom: "2.5rem",
      }}>
        {statCards.map((card) => (
          <div key={card.label} style={{
            background: "var(--oss-bg-card)",
            border: "1px solid var(--oss-border)",
            borderRadius: "12px",
            padding: "20px",
            textAlign: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--oss-accent)" style={{ marginBottom: "10px", opacity: 0.8 }}>
              <path d={card.icon} />
            </svg>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--oss-text)", lineHeight: 1.2 }}>
              {card.value}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--oss-text-muted)", marginTop: "4px" }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {stats.topGenres.length > 0 && (
        <div style={{
          background: "var(--oss-bg-card)",
          border: "1px solid var(--oss-border)",
          borderRadius: "12px",
          padding: "20px",
        }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--oss-text)", marginBottom: "16px" }}>
            Top Genres
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {stats.topGenres.map((genre) => (
              <div key={genre.name}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  marginBottom: "4px", fontSize: "0.85rem",
                }}>
                  <span style={{ color: "var(--oss-text)" }}>{genre.name}</span>
                  <span style={{ color: "var(--oss-text-muted)" }}>{genre.count} title{genre.count !== 1 ? "s" : ""}</span>
                </div>
                <div style={{
                  height: "8px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${(genre.count / maxGenreCount) * 100}%`,
                    background: "var(--oss-accent)",
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
