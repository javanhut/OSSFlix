import { useState, useEffect } from "react";
import { useProfile, type PublicProfile } from "../context/ProfileContext";
import { useNavigate } from "react-router-dom";
import { PasswordInput } from "../components/PasswordInput";

export default function Login() {
  const { login, register, setPassword } = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "register">("signin");

  // Email gate state
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [hasUnclaimed, setHasUnclaimed] = useState(false);
  const [showingUnclaimed, setShowingUnclaimed] = useState(false);

  // Check if unclaimed profiles exist on mount (for the "no email?" link)
  useEffect(() => {
    fetch("/api/auth/lookup-unclaimed", { method: "POST", headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((data) => {
        if (data.profiles?.length > 0) setHasUnclaimed(true);
      })
      .catch(() => {});
  }, []);

  // Profile list & selection
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [password, setPasswordVal] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [needsSetPassword, setNeedsSetPassword] = useState(false);
  const [nameConfirm, setNameConfirm] = useState("");
  const [nameVerified, setNameVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const handleEmailLookup = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
      setHasUnclaimed(data.hasUnclaimed || false);
      if (data.profiles.length > 0) {
        setProfiles(data.profiles);
        setEmailSubmitted(true);
        setShowingUnclaimed(false);
      } else {
        setError("No profiles found for this email");
      }
    } catch {
      setError("Failed to look up profiles");
    }
    setLoading(false);
  };

  const handleShowUnclaimed = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/lookup-unclaimed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.profiles.length > 0) {
        setProfiles(data.profiles);
        setEmailSubmitted(true);
        setShowingUnclaimed(true);
      } else {
        setError("No unclaimed profiles found");
      }
    } catch {
      setError("Failed to look up profiles");
    }
    setLoading(false);
  };

  const handleContinueAsGuest = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/guest-profile");
      const data = await res.json();
      if (data.error || !data.profile) {
        setError(data.error || "Guest profile unavailable");
        setLoading(false);
        return;
      }
      handleProfileClick(data.profile);
    } catch {
      setError("Failed to load guest profile");
    }
    setLoading(false);
  };

  const handleBackToEmail = () => {
    setEmailSubmitted(false);
    setProfiles([]);
    setSelectedProfile(null);
    setError("");
    setPasswordVal("");
    setConfirmPassword("");
    setNameConfirm("");
    setNameVerified(false);
    setNeedsSetPassword(false);
    setShowingUnclaimed(false);
  };

  const handleProfileClick = (p: PublicProfile) => {
    setError("");
    setPasswordVal("");
    setConfirmPassword("");
    setNameConfirm("");
    setNameVerified(false);
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
    setForgotMode(false);
    setResetCodeSent(false);
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const handleForgotPassword = async () => {
    if (!selectedProfile) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: selectedProfile.id }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSubmitting(false);
        return;
      }
      setResetCodeSent(true);
    } catch {
      setError("Failed to send reset email");
    }
    setSubmitting(false);
  };

  const handleResetPassword = async () => {
    if (!selectedProfile) return;
    if (!resetCode.trim()) {
      setError("Please enter the reset code");
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: selectedProfile.id, code: resetCode.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSubmitting(false);
        return;
      }
      if (data.profile) {
        navigate("/home");
      }
    } catch {
      setError("Failed to reset password");
    }
    setSubmitting(false);
  };

  const handleBackFromForgot = () => {
    setForgotMode(false);
    setResetCodeSent(false);
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setError("");
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
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/home");
  };

  const handleRegister = async () => {
    const trimmedEmail = regEmail.trim();
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
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
    const result = await register(trimmed, password, trimmedEmail);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/home");
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: "0.9rem",
    outline: "none",
    transition: "border-color 0.2s ease",
    boxSizing: "border-box" as const,
  };

  const renderSignInContent = () => {
    // Phase 3: Password entry for selected profile
    if (selectedProfile) {
      return (
        <>
          <button
            type="button"
            onClick={handleBack}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: "0 0 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
            Back
          </button>

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

          {forgotMode ? (
            resetCodeSent ? (
              <>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.85rem",
                    margin: "0 0 16px",
                  }}
                >
                  A reset code has been sent to your email. Enter it below with your new password.
                </p>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: "6px",
                    }}
                  >
                    Reset Code
                  </label>
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    style={{
                      ...inputStyle,
                      textAlign: "center",
                      letterSpacing: "6px",
                      fontSize: "1.2rem",
                      fontWeight: 600,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                  />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: "6px",
                    }}
                  >
                    New Password
                  </label>
                  <PasswordInput
                    placeholder="New password (min 4 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    inputStyle={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: "6px",
                    }}
                  >
                    Confirm Password
                  </label>
                  <PasswordInput
                    placeholder="Confirm new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleResetPassword();
                    }}
                    inputStyle={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    }}
                  />
                </div>
                {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#3b82f6",
                    color: "#fff",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: submitting ? "wait" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  {submitting ? "Resetting..." : "Reset Password & Sign In"}
                </button>
                <button
                  type="button"
                  onClick={handleBackFromForgot}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.35)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    padding: "14px 0 0",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.85rem",
                    margin: "0 0 16px",
                  }}
                >
                  We'll send a password reset code to the email associated with this profile.
                </p>
                {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#3b82f6",
                    color: "#fff",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: submitting ? "wait" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  {submitting ? "Sending..." : "Send Reset Code"}
                </button>
                <button
                  type="button"
                  onClick={handleBackFromForgot}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.35)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    padding: "14px 0 0",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  Back to sign in
                </button>
              </>
            )
          ) : needsSetPassword ? (
            nameVerified ? (
              <>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.85rem",
                    margin: "0 0 16px",
                  }}
                >
                  Identity verified. Now set a password for your account.
                </p>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: "6px",
                    }}
                  >
                    New Password
                  </label>
                  <PasswordInput
                    placeholder="Set a password (min 4 characters)"
                    value={password}
                    onChange={(e) => setPasswordVal(e.target.value)}
                    inputStyle={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: "6px",
                    }}
                  >
                    Confirm Password
                  </label>
                  <PasswordInput
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSetPassword();
                    }}
                    inputStyle={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.85rem",
                    margin: "0 0 16px",
                  }}
                >
                  This account doesn't have a password yet. To verify your identity, type the profile name below.
                </p>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: "6px",
                    }}
                  >
                    Profile Name
                  </label>
                  <input
                    type="text"
                    placeholder={`Type "${selectedProfile.name}" to confirm`}
                    value={nameConfirm}
                    onChange={(e) => setNameConfirm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyName();
                    }}
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                  />
                </div>
              </>
            )
          ) : (
            <>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "6px",
                  }}
                >
                  Password
                </label>
                <PasswordInput
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPasswordVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSignIn();
                  }}
                  inputStyle={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setForgotMode(true);
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.35)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  padding: "0 0 12px",
                  width: "100%",
                  textAlign: "right",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                Forgot password?
              </button>
            </>
          )}

          {!forgotMode && (
            <>
              {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}

              <button
                type="button"
                onClick={needsSetPassword ? (nameVerified ? handleSetPassword : handleVerifyName) : handleSignIn}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                {submitting
                  ? "Please wait..."
                  : needsSetPassword
                    ? nameVerified
                      ? "Set Password & Sign In"
                      : "Verify Identity"
                    : "Sign In"}
              </button>
            </>
          )}
        </>
      );
    }

    // Phase 2: Profile selection (after email lookup)
    if (emailSubmitted) {
      return (
        <>
          <button
            type="button"
            onClick={handleBackToEmail}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: "0 0 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
            Back
          </button>

          <p
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.85rem",
              margin: "0 0 20px",
              textAlign: "center",
            }}
          >
            {showingUnclaimed ? "Profiles without an email" : "Select your account to continue"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {profiles.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => handleProfileClick(p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  width: "100%",
                  textAlign: "left",
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
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,0.1)",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      color: "#fff",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      display: "block",
                    }}
                  >
                    {p.name}
                  </span>
                </div>
                {p.has_password ? (
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      );
    }

    // Phase 1: Email entry
    return (
      <>
        <p
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: "0.85rem",
            margin: "0 0 20px",
            textAlign: "center",
          }}
        >
          Enter your email to find your profiles
        </p>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
              marginBottom: "6px",
            }}
          >
            Email
          </label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEmailLookup();
            }}
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
          />
        </div>
        {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}
        <button
          type="button"
          onClick={handleEmailLookup}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            background: "#3b82f6",
            color: "#fff",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "opacity 0.2s ease",
          }}
        >
          {loading ? "Looking up..." : "Continue"}
        </button>
        <button
          type="button"
          onClick={handleContinueAsGuest}
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 12px",
            marginTop: "10px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.75)",
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "background 0.2s ease, border-color 0.2s ease",
          }}
        >
          Continue as Guest
        </button>
        {hasUnclaimed && (
          <button
            type="button"
            onClick={handleShowUnclaimed}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.35)",
              fontSize: "0.8rem",
              cursor: "pointer",
              padding: "14px 0 0",
              width: "100%",
              textAlign: "center",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            Profile without an email?
          </button>
        )}
      </>
    );
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
      <div style={{ marginBottom: "12px", textAlign: "center" }}>
        <h1
          className="oss-login-logo"
          style={{
            fontSize: "3.5rem",
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
      </div>

      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          overflow: "hidden",
        }}
      >
        {/* Tabs - only show when not in profile selection or password phase */}
        {!selectedProfile && !emailSubmitted && (
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {(["signin", "register"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => {
                  setTab(t);
                  setError("");
                  setPasswordVal("");
                  setConfirmPassword("");
                }}
                style={{
                  flex: 1,
                  padding: "16px",
                  border: "none",
                  background: tab === t ? "rgba(59,130,246,0.08)" : "transparent",
                  color: tab === t ? "#93c5fd" : "rgba(255,255,255,0.4)",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
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
          {loading && !emailSubmitted ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  border: "3px solid rgba(255,255,255,0.1)",
                  borderTopColor: "#3b82f6",
                  borderRadius: "50%",
                  animation: "loginSpin 0.8s linear infinite",
                }}
              />
            </div>
          ) : tab === "signin" ? (
            renderSignInContent()
          ) : (
            <>
              <p
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "0.85rem",
                  margin: "0 0 20px",
                  textAlign: "center",
                }}
              >
                Create a new account to get started
              </p>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "6px",
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "6px",
                  }}
                >
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "6px",
                  }}
                >
                  Password
                </label>
                <PasswordInput
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPasswordVal(e.target.value)}
                  inputStyle={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  }}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "6px",
                  }}
                >
                  Confirm Password
                </label>
                <PasswordInput
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRegister();
                  }}
                  inputStyle={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  }}
                />
              </div>
              {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}
              <button
                type="button"
                onClick={handleRegister}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: submitting ? "wait" : "pointer",
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginTop: "24px",
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.75rem", margin: 0 }}>Open Source Streaming Platform</p>
        <button
          type="button"
          onClick={() => navigate("/admin")}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.2)",
            cursor: "pointer",
            fontSize: "0.75rem",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Admin
        </button>
      </div>

      <style>{`
        @keyframes loginSpin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
