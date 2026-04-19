import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MigratorTab, AddMediaTab, css } from "../components/ProfileSettings";
import { PasswordInput } from "../components/PasswordInput";

type AdminTab = "media" | "addmedia" | "migrator" | "accounts";

interface AccountGroup {
  email: string;
  profiles: { id: number; name: string; image_path: string | null; has_password: boolean }[];
}

export default function Admin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Auth form
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Admin panel
  const [activeTab, setActiveTab] = useState<AdminTab>("media");
  const [rescanning, setRescanning] = useState(false);

  // Media settings
  const [moviesDir, setMoviesDir] = useState("");
  const [tvshowsDir, setTvshowsDir] = useState("");
  const [tmdbKey, setTmdbKey] = useState("");
  const [tmdbTesting, setTmdbTesting] = useState(false);
  const [tmdbTestResult, setTmdbTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [kaidadbUrl, setKaidadbUrl] = useState("");
  const [kaidadbPassword, setKaidadbPassword] = useState("");
  const [kaidadbTesting, setKaidadbTesting] = useState(false);
  const [kaidadbTestResult, setKaidadbTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [kaidadbRootPrefix, setKaidadbRootPrefix] = useState("");
  const [kaidadbMoviesPrefix, setKaidadbMoviesPrefix] = useState("");
  const [kaidadbTvshowsPrefix, setKaidadbTvshowsPrefix] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Accounts
  const [accounts, setAccounts] = useState<AccountGroup[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        setSetup(data.setup);
        setAuthenticated(data.authenticated);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load fns are declared below but stable; including them would cause render loops
  useEffect(() => {
    if (authenticated) {
      loadSettings();
      loadAccounts();
    }
  }, [authenticated]);

  const loadSettings = () => {
    fetch("/api/global-settings", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        setMoviesDir(data.movies_directory ?? "");
        setTvshowsDir(data.tvshows_directory ?? "");
        setTmdbKey(data.tmdb_api_key ?? "");
        setKaidadbUrl(data.kaidadb_url ?? "");
        setKaidadbPassword(data.kaidadb_password ?? "");
        setKaidadbRootPrefix(data.kaidadb_root_prefix ?? "");
        setKaidadbMoviesPrefix(data.kaidadb_movies_prefix ?? "");
        setKaidadbTvshowsPrefix(data.kaidadb_tvshows_prefix ?? "");
        setSmtpHost(data.smtp_host ?? "");
        setSmtpPort(data.smtp_port ? String(data.smtp_port) : "");
        setSmtpUser(data.smtp_user ?? "");
        setSmtpPass(data.smtp_pass ?? "");
        setSmtpFrom(data.smtp_from ?? "");
      })
      .catch(() => {});
  };

  const loadAccounts = () => {
    setAccountsLoading(true);
    fetch("/api/admin/accounts", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts || []))
      .catch(() => {})
      .finally(() => setAccountsLoading(false));
  };

  const handleSetup = async () => {
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
    const res = await fetch("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setSetup(true);
    setAuthenticated(true);
  };

  const handleLogin = async () => {
    if (!password) {
      setError("Enter admin password");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setAuthenticated(true);
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    setAuthenticated(false);
    setPassword("");
  };

  const handleRescan = () => {
    setRescanning(true);
    fetch("/api/media/resolve", { credentials: "same-origin" })
      .then(() => setRescanning(false))
      .catch(() => setRescanning(false));
  };

  const handleSaveSettings = () => {
    setSaving(true);
    fetch("/api/global-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        movies_directory: moviesDir || null,
        tvshows_directory: tvshowsDir || null,
        tmdb_api_key: tmdbKey || null,
        kaidadb_url: kaidadbUrl || null,
        kaidadb_password: kaidadbUrl.trim() ? kaidadbPassword || null : null,
        kaidadb_root_prefix: kaidadbUrl.trim() ? kaidadbRootPrefix : null,
        kaidadb_movies_prefix: kaidadbMoviesPrefix || null,
        kaidadb_tvshows_prefix: kaidadbTvshowsPrefix || null,
        smtp_host: smtpHost || null,
        smtp_port: smtpPort ? parseInt(smtpPort, 10) : null,
        smtp_user: smtpUser || null,
        smtp_pass: smtpPass || null,
        smtp_from: smtpFrom || null,
      }),
    })
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  };

  const handleDeleteEmail = async (email: string) => {
    if (!confirm(`Delete all profiles under ${email}?`)) return;
    await fetch("/api/admin/accounts/delete-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    });
    loadAccounts();
  };

  const handleDeleteProfile = async (id: number) => {
    if (!confirm("Delete this profile?")) return;
    await fetch("/api/admin/accounts/delete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id }),
    });
    loadAccounts();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: "0.9rem",
    outline: "none",
    transition: "border-color 0.2s ease",
    boxSizing: "border-box",
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #0a0a0f 0%, #12121e 50%, #0a0a0f 100%)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "adminSpin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes adminSpin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Login/Setup view
  if (!authenticated) {
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
        <div style={{ marginBottom: "12px", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              color: "#fff",
              margin: 0,
              letterSpacing: "-1px",
              background: "linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Admin
          </h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", marginTop: "4px" }}>
            Reelscape Platform Management
          </p>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: "400px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px",
            padding: "28px 24px",
          }}
        >
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: "0 0 20px", textAlign: "center" }}>
            {setup ? "Enter admin password" : "Set up admin password"}
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
              Password
            </label>
            <PasswordInput
              placeholder={setup ? "Admin password" : "Create admin password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setup ? handleLogin() : handleSetup();
                }
              }}
              inputStyle={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            />
          </div>

          {!setup && (
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
                Confirm Password
              </label>
              <PasswordInput
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetup();
                }}
                inputStyle={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                }}
              />
            </div>
          )}

          {error && <p style={{ margin: "0 0 12px", color: "#ef4444", fontSize: "0.82rem" }}>{error}</p>}

          <button
            type="button"
            onClick={setup ? handleLogin : handleSetup}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #f59e0b, #f97316)",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
              transition: "opacity 0.2s ease",
            }}
          >
            {submitting ? "Please wait..." : setup ? "Sign In" : "Create Admin"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              fontSize: "0.8rem",
              cursor: "pointer",
              padding: "14px 0 0",
              width: "100%",
              textAlign: "center",
            }}
          >
            Back to Reelscape
          </button>
        </div>
      </div>
    );
  }

  // Admin panel
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    border: "none",
    borderRadius: "10px",
    background: active ? "rgba(245,158,11,0.15)" : "transparent",
    color: active ? "#f59e0b" : "rgba(255,255,255,0.5)",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0a0a0f 0%, #12121e 50%, #0a0a0f 100%)",
        color: "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              margin: 0,
              background: "linear-gradient(135deg, #f59e0b, #f97316)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Admin Panel
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={handleRescan}
            disabled={rescanning}
            style={{
              ...css.btn,
              ...css.btnSecondary,
              opacity: rescanning ? 0.6 : 1,
              fontSize: "0.8rem",
              padding: "8px 14px",
            }}
          >
            {rescanning ? "Scanning..." : "Rescan Library"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{ ...css.btn, ...css.btnSecondary, fontSize: "0.8rem", padding: "8px 14px" }}
          >
            Back to App
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              ...css.btn,
              fontSize: "0.8rem",
              padding: "8px 14px",
              background: "rgba(239,68,68,0.15)",
              color: "#ef4444",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button type="button" style={tabStyle(activeTab === "media")} onClick={() => setActiveTab("media")}>
          Media & Services
        </button>
        <button type="button" style={tabStyle(activeTab === "addmedia")} onClick={() => setActiveTab("addmedia")}>
          Add Media
        </button>
        <button type="button" style={tabStyle(activeTab === "migrator")} onClick={() => setActiveTab("migrator")}>
          Migrator
        </button>
        <button type="button" style={tabStyle(activeTab === "accounts")} onClick={() => setActiveTab("accounts")}>
          Accounts
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
        {activeTab === "media" && (
          <>
            {/* Movies Directory */}
            <SectionHeader
              icon="film"
              color="#3b82f6"
              title="Movies Directory"
              subtitle="Folder containing your movie directories"
            />
            <input
              type="text"
              value={moviesDir}
              onChange={(e) => setMoviesDir(e.target.value)}
              placeholder="/path/to/movies"
              style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem", marginBottom: "20px" }}
            />

            {/* TV Shows Directory */}
            <SectionHeader
              icon="tv"
              color="#8b5cf6"
              title="TV Shows Directory"
              subtitle="Folder containing your TV show directories"
            />
            <input
              type="text"
              value={tvshowsDir}
              onChange={(e) => setTvshowsDir(e.target.value)}
              placeholder="/path/to/tvshows"
              style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem", marginBottom: "20px" }}
            />

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "20px", marginTop: "4px" }}>
              <SectionHeader
                icon="key"
                color="#a855f7"
                title="TMDB API Key"
                subtitle="Optional. Enables auto-fetching metadata from TMDB."
              />
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                <PasswordInput
                  value={tmdbKey}
                  onChange={(e) => {
                    setTmdbKey(e.target.value);
                    setTmdbTestResult(null);
                  }}
                  placeholder="Enter your TMDB API key"
                  style={{ flex: 1 }}
                  inputStyle={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                />
                <button
                  type="button"
                  style={{ ...css.btn, ...css.btnSecondary, flexShrink: 0, opacity: !tmdbKey.trim() ? 0.5 : 1 }}
                  disabled={!tmdbKey.trim() || tmdbTesting}
                  onClick={() => {
                    setTmdbTesting(true);
                    setTmdbTestResult(null);
                    fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=test`)
                      .then((r) =>
                        r.ok
                          ? setTmdbTestResult({ ok: true, message: "API key is valid!" })
                          : setTmdbTestResult({ ok: false, message: "Invalid API key" }),
                      )
                      .catch(() => setTmdbTestResult({ ok: false, message: "Connection failed" }))
                      .finally(() => setTmdbTesting(false));
                  }}
                >
                  {tmdbTesting ? "Testing..." : "Test"}
                </button>
              </div>
              {tmdbTestResult && (
                <p
                  style={{
                    marginTop: "-12px",
                    marginBottom: "16px",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: tmdbTestResult.ok ? "#22c55e" : "#ef4444",
                  }}
                >
                  {tmdbTestResult.message}
                </p>
              )}
            </div>

            {/* KaidaDB */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "20px" }}>
              <SectionHeader
                icon="db"
                color="#3b82f6"
                title="KaidaDB Storage"
                subtitle="Optional. Remote media storage server."
              />
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input
                  type="text"
                  value={kaidadbUrl}
                  onChange={(e) => {
                    setKaidadbUrl(e.target.value);
                    setKaidadbTestResult(null);
                  }}
                  placeholder="http://localhost:8080"
                  style={{ ...css.input, flex: 1, fontFamily: "monospace", fontSize: "0.82rem" }}
                />
                <button
                  type="button"
                  style={{ ...css.btn, ...css.btnSecondary, flexShrink: 0, opacity: !kaidadbUrl.trim() ? 0.5 : 1 }}
                  disabled={!kaidadbUrl.trim() || kaidadbTesting}
                  onClick={() => {
                    setKaidadbTesting(true);
                    setKaidadbTestResult(null);
                    // Save URL first so the backend reads the current value
                    fetch("/api/global-settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      credentials: "same-origin",
                      body: JSON.stringify({
                        kaidadb_url: kaidadbUrl || null,
                        kaidadb_password: kaidadbPassword || null,
                      }),
                    })
                      .then(() => fetch("/api/kaidadb/health", { credentials: "same-origin" }))
                      .then((r) => r.json())
                      .then((d) =>
                        setKaidadbTestResult(
                          d.ok !== false
                            ? { ok: true, message: "Connected!" }
                            : { ok: false, message: d.error || "Failed" },
                        ),
                      )
                      .catch(() => setKaidadbTestResult({ ok: false, message: "Connection failed" }))
                      .finally(() => setKaidadbTesting(false));
                  }}
                >
                  {kaidadbTesting ? "Testing..." : "Test"}
                </button>
              </div>
              {kaidadbTestResult && (
                <p
                  style={{
                    marginBottom: "12px",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: kaidadbTestResult.ok ? "#22c55e" : "#ef4444",
                  }}
                >
                  {kaidadbTestResult.message}
                </p>
              )}
              {kaidadbUrl.trim() && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                  <div>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: "2px",
                        display: "block",
                      }}
                    >
                      Server Password
                    </label>
                    <PasswordInput
                      value={kaidadbPassword}
                      onChange={(e) => {
                        setKaidadbPassword(e.target.value);
                        setKaidadbTestResult(null);
                      }}
                      placeholder="X-Server-Pass (only needed for remote access)"
                      autoComplete="new-password"
                      inputStyle={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: "2px",
                        display: "block",
                      }}
                    >
                      Root Prefix
                    </label>
                    <input
                      type="text"
                      value={kaidadbRootPrefix}
                      onChange={(e) => setKaidadbRootPrefix(e.target.value)}
                      placeholder="leave empty to scan all"
                      style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: "0.75rem",
                          color: "rgba(255,255,255,0.4)",
                          marginBottom: "2px",
                          display: "block",
                        }}
                      >
                        Movies Prefix
                      </label>
                      <input
                        type="text"
                        value={kaidadbMoviesPrefix}
                        onChange={(e) => setKaidadbMoviesPrefix(e.target.value)}
                        placeholder="movies/"
                        style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: "0.75rem",
                          color: "rgba(255,255,255,0.4)",
                          marginBottom: "2px",
                          display: "block",
                        }}
                      >
                        TV Shows Prefix
                      </label>
                      <input
                        type="text"
                        value={kaidadbTvshowsPrefix}
                        onChange={(e) => setKaidadbTvshowsPrefix(e.target.value)}
                        placeholder="tv/"
                        style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SMTP */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "20px" }}>
              <SectionHeader
                icon="mail"
                color="#22c55e"
                title="Email (SMTP)"
                subtitle="Required for password recovery emails."
              />
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <div style={{ flex: 2 }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "2px",
                      display: "block",
                    }}
                  >
                    SMTP Host
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => {
                      setSmtpHost(e.target.value);
                      setSmtpTestResult(null);
                    }}
                    placeholder="smtp.gmail.com"
                    style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "2px",
                      display: "block",
                    }}
                  >
                    Port
                  </label>
                  <input
                    type="text"
                    value={smtpPort}
                    onChange={(e) => {
                      setSmtpPort(e.target.value.replace(/\D/g, ""));
                      setSmtpTestResult(null);
                    }}
                    placeholder="587"
                    style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "2px",
                      display: "block",
                    }}
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="user@gmail.com"
                    style={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "2px",
                      display: "block",
                    }}
                  >
                    Password
                  </label>
                  <PasswordInput
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder="app password"
                    inputStyle={{ ...css.input, fontFamily: "monospace", fontSize: "0.82rem" }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginBottom: "2px", display: "block" }}
                >
                  From Address
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="noreply@yourdomain.com"
                    style={{ ...css.input, flex: 1, fontFamily: "monospace", fontSize: "0.82rem" }}
                  />
                  <button
                    type="button"
                    style={{
                      ...css.btn,
                      ...css.btnSecondary,
                      flexShrink: 0,
                      opacity: !smtpHost.trim() || !smtpPort.trim() ? 0.5 : 1,
                    }}
                    disabled={!smtpHost.trim() || !smtpPort.trim() || smtpTesting}
                    onClick={() => {
                      setSmtpTesting(true);
                      setSmtpTestResult(null);
                      fetch("/api/global-settings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify({
                          smtp_host: smtpHost || null,
                          smtp_port: smtpPort ? parseInt(smtpPort, 10) : null,
                          smtp_user: smtpUser || null,
                          smtp_pass: smtpPass || null,
                          smtp_from: smtpFrom || null,
                        }),
                      })
                        .then(() => fetch("/api/smtp/test", { method: "POST", credentials: "same-origin" }))
                        .then((r) => r.json())
                        .then((data) => setSmtpTestResult(data))
                        .catch(() => setSmtpTestResult({ ok: false, message: "Connection failed" }))
                        .finally(() => setSmtpTesting(false));
                    }}
                  >
                    {smtpTesting ? "Testing..." : "Test"}
                  </button>
                </div>
              </div>
              {smtpTestResult && (
                <p
                  style={{
                    marginBottom: "12px",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: smtpTestResult.ok ? "#22c55e" : "#ef4444",
                  }}
                >
                  {smtpTestResult.message}
                </p>
              )}
            </div>

            {/* Save */}
            <div
              style={{
                paddingTop: "20px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={saving}
                style={{
                  ...css.btn,
                  padding: "10px 28px",
                  background: "linear-gradient(135deg, #f59e0b, #f97316)",
                  color: "#fff",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </>
        )}

        {activeTab === "addmedia" && <AddMediaTab />}
        {activeTab === "migrator" && <MigratorTab />}

        {activeTab === "accounts" && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 16px", color: "rgba(255,255,255,0.8)" }}>
              User Accounts
            </h3>
            {accountsLoading ? (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading...</p>
            ) : accounts.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>No accounts found.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {accounts.map((group) => (
                  <div
                    key={group.email}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "12px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>
                          {group.email || "No email set"}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", marginLeft: "8px" }}>
                          {group.profiles.length} profile{group.profiles.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {group.email && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEmail(group.email)}
                          style={{
                            ...css.btn,
                            ...css.btnSmall,
                            background: "rgba(239,68,68,0.1)",
                            color: "#ef4444",
                            fontSize: "0.75rem",
                          }}
                        >
                          Delete All
                        </button>
                      )}
                    </div>
                    {group.profiles.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px 16px",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <img
                          src={p.image_path || "/images/profileicon.png"}
                          alt={p.name}
                          style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }}
                        />
                        <span style={{ flex: 1, fontSize: "0.85rem", color: "#fff" }}>{p.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(p.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "rgba(255,255,255,0.25)",
                            cursor: "pointer",
                            padding: "4px",
                            fontSize: "0.75rem",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                        >
                          <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  color,
  title,
  subtitle,
}: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
}) {
  const icons: Record<string, JSX.Element> = {
    film: (
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    ),
    tv: (
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <polyline points="17,2 12,7 7,2" />
      </svg>
    ),
    key: (
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
    db: (
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    mail: (
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: `${color}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
        }}
      >
        {icons[icon] || null}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>{title}</p>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{subtitle}</p>
      </div>
    </div>
  );
}
