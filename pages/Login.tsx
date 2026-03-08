import { useState, useEffect } from "react";
import { useProfile, type ProfileData } from "../context/ProfileContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { signIn } = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => { setProfiles(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSignIn = () => {
    signIn();
    navigate("/profiles");
  };

  const handleRegister = () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 25) {
      setError("Name must be between 1 and 25 characters");
      return;
    }
    setError("");
    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        signIn();
        navigate("/profiles");
      })
      .catch(() => setError("Failed to create account"));
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(180deg, #0a0a0f 0%, #12121e 50%, #0a0a0f 100%)",
      padding: "40px 24px",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "12px", textAlign: "center" }}>
        <h1 style={{
          fontSize: "3.5rem", fontWeight: 800, color: "#fff", margin: 0,
          letterSpacing: "-1px",
          background: "linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a5b4fc 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          OSSFlix
        </h1>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: "420px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px", overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          {(["signin", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              style={{
                flex: 1, padding: "16px", border: "none",
                background: tab === t ? "rgba(99,102,241,0.08)" : "transparent",
                color: tab === t ? "#a5b4fc" : "rgba(255,255,255,0.4)",
                fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
                borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
                transition: "all 0.2s ease",
              }}
            >
              {t === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <div style={{ padding: "28px 24px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
              <div style={{
                width: "36px", height: "36px",
                border: "3px solid rgba(255,255,255,0.1)",
                borderTopColor: "#6366f1", borderRadius: "50%",
                animation: "loginSpin 0.8s linear infinite",
              }} />
            </div>
          ) : tab === "signin" ? (
            <>
              <p style={{
                color: "rgba(255,255,255,0.5)", fontSize: "0.85rem",
                margin: "0 0 20px", textAlign: "center",
              }}>
                {profiles.length > 0
                  ? "Select your account to continue"
                  : "No accounts yet. Create one to get started."}
              </p>
              {profiles.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSignIn()}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "12px 16px", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "12px", background: "rgba(255,255,255,0.02)",
                        cursor: "pointer", transition: "all 0.2s ease",
                        width: "100%", textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
                        e.currentTarget.style.background = "rgba(99,102,241,0.06)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }}
                    >
                      <img
                        src={p.image_path || "/images/profileicon.png"}
                        alt={p.name}
                        style={{
                          width: "40px", height: "40px", borderRadius: "50%",
                          objectFit: "cover", border: "2px solid rgba(255,255,255,0.1)",
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{
                          color: "#fff", fontSize: "0.95rem", fontWeight: 600,
                          display: "block",
                        }}>
                          {p.name}
                        </span>
                        {p.email && (
                          <span style={{
                            color: "rgba(255,255,255,0.35)", fontSize: "0.78rem",
                          }}>
                            {p.email}
                          </span>
                        )}
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="9,18 15,12 9,6"/>
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setTab("register")}
                  style={{
                    width: "100%", padding: "12px", borderRadius: "10px",
                    border: "none", background: "#6366f1", color: "#fff",
                    fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Create Account
                </button>
              )}
            </>
          ) : (
            <>
              <p style={{
                color: "rgba(255,255,255,0.5)", fontSize: "0.85rem",
                margin: "0 0 20px", textAlign: "center",
              }}>
                Create a new account to get started
              </p>
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block", fontSize: "0.82rem", fontWeight: 600,
                  color: "rgba(255,255,255,0.5)", marginBottom: "6px",
                }}>
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
                  autoFocus
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)", color: "#fff",
                    fontSize: "0.9rem", outline: "none",
                    transition: "border-color 0.2s ease",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>
              {error && (
                <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>
              )}
              <button
                onClick={handleRegister}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  border: "none", background: "#6366f1", color: "#fff",
                  fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
                  transition: "opacity 0.2s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                Create Account
              </button>
            </>
          )}
        </div>
      </div>

      <p style={{
        color: "rgba(255,255,255,0.2)", fontSize: "0.75rem",
        marginTop: "24px",
      }}>
        Open Source Streaming Platform
      </p>

      <style>{`
        @keyframes loginSpin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
