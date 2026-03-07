import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ProfileData {
  id: number;
  name: string;
  email: string | null;
  image_path: string | null;
  movies_directory: string | null;
  tvshows_directory: string | null;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  files: { name: string; path: string }[];
}

// ── Icons ──
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconFolder = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconUpload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);
const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/>
  </svg>
);
const IconX = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconChevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9,18 15,12 9,6"/>
  </svg>
);
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,18 9,12 15,6"/>
  </svg>
);
const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12"/>
  </svg>
);
const IconFilm = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/>
  </svg>
);
const IconTv = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17,2 12,7 7,2"/>
  </svg>
);
const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

// ── Shared styles ──
const css = {
  overlay: {
    position: "fixed" as const, inset: 0, zIndex: 2000,
    background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px", overflowY: "auto" as const,
    animation: "ossFadeIn 0.2s ease",
  },
  panel: {
    background: "var(--oss-bg-card)", border: "1px solid var(--oss-border)",
    borderRadius: "16px", width: "100%", maxWidth: "520px", maxHeight: "90vh",
    overflow: "hidden", display: "flex", flexDirection: "column" as const,
    boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
    animation: "ossSlideUp 0.3s ease", margin: "auto",
  },
  panelLg: { maxWidth: "640px" },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 24px 16px", borderBottom: "1px solid var(--oss-border)",
  },
  headerTitle: { fontSize: "1.15rem", fontWeight: 700, color: "var(--oss-text)" },
  closeBtn: {
    background: "none", border: "none", color: "var(--oss-text-muted)",
    cursor: "pointer", padding: "6px", borderRadius: "8px",
    display: "flex", alignItems: "center", transition: "all 0.15s ease",
  },
  body: { padding: "24px", overflowY: "auto" as const, flex: 1 },
  footer: {
    display: "flex", gap: "10px", justifyContent: "flex-end",
    padding: "16px 24px", borderTop: "1px solid var(--oss-border)",
  },
  label: {
    fontSize: "0.82rem", fontWeight: 600, color: "var(--oss-text-muted)",
    marginBottom: "6px", display: "block",
  },
  input: {
    width: "100%", padding: "10px 14px", borderRadius: "10px",
    border: "1px solid var(--oss-border)", background: "var(--oss-bg-elevated)",
    color: "var(--oss-text)", fontSize: "0.9rem", outline: "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  inputFocus: {
    borderColor: "var(--oss-accent)",
    boxShadow: "0 0 0 3px var(--oss-accent-glow)",
  },
  btn: {
    padding: "9px 20px", borderRadius: "8px", border: "none",
    fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
    transition: "all 0.2s ease", display: "inline-flex",
    alignItems: "center", gap: "6px",
  },
  btnPrimary: { background: "var(--oss-accent)", color: "#fff" },
  btnSecondary: { background: "rgba(255,255,255,0.08)", color: "var(--oss-text)" },
  btnSmall: { padding: "6px 14px", fontSize: "0.8rem" },
};

