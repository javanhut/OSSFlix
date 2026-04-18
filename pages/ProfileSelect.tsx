import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile, type PublicProfile } from "../context/ProfileContext";

export default function ProfileSelect() {
  const { login, setPassword, logout, profile: currentProfile } = useProfile();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const userEmail = currentProfile?.email;

  // Password prompt state
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [password, setPasswordVal] = useState("");
  const [needsSetPassword, setNeedsSetPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameConfirm, setNameConfirm] = useState("");
  const [nameVerified, setNameVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadProfiles = () => {
    if (userEmail) {
      fetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      })
        .then((r) => r.json())
        .then((data) => {
          setProfiles(data.profiles || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      fetch("/api/profiles")
        .then((r) => r.json())
        .then((data) => {
          setProfiles(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect
  useEffect(() => {
    loadProfiles();
  }, []);

  const handleSelect = (p: PublicProfile) => {
    setSelectedProfile(p);
    setPasswordVal("");
    setConfirmPassword("");
    setNameConfirm("");
    setNameVerified(false);
    setError("");
    // If profile has no password, go straight to set-password flow
    setNeedsSetPassword(!p.has_password);
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

  const handleLogin = async () => {
    if (!selectedProfile) return;
    if (!password) {
      setError("Please enter your password");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await login(selectedProfile.id, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/home");
  };

  const handleSetPw = async () => {
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
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/home");
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (name.length < 1 || name.length > 25) {
      setError("Name must be between 1 and 25 characters");
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, password: newPassword, email: userEmail || "" }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setCreating(false);
      setNewName("");
      setNewPassword("");
      loadProfiles();
    } catch {
      setError("Failed to create profile");
    }
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profiles.length <= 1) return;
    fetch("/api/profiles/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id }),
    })
      .then(() => loadProfiles())
      .catch(() => {});
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: "0.9rem",
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #0a0a0f 0%, #12121e 50%, #0a0a0f 100%)",
        padding: "40px 24px",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "48px", textAlign: "center" }}>
        <h1
          style={{
            fontSize: "3rem",
            fontWeight: 800,
            color: "#fff",
            margin: 0,
            letterSpacing: "-1px",
            background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Reelscape
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: "0.9rem",
            marginTop: "8px",
            fontWeight: 400,
          }}
        >
          Who's watching?
        </p>
      </div>

      {loading ? (
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "vpSpin 0.8s linear infinite",
          }}
        />
      ) : (
        <>
          {/* Profile grid */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "24px",
              justifyContent: "center",
              maxWidth: "700px",
            }}
          >
            {profiles.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelect(p);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  padding: "20px",
                  border: "2px solid transparent",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  width: "140px",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.background = "rgba(59,130,246,0.08)";
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
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "3px solid rgba(255,255,255,0.1)",
                    background: "var(--oss-bg-elevated)",
                  }}
                >
                  <img
                    src={p.image_path || "/images/profileicon.png"}
                    alt={p.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <span
                  style={{
                    color: "#fff",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "120px",
                  }}
                >
                  {p.name}
                </span>
                {profiles.length > 1 && (
                  <button
                    type="button"
                    data-delete
                    onClick={(e) => handleDelete(p.id, e)}
                    style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.3)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
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
                type="button"
                onClick={() => setCreating(true)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  padding: "20px",
                  border: "2px dashed rgba(255,255,255,0.1)",
                  borderRadius: "16px",
                  background: "transparent",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  width: "140px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)";
                  e.currentTarget.style.background = "rgba(59,130,246,0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    border: "2px dashed rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", fontWeight: 500 }}>
                  Add Profile
                </span>
              </button>
            )}
          </div>

          {creating && (
            <div
              style={{
                marginTop: "32px",
                padding: "24px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                width: "100%",
                maxWidth: "360px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1rem", fontWeight: 600 }}>New Profile</h3>
              <input
                type="text"
                placeholder="Profile name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="Password (min 4 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                style={inputStyle}
              />
              {error && <p style={{ margin: 0, color: "#ef4444", fontSize: "0.8rem" }}>{error}</p>}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setNewPassword("");
                    setError("");
                  }}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  style={{
                    padding: "8px 24px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#3b82f6",
                    color: "#fff",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Password prompt modal */}
          {selectedProfile && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
              }}
              onClick={() => {
                setSelectedProfile(null);
                setError("");
                setNameConfirm("");
                setNameVerified(false);
              }}
            >
              <div
                style={{
                  background: "#1a1a2e",
                  borderRadius: "16px",
                  padding: "28px",
                  width: "100%",
                  maxWidth: "380px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
                  <img
                    src={selectedProfile.image_path || "/images/profileicon.png"}
                    alt={selectedProfile.name}
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <span style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 600 }}>{selectedProfile.name}</span>
                </div>

                {needsSetPassword ? (
                  nameVerified ? (
                    <>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: "0 0 14px" }}>
                        Identity verified. Set a password for this profile.
                      </p>
                      <input
                        type="password"
                        placeholder="New password (min 4 characters)"
                        value={password}
                        onChange={(e) => setPasswordVal(e.target.value)}
                        style={{ ...inputStyle, marginBottom: "10px" }}
                      />
                      <input
                        type="password"
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSetPw();
                        }}
                        style={{ ...inputStyle, marginBottom: "14px" }}
                      />
                    </>
                  ) : (
                    <>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: "0 0 14px" }}>
                        This profile has no password. Type the profile name to verify your identity.
                      </p>
                      <input
                        type="text"
                        placeholder={`Type "${selectedProfile.name}" to confirm`}
                        value={nameConfirm}
                        onChange={(e) => setNameConfirm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleVerifyName();
                        }}
                        style={{ ...inputStyle, marginBottom: "14px" }}
                      />
                    </>
                  )
                ) : (
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPasswordVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLogin();
                    }}
                    style={{ ...inputStyle, marginBottom: "14px" }}
                  />
                )}

                {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProfile(null);
                      setError("");
                      setNameConfirm("");
                      setNameVerified(false);
                    }}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "transparent",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={needsSetPassword ? (nameVerified ? handleSetPw : handleVerifyName) : handleLogin}
                    disabled={submitting}
                    style={{
                      padding: "8px 24px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#3b82f6",
                      color: "#fff",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: submitting ? "wait" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? "..." : needsSetPassword ? (nameVerified ? "Set Password" : "Verify") : "Continue"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Sign out link */}
      <button
        type="button"
        onClick={() => {
          logout();
          navigate("/");
        }}
        style={{
          marginTop: "40px",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.3)",
          fontSize: "0.82rem",
          cursor: "pointer",
          transition: "color 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
      >
        Sign out
      </button>

      <style>{`
        @keyframes vpSpin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
