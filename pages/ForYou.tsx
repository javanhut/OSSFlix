import { useState, useEffect } from "react";
import { useProfile } from "../context/ProfileContext";
import Card from "../components/Card";
import { SkeletonRow } from "../components/SkeletonCard";

type Recommendation = {
  name: string;
  imagePath: string | null;
  pathToDir: string;
  type: string;
  score: number;
  reason: string;
};

export default function ForYou() {
  const { profileHeaders } = useProfile();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDir, setSelectedDir] = useState("");

  useEffect(() => {
    const pHeaders = profileHeaders();
    fetch("/api/recommendations?limit=20", { headers: pHeaders })
      .then((r) => r.json())
      .then((data: Recommendation[]) => setRecs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => {
      const pHeaders = profileHeaders();
      fetch("/api/recommendations?limit=20", { headers: pHeaders })
        .then((r) => r.json())
        .then((data: Recommendation[]) => setRecs(data))
        .catch(() => {});
    };
    window.addEventListener("ossflix-media-updated", handler);
    return () => window.removeEventListener("ossflix-media-updated", handler);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "2rem 0", minHeight: "100vh" }}>
        <h2 className="oss-page-title">For You</h2>
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  // Group recommendations by their top genre (extracted from reason)
  const grouped = new Map<string, Recommendation[]>();
  for (const rec of recs) {
    // Extract the first genre from "Because you watch Action, Drama"
    const match = rec.reason.match(/Because you watch (.+)/);
    const genres = match ? match[1].split(", ") : ["Recommended"];
    const topGenre = genres[0] || "Recommended";
    const key = `Because you watch ${topGenre}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(rec);
  }

  // Check if title was added within 7 days (using current date as reference)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ padding: "2rem 4% 0.25rem" }}>
        <h2 style={{ color: "var(--oss-text)", marginBottom: "0.25rem", fontSize: "1.5rem" }}>
          For You
        </h2>
        <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Recommendations based on your watch history.
        </p>
      </div>

      {recs.length === 0 && (
        <div style={{
          textAlign: "center", padding: "4rem 2rem", margin: "0 4%",
          background: "rgba(255,255,255,0.03)", borderRadius: "12px",
          border: "1px solid var(--oss-border)",
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--oss-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "16px", opacity: 0.5 }}>
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.95rem", margin: 0 }}>
            No recommendations yet. Start watching something and we'll suggest similar titles!
          </p>
        </div>
      )}

      {[...grouped.entries()].map(([groupLabel, groupRecs]) => (
        <section key={groupLabel} className="oss-section">
          <h2 className="oss-section-title">{groupLabel}</h2>
          <div className="oss-row" role="list">
            {groupRecs.map((rec) => (
              <div
                key={rec.pathToDir}
                className="oss-card"
                role="button"
                aria-label={rec.name}
                onClick={() => setSelectedDir(rec.pathToDir)}
              >
                {rec.imagePath ? (
                  <img src={rec.imagePath} alt={rec.name} className="oss-card-img" loading="lazy" />
                ) : (
                  <div className="oss-card-img" style={{
                    background: "var(--oss-bg-elevated)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--oss-text-muted)", fontSize: "2rem",
                  }}>?</div>
                )}
                <div className="oss-card-title-bar">
                  <span>{rec.name}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <Card
        show={!!selectedDir}
        onHide={() => setSelectedDir("")}
        dirPath={selectedDir}
      />
    </div>
  );
}
