import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useProfile } from "../context/ProfileContext";
import Card from "../components/Card";

type HistoryEntry = {
  video_src: string;
  dir_path: string;
  current_time: number;
  duration: number;
  updated_at: string;
  name: string | null;
  imagePath: string | null;
  type: string | null;
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function parseEpisodeInfo(videoSrc: string): string {
  const filename = videoSrc.split("/").pop() || videoSrc;
  const match = filename.match(/^(.*?)_s(\d+)_ep(\d+)\.[^.]+$/i);
  if (match) return `S${match[2]} E${match[3]}`;
  return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function History() {
  const { profileHeaders } = useProfile();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDir, setSelectedDir] = useState("");

  const loadHistory = () => {
    const pHeaders = profileHeaders();
    fetch("/api/playback/history", { headers: pHeaders })
      .then((r) => r.json())
      .then((data: HistoryEntry[]) => setEntries(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadHistory(); }, []);

  const removeEntry = (videoSrc: string) => {
    const pHeaders = profileHeaders();
    fetch("/api/playback/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...pHeaders },
      body: JSON.stringify({ video_src: videoSrc }),
    }).then(() => {
      setEntries((prev) => prev.filter((e) => e.video_src !== videoSrc));
    }).catch(() => {});
  };

  const clearAll = () => {
    const pHeaders = profileHeaders();
    fetch("/api/playback/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...pHeaders },
      body: JSON.stringify({ clear_all: true }),
    }).then(() => setEntries([])).catch(() => {});
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="spinner-border" role="status" />
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "2rem 4%", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h2 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Watch History
          </h2>
          {entries.length > 0 && (
            <button
              onClick={clearAll}
              style={{
                background: "rgba(239,68,68,0.12)", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px",
                padding: "6px 16px", fontSize: "0.82rem", fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
            >
              Clear All
            </button>
          )}
        </div>

        {entries.length === 0 && (
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.95rem" }}>
            No watch history yet. Start watching something!
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {entries.map((entry) => {
            const pct = entry.duration > 0 ? (entry.current_time / entry.duration) * 100 : 0;
            const isCompleted = entry.duration > 0 && entry.current_time >= entry.duration - 10;

            return (
              <div key={entry.video_src} style={{
                display: "flex", alignItems: "center", gap: "16px",
                padding: "12px 16px", borderRadius: "var(--oss-radius, 8px)",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                cursor: "pointer", transition: "all 0.2s ease",
              }}
              onClick={() => entry.dir_path && setSelectedDir(entry.dir_path)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: "80px", height: "48px", borderRadius: "4px", overflow: "hidden",
                  flexShrink: 0, background: "rgba(255,255,255,0.08)",
                }}>
                  {entry.imagePath ? (
                    <img src={entry.imagePath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
                        <polygon points="5,3 19,12 5,21"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: "0.9rem", fontWeight: 600, marginBottom: "2px" }}>
                    {entry.name || "Unknown Title"}
                  </div>
                  <div style={{ color: "var(--oss-text-muted)", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>{parseEpisodeInfo(entry.video_src)}</span>
                    {entry.type && (
                      <>
                        <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                        <span>{entry.type}</span>
                      </>
                    )}
                  </div>
                  {/* Progress bar */}
                  {pct > 0 && (
                    <div style={{
                      height: "3px", background: "rgba(255,255,255,0.08)",
                      borderRadius: "2px", marginTop: "6px", width: "200px", maxWidth: "100%",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(pct, 100)}%`,
                        background: isCompleted ? "#22c55e" : "var(--oss-accent, #3b82f6)",
                        borderRadius: "2px",
                      }} />
                    </div>
                  )}
                </div>

                {/* Time info */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: "var(--oss-text-muted)", fontSize: "0.75rem", marginBottom: "2px" }}>
                    {relativeTime(entry.updated_at)}
                  </div>
                  {entry.duration > 0 && (
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem" }}>
                      {formatTime(entry.current_time)} / {formatTime(entry.duration)}
                    </div>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeEntry(entry.video_src); }}
                  title="Remove from history"
                  style={{
                    background: "none", border: "none", color: "rgba(255,255,255,0.25)",
                    cursor: "pointer", padding: "4px", fontSize: "1.1rem", lineHeight: 1,
                    transition: "color 0.2s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
                >
                  &#10005;
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {createPortal(
        <Card
          show={!!selectedDir}
          onHide={() => { setSelectedDir(""); loadHistory(); }}
          dirPath={selectedDir}
        />,
        document.body
      )}
    </>
  );
}
