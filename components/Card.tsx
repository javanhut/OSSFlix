import { Modal, ModalHeader, ModalBody, ModalTitle, ModalFooter, Spinner } from 'react-bootstrap';
import { useEffect, useState } from "react";
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

function TimingsModal({ show, videos, timingsMap, onSaveAll, onClose }: {
  show: boolean;
  videos: string[];
  timingsMap: Record<string, EpisodeTiming>;
  onSaveAll: (timings: EpisodeTiming[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TimingRowData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      </ModalBody>
      <ModalFooter>
        {saved && (
          <span style={{ color: "#22c55e", fontSize: "0.82rem", fontWeight: 600, marginRight: "auto" }}>
            &#10003; Saved successfully
          </span>
        )}
        <button className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onClose}>Cancel</button>
        <button className="oss-btn oss-btn-primary oss-btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save All"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export function Card({ show, onHide, dirPath }: CardProps) {
  const { profile } = useProfile();
  const pid = profile?.id;
  const pHeaders = pid ? { "x-profile-id": String(pid) } : {};
  const [information, setInformation] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerInitialTime, setPlayerInitialTime] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressEntry>>({});
  const [timingsMap, setTimingsMap] = useState<Record<string, EpisodeTiming>>({});
  const [showTimingsModal, setShowTimingsModal] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);

  const fetchProgress = () => {
    if (!dirPath) return;
    fetch(`/api/playback/progress?dir=${encodeURIComponent(dirPath)}`, { headers: pHeaders })
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

  const fetchWatchlistStatus = () => {
    if (!dirPath) return;
    fetch(`/api/watchlist/check?dir=${encodeURIComponent(dirPath)}`, { headers: pHeaders as Record<string, string> })
      .then((res) => res.json())
      .then((data: { inList: boolean }) => setInWatchlist(data.inList))
      .catch(() => {});
  };

  const toggleWatchlist = () => {
    const method = inWatchlist ? "DELETE" : "POST";
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (pid) hdrs["x-profile-id"] = String(pid);
    fetch("/api/watchlist", {
      method,
      headers: hdrs,
      body: JSON.stringify({ dir_path: dirPath }),
    })
      .then(() => setInWatchlist(!inWatchlist))
      .catch(() => {});
  };

  useEffect(() => {
    if (show && dirPath) {
      setLoading(true);
      setInformation(null);
      fetch(`/api/media/info?dir=${encodeURIComponent(dirPath)}`)
        .then((res) => res.json())
        .then((data) => setInformation(data))
        .finally(() => setLoading(false));
      fetchProgress();
      fetchTimings();
      fetchWatchlistStatus();
    }
  }, [show, dirPath]);

  const handlePlay = (videoSrc?: string, fromBeginning = false) => {
    const src = videoSrc || information?.videos?.[0];
    if (!src) return;
    if (fromBeginning) {
      setPlayerInitialTime(0);
    } else {
      const saved = progressMap[src];
      setPlayerInitialTime(saved?.current_time || 0);
    }
    setPlayerSrc(src);
  };

  const handleResume = () => {
    const entries = Object.values(progressMap).filter(
      (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 10)
    );
    if (entries.length > 0) {
      const latest = entries[0];
      setPlayerInitialTime(latest.current_time);
      setPlayerSrc(latest.video_src);
    } else {
      handlePlay();
    }
  };

  const hasResumable = Object.values(progressMap).some(
    (e) => e.current_time > 0 && (e.duration === 0 || e.current_time < e.duration - 10)
  );

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
                  style={{
                    background: inWatchlist ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.08)",
                    border: inWatchlist ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.12)",
                    color: inWatchlist ? "#60a5fa" : "var(--oss-text-muted)",
                    padding: "4px 12px", borderRadius: "4px", fontSize: "0.75rem",
                    fontWeight: 600, cursor: "pointer", transition: "all 0.2s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {inWatchlist ? "✓ In My List" : "+ My List"}
                </button>
              </div>
            </ModalHeader>
            <ModalBody>
              {information.bannerImage && (
                <div style={{ position: "relative", marginBottom: "1rem", borderRadius: "var(--oss-radius)", overflow: "hidden" }}>
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
              {information.season != null && (
                <p style={{ color: "var(--oss-text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                  <span style={{ color: "var(--oss-text)", fontWeight: 500 }}>Season {information.season}</span>
                  {" · "}
                  {information.videos.length} episode{information.videos.length !== 1 ? "s" : ""}
                </p>
              )}

              {information.videos?.length > 0 && (
                <div style={{ borderTop: "1px solid var(--oss-border)", paddingTop: "12px", marginTop: "8px" }}>
                  {information.videos.map((v) => {
                    const prog = progressMap[v];
                    const pct = prog && prog.duration > 0 ? (prog.current_time / prog.duration) * 100 : 0;
                    const isInProgress = prog && prog.current_time > 0 && (prog.duration === 0 || prog.current_time < prog.duration - 10);
                    const isCompleted = prog && prog.duration > 0 && prog.current_time >= prog.duration - 10;

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
                            onClick={() => handlePlay(v)}
                          />
                          {/* Status badges & actions */}
                          <div style={{
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
                            {(isInProgress || isCompleted) && (
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
              )}
            </ModalBody>
            <ModalFooter>
              <button className="oss-btn oss-btn-secondary oss-btn-sm" onClick={onHide}>Close</button>
              {information.videos?.length > 1 && (
                <button
                  className="oss-btn oss-btn-sm"
                  onClick={() => setShowTimingsModal(true)}
                  style={{
                    background: "rgba(59,130,246,0.12)", color: "#60a5fa",
                    border: "1px solid rgba(59,130,246,0.25)",
                  }}
                >
                  &#9881; Timings
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
          onClose={() => setShowTimingsModal(false)}
        />
      )}

      <VideoPlayer
        show={!!playerSrc}
        onHide={() => { setPlayerSrc(null); fetchProgress(); }}
        src={playerSrc || ""}
        title={information?.name || ""}
        dirPath={dirPath}
        initialTime={playerInitialTime}
        timings={playerSrc ? timingsMap[playerSrc] : undefined}
        subtitles={information?.subtitles}
        onNext={() => {
          if (!information?.videos || !playerSrc) return;
          const currentIndex = information.videos.indexOf(playerSrc);
          if (currentIndex >= 0 && currentIndex < information.videos.length - 1) {
            const nextSrc = information.videos[currentIndex + 1];
            const saved = progressMap[nextSrc];
            setPlayerInitialTime(saved?.current_time || 0);
            setPlayerSrc(nextSrc);
          } else {
            setPlayerSrc(null);
            fetchProgress();
          }
        }}
        hasNext={!!(information?.videos && playerSrc && information.videos.indexOf(playerSrc) < information.videos.length - 1)}
        profileId={pid}
      />
    </>
  );
}

export default Card;
