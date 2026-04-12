import { Modal, ModalHeader, ModalBody, ModalTitle, ModalFooter, Spinner } from 'react-bootstrap';
import { useEffect, useState, useRef, useCallback } from "react";
import { Episode } from "./Episode";
import VideoPlayer from "./VideoPlayer";
import { useProfile } from "../context/ProfileContext";

type SubtitleTrack = {
  label: string;
  language: string;
  src: string;
  format: string;
};

interface MediaInfo {
  name: string;
  description: string;
  genre: string[];
  type: string;
  cast?: string[];
  season?: number;
  episodes?: number;
  bannerImage: string | null;
  videos: string[];
  subtitles?: SubtitleTrack[];
  dirPath: string;
}

type CardProps = {
  show: boolean;
  onHide: () => void;
  dirPath: string;
  onWatchlistChange?: (dirPath: string, inList: boolean) => void;
};

type ProgressEntry = {
  video_src: string;
  current_time: number;
  duration: number;
};

type EpisodeTiming = {
  video_src: string;
  intro_start: number | null;
  intro_end: number | null;
  outro_start: number | null;
  outro_end: number | null;
};

function secsToMmSs(secs: number | null): string {
  if (secs == null) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mmSsToSecs(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  // Support "m:ss" or just plain seconds
  if (trimmed.includes(":")) {
    const [minStr, secStr] = trimmed.split(":");
    const m = parseInt(minStr, 10) || 0;
    const s = parseInt(secStr, 10) || 0;
    return m * 60 + s;
  }
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function parseEpisodeLabel(videoSrc: string): string {
  const filename = videoSrc.split("/").pop() || videoSrc;
  const match = filename.match(/^(.*?)_s(\d+)_ep(\d+)\.[^.]+$/i);
  if (match) return `S${match[2]} E${match[3]} - ${match[1].replace(/_/g, " ")}`;
  return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
}

type TimingRowData = {
  video_src: string;
  introStart: string;
  introEnd: string;
  outroStart: string;
  outroEnd: string;
};

type BrowseResult = {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  files: { name: string; path: string }[];
};

function TimingFileBrowser({ show, onHide, onSelect, initialPath }: {
  show: boolean; onHide: () => void; onSelect: (path: string) => void;
  initialPath?: string;
}) {
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browseTo = (path: string) => {
    setLoading(true); setError(null);
    fetch(`/api/browse?path=${encodeURIComponent(path)}&mode=toml`)
      .then((r) => r.json())
      .then((data) => data.error ? setError(data.error) : setBrowseData(data))
      .catch(() => setError("Failed to browse"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (show) browseTo(initialPath || "/"); }, [show]);

  const itemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 14px", border: "none", borderRadius: "8px",
    background: "transparent", color: "var(--oss-text)",
    cursor: "pointer", fontSize: "0.85rem", textAlign: "left",
    transition: "background 0.15s ease", width: "100%",
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <ModalHeader closeButton>
        <ModalTitle style={{ fontSize: "1.1rem" }}>Select timing.toml</ModalTitle>
      </ModalHeader>
      <ModalBody>
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
            <Spinner animation="border" size="sm" />
          </div>
        )}
        {!loading && browseData && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "400px", overflowY: "auto" }}>
            {browseData.parent && (
              <button
                style={itemStyle}
                onClick={() => browseTo(browseData.parent!)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M12 8a.5.5 0 0 1-.5.5H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5a.5.5 0 0 1 .5.5"/></svg>
                <span style={{ color: "var(--oss-accent)" }}>..</span>
              </button>
            )}
            {browseData.directories.map((dir) => (
              <button
                key={dir.path}
                style={itemStyle}
                onClick={() => browseTo(dir.path)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ color: "#f59e0b", flexShrink: 0 }}><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5z"/></svg>
                <span style={{ flex: 1, textAlign: "left" }}>{dir.name}</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.3 }}><path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"/></svg>
              </button>
            ))}
            {browseData.files.map((file) => (
              <button
                key={file.path}
                style={{ ...itemStyle, color: "var(--oss-accent)" }}
                onClick={() => { onSelect(file.path); onHide(); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}><path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.414A2 2 0 0 0 13.414 3L11 .586A2 2 0 0 0 9.586 0zm5.586 1H10v3a1 1 0 0 0 1 1h3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/></svg>
                <span style={{ flex: 1, textAlign: "left" }}>{file.name}</span>
              </button>
            ))}
            {browseData.directories.length === 0 && browseData.files.length === 0 && (
              <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "1.5rem" }}>
                No .toml files found
              </p>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <button className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onHide}>Cancel</button>
      </ModalFooter>
    </Modal>
  );
}

