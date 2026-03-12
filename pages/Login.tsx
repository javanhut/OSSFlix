import { useState, useEffect } from "react";
import { useProfile, type PublicProfile } from "../context/ProfileContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { login, register, setPassword } = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPasswordVal] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [needsSetPassword, setNeedsSetPassword] = useState(false);
  const [nameConfirm, setNameConfirm] = useState("");
  const [nameVerified, setNameVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => { setProfiles(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleProfileClick = (p: PublicProfile) => {
    setError("");
    setPasswordVal("");
    setConfirmPassword("");
    setNameConfirm("");
    setNameVerified(false);
    // If profile has no password, go straight to set-password flow
    if (!p.has_password) {
      setNeedsSetPassword(true);
    } else {
      setNeedsSetPassword(false);
    }
    setSelectedProfile(p);
  };

  const handleBack = () => {
    setSelectedProfile(null);
    setError("");
    setPasswordVal("");
    setConfirmPassword("");
    setNameConfirm("");
    setNameVerified(false);
    setNeedsSetPassword(false);
  };

  const handleVerifyName = () => {
    if (!selectedProfile) return;
    if (nameConfirm.trim().toLowerCase() !== selectedProfile.name.toLowerCase()) {
      setError("Name does not match this profile");
      return;
    }
    setError("");
    setNameVerified(true);
  };

  const handleSignIn = async () => {
    if (!selectedProfile) return;
    if (!password) { setError("Please enter your password"); return; }
    setSubmitting(true);
    setError("");
    const result = await login(selectedProfile.id, password);
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    navigate("/home");
  };

  const handleSetPassword = async () => {
    if (!selectedProfile) return;
    if (!password || password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await setPassword(selectedProfile.id, password);
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    navigate("/home");
  };

  const handleRegister = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 25) {
      setError("Name must be between 1 and 25 characters");
      return;
    }
    if (!password || password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await register(trimmed, password);
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    navigate("/home");
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)", color: "#fff",
    fontSize: "0.9rem", outline: "none",
    transition: "border-color 0.2s ease",
    boxSizing: "border-box" as const,
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
        <h1 className="oss-login-logo" style={{
          fontSize: "3.5rem", fontWeight: 800, color: "#fff", margin: 0,
          letterSpacing: "-1px",
          background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Reelscape
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
        {!selectedProfile && (
          <div style={{
            display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            {(["signin", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); setPasswordVal(""); setConfirmPassword(""); }}
                style={{
                  flex: 1, padding: "16px", border: "none",
                  background: tab === t ? "rgba(59,130,246,0.08)" : "transparent",
                  color: tab === t ? "#93c5fd" : "rgba(255,255,255,0.4)",
                  fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
                  borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
                  transition: "all 0.2s ease",
                }}
              >
                {t === "signin" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: "28px 24px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
              <div style={{
                width: "36px", height: "36px",
                border: "3px solid rgba(255,255,255,0.1)",
                borderTopColor: "#3b82f6", borderRadius: "50%",
                animation: "loginSpin 0.8s linear infinite",
              }} />
            </div>
          ) : selectedProfile ? (
            /* Password entry for selected profile */
            <>
              <button
                onClick={handleBack}
                style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                  cursor: "pointer", fontSize: "0.85rem", padding: "0 0 16px",
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15,18 9,12 15,6"/>
                </svg>
                Back
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
                <img
                  src={selectedProfile.image_path || "/images/profileicon.png"}
                  alt={selectedProfile.name}
                  style={{
                    width: "48px", height: "48px", borderRadius: "50%",
                    objectFit: "cover", border: "2px solid rgba(255,255,255,0.1)",
                  }}
                />
                <span style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 600 }}>
                  {selectedProfile.name}
                </span>
              </div>

              {needsSetPassword ? (
                nameVerified ? (
                  <>
                    <p style={{
                      color: "rgba(255,255,255,0.5)", fontSize: "0.85rem",
                      margin: "0 0 16px",
                    }}>
                      Identity verified. Now set a password for your account.
                    </p>
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                        New Password
                      </label>
                      <input
                        type="password"
                        placeholder="Set a password (min 4 characters)"
                        value={password}
                        onChange={(e) => setPasswordVal(e.target.value)}
                        autoFocus
                        style={inputStyle}
                        onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                        onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                      />
                    </div>
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSetPassword(); }}
                        style={inputStyle}
                        onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                        onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{
                      color: "rgba(255,255,255,0.5)", fontSize: "0.85rem",
                      margin: "0 0 16px",
                    }}>
                      This account doesn't have a password yet. To verify your identity, type the profile name below.
                    </p>
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                        Profile Name
                      </label>
                      <input
                        type="text"
                        placeholder={`Type "${selectedProfile.name}" to confirm`}
                        value={nameConfirm}
                        onChange={(e) => setNameConfirm(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleVerifyName(); }}
                        autoFocus
                        style={inputStyle}
                        onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                        onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                      />
                    </div>
                  </>
                )
              ) : (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPasswordVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSignIn(); }}
                    autoFocus
                    style={inputStyle}
                    onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                    onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                  />
                </div>
              )}

              {error && (
                <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>
              )}

              <button
                onClick={
                  needsSetPassword
                    ? (nameVerified ? handleSetPassword : handleVerifyName)
                    : handleSignIn
                }
                disabled={submitting}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  border: "none", background: "#3b82f6", color: "#fff",
                  fontSize: "0.9rem", fontWeight: 600, cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                {submitting
                  ? "Please wait..."
                  : needsSetPassword
                    ? (nameVerified ? "Set Password & Sign In" : "Verify Identity")
                    : "Sign In"
                }
              </button>
            </>
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
                      onClick={() => handleProfileClick(p)}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "12px 16px", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "12px", background: "rgba(255,255,255,0.02)",
                        cursor: "pointer", transition: "all 0.2s ease",
                        width: "100%", textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)";
                        e.currentTarget.style.background = "rgba(59,130,246,0.06)";
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
                      </div>
                      {p.has_password ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setTab("register")}
                  style={{
                    width: "100%", padding: "12px", borderRadius: "10px",
                    border: "none", background: "#3b82f6", color: "#fff",
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
              <div style={{ marginBottom: "12px" }}>
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
                  autoFocus
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{
                  display: "block", fontSize: "0.82rem", fontWeight: 600,
                  color: "rgba(255,255,255,0.5)", marginBottom: "6px",
                }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPasswordVal(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block", fontSize: "0.82rem", fontWeight: 600,
                  color: "rgba(255,255,255,0.5)", marginBottom: "6px",
                }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>
              {error && (
                <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>
              )}
              <button
                onClick={handleRegister}
                disabled={submitting}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  border: "none", background: "#3b82f6", color: "#fff",
                  fontSize: "0.9rem", fontWeight: 600, cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                {submitting ? "Creating..." : "Create Account"}
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
