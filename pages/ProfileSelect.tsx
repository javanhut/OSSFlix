import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile, type PublicProfile } from "../context/ProfileContext";
import { PasswordInput } from "../components/PasswordInput";

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
    <div className="oss-auth-stage"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        
        padding: "40px 24px",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "44px", textAlign: "center" }}>
        <div className="oss-login-logo oss-login-logo-sm">Reelscape</div>
        <h1 className="oss-profiles-heading">Who's watching?</h1>
      </div>

      {loading ? (
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "var(--oss-accent)",
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
              gap: "28px",
              justifyContent: "center",
              maxWidth: "860px",
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
                className="oss-profile-tile"
              >
                <div className="oss-profile-tile-avatar">
                  {p.image_path ? (
                    <img src={p.image_path} alt="" />
                  ) : (
                    // No photo: a colored tile with the initial, hue varied per profile
                    <span
                      className="oss-profile-tile-initial"
                      style={{ "--oss-tile-hue": `${(p.id * 67) % 360}` } as React.CSSProperties}
                    >
                      {p.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                </div>
                <span className="oss-profile-tile-name">{p.name}</span>
                {profiles.length > 1 && (
                  <button
                    type="button"
                    className="oss-profile-tile-delete"
                    onClick={(e) => handleDelete(p.id, e)}
                    title="Delete profile"
                    aria-label={`Delete profile ${p.name}`}
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
                className="oss-profile-tile oss-profile-tile-add"
              >
                <div className="oss-profile-tile-avatar">
                  <svg
                    aria-hidden="true"
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span className="oss-profile-tile-name">Add Profile</span>
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
              <PasswordInput
                placeholder="Password (min 4 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                inputStyle={inputStyle}
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
                    background: "var(--oss-accent)",
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
                      <PasswordInput
                        placeholder="New password (min 4 characters)"
                        value={password}
                        onChange={(e) => setPasswordVal(e.target.value)}
                        style={{ marginBottom: "10px" }}
                        inputStyle={inputStyle}
                      />
                      <PasswordInput
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSetPw();
                        }}
                        style={{ marginBottom: "14px" }}
                        inputStyle={inputStyle}
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
                  <PasswordInput
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPasswordVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLogin();
                    }}
                    style={{ marginBottom: "14px" }}
                    inputStyle={inputStyle}
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
                      background: "var(--oss-accent)",
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
