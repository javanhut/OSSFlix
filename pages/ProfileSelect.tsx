import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile, ProfileData } from "../context/ProfileContext";

export default function ProfileSelect() {
  const { setProfile, signOut } = useProfile();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const loadProfiles = () => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => { setProfiles(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadProfiles(); }, []);

  const handleSelect = (p: ProfileData) => {
    setProfile(p);
    navigate("/home");
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (name.length < 1 || name.length > 25) {
      setError("Name must be between 1 and 25 characters");
      return;
    }
    setError("");
    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setCreating(false);
        setNewName("");
        loadProfiles();
      })
      .catch(() => setError("Failed to create profile"));
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profiles.length <= 1) return;
    fetch("/api/profiles/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then(() => loadProfiles()).catch(() => {});
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(180deg, #0a0a0f 0%, #12121e 50%, #0a0a0f 100%)",
      padding: "40px 24px",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "48px", textAlign: "center" }}>
        <h1 style={{
          fontSize: "3rem", fontWeight: 800, color: "#fff", margin: 0,
          letterSpacing: "-1px",
          background: "linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a5b4fc 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          OSSFlix
        </h1>
        <p style={{
          color: "rgba(255,255,255,0.35)", fontSize: "0.9rem",
          marginTop: "8px", fontWeight: 400,
        }}>
          Who's watching?
        </p>
      </div>

      {loading ? (
        <div style={{
          width: "48px", height: "48px",
          border: "3px solid rgba(255,255,255,0.1)",
          borderTopColor: "#6366f1", borderRadius: "50%",
          animation: "vpSpin 0.8s linear infinite",
        }} />
      ) : (
        <>
          {/* Profile grid */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "24px",
            justifyContent: "center", maxWidth: "700px",
          }}>
            {profiles.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(p)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelect(p); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: "12px", padding: "20px", border: "2px solid transparent",
                  borderRadius: "16px", background: "rgba(255,255,255,0.03)",
                  cursor: "pointer", transition: "all 0.25s ease",
                  width: "140px", position: "relative",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#6366f1";
                  e.currentTarget.style.background = "rgba(99,102,241,0.08)";
                  e.currentTarget.style.transform = "scale(1.05)";
                  const del = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                  if (del) del.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.transform = "scale(1)";
                  const del = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                  if (del) del.style.opacity = "0";
                }}
              >
                <div style={{
                  width: "80px", height: "80px", borderRadius: "50%",
                  overflow: "hidden", border: "3px solid rgba(255,255,255,0.1)",
                  background: "var(--oss-bg-elevated)",
                }}>
                  <img
                    src={p.image_path || "/images/profileicon.png"}
                    alt={p.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <span style={{
                  color: "#fff", fontSize: "0.95rem", fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  maxWidth: "120px",
                }}>
                  {p.name}
                </span>
                {profiles.length > 1 && (
                  <button
                    data-delete
                    onClick={(e) => handleDelete(p.id, e)}
                    style={{
                      position: "absolute", top: "6px", right: "6px",
                      width: "22px", height: "22px", borderRadius: "50%",
                      border: "none", background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.3)", fontSize: "0.75rem",
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", transition: "all 0.15s ease",
                      opacity: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.2)";
                      e.currentTarget.style.color = "#ef4444";
                      e.currentTarget.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.3)";
                      e.currentTarget.style.opacity = "0";
                    }}
                    title="Delete profile"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}

            {!creating && (
              <button
                onClick={() => setCreating(true)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: "12px", padding: "20px", border: "2px dashed rgba(255,255,255,0.1)",
                  borderRadius: "16px", background: "transparent",
                  cursor: "pointer", transition: "all 0.25s ease",
                  width: "140px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
                  e.currentTarget.style.background = "rgba(99,102,241,0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{
                  width: "80px", height: "80px", borderRadius: "50%",
                  border: "2px dashed rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", fontWeight: 500 }}>
                  Add Profile
                </span>
              </button>
            )}
          </div>

          {creating && (
            <div style={{
              marginTop: "32px", padding: "24px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", width: "100%", maxWidth: "360px",
              display: "flex", flexDirection: "column", gap: "14px",
            }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1rem", fontWeight: 600 }}>
                New Profile
              </h3>
              <input
                type="text"
                placeholder="Profile name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                autoFocus
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)", color: "#fff",
                  fontSize: "0.9rem", outline: "none",
                }}
              />
              {error && (
                <p style={{ margin: 0, color: "#ef4444", fontSize: "0.8rem" }}>{error}</p>
              )}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setCreating(false); setNewName(""); setError(""); }}
                  style={{
                    padding: "8px 20px", borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "transparent", color: "rgba(255,255,255,0.6)",
                    fontSize: "0.85rem", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  style={{
                    padding: "8px 24px", borderRadius: "8px",
                    border: "none", background: "#6366f1",
                    color: "#fff", fontSize: "0.85rem", fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Sign out link */}
      <button
        onClick={() => { signOut(); navigate("/"); }}
        style={{
          marginTop: "40px", background: "none", border: "none",
          color: "rgba(255,255,255,0.3)", fontSize: "0.82rem",
          cursor: "pointer", transition: "color 0.2s ease",
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
      >
        Sign out
      </button>

      <style>{`
        @keyframes vpSpin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