function TimingsModal({ show, videos, timingsMap, onSaveAll, onClearAll, onClose, dirPath, onTimingsRefresh }: {
  show: boolean;
  videos: string[];
  timingsMap: Record<string, EpisodeTiming>;
  onSaveAll: (timings: EpisodeTiming[]) => void;
  onClearAll: () => void;
  onClose: () => void;
  dirPath?: string;
  onTimingsRefresh?: () => void;
}) {
  const [rows, setRows] = useState<TimingRowData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectProgress, setAutoDetectProgress] = useState("");

  // Re-init rows when modal opens
  useEffect(() => {
    if (show) {
      setRows(videos.map((v) => {
        const t = timingsMap[v];
        return {
          video_src: v,
          introStart: secsToMmSs(t?.intro_start ?? null),
          introEnd: secsToMmSs(t?.intro_end ?? null),
          outroStart: secsToMmSs(t?.outro_start ?? null),
          outroEnd: secsToMmSs(t?.outro_end ?? null),
        };
      }));
      setSaved(false);
      setSaving(false);
    }
  }, [show, videos, timingsMap]);

  const updateRow = (idx: number, field: keyof TimingRowData, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setSaved(false);
  };

  const handleSave = () => {
    setSaving(true);
    const timings: EpisodeTiming[] = rows.map((r) => ({
      video_src: r.video_src,
      intro_start: mmSsToSecs(r.introStart),
      intro_end: mmSsToSecs(r.introEnd),
      outro_start: mmSsToSecs(r.outroStart),
      outro_end: mmSsToSecs(r.outroEnd),
    }));
    onSaveAll(timings);
    setTimeout(() => { setSaving(false); setSaved(true); }, 400);
  };

  const handleClearAll = () => {
    setRows((prev) => prev.map((r) => ({
      ...r, introStart: "", introEnd: "", outroStart: "", outroEnd: "",
    })));
    onClearAll();
    setSaved(false);
  };

  const handleImport = () => {
    setShowFileBrowser(true);
  };

  const handleAutoDetect = async () => {
    if (!dirPath) return;
    setAutoDetecting(true);
    setAutoDetectProgress("Starting detection...");
    try {
      const res = await fetch("/api/detect/intros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath }),
      });
      const data = await res.json();
      if (data.error) { setAutoDetectProgress(data.error); setAutoDetecting(false); return; }
      const jobId = data.jobId;

      // Poll for status
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/detect/status?jobId=${jobId}`);
          const job = await statusRes.json();
          if (job.progress) setAutoDetectProgress(job.progress);
          if (job.status === "completed") {
            clearInterval(poll);
            setAutoDetecting(false);
            setAutoDetectProgress("");
            onTimingsRefresh?.();
          } else if (job.status === "failed") {
            clearInterval(poll);
            setAutoDetecting(false);
            setAutoDetectProgress(job.error || "Detection failed");
          }
        } catch {
          clearInterval(poll);
          setAutoDetecting(false);
        }
      }, 2000);
    } catch {
      setAutoDetecting(false);
      setAutoDetectProgress("Failed to start detection");
    }
  };

  const handleFileSelected = async (filePath: string) => {
    setImporting(true);
    try {
      const res = await fetch("/api/episode/timings/parse-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
      if (!res.ok) throw new Error("Parse failed");
      const parsed: Record<string, { intro_start: number | null; intro_end: number | null; outro_start: number | null; outro_end: number | null }> = await res.json();
      setRows((prev) => prev.map((r) => {
        const filename = r.video_src.split("/").pop() || "";
        const epMatch = filename.match(/_s(\d+)_ep(\d+)\./i);
        if (!epMatch) return r;
        const key = `s${epMatch[1].replace(/^0+/, "") || "0"}e${epMatch[2].replace(/^0+/, "") || "0"}`;
        const timing = parsed[key.toLowerCase()]
          || parsed[`s${epMatch[1]}e${epMatch[2]}`.toLowerCase()]
          || parsed[`s${String(Number(epMatch[1])).padStart(2, "0")}e${String(Number(epMatch[2])).padStart(2, "0")}`.toLowerCase()];
        if (!timing) return r;
        return {
          ...r,
          introStart: secsToMmSs(timing.intro_start),
          introEnd: secsToMmSs(timing.intro_end),
          outroStart: secsToMmSs(timing.outro_start),
          outroEnd: secsToMmSs(timing.outro_end),
        };
      }));
      setSaved(false);
    } catch {
      alert("Failed to parse timing file. Make sure it is a valid timing.toml.");
    } finally {
      setImporting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 8px", borderRadius: "6px", textAlign: "center",
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
    color: "#fff", fontSize: "0.85rem", outline: "none",
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" centered dialogClassName="oss-timings-modal">
      <ModalHeader closeButton>
        <ModalTitle style={{ fontSize: "1.1rem" }}>
          Episode Timings
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginLeft: "10px", fontWeight: 400 }}>
            format: m:ss
          </span>
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", marginBottom: "16px" }}>
          Set intro and outro timestamps for skip buttons during playback. Use m:ss format (e.g. 1:30 for 1 minute 30 seconds).
        </p>

        {/* Scrollable grid wrapper for mobile */}
        <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: "600px" }}>
        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: "10px",
          padding: "0 0 8px", fontSize: "0.72rem", fontWeight: 600,
          color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div>Episode</div>
          <div style={{ textAlign: "center" }}>Intro Start</div>
          <div style={{ textAlign: "center" }}>Intro End</div>
          <div style={{ textAlign: "center" }}>Outro Start</div>
          <div style={{ textAlign: "center" }}>Outro End</div>
        </div>

        {/* Episode rows */}
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {rows.map((r, idx) => (
            <div key={r.video_src} style={{
              display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: "10px",
              alignItems: "center", padding: "10px 0",
              borderBottom: idx < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <div style={{
                fontSize: "0.82rem", color: "#fff", fontWeight: 500,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }} title={parseEpisodeLabel(r.video_src)}>
                {parseEpisodeLabel(r.video_src)}
              </div>
              <input
                style={inputStyle}
                type="text"
                placeholder="0:00"
                value={r.introStart}
                onChange={(e) => updateRow(idx, "introStart", e.target.value)}
              />
              <input
                style={inputStyle}
                type="text"
                placeholder="0:00"
                value={r.introEnd}
                onChange={(e) => updateRow(idx, "introEnd", e.target.value)}
              />
              <input
                style={inputStyle}
                type="text"
                placeholder="0:00"
                value={r.outroStart}
                onChange={(e) => updateRow(idx, "outroStart", e.target.value)}
              />
              <input
                style={inputStyle}
                type="text"
                placeholder="0:00"
                value={r.outroEnd}
                onChange={(e) => updateRow(idx, "outroEnd", e.target.value)}
              />
            </div>
          ))}
        </div>
        </div>
        </div>
      </ModalBody>
      <ModalFooter style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button className="oss-btn oss-btn-info-soft oss-btn-sm" onClick={handleImport} disabled={importing}>
            {importing ? "Importing..." : "Import timing.toml"}
          </button>
          {dirPath && (
            <button className="oss-btn oss-btn-info-soft oss-btn-sm" onClick={handleAutoDetect} disabled={autoDetecting}
              title="Auto-detect intro/outro using audio fingerprinting (requires fpcalc)"
            >
              {autoDetecting ? autoDetectProgress || "Detecting..." : "Auto-detect"}
            </button>
          )}
          <button className="oss-btn oss-btn-danger-soft oss-btn-sm" onClick={handleClearAll}>
            Clear All
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {saved && (
            <span style={{ color: "#22c55e", fontSize: "0.82rem", fontWeight: 600 }}>
              &#10003; Saved
            </span>
          )}
          <button className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onClose}>Cancel</button>
          <button className="oss-btn oss-btn-primary oss-btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      </ModalFooter>
      <TimingFileBrowser
        show={showFileBrowser}
        onHide={() => setShowFileBrowser(false)}
        onSelect={handleFileSelected}
        initialPath="/"
      />
    </Modal>
  );
}

function parseSeasonNumber(videoSrc: string): number | null {
  const filename = videoSrc.split("/").pop() || videoSrc;
  const match = filename.match(/_s(\d+)_ep\d+\.[^.]+$/i);
  return match ? parseInt(match[1], 10) : null;
}

function groupVideosBySeason(videos: string[]): Map<number, string[]> {
  const seasons = new Map<number, string[]>();
  for (const v of videos) {
    const season = parseSeasonNumber(v);
    if (season != null) {
      if (!seasons.has(season)) seasons.set(season, []);
      seasons.get(season)!.push(v);
    }
  }
  return new Map([...seasons.entries()].sort((a, b) => a[0] - b[0]));
}

export function Card({ show, onHide, dirPath, onWatchlistChange }: CardProps) {
  const { profile } = useProfile();
  const pid = profile?.id;
  const [information, setInformation] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerInitialTime, setPlayerInitialTime] = useState(0);
  const [restartMode, setRestartMode] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressEntry>>({});
  const [timingsMap, setTimingsMap] = useState<Record<string, EpisodeTiming>>({});
  const [showTimingsModal, setShowTimingsModal] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  // Feature 2: Sleep detection
  const [sleepInfo, setSleepInfo] = useState<{ fellAsleep: boolean; resumeEpisode?: string; consecutiveCount?: number } | null>(null);
  const [sleepDismissed, setSleepDismissed] = useState(false);
  // Feature 3: TMDB
  const [showTmdbModal, setShowTmdbModal] = useState(false);
  const [tmdbApiKey, setTmdbApiKey] = useState<string | null>(null);
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [tmdbApplying, setTmdbApplying] = useState(false);
  // Feature 4: Auto-detect
  const [detectJobId, setDetectJobId] = useState<number | null>(null);
  const [detectProgress, setDetectProgress] = useState<string>("");
  const [detecting, setDetecting] = useState(false);

  // Focus trap for modal (D2)
  const previousFocusRef = useRef<Element | null>(null);
  useEffect(() => {
    if (show && !playerSrc) {
      previousFocusRef.current = document.activeElement;
    }
    if (!show && previousFocusRef.current && previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [show, playerSrc]);

  const fetchProgress = () => {
    if (!dirPath) return;
    fetch(`/api/playback/progress?dir=${encodeURIComponent(dirPath)}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((entries: ProgressEntry[]) => {
        const map: Record<string, ProgressEntry> = {};
        for (const e of entries) map[e.video_src] = e;
        setProgressMap(map);
      })
      .catch(() => {});
  };

  const fetchTimings = () => {
    if (!dirPath) return;
    fetch(`/api/episode/timings/batch?dir=${encodeURIComponent(dirPath)}`)
      .then((res) => res.json())
      .then((rows: EpisodeTiming[]) => {
        const map: Record<string, EpisodeTiming> = {};
        for (const r of rows) map[r.video_src] = r;
        setTimingsMap(map);
      })
      .catch(() => {});
  };

  const saveAllTimings = (timings: EpisodeTiming[]) => {
    Promise.all(
      timings.map((t) =>
        fetch("/api/episode/timings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        })
      )
    ).then(() => {
      const map: Record<string, EpisodeTiming> = {};
      for (const t of timings) map[t.video_src] = t;
      setTimingsMap(map);
    }).catch(() => {});
  };

  const clearAllTimings = () => {
    if (!dirPath) return;
    fetch(`/api/episode/timings/batch?dir=${encodeURIComponent(dirPath)}`, { method: "DELETE" })
      .then(() => setTimingsMap({}))
      .catch(() => {});
  };

  const fetchWatchlistStatus = () => {
    if (!dirPath) return;
    fetch(`/api/watchlist/check?dir=${encodeURIComponent(dirPath)}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { inList: boolean }) => setInWatchlist(data.inList))
      .catch(() => {});
  };

  const toggleWatchlist = () => {
    const method = inWatchlist ? "DELETE" : "POST";
    fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ dir_path: dirPath }),
    })
      .then(() => {
        const newState = !inWatchlist;
        setInWatchlist(newState);
        if (onWatchlistChange) onWatchlistChange(dirPath, newState);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (show && dirPath) {
      setLoading(true);
      setInformation(null);
      setSelectedSeason(null);
      fetch(`/api/media/info?dir=${encodeURIComponent(dirPath)}`)
        .then((res) => res.json())
        .then((data: MediaInfo) => {
          setInformation(data);
          const seasons = groupVideosBySeason(data.videos || []);
          if (seasons.size > 0) {
            setSelectedSeason([...seasons.keys()][0]);
          }
        })
        .finally(() => setLoading(false));
      fetchProgress();
      fetchTimings();
      fetchWatchlistStatus();
      setSleepDismissed(false);
      setSleepInfo(null);
      // Check sleep pattern
      fetch(`/api/playback/sleep-detect?dir=${encodeURIComponent(dirPath)}`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => setSleepInfo(data))
        .catch(() => {});
      // Check TMDB key availability
      fetch("/api/global-settings")
        .then((r) => r.json())
        .then((data) => setTmdbApiKey(data.tmdb_api_key || null))
        .catch(() => {});
    }
  }, [show, dirPath]);

  const handlePlay = (videoSrc?: string, fromBeginning = false) => {
    const src = videoSrc || information?.videos?.[0];
    if (!src) return;
    if (fromBeginning) {
      setPlayerInitialTime(0);
      setRestartMode(true);
    } else {
      const saved = progressMap[src];
      setPlayerInitialTime(saved?.current_time || 0);
      setRestartMode(false);
    }
    setPlayerSrc(src);
  };

  const handleResume = () => {
    // Find in-progress entries (not completed) sorted by video order in the title
    const videos = information?.videos || [];
    const inProgress = Object.values(progressMap).filter(
      (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 5)
    );
    if (inProgress.length > 0) {
      // Pick the latest one by position in the video list (most recent episode)
      const sorted = inProgress.sort((a, b) => {
        const idxA = videos.indexOf(a.video_src);
        const idxB = videos.indexOf(b.video_src);
        return idxB - idxA;
      });
      const latest = sorted[0];
      setPlayerInitialTime(latest.current_time);
      setPlayerSrc(latest.video_src);
    } else {
      // All episodes completed — find the next unwatched episode after the last completed one
      const completedSrcs = Object.values(progressMap)
        .filter((e) => e.duration > 0 && e.current_time >= e.duration - 5)
        .map((e) => e.video_src);
      if (completedSrcs.length > 0 && videos.length > 0) {
        let lastCompletedIdx = -1;
        for (const src of completedSrcs) {
          const idx = videos.indexOf(src);
          if (idx > lastCompletedIdx) lastCompletedIdx = idx;
        }
        // Play next episode if available, otherwise restart from beginning
        if (lastCompletedIdx < videos.length - 1) {
          setPlayerInitialTime(0);
          setPlayerSrc(videos[lastCompletedIdx + 1]);
          return;
        }
      }
      handlePlay();
    }
  };

  const hasResumable = Object.values(progressMap).some(
    (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 5)
  ) || (() => {
    // Also show resume if there are completed episodes and a next episode to play
    const videos = information?.videos || [];
    const completedSrcs = Object.values(progressMap)
      .filter((e) => e.duration > 0 && e.current_time >= e.duration - 5)
      .map((e) => e.video_src);
    if (completedSrcs.length > 0 && videos.length > 1) {
      let lastCompletedIdx = -1;
      for (const src of completedSrcs) {
        const idx = videos.indexOf(src);
        if (idx > lastCompletedIdx) lastCompletedIdx = idx;
      }
      return lastCompletedIdx < videos.length - 1;
    }
    return false;
  })();

  return (
    <>
      <Modal show={show && !playerSrc && !showTimingsModal} onHide={onHide} size="lg" centered>
        {loading && (
          <ModalBody className="text-center py-5">
            <Spinner animation="border" />
          </ModalBody>
        )}
        {!loading && information && (
          <>
            <ModalHeader closeButton>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                <ModalTitle>{information.name}</ModalTitle>
                <button
                  onClick={toggleWatchlist}
                  title={inWatchlist ? "Remove from My List" : "Add to My List"}
                  aria-label={inWatchlist ? "Remove from My List" : "Add to My List"}
                  style={{
                    background: inWatchlist ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.08)",
                    border: inWatchlist ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.12)",
                    color: inWatchlist ? "#60a5fa" : "var(--oss-text-muted)",
                    padding: "4px 12px", borderRadius: "4px", fontSize: "0.75rem",
                    fontWeight: 600, cursor: "pointer", transition: "all 0.2s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {inWatchlist ? "\u2713 In My List" : "+ My List"}
                </button>
              </div>
            </ModalHeader>
            <ModalBody>
              {information.bannerImage && (
                <div className="oss-modal-banner" style={{ position: "relative", marginBottom: "1rem", borderRadius: "var(--oss-radius)", overflow: "hidden" }}>
                  <img
                    src={information.bannerImage}
                    alt={information.name}
                    style={{ width: "100%", height: "300px", objectFit: "cover", display: "block" }}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(transparent 50%, var(--oss-bg-card))",
                  }} />
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                <span style={{
                  background: "var(--oss-accent)", color: "#fff",
                  padding: "3px 10px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600,
                  textTransform: "uppercase",
                }}>
                  {information.type}
                </span>
                {information.genre?.map((g) => (
                  <span key={g} style={{
                    background: "rgba(255,255,255,0.08)", color: "var(--oss-text-muted)",
                    padding: "3px 10px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 500,
                  }}>
                    {g}
                  </span>
                ))}
              </div>

              <p style={{ color: "var(--oss-text-muted)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem" }}>
                {information.description}
              </p>

              {information.cast && information.cast.filter(c => c).length > 0 && (
                <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Cast: </span>
                  {information.cast.filter(c => c).join(", ")}
                </p>
              )}

              {/* Sleep detection banner */}
              {sleepInfo?.fellAsleep && !sleepDismissed && (
                <div style={{
                  padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem",
                  background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                  display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#fbbf24", fontWeight: 600 }}>
                      It looks like you fell asleep during {parseEpisodeLabel(sleepInfo.resumeEpisode || "")}.
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "rgba(251,191,36,0.7)" }}>
                      {sleepInfo.consecutiveCount} episodes auto-played after.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="oss-btn oss-btn-primary oss-btn-sm"
                      onClick={() => { if (sleepInfo.resumeEpisode) handlePlay(sleepInfo.resumeEpisode, false); }}
                    >
                      Resume from there
                    </button>
                    <button
                      className="oss-btn oss-btn-secondary oss-btn-sm"
                      onClick={() => setSleepDismissed(true)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const seasonMap = groupVideosBySeason(information.videos || []);
                const seasonKeys = [...seasonMap.keys()];
                const hasSeasons = seasonKeys.length > 0;

                if (hasSeasons && seasonKeys.length > 1) {
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
                      <select
                        value={selectedSeason ?? ""}
                        onChange={(e) => setSelectedSeason(parseInt(e.target.value, 10))}
                        style={{
                          background: "var(--oss-bg-elevated)",
                          color: "var(--oss-text)",
                          border: "1px solid var(--oss-border)",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        {seasonKeys.map((s) => (
                          <option key={s} value={s}>Season {s}</option>
                        ))}
                      </select>
                      <span style={{ color: "var(--oss-text-muted)", fontSize: "0.82rem" }}>
                        {selectedSeason != null && seasonMap.get(selectedSeason)
                          ? `${seasonMap.get(selectedSeason)!.length} episode${seasonMap.get(selectedSeason)!.length !== 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </div>
                  );
                } else if (hasSeasons) {
                  return (
                    <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                      <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Season {seasonKeys[0]}</span>
                      {" · "}
                      {seasonMap.get(seasonKeys[0])!.length} episode{seasonMap.get(seasonKeys[0])!.length !== 1 ? "s" : ""}
                    </p>
                  );
                } else if (information.season != null) {
                  return (
                    <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                      <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Season {information.season}</span>
                      {" · "}
                      {information.videos.length} episode{information.videos.length !== 1 ? "s" : ""}
                    </p>
                  );
                }
                return null;
              })()}

              {information.videos?.length > 0 && (() => {
                const seasonMap = groupVideosBySeason(information.videos);
                const hasSeasons = seasonMap.size > 0;
                const displayVideos = hasSeasons && selectedSeason != null
                  ? (seasonMap.get(selectedSeason) || [])
                  : information.videos;

                return (
                <div style={{ borderTop: "1px solid var(--oss-border)", paddingTop: "12px", marginTop: "8px" }}>
                  {displayVideos.map((v) => {
                    const prog = progressMap[v];
                    const pct = prog && prog.duration > 0 ? (prog.current_time / prog.duration) * 100 : 0;
                    const isInProgress = prog && prog.current_time > 0 && (prog.duration === 0 || prog.current_time < prog.duration - 5);
                    const isCompleted = prog && prog.duration > 0 && prog.current_time >= prog.duration - 5;

                    const formatTime = (secs: number) => {
                      const m = Math.floor(secs / 60);
                      const s = Math.floor(secs % 60);
                      return `${m}:${s.toString().padStart(2, "0")}`;
                    };

                    return (
                      <div key={v} style={{
                        borderRadius: "var(--oss-radius)", overflow: "hidden",
                        marginBottom: "4px",
                        border: isInProgress ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                        background: isInProgress ? "rgba(59,130,246,0.05)" : "transparent",
                        transition: "all 0.2s ease",
                      }}>
                        <div style={{ position: "relative" }}>
                          <Episode
                            filename={v.split("/").pop()!}
                            thumbnail={information.bannerImage}
                            onClick={() => handlePlay(v, !!isCompleted)}
                          />
                          {/* Status badges & actions */}
                          <div className="oss-episode-status" style={{
                            position: "absolute", top: "50%", right: "40px",
                            transform: "translateY(-50%)",
                            display: "flex", alignItems: "center", gap: "6px",
                          }}>
                            {isInProgress && (
                              <span style={{
                                fontSize: "0.7rem", fontWeight: 600,
                                color: "var(--oss-accent)",
                                background: "rgba(59,130,246,0.15)",
                                padding: "2px 8px", borderRadius: "4px",
                              }}>
                                {formatTime(prog!.current_time)} / {formatTime(prog!.duration)}
                              </span>
                            )}
                            {isCompleted && (
                              <span style={{
                                fontSize: "0.7rem", fontWeight: 600,
                                color: "#22c55e",
                                background: "rgba(34,197,94,0.15)",
                                padding: "2px 8px", borderRadius: "4px",
                              }}>
                                &#10003; Watched
                              </span>
                            )}
                            {isInProgress && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePlay(v, true); }}
                                style={{
                                  fontSize: "0.7rem", fontWeight: 600,
                                  color: "var(--oss-text-muted)",
                                  background: "rgba(255,255,255,0.08)",
                                  padding: "2px 8px", borderRadius: "4px",
                                  border: "none", cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--oss-text-muted)"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                                title="Play from beginning"
                              >
                                &#8634; Restart
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Progress bar */}
                        {pct > 0 && (
                          <div style={{
                            height: "4px", background: "rgba(255,255,255,0.08)",
                            borderRadius: "0 0 4px 4px", overflow: "hidden",
                            margin: "0 12px 8px",
                          }}>
                            <div style={{
                              height: "100%",
                              width: `${Math.min(pct, 100)}%`,
                              background: isCompleted ? "#22c55e" : "var(--oss-accent)",
                              borderRadius: "2px",
                              transition: "width 0.3s ease",
                            }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </ModalBody>
            <ModalFooter>
              <button className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onHide}>Close</button>
              {tmdbApiKey && (
                <button
                  className="oss-btn oss-btn-success-soft oss-btn-sm"
                  onClick={() => { setTmdbQuery(information.name); setShowTmdbModal(true); }}
                >
                  Fetch from TMDB
                </button>
              )}
              {information.videos?.length > 1 && (
                <button
                  className="oss-btn oss-btn-info-soft oss-btn-sm"
                  onClick={() => setShowTimingsModal(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ verticalAlign: "-2px", marginRight: "4px" }}><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.902 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291a1.873 1.873 0 0 0-1.116-2.693l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094a1.873 1.873 0 0 0 1.115-2.693l-.16-.291c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116z"/></svg>Timings
                </button>
              )}
              {information.videos?.length > 0 && (
                <>
                  {hasResumable && (
                    <button className="oss-btn oss-btn-success oss-btn-sm" onClick={handleResume}>
                      &#9654; Resume
                    </button>
                  )}
                  <button className="oss-btn oss-btn-primary oss-btn-sm" onClick={() => handlePlay()}>
                    &#9654; Play
                  </button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>

      {information?.videos && (
        <TimingsModal
          show={showTimingsModal}
          videos={information.videos}
          timingsMap={timingsMap}
          onSaveAll={saveAllTimings}
          onClearAll={clearAllTimings}
          onClose={() => setShowTimingsModal(false)}
          dirPath={dirPath}
          onTimingsRefresh={fetchTimings}
        />
      )}

      <VideoPlayer
        show={!!playerSrc}
        onHide={() => { setPlayerSrc(null); setRestartMode(false); fetchProgress(); }}
        src={playerSrc || ""}
        title={information?.name || ""}
        dirPath={dirPath}
        initialTime={playerInitialTime}
        timings={playerSrc ? timingsMap[playerSrc] : undefined}
        subtitles={information?.subtitles}
        nextSrc={(() => {
          if (!information?.videos || !playerSrc) return undefined;
          const idx = information.videos.indexOf(playerSrc);
          return (idx >= 0 && idx < information.videos.length - 1) ? information.videos[idx + 1] : undefined;
        })()}
        onNext={() => {
          if (!information?.videos || !playerSrc) return;
          const currentIndex = information.videos.indexOf(playerSrc);
          if (currentIndex >= 0 && currentIndex < information.videos.length - 1) {
            const nextSrc = information.videos[currentIndex + 1];
            if (restartMode) {
              setPlayerInitialTime(0);
            } else {
              const saved = progressMap[nextSrc];
              setPlayerInitialTime(saved?.current_time || 0);
            }
            setPlayerSrc(nextSrc);
          } else {
            setPlayerSrc(null);
            fetchProgress();
          }
        }}
        hasNext={!!(information?.videos && playerSrc && information.videos.indexOf(playerSrc) < information.videos.length - 1)}
        onPrev={() => {
          if (!information?.videos || !playerSrc) return;
          const currentIndex = information.videos.indexOf(playerSrc);
          if (currentIndex > 0) {
            const prevSrc = information.videos[currentIndex - 1];
            if (restartMode) {
              setPlayerInitialTime(0);
            } else {
              const saved = progressMap[prevSrc];
              setPlayerInitialTime(saved?.current_time || 0);
            }
            setPlayerSrc(prevSrc);
          }
        }}
        hasPrev={!!(information?.videos && playerSrc && information.videos.indexOf(playerSrc) > 0)}
        profileId={pid}
      />

      {/* TMDB Search Modal */}
      <Modal show={showTmdbModal} onHide={() => setShowTmdbModal(false)} size="lg" centered>
        <ModalHeader closeButton>
          <ModalTitle style={{ fontSize: "1.1rem" }}>Fetch from TMDB</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input
              type="text"
              value={tmdbQuery}
              onChange={(e) => setTmdbQuery(e.target.value)}
              placeholder="Search TMDB..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setTmdbSearching(true);
                  const type = information?.type?.toLowerCase().includes("movie") ? "movie" : "tv";
                  fetch(`/api/tmdb/search?q=${encodeURIComponent(tmdbQuery)}&type=${type}`)
                    .then((r) => r.json())
                    .then((data) => {
                      if (Array.isArray(data)) setTmdbResults(data);
                      else setTmdbResults([]);
                    })
                    .catch(() => setTmdbResults([]))
                    .finally(() => setTmdbSearching(false));
                }
              }}
              style={{
                flex: 1, padding: "8px 14px", borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
                color: "#fff", fontSize: "0.85rem", outline: "none",
              }}
            />
            <button
              className="oss-btn oss-btn-primary oss-btn-sm"
              disabled={tmdbSearching || !tmdbQuery.trim()}
              onClick={() => {
                setTmdbSearching(true);
                const type = information?.type?.toLowerCase().includes("movie") ? "movie" : "tv";
                fetch(`/api/tmdb/search?q=${encodeURIComponent(tmdbQuery)}&type=${type}`)
                  .then((r) => r.json())
                  .then((data) => {
                    if (Array.isArray(data)) setTmdbResults(data);
                    else setTmdbResults([]);
                  })
                  .catch(() => setTmdbResults([]))
                  .finally(() => setTmdbSearching(false));
              }}
            >
              {tmdbSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {tmdbApplying && (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <Spinner animation="border" size="sm" />
              <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginTop: "8px" }}>Applying metadata...</p>
            </div>
          )}

          {!tmdbApplying && tmdbResults.length > 0 && (
            <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {tmdbResults.slice(0, 10).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setTmdbApplying(true);
                    const mediaType = (r.media_type === "tv" || r.name) ? "tv" : "movie";
                    fetch("/api/tmdb/apply", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ dirPath, tmdbId: r.id, mediaType }),
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        if (data.ok) {
                          setShowTmdbModal(false);
                          setTmdbResults([]);
                          // Refetch media info
                          fetch(`/api/media/info?dir=${encodeURIComponent(dirPath)}`)
                            .then((res) => res.json())
                            .then((info) => setInformation(info))
                            .catch(() => {});
                          window.dispatchEvent(new CustomEvent("ossflix-media-updated"));
                        }
                      })
                      .catch(() => {})
                      .finally(() => setTmdbApplying(false));
                  }}
                  style={{
                    display: "flex", gap: "12px", padding: "10px", borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.08)", background: "transparent",
                    color: "var(--oss-text)", cursor: "pointer", textAlign: "left",
                    transition: "background 0.15s ease", width: "100%",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {r.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                      alt=""
                      style={{ width: "60px", height: "90px", borderRadius: "4px", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: "60px", height: "90px", borderRadius: "4px", background: "var(--oss-bg-elevated)", flexShrink: 0 }} />
                  )}
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                      {r.title || r.name}
                    </p>
                    <p style={{ margin: "2px 0", fontSize: "0.78rem", color: "var(--oss-text-muted)" }}>
                      {r.release_date || r.first_air_date || ""}
                    </p>
                    <p style={{
                      margin: 0, fontSize: "0.78rem", color: "var(--oss-text-muted)",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
                      overflow: "hidden",
                    }}>
                      {r.overview}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!tmdbApplying && !tmdbSearching && tmdbResults.length === 0 && tmdbQuery.trim() && (
            <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "1rem" }}>
              Press Enter or click Search to find results.
            </p>
          )}
        </ModalBody>
      </Modal>
    </>
  );
}

export default Card;