// ── File Browser ──
function FileBrowser({ show, onHide, onSelect, initialPath, mode }: {
  show: boolean; onHide: () => void; onSelect: (path: string) => void;
  initialPath?: string; mode: "directories" | "images";
}) {
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browseTo = (path: string) => {
    setLoading(true); setError(null);
    fetch(`/api/browse?path=${encodeURIComponent(path)}&mode=${mode}`)
      .then((r) => r.json())
      .then((data) => data.error ? setError(data.error) : setBrowseData(data))
      .catch(() => setError("Failed to browse"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (show) browseTo(initialPath || "/"); }, [show]);

  if (!show) return null;

  return (
    <div style={css.overlay} onClick={(e) => { if (e.target === e.currentTarget) onHide(); }}>
      <div style={{ ...css.panel, ...css.panelLg }}>
        <div style={css.header}>
          <span style={css.headerTitle}>{mode === "images" ? "Select Image" : "Select Directory"}</span>
          <button style={css.closeBtn} onClick={onHide}><IconX /></button>
        </div>
        <div style={css.body}>
          {browseData && (
            <div style={{
              padding: "8px 14px", borderRadius: "8px", marginBottom: "12px",
              background: "var(--oss-bg-elevated)", fontSize: "0.82rem",
              color: "var(--oss-text-muted)", fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {browseData.current}
            </div>
          )}
          {error && <p style={{ color: "#ef4444", fontSize: "0.85rem" }}>{error}</p>}
          {loading && (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div style={{
                width: "32px", height: "32px", margin: "0 auto",
                border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#6366f1",
                borderRadius: "50%", animation: "vpSpin 0.8s linear infinite",
              }} />
            </div>
          )}
          {!loading && browseData && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "400px", overflowY: "auto" }}>
              {browseData.parent && (
                <BrowseItem onClick={() => browseTo(browseData.parent!)} style={{ color: "var(--oss-accent)" }}>
                  <IconBack /> <span>..</span>
                </BrowseItem>
              )}
              {browseData.directories.map((dir) => (
                <BrowseItem key={dir.path} onClick={() => browseTo(dir.path)}>
                  <IconFolder /> <span style={{ flex: 1, textAlign: "left" }}>{dir.name}</span>
                  <IconChevron />
                </BrowseItem>
              ))}
              {browseData.files.map((file) => (
                <BrowseItem key={file.path} onClick={() => { onSelect(file.path); onHide(); }} style={{ color: "var(--oss-accent)" }}>
                  <IconImage /> <span style={{ flex: 1, textAlign: "left" }}>{file.name}</span>
                </BrowseItem>
              ))}
              {browseData.directories.length === 0 && browseData.files.length === 0 && (
                <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "1.5rem" }}>
                  Empty directory
                </p>
              )}
            </div>
          )}
        </div>
        <div style={css.footer}>
          <button style={{ ...css.btn, ...css.btnSecondary }} onClick={onHide}>Cancel</button>
          {mode === "directories" && (
            <button
              style={{ ...css.btn, ...css.btnPrimary, opacity: browseData ? 1 : 0.5 }}
              disabled={!browseData}
              onClick={() => { if (browseData) { onSelect(browseData.current); onHide(); } }}
            >
              <IconCheck /> Select This Directory
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const dirItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "10px",
  padding: "10px 14px", border: "none", borderRadius: "8px",
  background: "transparent", color: "var(--oss-text)",
  cursor: "pointer", fontSize: "0.85rem", textAlign: "left",
  transition: "background 0.15s ease", width: "100%",
};

// ── Profile Modal ──
function ProfileModal({ show, onHide, profile, onProfileUpdate }: {
  show: boolean; onHide: () => void;
  profile: ProfileData; onProfileUpdate: (p: ProfileData) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? "");
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) { setName(profile.name); setEmail(profile.email ?? ""); }
  }, [show, profile]);

  const handleSave = () => {
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: email || null }),
    })
      .then((r) => r.json())
      .then((data) => { onProfileUpdate(data); onHide(); })
      .catch((err) => console.error("Failed to save profile:", err));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);
    fetch("/api/profile/avatar", { method: "POST", body: formData })
      .then((r) => r.json())
      .then((data) => { if (!data.error) onProfileUpdate(data); })
      .catch((err) => console.error("Upload failed:", err))
      .finally(() => setUploading(false));
  };

  const handleBrowseSelect = (filePath: string) => {
    setUploading(true);
    fetch("/api/profile/avatar/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    })
      .then((r) => r.json())
      .then((data) => { if (!data.error) onProfileUpdate(data); })
      .catch((err) => console.error("Browse select failed:", err))
      .finally(() => setUploading(false));
  };

  if (!show) return null;

  return (
    <>
      <div style={css.overlay} onClick={(e) => { if (e.target === e.currentTarget) onHide(); }}>
        <div style={css.panel}>
          <div style={css.header}>
            <span style={css.headerTitle}>Edit Profile</span>
            <button style={css.closeBtn} onClick={onHide}><IconX /></button>
          </div>
          <div style={css.body}>
            {/* Avatar */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
              <div style={{ position: "relative", marginBottom: "14px" }}>
                {uploading ? (
                  <div style={{
                    width: "96px", height: "96px", borderRadius: "50%",
                    background: "var(--oss-bg-elevated)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: "28px", height: "28px",
                      border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#6366f1",
                      borderRadius: "50%", animation: "vpSpin 0.8s linear infinite",
                    }} />
                  </div>
                ) : (
                  <img
                    src={profile.image_path || "/images/profileicon.png"}
                    alt="Avatar"
                    style={{
                      width: "96px", height: "96px", borderRadius: "50%", objectFit: "cover",
                      border: "3px solid var(--oss-border)", cursor: "pointer",
                      transition: "border-color 0.2s ease",
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--oss-accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--oss-border)")}
                  />
                )}
                <div style={{
                  position: "absolute", bottom: "0", right: "0",
                  width: "28px", height: "28px", borderRadius: "50%",
                  background: "var(--oss-accent)", border: "2px solid var(--oss-bg-card)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }} onClick={() => fileInputRef.current?.click()}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4" fill="var(--oss-accent)" stroke="#fff" strokeWidth="1.5"/>
                  </svg>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  style={{ ...css.btn, ...css.btnSecondary, ...css.btnSmall }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <IconUpload /> Upload
                </button>
                <button
                  style={{ ...css.btn, ...css.btnSecondary, ...css.btnSmall }}
                  onClick={() => setShowImageBrowser(true)}
                  disabled={uploading}
                >
                  <IconImage /> Browse
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileUpload} />
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: "18px" }}>
              <label style={css.label}>Display Name</label>
              <input
                type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                maxLength={25}
                placeholder="Your name"
                style={{ ...css.input, ...(nameFocused ? css.inputFocus : {}) }}
              />
              {name.length < 1 && (
                <p style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: "4px" }}>Name is required</p>
              )}
            </div>

            {/* Email */}
            <div style={{ marginBottom: "8px" }}>
              <label style={css.label}>Email <span style={{ fontWeight: 400, color: "var(--oss-text-muted)" }}>(optional)</span></label>
              <input
                type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="your@email.com"
                style={{ ...css.input, ...(emailFocused ? css.inputFocus : {}) }}
              />
            </div>
          </div>
          <div style={css.footer}>
            <button style={{ ...css.btn, ...css.btnSecondary }} onClick={onHide}>Cancel</button>
            <button
              style={{ ...css.btn, ...css.btnPrimary, opacity: name.length < 1 ? 0.5 : 1 }}
              onClick={handleSave}
              disabled={name.length < 1}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <FileBrowser
        show={showImageBrowser}
        onHide={() => setShowImageBrowser(false)}
        onSelect={handleBrowseSelect}
        initialPath="/"
        mode="images"
      />
    </>
  );
}

