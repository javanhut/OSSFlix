import { useState, useEffect } from "react";
import { useProfile } from "../context/ProfileContext";
import Card from "../components/Card";

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
    fetch("/api/recommendations?limit=12", { headers: pHeaders })
      .then((r) => r.json())
      .then((data: Recommendation[]) => setRecs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => {
      const pHeaders = profileHeaders();
      fetch("/api/recommendations?limit=12", { headers: pHeaders })
        .then((r) => r.json())
        .then((data: Recommendation[]) => setRecs(data))
        .catch(() => {});
    };
    window.addEventListener("ossflix-media-updated", handler);
    return () => window.removeEventListener("ossflix-media-updated", handler);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="spinner-border" role="status" />
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 4%", minHeight: "100vh" }}>
      <h2 style={{ color: "var(--oss-text)", marginBottom: "0.25rem", fontSize: "1.5rem" }}>
        For You
      </h2>
      <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "2rem" }}>
        Recommendations based on your watch history.
      </p>

      {recs.length === 0 && (
        <div style={{
          textAlign: "center", padding: "4rem 2rem",
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

      {recs.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "20px",
        }}>
          {recs.map((rec) => (
            <div
              key={rec.pathToDir}
              onClick={() => setSelectedDir(rec.pathToDir)}
              style={{
                cursor: "pointer",
                borderRadius: "var(--oss-radius, 8px)",
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
              {rec.imagePath ? (
                <img
                  src={rec.imagePath}
                  alt={rec.name}
                  style={{ width: "100%", height: "260px", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "260px", background: "var(--oss-bg-elevated)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--oss-text-muted)", fontSize: "2.5rem",
                }}>
                  ?
                </div>
              )}
              <div style={{ padding: "12px 14px" }}>
                <p style={{
                  margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--oss-text)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {rec.name}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--oss-text-muted)" }}>
                  {rec.type}
                </p>
                <p style={{
                  margin: "8px 0 0", fontSize: "0.75rem", color: "var(--oss-accent, #3b82f6)",
                  fontStyle: "italic",
                }}>
                  {rec.reason}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card
        show={!!selectedDir}
        onHide={() => setSelectedDir("")}
        dirPath={selectedDir}
      />
    </div>
  );
}
