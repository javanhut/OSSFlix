import { Modal, ModalHeader, ModalBody, ModalTitle, ModalFooter, Spinner } from "react-bootstrap";
import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Episode } from "./Episode";
import VideoPlayer from "./VideoPlayer";
import { useProfile } from "../context/ProfileContext";
import {
  parseEpisodePath,
  formatEpisodeLabel,
  inferEpisodeVariants,
  type AudioVariant,
} from "../scripts/episodeNaming";

type AudioSelection = AudioVariant | "both";
import type { SeasonMeta } from "../scripts/tomlreader";

type SubtitleTrack = {
  label: string;
  language: string;
  src: string;
  format: string;
};

interface MediaInfo {
  name: string;
  originalName?: string;
  altName?: string | null;
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
  seasonsMeta?: SeasonMeta[];
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
  return Number.isNaN(n) ? null : n;
}

function parseEpisodeLabel(videoSrc: string): string {
  const filename = videoSrc.split("/").pop() || videoSrc;
  const parsed = parseEpisodePath(filename);
  if (parsed) return formatEpisodeLabel(parsed);
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

function TimingFileBrowser({
  show,
  onHide,
  onSelect,
  initialPath,
}: {
  show: boolean;
  onHide: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}) {
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browseTo = (path: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/browse?path=${encodeURIComponent(path)}&mode=toml`)
      .then((r) => r.json())
      .then((data) => (data.error ? setError(data.error) : setBrowseData(data)))
      .catch(() => setError("Failed to browse"))
      .finally(() => setLoading(false));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: browseTo is stable within component lifetime
  useEffect(() => {
    if (show) browseTo(initialPath || "/");
  }, [show, initialPath]);

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    border: "none",
    borderRadius: "8px",
    background: "transparent",
    color: "var(--oss-text)",
    cursor: "pointer",
    fontSize: "0.85rem",
    textAlign: "left",
    transition: "background 0.15s ease",
    width: "100%",
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <ModalHeader closeButton>
        <ModalTitle style={{ fontSize: "1.1rem" }}>Select timing.toml</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {browseData && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              marginBottom: "12px",
              background: "var(--oss-bg-elevated)",
              fontSize: "0.82rem",
              color: "var(--oss-text-muted)",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
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
                type="button"
                style={itemStyle}
                onClick={() => browseTo(browseData.parent!)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12 8a.5.5 0 0 1-.5.5H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5a.5.5 0 0 1 .5.5"
                  />
                </svg>
                <span style={{ color: "var(--oss-accent)" }}>..</span>
              </button>
            )}
            {browseData.directories.map((dir) => (
              <button
                type="button"
                key={dir.path}
                style={itemStyle}
                onClick={() => browseTo(dir.path)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  style={{ color: "#f59e0b", flexShrink: 0 }}
                >
                  <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5z" />
                </svg>
                <span style={{ flex: 1, textAlign: "left" }}>{dir.name}</span>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  style={{ opacity: 0.3 }}
                >
                  <path
                    fillRule="evenodd"
                    d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"
                  />
                </svg>
              </button>
            ))}
            {browseData.files.map((file) => (
              <button
                type="button"
                key={file.path}
                style={{ ...itemStyle, color: "var(--oss-accent)" }}
                onClick={() => {
                  onSelect(file.path);
                  onHide();
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(59,130,246,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.414A2 2 0 0 0 13.414 3L11 .586A2 2 0 0 0 9.586 0zm5.586 1H10v3a1 1 0 0 0 1 1h3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                </svg>
                <span style={{ flex: 1, textAlign: "left" }}>{file.name}</span>
              </button>
            ))}
            {browseData.directories.length === 0 && browseData.files.length === 0 && (
              <p
                style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "1.5rem" }}
              >
                No .toml files found
              </p>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onHide}>
          Cancel
        </button>
      </ModalFooter>
    </Modal>
  );
}

function TimingsModal({
  show,
  videos,
  timingsMap,
  onSaveAll,
  onClearAll,
  onClose,
  dirPath,
  onTimingsRefresh,
}: {
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
      setRows(
        videos.map((v) => {
          const t = timingsMap[v];
          return {
            video_src: v,
            introStart: secsToMmSs(t?.intro_start ?? null),
            introEnd: secsToMmSs(t?.intro_end ?? null),
            outroStart: secsToMmSs(t?.outro_start ?? null),
            outroEnd: secsToMmSs(t?.outro_end ?? null),
          };
        }),
      );
      setSaved(false);
      setSaving(false);
    }
  }, [show, videos, timingsMap]);

  const updateRow = (idx: number, field: keyof TimingRowData, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
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
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 400);
  };

  const handleClearAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        introStart: "",
        introEnd: "",
        outroStart: "",
        outroEnd: "",
      })),
    );
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
      if (data.error) {
        setAutoDetectProgress(data.error);
        setAutoDetecting(false);
        return;
      }
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
      const parsed: Record<
        string,
        { intro_start: number | null; intro_end: number | null; outro_start: number | null; outro_end: number | null }
      > = await res.json();
      setRows((prev) =>
        prev.map((r) => {
          const filename = r.video_src.split("/").pop() || "";
          const epMatch = filename.match(/_s(\d+)_ep(\d+)(?:_(?:sub|dub))?\./i);
          if (!epMatch) return r;
          const key = `s${epMatch[1].replace(/^0+/, "") || "0"}e${epMatch[2].replace(/^0+/, "") || "0"}`;
          const timing =
            parsed[key.toLowerCase()] ||
            parsed[`s${epMatch[1]}e${epMatch[2]}`.toLowerCase()] ||
            parsed[
              `s${String(Number(epMatch[1])).padStart(2, "0")}e${String(Number(epMatch[2])).padStart(2, "0")}`.toLowerCase()
            ];
          if (!timing) return r;
          return {
            ...r,
            introStart: secsToMmSs(timing.intro_start),
            introEnd: secsToMmSs(timing.intro_end),
            outroStart: secsToMmSs(timing.outro_start),
            outroEnd: secsToMmSs(timing.outro_end),
          };
        }),
      );
      setSaved(false);
    } catch {
      alert("Failed to parse timing file. Make sure it is a valid timing.toml.");
    } finally {
      setImporting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "6px",
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: "0.85rem",
    outline: "none",
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
          Set intro and outro timestamps for skip buttons during playback. Use m:ss format (e.g. 1:30 for 1 minute 30
          seconds).
        </p>

        {/* Scrollable grid wrapper for mobile */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "600px" }}>
            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr repeat(4, 1fr)",
                gap: "10px",
                padding: "0 0 8px",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div>Episode</div>
              <div style={{ textAlign: "center" }}>Intro Start</div>
              <div style={{ textAlign: "center" }}>Intro End</div>
              <div style={{ textAlign: "center" }}>Outro Start</div>
              <div style={{ textAlign: "center" }}>Outro End</div>
            </div>

            {/* Episode rows */}
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {rows.map((r, idx) => (
                <div
                  key={r.video_src}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr repeat(4, 1fr)",
                    gap: "10px",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: idx < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "#fff",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={parseEpisodeLabel(r.video_src)}
                  >
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
          <button
            type="button"
            className="oss-btn oss-btn-info-soft oss-btn-sm"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import timing.toml"}
          </button>
          {dirPath && (
            <button
              type="button"
              className="oss-btn oss-btn-info-soft oss-btn-sm"
              onClick={handleAutoDetect}
              disabled={autoDetecting}
              title="Auto-detect intro/outro using audio fingerprinting (requires fpcalc)"
            >
              {autoDetecting ? autoDetectProgress || "Detecting..." : "Auto-detect"}
            </button>
          )}
          <button type="button" className="oss-btn oss-btn-danger-soft oss-btn-sm" onClick={handleClearAll}>
            Clear All
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {saved && <span style={{ color: "#22c55e", fontSize: "0.82rem", fontWeight: 600 }}>&#10003; Saved</span>}
          <button type="button" className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="oss-btn oss-btn-primary oss-btn-sm" onClick={handleSave} disabled={saving}>
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
  const match = filename.match(/_s(\d+)_ep\d+(?:_(?:sub|dub))?\.[^.]+$/i);
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
  const navigate = useNavigate();
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
  const [selectedVariant, setSelectedVariant] = useState<AudioSelection | null>(null);
  const [mostRecentSrc, setMostRecentSrc] = useState<string | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const variantMap = useMemo(() => inferEpisodeVariants(information?.videos || []), [information?.videos]);
  const availableVariants = useMemo(() => {
    const set = new Set<AudioVariant>();
    for (const v of variantMap.values()) {
      if (v) set.add(v);
    }
    return set;
  }, [variantMap]);
  const hasBothVariants = availableVariants.has("sub") && availableVariants.has("dub");
  const filteredVideos = useMemo(() => {
    const videos = information?.videos || [];
    // "Sub + Dub" mode: show every variant; no filtering and no dedupe so the
    // viewer can pick either copy of each episode.
    if (selectedVariant === "both") return videos;
    const variantFiltered =
      !hasBothVariants || selectedVariant === null
        ? videos
        : videos.filter((v) => {
            const variant = variantMap.get(v) ?? null;
            return variant === null || variant === selectedVariant;
          });
    // Defensive dedupe: if multiple files survive for the same (season,
    // episode), prefer the one whose inferred variant matches the selection,
    // then untagged, then the first remaining. Files that don't parse as
    // episodes (movies, extras) are never deduped.
    const pickRank = (src: string): number => {
      const v = variantMap.get(src) ?? null;
      if (selectedVariant && v === selectedVariant) return 0;
      if (v === null) return 1;
      return 2;
    };
    const groups = new Map<string, string[]>();
    for (const src of variantFiltered) {
      const filename = src.split("/").pop() || src;
      const parsed = parseEpisodePath(filename);
      if (!parsed) continue;
      const key = `s${parsed.season}e${parsed.episode}`;
      const list = groups.get(key);
      if (list) list.push(src);
      else groups.set(key, [src]);
    }
    const winnerByKey = new Map<string, string>();
    for (const [key, candidates] of groups) {
      const winner =
        candidates.length > 1 ? [...candidates].sort((a, b) => pickRank(a) - pickRank(b))[0]! : candidates[0]!;
      winnerByKey.set(key, winner);
    }
    const emitted = new Set<string>();
    const result: string[] = [];
    for (const src of variantFiltered) {
      const filename = src.split("/").pop() || src;
      const parsed = parseEpisodePath(filename);
      if (!parsed) {
        result.push(src);
        continue;
      }
      const key = `s${parsed.season}e${parsed.episode}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      result.push(winnerByKey.get(key) ?? src);
    }
    return result;
  }, [information?.videos, hasBothVariants, selectedVariant, variantMap]);
  const currentSeasonMeta = useMemo(() => {
    if (!information) return null;
    const metas = information.seasonsMeta || [];
    if (metas.length === 0) return null;
    const seasonMap = groupVideosBySeason(filteredVideos);
    const onlyOneSeason = seasonMap.size <= 1;
    const explicit = selectedSeason != null ? metas.find((m) => m.season === selectedSeason) : undefined;
    if (explicit) return explicit;
    if (onlyOneSeason && metas.length === 1) return metas[0];
    return null;
  }, [information, selectedSeason, filteredVideos]);
  const displayBanner = currentSeasonMeta?.logo || information?.bannerImage || null;
  const displayDescription = currentSeasonMeta?.description || information?.description || "";
  // Feature 2: Sleep detection
  const [sleepInfo, setSleepInfo] = useState<{
    fellAsleep: boolean;
    resumeEpisode?: string;
    consecutiveCount?: number;
  } | null>(null);
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
  // Dropdown of secondary actions next to the genres
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  // Confirmation modal for resetting all playback progress on this title
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInFlight, setResetInFlight] = useState(false);
  // Alternative-title editor — display-only override that doesn't touch files
  const [showAltTitleModal, setShowAltTitleModal] = useState(false);
  const [altTitleDraft, setAltTitleDraft] = useState("");
  const [altTitleSaving, setAltTitleSaving] = useState(false);
  const altTitleInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!showAltTitleModal) return;
    const id = requestAnimationFrame(() => altTitleInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [showAltTitleModal]);
  // Per-episode display-name overrides (display-only — files are never renamed)
  const [episodeAltsMap, setEpisodeAltsMap] = useState<Record<string, string>>({});
  const [episodeEditSrc, setEpisodeEditSrc] = useState<string | null>(null);
  const [episodeEditDraft, setEpisodeEditDraft] = useState("");
  const [episodeEditSaving, setEpisodeEditSaving] = useState(false);
  const episodeEditInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!episodeEditSrc) return;
    const id = requestAnimationFrame(() => episodeEditInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [episodeEditSrc]);
  const fetchEpisodeAlts = () => {
    if (!dirPath) return;
    fetch(`/api/episode/alt-titles?dir=${encodeURIComponent(dirPath)}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((rows: { video_src: string; alt_title: string }[]) => {
        const map: Record<string, string> = {};
        for (const r of rows) map[r.video_src] = r.alt_title;
        setEpisodeAltsMap(map);
      })
      .catch(() => {});
  };
  const openEpisodeEdit = (videoSrc: string) => {
    setEpisodeEditDraft(episodeAltsMap[videoSrc] ?? "");
    setEpisodeEditSrc(videoSrc);
  };
  const saveEpisodeAlt = async () => {
    if (!episodeEditSrc || !dirPath) return;
    setEpisodeEditSaving(true);
    try {
      const res = await fetch("/api/episode/alt-title", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_src: episodeEditSrc, dir_path: dirPath, alt_title: episodeEditDraft }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = (await res.json()) as { alt_title: string | null };
      setEpisodeAltsMap((prev) => {
        const next = { ...prev };
        if (data.alt_title) next[episodeEditSrc] = data.alt_title;
        else delete next[episodeEditSrc];
        return next;
      });
      setEpisodeEditSrc(null);
    } catch {
      // leave open so the user can retry
    } finally {
      setEpisodeEditSaving(false);
    }
  };
  const saveAltTitle = async () => {
    if (!dirPath) return;
    setAltTitleSaving(true);
    try {
      const res = await fetch("/api/media/alt-title", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath, altName: altTitleDraft }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = (await res.json()) as { altName: string | null };
      setInformation((prev) =>
        prev
          ? {
              ...prev,
              altName: data.altName,
              name: data.altName ?? prev.originalName ?? prev.name,
            }
          : prev,
      );
      window.dispatchEvent(new CustomEvent("ossflix-media-updated"));
      setShowAltTitleModal(false);
    } catch {
      // leave the modal open so the user can retry
    } finally {
      setAltTitleSaving(false);
    }
  };
  const handleResetAllProgress = async () => {
    if (!dirPath) return;
    setResetInFlight(true);
    try {
      await fetch("/api/playback/history", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir_path: dirPath }),
      });
      setProgressMap({});
      fetchProgress();
      setShowResetConfirm(false);
    } catch (err) {
      console.error("Failed to reset progress:", err);
    } finally {
      setResetInFlight(false);
    }
  };
  // Episode hover preview — swaps the banner image for a muted /api/stream of the hovered episode
  const [hoverPreviewSrc, setHoverPreviewSrc] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPreviewableVideo = (src: string) => {
    const ext = (src.split(".").pop() || "").toLowerCase();
    return ext === "mp4" || ext === "webm" || ext === "m4v" || ext === "ogv" || ext === "mov";
  };
  const beginHoverPreview = (src: string) => {
    if (!isPreviewableVideo(src)) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverPreviewSrc(src), 450);
  };
  const endHoverPreview = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreviewSrc(null);
  };
  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    },
    [],
  );
  // Tear down any preview when the player opens or the modal closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: endHoverPreview is an inline cleanup helper; re-running on its identity change would just retrigger an idempotent teardown
  useEffect(() => {
    if (playerSrc || !show) endHoverPreview();
  }, [playerSrc, show]);
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreMenuOpen]);

  // Default to "sub" the first time we see both sub & dub variants for a title
  useEffect(() => {
    if (hasBothVariants && selectedVariant === null) setSelectedVariant("sub");
  }, [hasBothVariants, selectedVariant]);

  // Pick the initial selected season once info AND progress are both loaded.
  // Prefer the season of the most-recently-played episode so reopening a show
  // that the user last watched on (say) Season 3 lands on Season 3 — not S1.
  useEffect(() => {
    if (selectedSeason != null) return;
    if (!information || !progressLoaded) return;
    const seasons = groupVideosBySeason(information.videos || []);
    if (seasons.size === 0) return;
    let target: number | null = null;
    if (mostRecentSrc) target = parseSeasonNumber(mostRecentSrc);
    if (target == null || !seasons.has(target)) target = [...seasons.keys()][0];
    setSelectedSeason(target);
  }, [information, mostRecentSrc, progressLoaded, selectedSeason]);

  // If the active season disappears after a variant switch, fall back to the first available season
  useEffect(() => {
    if (selectedSeason == null) return;
    const seasons = [...groupVideosBySeason(filteredVideos).keys()];
    if (seasons.length === 0) return;
    if (!seasons.includes(selectedSeason)) setSelectedSeason(seasons[0]);
  }, [filteredVideos, selectedSeason]);

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
    if (!dirPath) {
      setProgressLoaded(true);
      return;
    }
    fetch(`/api/playback/progress?dir=${encodeURIComponent(dirPath)}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((entries: ProgressEntry[]) => {
        const map: Record<string, ProgressEntry> = {};
        for (const e of entries) map[e.video_src] = e;
        setProgressMap(map);
        // API returns entries ORDER BY updated_at DESC — first is most recent.
        setMostRecentSrc(Array.isArray(entries) && entries.length > 0 ? entries[0].video_src : null);
      })
      .catch(() => {})
      .finally(() => setProgressLoaded(true));
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
        }),
      ),
    )
      .then(() => {
        const map: Record<string, EpisodeTiming> = {};
        for (const t of timings) map[t.video_src] = t;
        setTimingsMap(map);
      })
      .catch(() => {});
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch callbacks are stable; depend only on show + dirPath
  useEffect(() => {
    if (show && dirPath) {
      setLoading(true);
      setInformation(null);
      setSelectedSeason(null);
      setSelectedVariant(null);
      setMostRecentSrc(null);
      setProgressLoaded(false);
      fetch(`/api/media/info?dir=${encodeURIComponent(dirPath)}`)
        .then((res) => res.json())
        .then((data: MediaInfo) => {
          setInformation(data);
        })
        .finally(() => setLoading(false));
      fetchProgress();
      fetchTimings();
      fetchEpisodeAlts();
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
    const src = videoSrc || filteredVideos[0];
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
    const videos = filteredVideos;
    const videoSet = new Set(videos);
    const inProgress = Object.values(progressMap).filter(
      (e) => videoSet.has(e.video_src) && e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 5),
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
        .filter((e) => videoSet.has(e.video_src) && e.duration > 0 && e.current_time >= e.duration - 5)
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

  const filteredSrcSet = useMemo(() => new Set(filteredVideos), [filteredVideos]);
  const hasResumable =
    Object.values(progressMap).some(
      (e) =>
        filteredSrcSet.has(e.video_src) && e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 5),
    ) ||
    (() => {
      // Also show resume if there are completed episodes and a next episode to play
      const videos = filteredVideos;
      const completedSrcs = Object.values(progressMap)
        .filter((e) => filteredSrcSet.has(e.video_src) && e.duration > 0 && e.current_time >= e.duration - 5)
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
      <Modal
        show={show && !playerSrc && !showTimingsModal}
        onHide={onHide}
        size="lg"
        centered
        dialogClassName="oss-detail-modal"
      >
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
                  type="button"
                  onClick={toggleWatchlist}
                  title={inWatchlist ? "Remove from My List" : "Add to My List"}
                  aria-label={inWatchlist ? "Remove from My List" : "Add to My List"}
                  style={{
                    background: inWatchlist ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.08)",
                    border: inWatchlist ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.12)",
                    color: inWatchlist ? "#60a5fa" : "var(--oss-text-muted)",
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {inWatchlist ? "\u2713 In My List" : "+ My List"}
                </button>
              </div>
            </ModalHeader>
            <ModalBody className="oss-detail-body">
              {displayBanner && (
                <div
                  className="oss-modal-banner"
                  style={{
                    position: "relative",
                    marginBottom: "1rem",
                    borderRadius: "var(--oss-radius)",
                    overflow: "hidden",
                    height: "300px",
                    background: "var(--oss-bg-elevated)",
                  }}
                >
                  <img
                    src={displayBanner}
                    alt={information.name}
                    style={{
                      width: "100%",
                      height: "300px",
                      objectFit: "cover",
                      display: "block",
                      transition: "opacity 0.2s ease",
                      opacity: hoverPreviewSrc ? 0 : 1,
                    }}
                  />
                  {hoverPreviewSrc && (
                    <video
                      key={hoverPreviewSrc}
                      src={`/api/stream?src=${encodeURIComponent(hoverPreviewSrc)}`}
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        const target = Math.min(30, (v.duration || 60) * 0.1);
                        if (Number.isFinite(target) && target > 0) v.currentTime = target;
                      }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(transparent 50%, var(--oss-bg-card))",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              )}

              <div
                className="oss-detail-tags"
                style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px", alignItems: "center" }}
              >
                <span
                  style={{
                    background: "var(--oss-accent)",
                    color: "#fff",
                    padding: "3px 10px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {information.type}
                </span>
                {information.genre?.map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => {
                      onHide();
                      navigate(`/genre/${encodeURIComponent(g)}`);
                    }}
                    title={`Browse ${g}`}
                    className="oss-genre-pill"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      color: "var(--oss-text-muted)",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {g}
                  </button>
                ))}
                <div ref={moreMenuRef} style={{ position: "relative", marginLeft: "auto" }}>
                  <button
                    type="button"
                    onClick={() => setMoreMenuOpen((v) => !v)}
                    title="More actions"
                    aria-haspopup="menu"
                    aria-expanded={moreMenuOpen}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      color: "var(--oss-text-muted)",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      border: "none",
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    &#x2026;
                  </button>
                  {moreMenuOpen && (
                    <div
                      role="menu"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        minWidth: "180px",
                        background: "var(--oss-bg-elevated)",
                        border: "1px solid var(--oss-border)",
                        borderRadius: "8px",
                        padding: "6px",
                        zIndex: 50,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setAltTitleDraft(information.altName ?? "");
                          setShowAltTitleModal(true);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--oss-text)",
                          padding: "8px 10px",
                          textAlign: "left",
                          fontSize: "0.82rem",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Edit display name
                      </button>
                      {tmdbApiKey && (
                        <button
                          type="button"
                          role="menuitem"
                          className="oss-more-menu-item"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setTmdbQuery(information.name);
                            setShowTmdbModal(true);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--oss-text)",
                            padding: "8px 10px",
                            textAlign: "left",
                            fontSize: "0.82rem",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          Fetch from TMDB
                        </button>
                      )}
                      {information.videos?.length > 1 && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setShowTimingsModal(true);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--oss-text)",
                            padding: "8px 10px",
                            textAlign: "left",
                            fontSize: "0.82rem",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          Episode Timings
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setShowResetConfirm(true);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#fca5a5",
                          padding: "8px 10px",
                          textAlign: "left",
                          fontSize: "0.82rem",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Reset all progress
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          onHide();
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--oss-text-muted)",
                          padding: "8px 10px",
                          textAlign: "left",
                          fontSize: "0.82rem",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p
                className="oss-detail-description"
                style={{ color: "var(--oss-text-muted)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem" }}
              >
                {displayDescription}
              </p>

              {information.cast && information.cast.filter((c) => c).length > 0 && (
                <p
                  className="oss-detail-cast"
                  style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}
                >
                  <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Cast: </span>
                  {information.cast.filter((c) => c).join(", ")}
                </p>
              )}

              {/* Sleep detection banner */}
              {sleepInfo?.fellAsleep && !sleepDismissed && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    background: "rgba(251,191,36,0.1)",
                    border: "1px solid rgba(251,191,36,0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
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
                      type="button"
                      className="oss-btn oss-btn-primary oss-btn-sm"
                      onClick={() => {
                        if (sleepInfo.resumeEpisode) handlePlay(sleepInfo.resumeEpisode, false);
                      }}
                    >
                      Resume from there
                    </button>
                    <button
                      type="button"
                      className="oss-btn oss-btn-secondary oss-btn-sm"
                      onClick={() => setSleepDismissed(true)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {hasBothVariants && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
                  <label
                    htmlFor="oss-variant-select"
                    style={{ color: "var(--oss-text-muted)", fontSize: "0.82rem", fontWeight: 500 }}
                  >
                    Audio
                  </label>
                  <select
                    id="oss-variant-select"
                    value={selectedVariant ?? "sub"}
                    onChange={(e) => setSelectedVariant(e.target.value as AudioSelection)}
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
                    <option value="sub">Sub</option>
                    <option value="dub">Dub</option>
                    <option value="both">Sub + Dub</option>
                  </select>
                </div>
              )}

              {(() => {
                const seasonMap = groupVideosBySeason(filteredVideos);
                const seasonKeys = [...seasonMap.keys()];
                const hasSeasons = seasonKeys.length > 0;
                const showPlay = (information.videos?.length ?? 0) > 0;
                const playButton = showPlay ? (
                  <button
                    type="button"
                    className={`oss-btn oss-btn-sm ${hasResumable ? "oss-btn-success" : "oss-btn-primary"}`}
                    onClick={() => (hasResumable ? handleResume() : handlePlay())}
                  >
                    &#9654; {hasResumable ? "Resume" : "Play"}
                  </button>
                ) : null;

                let left: React.ReactNode = null;
                if (hasSeasons && seasonKeys.length > 1) {
                  left = (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
                          <option key={s} value={s}>
                            Season {s}
                          </option>
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
                  left = (
                    <span style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem" }}>
                      <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Season {seasonKeys[0]}</span>
                      {" · "}
                      {seasonMap.get(seasonKeys[0])!.length} episode
                      {seasonMap.get(seasonKeys[0])!.length !== 1 ? "s" : ""}
                    </span>
                  );
                } else if (information.season != null) {
                  left = (
                    <span style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem" }}>
                      <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Season {information.season}</span>
                      {" · "}
                      {information.videos.length} episode{information.videos.length !== 1 ? "s" : ""}
                    </span>
                  );
                }

                if (!left && !playButton) return null;
                return (
                  <div
                    className="oss-episode-toolbar"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>{left}</div>
                    {playButton}
                  </div>
                );
              })()}

              {information.videos?.length > 0 &&
                (() => {
                  const seasonMap = groupVideosBySeason(filteredVideos);
                  const hasSeasons = seasonMap.size > 0;
                  const displayVideos =
                    hasSeasons && selectedSeason != null ? seasonMap.get(selectedSeason) || [] : filteredVideos;

                  return (
                    <div
                      className="oss-episode-list oss-episode-list-scroll"
                      style={{
                        borderTop: "1px solid var(--oss-border)",
                        paddingTop: "12px",
                        marginTop: "8px",
                      }}
                    >
                      {displayVideos.map((v) => {
                        const prog = progressMap[v];
                        const isCompleted = !!prog && prog.duration > 0 && prog.current_time >= prog.duration - 5;
                        const variant = selectedVariant === "both" ? (variantMap.get(v) ?? null) : null;
                        return (
                          <Episode
                            key={v}
                            filename={v.split("/").pop()!}
                            progress={prog || null}
                            variant={variant}
                            altTitle={episodeAltsMap[v]}
                            onEditTitle={() => openEpisodeEdit(v)}
                            onPlay={() => handlePlay(v, !!isCompleted)}
                            onRestart={() => handlePlay(v, true)}
                            onHoverStart={() => beginHoverPreview(v)}
                            onHoverEnd={endHoverPreview}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
            </ModalBody>
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

      <Modal show={!!episodeEditSrc} onHide={() => setEpisodeEditSrc(null)} centered>
        <ModalHeader closeButton>
          <ModalTitle style={{ fontSize: "1.05rem" }}>Edit episode name</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", margin: "0 0 12px", lineHeight: 1.55 }}>
            Override how this episode appears in the app. The file is not renamed.
          </p>
          {episodeEditSrc && (
            <p style={{ color: "var(--oss-text-muted)", fontSize: "0.78rem", margin: "0 0 6px" }}>
              Original: <span style={{ color: "var(--oss-text)" }}>{parseEpisodeLabel(episodeEditSrc)}</span>
            </p>
          )}
          <input
            ref={episodeEditInputRef}
            type="text"
            value={episodeEditDraft}
            onChange={(e) => setEpisodeEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !episodeEditSaving) {
                e.preventDefault();
                saveEpisodeAlt();
              }
            }}
            placeholder={episodeEditSrc ? parseEpisodeLabel(episodeEditSrc) : "Episode title"}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.75rem", margin: "8px 0 0" }}>
            Leave blank to clear the override and revert to the original.
          </p>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="oss-btn oss-btn-secondary oss-btn-sm"
            onClick={() => setEpisodeEditSrc(null)}
            disabled={episodeEditSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="oss-btn oss-btn-primary oss-btn-sm"
            onClick={saveEpisodeAlt}
            disabled={episodeEditSaving}
          >
            {episodeEditSaving ? "Saving..." : "Save"}
          </button>
        </ModalFooter>
      </Modal>

      <Modal show={showAltTitleModal} onHide={() => setShowAltTitleModal(false)} centered>
        <ModalHeader closeButton>
          <ModalTitle style={{ fontSize: "1.05rem" }}>Edit display name</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", margin: "0 0 12px", lineHeight: 1.55 }}>
            Override how this title appears in the app. Files are not renamed — this only changes what you see.
          </p>
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.78rem", margin: "0 0 6px" }}>
            Original: <span style={{ color: "var(--oss-text)" }}>{information?.originalName || information?.name}</span>
          </p>
          <input
            ref={altTitleInputRef}
            type="text"
            value={altTitleDraft}
            onChange={(e) => setAltTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !altTitleSaving) {
                e.preventDefault();
                saveAltTitle();
              }
            }}
            placeholder={information?.originalName || "Display name"}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.75rem", margin: "8px 0 0" }}>
            Leave blank to clear the override and revert to the original.
          </p>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="oss-btn oss-btn-secondary oss-btn-sm"
            onClick={() => setShowAltTitleModal(false)}
            disabled={altTitleSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="oss-btn oss-btn-primary oss-btn-sm"
            onClick={saveAltTitle}
            disabled={altTitleSaving}
          >
            {altTitleSaving ? "Saving..." : "Save"}
          </button>
        </ModalFooter>
      </Modal>

      <Modal show={showResetConfirm} onHide={() => setShowResetConfirm(false)} centered>
        <ModalHeader closeButton>
          <ModalTitle style={{ fontSize: "1.05rem" }}>Reset all progress?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p style={{ color: "var(--oss-text-muted)", fontSize: "0.9rem", margin: 0, lineHeight: 1.55 }}>
            This will clear watch progress for every episode of{" "}
            <strong style={{ color: "var(--oss-text)" }}>{information?.name || "this title"}</strong>. Completed
            episodes will be marked unwatched again. This action can't be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="oss-btn oss-btn-secondary oss-btn-sm"
            onClick={() => setShowResetConfirm(false)}
            disabled={resetInFlight}
          >
            Cancel
          </button>
          <button
            type="button"
            className="oss-btn oss-btn-danger oss-btn-sm"
            onClick={handleResetAllProgress}
            disabled={resetInFlight}
            style={{
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "#fff",
              opacity: resetInFlight ? 0.6 : 1,
            }}
          >
            {resetInFlight ? "Resetting..." : "Reset all progress"}
          </button>
        </ModalFooter>
      </Modal>

      <VideoPlayer
        show={!!playerSrc}
        onHide={() => {
          setPlayerSrc(null);
          setRestartMode(false);
          fetchProgress();
        }}
        src={playerSrc || ""}
        title={information?.name || ""}
        dirPath={dirPath}
        initialTime={playerInitialTime}
        timings={playerSrc ? timingsMap[playerSrc] : undefined}
        subtitles={information?.subtitles}
        episodes={filteredVideos}
        episodeAlts={episodeAltsMap}
        onSelectEpisode={(epSrc) => {
          if (!epSrc || epSrc === playerSrc) return;
          if (restartMode) {
            setPlayerInitialTime(0);
          } else {
            const saved = progressMap[epSrc];
            setPlayerInitialTime(saved?.current_time || 0);
          }
          setPlayerSrc(epSrc);
        }}
        nextSrc={(() => {
          if (!filteredVideos.length || !playerSrc) return undefined;
          const idx = filteredVideos.indexOf(playerSrc);
          return idx >= 0 && idx < filteredVideos.length - 1 ? filteredVideos[idx + 1] : undefined;
        })()}
        onNext={() => {
          if (!filteredVideos.length || !playerSrc) return;
          const currentIndex = filteredVideos.indexOf(playerSrc);
          if (currentIndex >= 0 && currentIndex < filteredVideos.length - 1) {
            const nextSrc = filteredVideos[currentIndex + 1];
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
        hasNext={
          !!(filteredVideos.length && playerSrc && filteredVideos.indexOf(playerSrc) < filteredVideos.length - 1)
        }
        onPrev={() => {
          if (!filteredVideos.length || !playerSrc) return;
          const currentIndex = filteredVideos.indexOf(playerSrc);
          if (currentIndex > 0) {
            const prevSrc = filteredVideos[currentIndex - 1];
            if (restartMode) {
              setPlayerInitialTime(0);
            } else {
              const saved = progressMap[prevSrc];
              setPlayerInitialTime(saved?.current_time || 0);
            }
            setPlayerSrc(prevSrc);
          }
        }}
        hasPrev={!!(filteredVideos.length && playerSrc && filteredVideos.indexOf(playerSrc) > 0)}
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
                flex: 1,
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontSize: "0.85rem",
                outline: "none",
              }}
            />
            <button
              type="button"
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
              <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginTop: "8px" }}>
                Applying metadata...
              </p>
            </div>
          )}

          {!tmdbApplying && tmdbResults.length > 0 && (
            <div
              style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {tmdbResults.slice(0, 10).map((r: any) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => {
                    setTmdbApplying(true);
                    const mediaType = r.media_type === "tv" || r.name ? "tv" : "movie";
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
                    display: "flex",
                    gap: "12px",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent",
                    color: "var(--oss-text)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.15s ease",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {r.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                      alt=""
                      style={{ width: "60px", height: "90px", borderRadius: "4px", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "60px",
                        height: "90px",
                        borderRadius: "4px",
                        background: "var(--oss-bg-elevated)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>{r.title || r.name}</p>
                    <p style={{ margin: "2px 0", fontSize: "0.78rem", color: "var(--oss-text-muted)" }}>
                      {r.release_date || r.first_air_date || ""}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.78rem",
                        color: "var(--oss-text-muted)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as any,
                        overflow: "hidden",
                      }}
                    >
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