// ── Settings Modal ──
function SettingsModal({ show, onHide, profile, onProfileUpdate }: {
  show: boolean; onHide: () => void;
  profile: ProfileData; onProfileUpdate: (p: ProfileData) => void;
}) {
  const [activeTab, setActiveTab] = useState<"directories" | "about">("directories");
  const [moviesDir, setMoviesDir] = useState(profile.movies_directory ?? "");
  const [tvshowsDir, setTvshowsDir] = useState(profile.tvshows_directory ?? "");
  const [browseTarget, setBrowseTarget] = useState<"movies" | "tvshows" | null>(null);
  const [saving, setSaving] = useState(false);
  const [moviesFocused, setMoviesFocused] = useState(false);
  const [tvFocused, setTvFocused] = useState(false);

  useEffect(() => {
    if (show) {
      setMoviesDir(profile.movies_directory ?? "");
      setTvshowsDir(profile.tvshows_directory ?? "");
    }
  }, [show, profile]);

  const handleSave = () => {
    setSaving(true);
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movies_directory: moviesDir || null, tvshows_directory: tvshowsDir || null }),
    })
      .then((r) => r.json())
      .then((data) => { onProfileUpdate(data); onHide(); })
      .catch((err) => console.error("Failed to save settings:", err))
      .finally(() => setSaving(false));
  };

  const handleBrowseSelect = (path: string) => {
    if (browseTarget === "movies") setMoviesDir(path);
    else if (browseTarget === "tvshows") setTvshowsDir(path);
  };

  if (!show) return null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", border: "none", borderRadius: "8px",
    background: active ? "var(--oss-accent)" : "transparent",
    color: active ? "#fff" : "var(--oss-text-muted)",
    fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
    transition: "all 0.2s ease",
  });

  return (
    <>
      <div style={css.overlay} onClick={(e) => { if (e.target === e.currentTarget) onHide(); }}>
        <div style={{ ...css.panel, ...css.panelLg }}>
          <div style={css.header}>
            <span style={css.headerTitle}>Settings</span>
            <button style={css.closeBtn} onClick={onHide}><IconX /></button>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: "4px", padding: "0 24px 16px",
            borderBottom: "1px solid var(--oss-border)",
          }}>
            <button style={tabStyle(activeTab === "directories")} onClick={() => setActiveTab("directories")}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconFolder /> Media</span>
            </button>
            <button style={tabStyle(activeTab === "about")} onClick={() => setActiveTab("about")}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconInfo /> About</span>
            </button>
          </div>

          <div style={css.body}>
            {activeTab === "directories" && (
              <>
                {/* Movies directory */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "10px",
                      background: "rgba(99,102,241,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#6366f1",
                    }}>
                      <IconFilm />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--oss-text)" }}>Movies Directory</p>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--oss-text-muted)" }}>Folder containing your movie directories</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text" value={moviesDir}
                      onChange={(e) => setMoviesDir(e.target.value)}
                      onFocus={() => setMoviesFocused(true)}
                      onBlur={() => setMoviesFocused(false)}
                      placeholder="/path/to/movies"
                      style={{
                        ...css.input, flex: 1, fontFamily: "monospace", fontSize: "0.82rem",
                        ...(moviesFocused ? css.inputFocus : {}),
                      }}
                    />
                    <button
                      style={{ ...css.btn, ...css.btnSecondary, flexShrink: 0 }}
                      onClick={() => setBrowseTarget("movies")}
                    >
                      <IconFolder /> Browse
                    </button>
                  </div>
                </div>

                {/* TV Shows directory */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "10px",
                      background: "rgba(34,197,94,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#22c55e",
                    }}>
                      <IconTv />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--oss-text)" }}>TV Shows Directory</p>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--oss-text-muted)" }}>Folder containing your TV show directories</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text" value={tvshowsDir}
                      onChange={(e) => setTvshowsDir(e.target.value)}
                      onFocus={() => setTvFocused(true)}
                      onBlur={() => setTvFocused(false)}
                      placeholder="/path/to/tvshows"
                      style={{
                        ...css.input, flex: 1, fontFamily: "monospace", fontSize: "0.82rem",
                        ...(tvFocused ? css.inputFocus : {}),
                      }}
                    />
                    <button
                      style={{ ...css.btn, ...css.btnSecondary, flexShrink: 0 }}
                      onClick={() => setBrowseTarget("tvshows")}
                    >
                      <IconFolder /> Browse
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "about" && (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div style={{
                  width: "64px", height: "64px", borderRadius: "16px",
                  background: "linear-gradient(135deg, #6366f1, #818cf8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px", fontSize: "1.6rem", fontWeight: 800, color: "#fff",
                }}>
                  O
                </div>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.2rem", fontWeight: 700, color: "var(--oss-text)" }}>OSSFlix</h3>
                <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--oss-text-muted)" }}>
                  Open-source media browser and player
                </p>
                <div style={{
                  display: "inline-flex", gap: "16px", padding: "12px 20px",
                  background: "var(--oss-bg-elevated)", borderRadius: "10px",
                  fontSize: "0.8rem", color: "var(--oss-text-muted)",
                }}>
                  <span>Powered by <strong style={{ color: "var(--oss-text)" }}>Bun</strong></span>
                  <span style={{ color: "var(--oss-border)" }}>|</span>
                  <span>Built with <strong style={{ color: "var(--oss-text)" }}>React</strong></span>
                </div>
              </div>
            )}
          </div>

          <div style={css.footer}>
            <button style={{ ...css.btn, ...css.btnSecondary }} onClick={onHide}>Cancel</button>
            {activeTab === "directories" && (
              <button
                style={{ ...css.btn, ...css.btnPrimary, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            )}
          </div>
        </div>
      </div>

      <FileBrowser
        show={browseTarget !== null}
        onHide={() => setBrowseTarget(null)}
        onSelect={handleBrowseSelect}
        initialPath={browseTarget === "movies" ? (moviesDir || "/") : (tvshowsDir || "/")}
        mode="directories"
      />
    </>
  );
}

