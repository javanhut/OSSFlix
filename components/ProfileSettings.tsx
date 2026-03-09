import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../context/ProfileContext";

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
const IconRescan = ({ spinning }: { spinning?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={spinning ? { animation: "spin 1s linear infinite" } : {}}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
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
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6",
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
                      border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6",
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

// ── Migrator Icons ──
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconArrowUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18,15 12,9 6,15" /></svg>
);
const IconArrowDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6,9 12,15 18,9" /></svg>
);

const GENRE_OPTIONS = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Musical",
  "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
  "Anime", "Superhero", "Neo-Western", "Zombie Apocalypse",
];

type MigratorBrowseResult = {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  files: { name: string; path: string }[];
};

type DroppedFile = {
  name: string;
  sourcePath: string;
  newName: string;
};

type EpisodeEntry = { number: number; name: string };

// ── Migrator Source Browser ──
function SourceBrowser({ onFilesSelected }: { onFilesSelected: (files: { name: string; path: string }[]) => void }) {
  const [browseData, setBrowseData] = useState<MigratorBrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const browseTo = (path: string) => {
    setLoading(true);
    fetch(`/api/browse?path=${encodeURIComponent(path)}&mode=all`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setBrowseData(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { browseTo("/"); }, []);

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const handleAdd = () => {
    if (!browseData) return;
    const files = browseData.files.filter((f) => selected.has(f.path));
    onFilesSelected(files);
    setSelected(new Set());
  };

  return (
    <div style={{ border: "1px solid var(--oss-border)", borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--oss-text)" }}>Browse Files</span>
        {selected.size > 0 && (
          <button style={{ ...css.btn, ...css.btnPrimary, padding: "4px 12px", fontSize: "0.78rem" }} onClick={handleAdd}>
            Add {selected.size} file{selected.size > 1 ? "s" : ""}
          </button>
        )}
      </div>
      {browseData && (
        <div style={{
          padding: "4px 10px", borderRadius: "6px", marginBottom: "8px",
          background: "var(--oss-bg-elevated)", fontSize: "0.75rem",
          color: "var(--oss-text-muted)", fontFamily: "monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {browseData.current}
        </div>
      )}
      {loading && (
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{
            width: "20px", height: "20px", margin: "0 auto",
            border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6",
            borderRadius: "50%", animation: "vpSpin 0.8s linear infinite",
          }} />
        </div>
      )}
      {!loading && browseData && (
        <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1px" }}>
          {browseData.parent && (
            <button onClick={() => browseTo(browseData.parent!)} style={{
              ...dirItemStyle, color: "var(--oss-accent)", fontSize: "0.82rem", padding: "6px 10px",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--oss-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconBack /> ..
            </button>
          )}
          {browseData.directories.map((dir) => (
            <button key={dir.path} onClick={() => browseTo(dir.path)} style={{
              ...dirItemStyle, fontSize: "0.82rem", padding: "6px 10px",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--oss-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconFolder /> <span style={{ flex: 1, textAlign: "left" }}>{dir.name}</span>
              <IconChevron />
            </button>
          ))}
          {browseData.files.map((file) => (
            <button key={file.path} onClick={() => toggleFile(file.path)} style={{
              ...dirItemStyle, fontSize: "0.82rem", padding: "6px 10px",
              background: selected.has(file.path) ? "rgba(59,130,246,0.12)" : "transparent",
            }}
              onMouseEnter={(e) => { if (!selected.has(file.path)) e.currentTarget.style.background = "var(--oss-bg-hover)"; }}
              onMouseLeave={(e) => { if (!selected.has(file.path)) e.currentTarget.style.background = selected.has(file.path) ? "rgba(59,130,246,0.12)" : "transparent"; }}
            >
              <div style={{
                width: "16px", height: "16px", borderRadius: "3px", flexShrink: 0,
                border: selected.has(file.path) ? "none" : "1.5px solid var(--oss-border)",
                background: selected.has(file.path) ? "var(--oss-accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {selected.has(file.path) && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>
                )}
              </div>
              <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Migrator Tab Content ──
function MigratorTab() {
  const [step, setStep] = useState(0);
  const [mediaType, setMediaType] = useState<"Movie" | "tv show">("Movie");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [cast, setCast] = useState<string[]>([]);
  const [season, setSeason] = useState(1);
  const [episodeNames, setEpisodeNames] = useState<EpisodeEntry[]>([]);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [genreInput, setGenreInput] = useState("");
  const [castInput, setCastInput] = useState("");
  const [namingMode, setNamingMode] = useState<"numbered" | "custom">("numbered");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const inputStyle = (field: string) => ({
    ...css.input,
    ...(focusedField === field ? css.inputFocus : {}),
  });

  const addGenre = (g: string) => {
    const trimmed = g.trim();
    if (trimmed && !genres.includes(trimmed)) setGenres((prev) => [...prev, trimmed]);
    setGenreInput("");
  };

  const addCast = () => {
    const trimmed = castInput.trim();
    if (trimmed && !cast.includes(trimmed)) setCast((prev) => [...prev, trimmed]);
    setCastInput("");
  };

  const handleFilesFromBrowser = (newFiles: { name: string; path: string }[]) => {
    const existing = new Set(files.map((f) => f.sourcePath));
    const additions: DroppedFile[] = newFiles
      .filter((f) => !existing.has(f.path))
      .map((f, i) => {
        const ext = f.name.substring(f.name.lastIndexOf("."));
        const num = files.length + i + 1;
        return { name: f.name, sourcePath: f.path, newName: namingMode === "numbered" ? `${num}${ext}` : f.name };
      });
    setFiles((prev) => [...prev, ...additions]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (namingMode === "numbered") {
        return next.map((f, i) => {
          const ext = f.name.substring(f.name.lastIndexOf("."));
          return { ...f, newName: `${i + 1}${ext}` };
        });
      }
      return next;
    });
    setEpisodeNames((prev) => prev.filter((e) => e.number !== idx + 1));
  };

  const moveFile = (idx: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      if (namingMode === "numbered") {
        return next.map((f, i) => {
          const ext = f.name.substring(f.name.lastIndexOf("."));
          return { ...f, newName: `${i + 1}${ext}` };
        });
      }
      return next;
    });
  };

  const renameFile = (idx: number, newName: string) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, newName } : f)));
  };

  const updateEpisodeName = (epNum: number, epName: string) => {
    setEpisodeNames((prev) => {
      const existing = prev.find((e) => e.number === epNum);
      if (existing) return prev.map((e) => e.number === epNum ? { ...e, name: epName } : e);
      return [...prev, { number: epNum, name: epName }];
    });
  };

  const applyNumberedNaming = () => {
    setNamingMode("numbered");
    setFiles((prev) => prev.map((f, i) => {
      const ext = f.name.substring(f.name.lastIndexOf("."));
      return { ...f, newName: `${i + 1}${ext}` };
    }));
  };

  const applyCustomNaming = () => {
    setNamingMode("custom");
    setFiles((prev) => prev.map((f) => ({ ...f, newName: f.name })));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/migrator/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          toml: {
            name, type: mediaType, description, genre: genres, cast,
            season: mediaType === "tv show" ? season : undefined,
            episodes: mediaType === "tv show" ? files.length : undefined,
            episodeNames: mediaType === "tv show" ? episodeNames.filter((e) => e.name.trim()) : undefined,
          },
          files: files.map((f) => ({ sourcePath: f.sourcePath, newName: f.newName })),
        }),
      });
      const data = await res.json();
      setSaveResult(data.error ? { ok: false, message: data.error } : { ok: true, message: data.message || "Done!" });
      if (!data.error) {
        setStep(0); setName(""); setDescription(""); setGenres([]); setCast([]);
        setSeason(1); setEpisodeNames([]); setFiles([]); setMediaType("Movie");
        window.dispatchEvent(new CustomEvent("ossflix-media-updated"));
      }
    } catch (err: any) {
      setSaveResult({ ok: false, message: err.message || "Failed" });
    } finally {
      setSaving(false);
    }
  };

  const canNext0 = name.trim().length > 0;
  const canNext1 = genres.length > 0 && description.trim().length > 0;
  const canNext2 = files.length > 0;

  const stepLabel = ["Title", "Details", "Files", "Review"];

  // Step indicators
  const StepDots = () => (
    <div style={{ display: "flex", gap: "0", marginBottom: "16px" }}>
      {stepLabel.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < stepLabel.length - 1 ? 1 : undefined }}>
          <div style={{
            width: "26px", height: "26px", borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700,
            background: i <= step ? "var(--oss-accent)" : "var(--oss-bg-elevated)",
            color: i <= step ? "#fff" : "var(--oss-text-muted)",
            border: i <= step ? "none" : "1px solid var(--oss-border)",
            flexShrink: 0,
          }}>
            {i < step ? "\u2713" : i + 1}
          </div>
          <span style={{ fontSize: "0.72rem", marginLeft: "4px", color: i <= step ? "var(--oss-text)" : "var(--oss-text-muted)" }}>{label}</span>
          {i < stepLabel.length - 1 && (
            <div style={{ flex: 1, height: "2px", marginLeft: "8px", background: i < step ? "var(--oss-accent)" : "var(--oss-border)" }} />
          )}
        </div>
      ))}
    </div>
  );

  const navButtons = (back: number | null, next: (() => void) | null, canNext?: boolean) => (
    <div style={{ display: "flex", justifyContent: back !== null ? "space-between" : "flex-end", marginTop: "12px" }}>
      {back !== null && (
        <button style={{ ...css.btn, ...css.btnSecondary, padding: "6px 14px", fontSize: "0.8rem" }} onClick={() => setStep(back)}>
          <IconBack /> Back
        </button>
      )}
      {next && (
        <button style={{ ...css.btn, ...css.btnPrimary, padding: "6px 14px", fontSize: "0.8rem", opacity: canNext === false ? 0.5 : 1 }} disabled={canNext === false} onClick={next}>
          Next <IconChevron />
        </button>
      )}
    </div>
  );

  const tagStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "3px 8px", borderRadius: "5px", fontSize: "0.75rem", fontWeight: 500,
  };

  return (
    <div>
      <StepDots />

      {saveResult && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "12px",
          background: saveResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          color: saveResult.ok ? "#22c55e" : "#ef4444",
          fontSize: "0.82rem", fontWeight: 500,
        }}>
          {saveResult.message}
        </div>
      )}

      {/* Step 0: Title Info */}
      {step === 0 && (
        <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            {(["Movie", "tv show"] as const).map((t) => (
              <button key={t} style={{
                ...css.btn, ...(mediaType === t ? css.btnPrimary : css.btnSecondary),
                flex: 1, justifyContent: "center", padding: "8px 14px", fontSize: "0.82rem",
              }} onClick={() => setMediaType(t)}>
                {t === "Movie" ? <IconFilm /> : <IconTv />}
                {t === "tv show" ? "TV Show" : "Movie"}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={css.label}>Title</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)}
              placeholder="Enter title name" style={inputStyle("name")} />
          </div>
          {mediaType === "tv show" && (
            <div style={{ marginBottom: "14px" }}>
              <label style={css.label}>Season</label>
              <input type="number" min={1} value={season} onChange={(e) => setSeason(parseInt(e.target.value) || 1)}
                onFocus={() => setFocusedField("season")} onBlur={() => setFocusedField(null)}
                style={{ ...inputStyle("season"), width: "100px" }} />
            </div>
          )}
          {navButtons(null, () => setStep(1), canNext0)}
        </>
      )}

      {/* Step 1: Details */}
      {step === 1 && (
        <>
          <div style={{ marginBottom: "14px" }}>
            <label style={css.label}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setFocusedField("desc")} onBlur={() => setFocusedField(null)}
              placeholder="Enter a description..."
              style={{ ...css.input, ...(focusedField === "desc" ? css.inputFocus : {}), minHeight: "70px", resize: "vertical" as const, fontFamily: "inherit" }} />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={css.label}>Genres</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
              {genres.map((g) => (
                <span key={g} style={{ ...tagStyle, background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                  {g}
                  <button onClick={() => setGenres((p) => p.filter((x) => x !== g))}
                    style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: "0 1px", fontSize: "0.9rem", lineHeight: 1 }}>&times;</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input type="text" value={genreInput} onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGenre(genreInput); } }}
                onFocus={() => setFocusedField("genre")} onBlur={() => setFocusedField(null)}
                placeholder="Type genre..." style={{ ...inputStyle("genre"), flex: 1 }} list="migrator-genres" />
              <button style={{ ...css.btn, ...css.btnSecondary, ...css.btnSmall }} onClick={() => addGenre(genreInput)}>Add</button>
            </div>
            <datalist id="migrator-genres">
              {GENRE_OPTIONS.filter((g) => !genres.includes(g)).map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={css.label}>Cast</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
              {cast.map((c) => (
                <span key={c} style={{ ...tagStyle, background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                  {c}
                  <button onClick={() => setCast((p) => p.filter((x) => x !== c))}
                    style={{ background: "none", border: "none", color: "#22c55e", cursor: "pointer", padding: "0 1px", fontSize: "0.9rem", lineHeight: 1 }}>&times;</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input type="text" value={castInput} onChange={(e) => setCastInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCast(); } }}
                onFocus={() => setFocusedField("cast")} onBlur={() => setFocusedField(null)}
                placeholder="Actor name..." style={{ ...inputStyle("cast"), flex: 1 }} />
              <button style={{ ...css.btn, ...css.btnSecondary, ...css.btnSmall }} onClick={addCast}>Add</button>
            </div>
          </div>
          {navButtons(0, () => setStep(2), canNext1)}
        </>
      )}

      {/* Step 2: Files */}
      {step === 2 && (
        <>
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            <button style={{ ...css.btn, ...css.btnSmall, ...(namingMode === "numbered" ? css.btnPrimary : css.btnSecondary) }} onClick={applyNumberedNaming}>
              Numbered (1.mp4, 2.mp4)
            </button>
            <button style={{ ...css.btn, ...css.btnSmall, ...(namingMode === "custom" ? css.btnPrimary : css.btnSecondary) }} onClick={applyCustomNaming}>
              Keep Original
            </button>
          </div>

          <SourceBrowser onFilesSelected={handleFilesFromBrowser} />

          {files.length > 0 && (
            <div>
              <label style={{ ...css.label, marginBottom: "8px" }}>{files.length} file{files.length > 1 ? "s" : ""}</label>
              {files.map((file, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 10px", borderRadius: "8px",
                  background: "var(--oss-bg-elevated)", marginBottom: "4px",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }}>
                    <button onClick={() => moveFile(idx, -1)} disabled={idx === 0}
                      style={{ background: "none", border: "none", color: idx === 0 ? "var(--oss-border)" : "var(--oss-text-muted)", cursor: idx === 0 ? "default" : "pointer", padding: "1px" }}>
                      <IconArrowUp />
                    </button>
                    <button onClick={() => moveFile(idx, 1)} disabled={idx === files.length - 1}
                      style={{ background: "none", border: "none", color: idx === files.length - 1 ? "var(--oss-border)" : "var(--oss-text-muted)", cursor: idx === files.length - 1 ? "default" : "pointer", padding: "1px" }}>
                      <IconArrowDown />
                    </button>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--oss-text-muted)", fontWeight: 700, minWidth: "20px" }}>{idx + 1}.</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--oss-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                    {editingIndex === idx ? (
                      <input type="text" value={file.newName} onChange={(e) => renameFile(idx, e.target.value)}
                        onBlur={() => setEditingIndex(null)} onKeyDown={(e) => { if (e.key === "Enter") setEditingIndex(null); }}
                        autoFocus style={{ ...css.input, padding: "3px 6px", fontSize: "0.78rem", marginTop: "2px" }} />
                    ) : (
                      <div style={{ fontSize: "0.82rem", fontWeight: 500, cursor: "pointer", color: "var(--oss-accent)" }} onClick={() => setEditingIndex(idx)}>
                        &rarr; {file.newName}
                      </div>
                    )}
                    {mediaType === "tv show" && (
                      <input type="text" placeholder={`Ep ${idx + 1} name (optional)`}
                        value={episodeNames.find((e) => e.number === idx + 1)?.name || ""}
                        onChange={(e) => updateEpisodeName(idx + 1, e.target.value)}
                        style={{ ...css.input, padding: "3px 6px", fontSize: "0.75rem", marginTop: "2px" }} />
                    )}
                  </div>
                  <button onClick={() => removeFile(idx)}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          )}
          {navButtons(1, () => setStep(3), canNext2)}
        </>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <>
          <div style={{
            background: "var(--oss-bg-elevated)", borderRadius: "10px",
            padding: "14px", marginBottom: "14px", fontSize: "0.82rem",
          }}>
            <p style={{ margin: "0 0 6px", fontSize: "0.75rem", color: "var(--oss-text-muted)" }}>
              Destination: <strong style={{ color: "var(--oss-text)" }}>{mediaType === "Movie" ? "Movies" : "TV Shows"} / {name.replace(/\s+/g, "")}</strong>
            </p>
            {[
              ["Title", name],
              ["Type", mediaType === "tv show" ? "TV Show" : "Movie"],
              ...(mediaType === "tv show" ? [["Season", String(season)], ["Episodes", String(files.length)]] : []),
              ["Genres", genres.join(", ")],
              ["Cast", cast.length > 0 ? cast.join(", ") : "None"],
              ["Files", String(files.length)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "var(--oss-text-muted)" }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: "14px" }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", padding: "6px 10px",
                background: "var(--oss-bg-elevated)", borderRadius: "6px", marginBottom: "3px", fontSize: "0.78rem",
              }}>
                <span style={{ color: "var(--oss-text-muted)" }}>{f.name}</span>
                <span style={{ color: "var(--oss-accent)" }}>&rarr; {f.newName}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
            <button style={{ ...css.btn, ...css.btnSecondary, padding: "6px 14px", fontSize: "0.8rem" }} onClick={() => setStep(2)}>
              <IconBack /> Back
            </button>
            <button style={{ ...css.btn, ...css.btnPrimary, padding: "6px 14px", fontSize: "0.8rem", opacity: saving ? 0.6 : 1 }}
              disabled={saving} onClick={handleSave}>
              {saving ? "Importing..." : (
                <><IconCheck /> Import Media</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Add Media Tab ──
type ExistingTitle = {
  name: string;
  type: string;
  imagePath: string | null;
  dirPath: string;
  sourcePath: string;
  season: number | null;
  episodes: number | null;
};

const IconAddFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
  </svg>
);

function AddMediaTab() {
  const [titles, setTitles] = useState<ExistingTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ExistingTitle | null>(null);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [namingMode, setNamingMode] = useState<"numbered" | "custom">("numbered");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/media/titles")
      .then((r) => r.json())
      .then((data) => setTitles(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? titles.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : titles;

  const handleSelect = (title: ExistingTitle) => {
    setSelected(title);
    setFiles([]);
    setSaveResult(null);
    // For TV shows, start numbering from existing episode count + 1
    setNamingMode("numbered");
  };

  const startEpNumber = (selected?.episodes || 0) + 1;

  const handleFilesFromBrowser = (newFiles: { name: string; path: string }[]) => {
    const existing = new Set(files.map((f) => f.sourcePath));
    const additions: DroppedFile[] = newFiles
      .filter((f) => !existing.has(f.path))
      .map((f, i) => {
        const ext = f.name.substring(f.name.lastIndexOf("."));
        const num = startEpNumber + files.length + i;
        return { name: f.name, sourcePath: f.path, newName: namingMode === "numbered" ? `${num}${ext}` : f.name };
      });
    setFiles((prev) => [...prev, ...additions]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (namingMode === "numbered") {
        return next.map((f, i) => {
          const ext = f.name.substring(f.name.lastIndexOf("."));
          return { ...f, newName: `${startEpNumber + i}${ext}` };
        });
      }
      return next;
    });
  };

  const moveFile = (idx: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      if (namingMode === "numbered") {
        return next.map((f, i) => {
          const ext = f.name.substring(f.name.lastIndexOf("."));
          return { ...f, newName: `${startEpNumber + i}${ext}` };
        });
      }
      return next;
    });
  };

  const renameFile = (idx: number, newName: string) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, newName } : f)));
  };

  const applyNumbered = () => {
    setNamingMode("numbered");
    setFiles((prev) => prev.map((f, i) => {
      const ext = f.name.substring(f.name.lastIndexOf("."));
      return { ...f, newName: `${startEpNumber + i}${ext}` };
    }));
  };

  const applyCustom = () => {
    setNamingMode("custom");
    setFiles((prev) => prev.map((f) => ({ ...f, newName: f.name })));
  };

  const handleSave = async () => {
    if (!selected || files.length === 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/migrator/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: selected.sourcePath,
          files: files.map((f) => ({ sourcePath: f.sourcePath, newName: f.newName })),
          updateEpisodeCount: selected.type.toLowerCase() === "tv show",
        }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveResult({ ok: false, message: data.error });
      } else {
        setSaveResult({ ok: true, message: data.message || "Files added!" });
        setFiles([]);
        fetch("/api/media/titles").then((r) => r.json()).then(setTitles).catch(() => {});
        window.dispatchEvent(new CustomEvent("ossflix-media-updated"));
      }
    } catch (err: any) {
      setSaveResult({ ok: false, message: err.message || "Failed" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <div style={{
          width: "24px", height: "24px", margin: "0 auto",
          border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6",
          borderRadius: "50%", animation: "vpSpin 0.8s linear infinite",
        }} />
      </div>
    );
  }

  // Title selection view
  if (!selected) {
    return (
      <div>
        <p style={{ fontSize: "0.82rem", color: "var(--oss-text-muted)", marginBottom: "12px" }}>
          Select a title to add files to.
        </p>
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocusedField("search")}
          onBlur={() => setFocusedField(null)}
          placeholder="Search titles..."
          style={{ ...css.input, marginBottom: "12px", ...(focusedField === "search" ? css.inputFocus : {}) }}
        />
        <div style={{ maxHeight: "320px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
          {filtered.length === 0 && (
            <p style={{ color: "var(--oss-text-muted)", fontSize: "0.82rem", textAlign: "center", padding: "1.5rem" }}>
              {titles.length === 0 ? "No titles in your library yet. Use the Migrator to add one." : "No matching titles."}
            </p>
          )}
          {filtered.map((t) => (
            <button
              key={t.dirPath}
              onClick={() => handleSelect(t)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 12px", border: "none", borderRadius: "8px",
                background: "transparent", color: "var(--oss-text)",
                cursor: "pointer", textAlign: "left", width: "100%",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--oss-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {t.imagePath ? (
                <img src={t.imagePath} alt="" style={{ width: "48px", height: "32px", borderRadius: "4px", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: "48px", height: "32px", borderRadius: "4px", flexShrink: 0,
                  background: "var(--oss-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {t.type.toLowerCase() === "movie" ? <IconFilm /> : <IconTv />}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--oss-text-muted)" }}>
                  {t.type === "tv show" ? `TV Show \u00B7 Season ${t.season} \u00B7 ${t.episodes} episodes` : "Movie"}
                </div>
              </div>
              <IconChevron />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // File add view for selected title
  return (
    <div>
      {/* Selected title header */}
      <button
        onClick={() => { setSelected(null); setFiles([]); setSaveResult(null); }}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "none", border: "none", color: "var(--oss-accent)",
          cursor: "pointer", padding: "0", marginBottom: "12px", fontSize: "0.82rem", fontWeight: 500,
        }}
      >
        <IconBack /> Back to titles
      </button>

      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "12px 14px", borderRadius: "10px",
        background: "var(--oss-bg-elevated)", marginBottom: "16px",
      }}>
        {selected.imagePath ? (
          <img src={selected.imagePath} alt="" style={{ width: "56px", height: "36px", borderRadius: "4px", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "56px", height: "36px", borderRadius: "4px",
            background: "var(--oss-bg-card)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {selected.type.toLowerCase() === "movie" ? <IconFilm /> : <IconTv />}
          </div>
        )}
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{selected.name}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--oss-text-muted)" }}>
            {selected.type === "tv show" ? `Season ${selected.season} \u00B7 ${selected.episodes} episodes` : "Movie"}
            {" \u00B7 "}
            <span style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{selected.sourcePath}</span>
          </div>
        </div>
      </div>

      {saveResult && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "12px",
          background: saveResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          color: saveResult.ok ? "#22c55e" : "#ef4444",
          fontSize: "0.82rem", fontWeight: 500,
        }}>
          {saveResult.message}
        </div>
      )}

      {/* Naming mode */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        <button style={{ ...css.btn, ...css.btnSmall, ...(namingMode === "numbered" ? css.btnPrimary : css.btnSecondary) }} onClick={applyNumbered}>
          Numbered (from {startEpNumber})
        </button>
        <button style={{ ...css.btn, ...css.btnSmall, ...(namingMode === "custom" ? css.btnPrimary : css.btnSecondary) }} onClick={applyCustom}>
          Keep Original
        </button>
      </div>

      {/* File browser */}
      <SourceBrowser onFilesSelected={handleFilesFromBrowser} />

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <label style={{ ...css.label, marginBottom: "8px" }}>{files.length} file{files.length > 1 ? "s" : ""} to add</label>
          {files.map((file, idx) => (
            <div key={idx} style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 10px", borderRadius: "8px",
              background: "var(--oss-bg-elevated)", marginBottom: "4px",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }}>
                <button onClick={() => moveFile(idx, -1)} disabled={idx === 0}
                  style={{ background: "none", border: "none", color: idx === 0 ? "var(--oss-border)" : "var(--oss-text-muted)", cursor: idx === 0 ? "default" : "pointer", padding: "1px" }}>
                  <IconArrowUp />
                </button>
                <button onClick={() => moveFile(idx, 1)} disabled={idx === files.length - 1}
                  style={{ background: "none", border: "none", color: idx === files.length - 1 ? "var(--oss-border)" : "var(--oss-text-muted)", cursor: idx === files.length - 1 ? "default" : "pointer", padding: "1px" }}>
                  <IconArrowDown />
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--oss-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                {editingIndex === idx ? (
                  <input type="text" value={file.newName} onChange={(e) => renameFile(idx, e.target.value)}
                    onBlur={() => setEditingIndex(null)} onKeyDown={(e) => { if (e.key === "Enter") setEditingIndex(null); }}
                    autoFocus style={{ ...css.input, padding: "3px 6px", fontSize: "0.78rem", marginTop: "2px" }} />
                ) : (
                  <div style={{ fontSize: "0.82rem", fontWeight: 500, cursor: "pointer", color: "var(--oss-accent)" }} onClick={() => setEditingIndex(idx)}>
                    &rarr; {file.newName}
                  </div>
                )}
              </div>
              <button onClick={() => removeFile(idx)}
                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                <IconX />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {files.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={{ ...css.btn, ...css.btnPrimary, padding: "8px 16px", fontSize: "0.82rem", opacity: saving ? 0.6 : 1 }}
            disabled={saving} onClick={handleSave}>
            {saving ? "Adding..." : (
              <><IconCheck /> Add {files.length} file{files.length > 1 ? "s" : ""}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Settings Modal ──
function SettingsModal({ show, onHide, profile, onProfileUpdate }: {
  show: boolean; onHide: () => void;
  profile: ProfileData; onProfileUpdate: (p: ProfileData) => void;
}) {
  const { profile: ctxProfile } = useProfile();
  const [activeTab, setActiveTab] = useState<"directories" | "addmedia" | "migrator" | "about">("directories");
  const [moviesDir, setMoviesDir] = useState("");
  const [tvshowsDir, setTvshowsDir] = useState("");
  const [useGlobal, setUseGlobal] = useState(true);
  const [browseTarget, setBrowseTarget] = useState<"movies" | "tvshows" | null>(null);
  const [saving, setSaving] = useState(false);
  const [moviesFocused, setMoviesFocused] = useState(false);
  const [tvFocused, setTvFocused] = useState(false);

  useEffect(() => {
    if (show) {
      const isGlobal = (profile as any).use_global_dirs !== 0;
      setUseGlobal(isGlobal);
      if (isGlobal) {
        // Load global settings
        fetch("/api/global-settings")
          .then((r) => r.json())
          .then((data) => {
            setMoviesDir(data.movies_directory ?? "");
            setTvshowsDir(data.tvshows_directory ?? "");
          })
          .catch(() => {});
      } else {
        setMoviesDir(profile.movies_directory ?? "");
        setTvshowsDir(profile.tvshows_directory ?? "");
      }
    }
  }, [show, profile]);

  const pHeaders: Record<string, string> = ctxProfile?.id
    ? { "Content-Type": "application/json", "x-profile-id": String(ctxProfile.id) }
    : { "Content-Type": "application/json" };

  const handleSave = () => {
    setSaving(true);
    if (useGlobal) {
      // Save to global settings
      Promise.all([
        fetch("/api/global-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movies_directory: moviesDir || null, tvshows_directory: tvshowsDir || null }),
        }),
        fetch("/api/profile", {
          method: "PUT",
          headers: pHeaders,
          body: JSON.stringify({ use_global_dirs: 1 }),
        }),
      ])
        .then(([, profileRes]) => profileRes.json())
        .then((data) => { onProfileUpdate(data); onHide(); window.dispatchEvent(new CustomEvent("ossflix-media-updated")); })
        .catch((err) => console.error("Failed to save settings:", err))
        .finally(() => setSaving(false));
    } else {
      // Save to profile-specific directories
      fetch("/api/profile", {
        method: "PUT",
        headers: pHeaders,
        body: JSON.stringify({
          movies_directory: moviesDir || null,
          tvshows_directory: tvshowsDir || null,
          use_global_dirs: 0,
        }),
      })
        .then((r) => r.json())
        .then((data) => { onProfileUpdate(data); onHide(); window.dispatchEvent(new CustomEvent("ossflix-media-updated")); })
        .catch((err) => console.error("Failed to save settings:", err))
        .finally(() => setSaving(false));
    }
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
        <div style={{ ...css.panel, ...css.panelLg, maxWidth: (activeTab === "migrator" || activeTab === "addmedia") ? "700px" : "640px", transition: "max-width 0.3s ease" }}>
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
            <button style={tabStyle(activeTab === "addmedia")} onClick={() => setActiveTab("addmedia")}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconAddFile /> Add Media</span>
            </button>
            <button style={tabStyle(activeTab === "migrator")} onClick={() => setActiveTab("migrator")}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconPlus /> Migrator</span>
            </button>
            <button style={tabStyle(activeTab === "about")} onClick={() => setActiveTab("about")}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><IconInfo /> About</span>
            </button>
          </div>

          <div style={css.body}>
            {activeTab === "directories" && (
              <>
                {/* Global vs per-profile toggle */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", marginBottom: "20px",
                  background: "var(--oss-bg-elevated)", borderRadius: "10px",
                  border: "1px solid var(--oss-border)",
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--oss-text)" }}>
                      Shared Media Directories
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--oss-text-muted)" }}>
                      {useGlobal ? "All profiles share these directories" : "Using directories specific to this profile"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !useGlobal;
                      setUseGlobal(next);
                      if (next) {
                        fetch("/api/global-settings").then((r) => r.json()).then((data) => {
                          setMoviesDir(data.movies_directory ?? "");
                          setTvshowsDir(data.tvshows_directory ?? "");
                        }).catch(() => {});
                      } else {
                        setMoviesDir(profile.movies_directory ?? "");
                        setTvshowsDir(profile.tvshows_directory ?? "");
                      }
                    }}
                    style={{
                      width: "44px", height: "24px", borderRadius: "12px",
                      border: "none", cursor: "pointer",
                      background: useGlobal ? "#3b82f6" : "rgba(255,255,255,0.15)",
                      position: "relative", transition: "background 0.2s ease",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: "18px", height: "18px", borderRadius: "50%",
                      background: "#fff", position: "absolute", top: "3px",
                      left: useGlobal ? "23px" : "3px",
                      transition: "left 0.2s ease",
                    }} />
                  </button>
                </div>

                {/* Movies directory */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "10px",
                      background: "rgba(59,130,246,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#3b82f6",
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

            {activeTab === "addmedia" && <AddMediaTab />}

            {activeTab === "migrator" && <MigratorTab />}

            {activeTab === "about" && (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div style={{
                  width: "64px", height: "64px", borderRadius: "16px",
                  background: "linear-gradient(135deg, #3b82f6, #60a5fa)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px", fontSize: "1.6rem", fontWeight: 800, color: "#fff",
                }}>
                  O
                </div>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.2rem", fontWeight: 700, color: "var(--oss-text)" }}>Reelscape</h3>
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
      className="oss-profile-dropdown-item"
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
  const { profile: ctxProfile, setProfile: setCtxProfile, signOut, switchProfile } = useProfile();
  const navigate = useNavigate();
  const [profile, setProfileLocal] = useState<ProfileData | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const setProfile = (p: ProfileData | null) => {
    setProfileLocal(p);
    if (p) setCtxProfile(p as any);
  };

  useEffect(() => {
    if (!ctxProfile?.id) return;
    fetch("/api/profile", { headers: { "x-profile-id": String(ctxProfile.id) } })
      .then((r) => r.json())
      .then((data) => setProfileLocal(data))
      .catch((err) => console.error("Failed to load profile:", err));
  }, [ctxProfile?.id]);

  const handleRescan = () => {
    setRescanning(true);
    setDropdownOpen(false);
    fetch("/api/media/resolve")
      .then(() => window.location.reload())
      .catch(() => setRescanning(false));
  };

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
        border: "2px solid var(--oss-border)", borderTopColor: "#3b82f6",
      }} />
    );
  }

  return (
    <>
      <div ref={dropdownRef} className="oss-profile-wrapper" style={{ position: "relative" }}>
        <button
          className="oss-profile-trigger"
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
          <span className="oss-profile-name" style={{ color: "var(--oss-text)", fontSize: "0.85rem", fontWeight: 500 }}>{profile.name}</span>
          <svg className="oss-profile-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--oss-text-muted)" strokeWidth="2.5"
            style={{ transition: "transform 0.2s ease", transform: dropdownOpen ? "rotate(180deg)" : "rotate(0)" }}>
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>

        {dropdownOpen && (
          <div className="oss-profile-dropdown">
            {/* Close button — mobile only */}
            <div className="oss-profile-dropdown-header">
              <span>Account</span>
              <button
                onClick={() => setDropdownOpen(false)}
                style={{
                  background: "none", border: "none", color: "var(--oss-text-muted)",
                  cursor: "pointer", padding: "4px", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Profile header in dropdown */}
            <div className="oss-profile-dropdown-user">
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
            <DropdownItem onClick={handleRescan} style={rescanning ? { cursor: "not-allowed", opacity: 0.6 } : {}}>
              <IconRescan spinning={rescanning} /> {rescanning ? "Scanning..." : "Rescan Library"}
            </DropdownItem>
            <div className="oss-profile-dropdown-divider" style={{ height: "1px", background: "var(--oss-border)", margin: "4px 0" }} />
            <DropdownItem onClick={() => { setDropdownOpen(false); switchProfile(); navigate("/profiles"); }}>
              <IconUser /> Switch Profile
            </DropdownItem>
            <DropdownItem onClick={() => { setDropdownOpen(false); signOut(); navigate("/"); }} style={{ color: "#ef4444" }}>
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