// ── Hover-enabled items ──
function DropdownItem({ onClick, children, style: extraStyle }: {
  onClick?: () => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...dropdownItemStyle, ...extraStyle }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--oss-bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function BrowseItem({ onClick, children, style: extraStyle }: {
  onClick: () => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...dirItemStyle, ...extraStyle }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--oss-bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

// ── Profile Dropdown ──
export function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => setProfile(data))
      .catch((err) => console.error("Failed to load profile:", err));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  if (!profile) {
    return (
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%",
        background: "var(--oss-bg-elevated)", animation: "vpSpin 1s linear infinite",
        border: "2px solid var(--oss-border)", borderTopColor: "#6366f1",
      }} />
    );
  }

  return (
    <>
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "none", border: "2px solid transparent",
            borderRadius: "24px", padding: "3px 10px 3px 3px",
            cursor: "pointer", transition: "all 0.2s ease",
            borderColor: dropdownOpen ? "var(--oss-accent)" : "transparent",
          }}
          onMouseEnter={(e) => { if (!dropdownOpen) e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
          onMouseLeave={(e) => { if (!dropdownOpen) e.currentTarget.style.borderColor = "transparent"; }}
        >
          <img
            src={profile.image_path || "/images/profileicon.png"}
            alt="Profile"
            style={{
              width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover",
            }}
          />
          <span style={{ color: "var(--oss-text)", fontSize: "0.85rem", fontWeight: 500 }}>{profile.name}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--oss-text-muted)" strokeWidth="2.5"
            style={{ transition: "transform 0.2s ease", transform: dropdownOpen ? "rotate(180deg)" : "rotate(0)" }}>
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>

        {dropdownOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            background: "var(--oss-bg-elevated)",
            border: "1px solid var(--oss-border)",
            borderRadius: "12px", padding: "6px", minWidth: "200px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            animation: "vpSlideUp 0.15s ease",
            zIndex: 1001,
          }}>
            {/* Profile header in dropdown */}
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 12px", marginBottom: "4px",
              borderBottom: "1px solid var(--oss-border)",
            }}>
              <img
                src={profile.image_path || "/images/profileicon.png"}
                alt="Profile"
                style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }}
              />
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--oss-text)" }}>{profile.name}</p>
                {profile.email && (
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--oss-text-muted)" }}>{profile.email}</p>
                )}
              </div>
            </div>

            <DropdownItem onClick={() => { setDropdownOpen(false); setShowProfile(true); }}>
              <IconUser /> Profile
            </DropdownItem>
            <DropdownItem onClick={() => { setDropdownOpen(false); setShowSettings(true); }}>
              <IconSettings /> Settings
            </DropdownItem>
            <div style={{ height: "1px", background: "var(--oss-border)", margin: "4px 0" }} />
            <DropdownItem style={{ color: "#ef4444" }}>
              <IconLogout /> Sign Out
            </DropdownItem>
          </div>
        )}
      </div>

      {createPortal(
        <ProfileModal
          show={showProfile}
          onHide={() => setShowProfile(false)}
          profile={profile}
          onProfileUpdate={setProfile}
        />,
        document.body
      )}
      {createPortal(
        <SettingsModal
          show={showSettings}
          onHide={() => setShowSettings(false)}
          profile={profile}
          onProfileUpdate={setProfile}
        />,
        document.body
      )}
    </>
  );
}

const dropdownItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "10px", width: "100%",
  padding: "9px 12px", border: "none", borderRadius: "8px",
  background: "transparent", color: "var(--oss-text-muted)",
  fontSize: "0.85rem", cursor: "pointer", textAlign: "left",
  transition: "all 0.15s ease",
};

export default Profile;
