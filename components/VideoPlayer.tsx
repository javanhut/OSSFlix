import { useState, useRef, useEffect, useCallback, useMemo } from "react";

type EpisodeTiming = {
  video_src: string;
  intro_start: number | null;
  intro_end: number | null;
  outro_start: number | null;
  outro_end: number | null;
};

type SubtitleTrack = {
  label: string;
  language: string;
  src: string;
  format: string;
};

type AudioTrack = {
  index: number;
  codec: string;
  channels: number;
  channelLayout: string;
  language: string;
  title: string;
};

type VideoPlayerProps = {
  show: boolean;
  onHide: () => void;
  src: string;
  title: string;
  dirPath?: string;
  initialTime?: number;
  onNext?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  timings?: EpisodeTiming;
  hasNext?: boolean;
  profileId?: number;
  subtitles?: SubtitleTrack[];
  nextSrc?: string;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function safePlay(video: HTMLVideoElement): void {
  video.play().catch(() => {});
}

function parseEpisodeFromSrc(src: string): string | null {
  const filename = src.split("/").pop() || "";
  const match = filename.match(/^(.*?)_s(\d+)_ep(\d+)\.[^.]+$/i);
  if (!match) return null;
  return `S${Number(match[2])} E${Number(match[3])} - ${match[1].replace(/_/g, " ")}`;
}

// ── SVG Icon components ──
const IconPlay = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><polygon points="6,3 20,12 6,21" /></svg>
);
const IconPause = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><rect x="5" y="3" width="5" height="18" rx="1.5"/><rect x="14" y="3" width="5" height="18" rx="1.5"/></svg>
);
const IconSkipBack = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.5 8L7 12.5L12.5 17"/>
    <path d="M17.5 8L12 12.5L17.5 17"/>
    <text x="12" y="24" fill="#fff" fontSize="7" fontWeight="700" textAnchor="middle" stroke="none">10</text>
  </svg>
);
const IconSkipForward = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.5 8L17 12.5L11.5 17"/>
    <path d="M6.5 8L12 12.5L6.5 17"/>
    <text x="12" y="24" fill="#fff" fontSize="7" fontWeight="700" textAnchor="middle" stroke="none">10</text>
  </svg>
);
const IconVolumeMuted = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#fff" stroke="none"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
);
const IconVolumeLow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#fff" stroke="none"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>
);
const IconVolumeHigh = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#fff" stroke="none"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);
const IconFullscreen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);
const IconExitFullscreen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,14 4,20 10,20"/><polyline points="20,10 20,4 14,4"/>
    <line x1="14" y1="10" x2="20" y2="4"/><line x1="4" y1="20" x2="10" y2="14"/>
  </svg>
);
const IconPip = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <rect x="12" y="9" width="8" height="6" rx="1" fill="rgba(255,255,255,0.3)"/>
  </svg>
);
const IconNext = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
    <polygon points="4,3 16,12 4,21"/>
    <rect x="17" y="3" width="3" height="18" rx="1"/>
  </svg>
);
const IconBack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,18 9,12 15,6"/>
  </svg>
);
const IconRestart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,4 1,10 7,10"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
);
const IconCC = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "#fff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <path d="M10 10.5c-.5-.7-1.2-1-2-1-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-1"/>
    <path d="M19 10.5c-.5-.7-1.2-1-2-1-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-1"/>
  </svg>
);
const IconAudio = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "#fff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3" fill={active ? "#3b82f6" : "none"}/>
    <circle cx="18" cy="16" r="3" fill={active ? "#3b82f6" : "none"}/>
  </svg>
);
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ── Skip feedback overlay ──
function SkipFeedback({ side, seconds }: { side: "left" | "right"; seconds: number }) {
  return (
    <div style={{
      position: "absolute",
      top: "50%",
      [side]: "15%",
      transform: "translateY(-50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      color: "#fff",
      animation: "vpFadeOut 0.6s ease forwards",
      pointerEvents: "none",
    }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: side === "left" ? "scaleX(-1)" : "none" }}>
        <polygon points="5,4 15,12 5,20" fill="rgba(255,255,255,0.8)"/>
        <polygon points="13,4 23,12 13,20" fill="rgba(255,255,255,0.4)"/>
      </svg>
      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{seconds}s</span>
    </div>
  );
}

// ── Loading spinner ──
function LoadingSpinner() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
    }}>
      <div style={{
        width: "48px", height: "48px",
        border: "3px solid rgba(255,255,255,0.15)",
        borderTopColor: "#3b82f6",
        borderRadius: "50%",
        animation: "vpSpin 0.8s linear infinite",
      }} />
    </div>
  );
}

export default function VideoPlayer({ show, onHide, src, title, dirPath, initialTime, onNext, onProgress, timings, hasNext, profileId, subtitles, nextSrc }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const volumeTimeoutRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isPip, setIsPip] = useState(false);

  // Cache/buffer state for streamed content
  const [cacheStatus, setCacheStatus] = useState<{
    cached: boolean;
    transcoding: boolean;
    bytesWritten: number;
    duration: number;
    fileSize: number;
  } | null>(null);
  const [streamBufferedPercent, setStreamBufferedPercent] = useState(0);
  const cachePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Skip feedback
  const [skipFeedback, setSkipFeedback] = useState<{ side: "left" | "right"; key: number; seconds: number } | null>(null);
  const skipAccumulatorRef = useRef(0);
  const skipResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSkipDirectionRef = useRef<"left" | "right" | null>(null);

  // CC state
  const [ccEnabled, setCcEnabled] = useState(false);
  const [ccAvailable, setCcAvailable] = useState(false);
  const [showCcMenu, setShowCcMenu] = useState(false);
  const [activeTrackIndex, setActiveTrackIndex] = useState(-1);

  // Audio track state
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState(0);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const activeAudioTrackRef = useRef(0);

  // Mouse tracking for mobile (avoid synthetic mousemove)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDeviceRef = useRef(false);

  // Volume swipe gesture state
  const volumeGestureRef = useRef<{ active: boolean; startY: number; startVolume: number } | null>(null);
  const [volumeGestureValue, setVolumeGestureValue] = useState<number | null>(null);

  // Dragging state
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [progressHovered, setProgressHovered] = useState(false);
  const wasPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const seekLockRef = useRef(false);
  const transitioningRef = useRef(false);
  const streamOffsetRef = useRef(0);
  const [streamOffset, setStreamOffset] = useState(0);

  // Skip intro/outro state
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);

  // Countdown to next episode
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timingsRef = useRef(timings);
  const hasNextRef = useRef(hasNext);
  const onNextRef = useRef(onNext);

  useEffect(() => { timingsRef.current = timings; }, [timings]);
  useEffect(() => { hasNextRef.current = hasNext; }, [hasNext]);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);

  // Source ready gate for race condition fix (2A)
  const sourceReadyRef = useRef(true);
  const pendingMetadataRef = useRef(false);

  // Auto-skip intro tracking (2D)
  const autoSkipIntroRef = useRef(false);

  // Prefetch tracking (2C)
  const prefetchedRef = useRef<string | null>(null);

  // Stall detection (4B)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake lock (4C)
  const wakeLockRef = useRef<any>(null);

  // Error recovery (4A)
  const [showReconnecting, setShowReconnecting] = useState(false);

  // Episode transition fade (2B)
  const [transitioning2, setTransitioning2] = useState(false);

  // Hover tooltip state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // ── Settings persistence (3A) ──
  useEffect(() => {
    try {
      const savedVol = localStorage.getItem("ossflix_volume");
      const savedMuted = localStorage.getItem("ossflix_muted");
      const savedRate = localStorage.getItem("ossflix_playbackRate");
      const savedCc = localStorage.getItem("ossflix_cc");
      const savedCcTrack = localStorage.getItem("ossflix_cc_track");
      if (savedVol !== null) { const v = parseFloat(savedVol); if (isFinite(v)) setVolume(v); }
      if (savedMuted !== null) setMuted(savedMuted === "true");
      if (savedRate !== null) { const r = parseFloat(savedRate); if (isFinite(r) && speeds.includes(r)) setPlaybackRate(r); }
      if (savedCc !== null) setCcEnabled(savedCc === "true");
      if (savedCcTrack !== null) { const t = parseInt(savedCcTrack); if (isFinite(t)) setActiveTrackIndex(t); }
    } catch {}
  }, []);

  useEffect(() => { try { localStorage.setItem("ossflix_volume", String(volume)); } catch {} }, [volume]);
  useEffect(() => { try { localStorage.setItem("ossflix_muted", String(muted)); } catch {} }, [muted]);
  useEffect(() => { try { localStorage.setItem("ossflix_playbackRate", String(playbackRate)); } catch {} }, [playbackRate]);
  useEffect(() => { try { localStorage.setItem("ossflix_cc", String(ccEnabled)); } catch {} }, [ccEnabled]);
  useEffect(() => { try { localStorage.setItem("ossflix_cc_track", String(activeTrackIndex)); } catch {} }, [activeTrackIndex]);

  // ── Progress saving refs ──
  const saveProgressRef = useRef<(force?: boolean) => void>(() => {});
  const lastSavedTimeRef = useRef(0);
  const initialTimeAppliedRef = useRef(false);
  const currentSrcRef = useRef(src);
  const currentDirRef = useRef(dirPath);

  useEffect(() => {
    if (src) currentSrcRef.current = src;
    if (dirPath) currentDirRef.current = dirPath;
  }, [src, dirPath]);

  saveProgressRef.current = (force = false) => {
    const video = videoRef.current;
    const videoSrcToSave = currentSrcRef.current;
    if (!video || !videoSrcToSave) return;
    const ct = video.currentTime + streamOffsetRef.current;
    const dur = isStreamed ? durationRef.current : (isFinite(video.duration) ? video.duration : 0);
    if (!isFinite(ct) || (ct === 0 && !force)) return;
    if (!force && Math.abs(ct - lastSavedTimeRef.current) < 3) return;
    lastSavedTimeRef.current = ct;
    onProgress?.(ct, dur);
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (profileId) hdrs["x-profile-id"] = String(profileId);
    fetch("/api/playback/progress", {
      method: "PUT",
      headers: hdrs,
      body: JSON.stringify({
        video_src: videoSrcToSave,
        dir_path: currentDirRef.current || "",
        current_time: ct,
        duration: isFinite(dur) ? dur : 0,
      }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (!show || !src) return;
    const interval = setInterval(() => saveProgressRef.current(), 5000);
    return () => clearInterval(interval);
  }, [show, src]);

  useEffect(() => {
    initialTimeAppliedRef.current = false;
    streamOffsetRef.current = 0;
    setStreamOffset(0);
    // Reset cache mode for new source
    isCachedRef.current = false;
    setCachedMode(false);
    // Source ready gate (2A) — block metadata handling until cache check resolves
    sourceReadyRef.current = false;
    pendingMetadataRef.current = false;
    // Reset prefetch tracking for new source
    prefetchedRef.current = null;
    // Apply transition fade (2B)
    setTransitioning2(true);
    // For streamed files, check if already cached and apply initialTime
    if (isStreamed && initialTime && initialTime > 0) {
      // Check cache status to decide how to apply initialTime
      fetch(`/api/stream/cache/status?src=${encodeURIComponent(src)}`)
        .then((res) => res.json())
        .then((data: any) => {
          if (data.cached && !data.transcoding) {
            // Already cached — use cached mode with native seeking
            isCachedRef.current = true;
            setCachedMode(true);
            // Don't set streamOffset — we'll seek natively in handleLoadedMetadata
            initialTimeAppliedRef.current = true;
          } else {
            // Not cached — use stream offset
            streamOffsetRef.current = initialTime;
            setStreamOffset(initialTime);
            initialTimeAppliedRef.current = true;
          }
          sourceReadyRef.current = true;
          if (pendingMetadataRef.current) handleLoadedMetadata();
        })
        .catch(() => {
          // Fallback to stream offset
          streamOffsetRef.current = initialTime;
          setStreamOffset(initialTime);
          initialTimeAppliedRef.current = true;
          sourceReadyRef.current = true;
          if (pendingMetadataRef.current) handleLoadedMetadata();
        });
    } else if (isStreamed) {
      // No initial time — still check if cached for instant playback
      fetch(`/api/stream/cache/status?src=${encodeURIComponent(src)}`)
        .then((res) => res.json())
        .then((data: any) => {
          if (data.cached && !data.transcoding) {
            isCachedRef.current = true;
            setCachedMode(true);
          }
          sourceReadyRef.current = true;
          if (pendingMetadataRef.current) handleLoadedMetadata();
        })
        .catch(() => {
          sourceReadyRef.current = true;
          if (pendingMetadataRef.current) handleLoadedMetadata();
        });
    } else {
      // Non-streamed: source is immediately ready
      sourceReadyRef.current = true;
    }
    // Clear countdown when src changes
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    setShowSkipIntro(false);
    setShowSkipOutro(false);
    // Reset audio track selection
    setActiveAudioTrack(0);
    activeAudioTrackRef.current = 0;
    setAudioTracks([]);
  }, [src]);

  const episodeLabel = useMemo(() => parseEpisodeFromSrc(src), [src]);

  const isStreamed = useMemo(() => {
    const ext = src.split(".").pop()?.toLowerCase();
    return ext === "mkv" || ext === "avi" || ext === "wmv" || ext === "mov" || ext === "webm";
  }, [src]);

  const isCachedRef = useRef(false);
  // Track if we've switched to cached playback mode
  const [cachedMode, setCachedMode] = useState(false);

  const videoSrc = useMemo(() => {
    if (isStreamed) {
      let url = `/api/stream?src=${encodeURIComponent(src)}`;
      // When cached, don't include start offset — use native seeking instead
      if (!cachedMode && streamOffset > 0) url += `&start=${streamOffset}`;
      if (activeAudioTrack > 0) url += `&audio=${activeAudioTrack}`;
      return url;
    }
    return src;
  }, [src, isStreamed, streamOffset, activeAudioTrack, cachedMode]);

  const resetState = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    streamOffsetRef.current = 0;
    setStreamOffset(0);
    setShowControls(true);
    setShowSettingsMenu(false);
    setShowCcMenu(false);
    setShowAudioMenu(false);
    setDragging(false);
    setHoverTime(null);
    setIsLoading(true);
    setShowVolumeSlider(false);
    setVolumeGestureValue(null);
    volumeGestureRef.current = null;
    setSkipFeedback(null);
    skipAccumulatorRef.current = 0;
    lastSkipDirectionRef.current = null;
    if (skipResetTimeoutRef.current) { clearTimeout(skipResetTimeoutRef.current); skipResetTimeoutRef.current = null; }
    setShowSkipIntro(false);
    setShowSkipOutro(false);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
    setCacheStatus(null);
    setStreamBufferedPercent(0);
    isCachedRef.current = false;
    setCachedMode(false);
    if (cachePollingRef.current) { clearInterval(cachePollingRef.current); cachePollingRef.current = null; }
    setShowReconnecting(false);
    setTransitioning2(false);
    sourceReadyRef.current = true;
    pendingMetadataRef.current = false;
    prefetchedRef.current = null;
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
  }, []);

  const seekStream = useCallback((absoluteTime: number) => {
    const seekTo = Math.max(0, Math.min(absoluteTime, durationRef.current - 1));
    const video = videoRef.current;

    // If we're in cached mode, use native seeking (much faster)
    if (isCachedRef.current && video) {
      video.currentTime = seekTo;
      streamOffsetRef.current = 0;
      setStreamOffset(0);
      setCurrentTime(seekTo);
      if (wasPlayingRef.current || !video.paused) {
        safePlay(video);
        setPlaying(true);
      }
      return;
    }

    // Not cached — reload stream with new start offset
    streamOffsetRef.current = seekTo;
    setStreamOffset(seekTo);
    setCurrentTime(seekTo);
    setIsLoading(true);
  }, []);

  const selectAudioTrack = useCallback((trackIndex: number) => {
    if (trackIndex === activeAudioTrackRef.current) {
      setShowAudioMenu(false);
      return;
    }
    activeAudioTrackRef.current = trackIndex;
    setActiveAudioTrack(trackIndex);
    setShowAudioMenu(false);
    const video = videoRef.current;
    if (video && isStreamed) {
      const currentAbsoluteTime = video.currentTime + streamOffsetRef.current;
      // Different audio track may have a different cache — reset cached mode
      isCachedRef.current = false;
      setCachedMode(false);
      setCacheStatus(null);
      setStreamBufferedPercent(0);
      // This will trigger a new stream request (and start caching the new audio variant)
      streamOffsetRef.current = currentAbsoluteTime;
      setStreamOffset(currentAbsoluteTime);
      setCurrentTime(currentAbsoluteTime);
      setIsLoading(true);
    }
  }, [isStreamed]);

  // ── Show / hide lifecycle ──
  useEffect(() => {
    if (!show) {
      // Reset auto-skip intro on player hide (2D)
      autoSkipIntroRef.current = false;
      // Release wake lock (4C)
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      // Clear stall timer (4B)
      if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
      const video = videoRef.current;
      if (video && currentSrcRef.current) {
        const ct = video.currentTime + streamOffsetRef.current;
        const dur = isStreamed ? durationRef.current : video.duration;
        if (isFinite(ct) && ct > 0) {
          const hdrs: Record<string, string> = { "Content-Type": "application/json" };
          if (profileId) hdrs["x-profile-id"] = String(profileId);
          fetch("/api/playback/progress", {
            method: "PUT",
            headers: hdrs,
            body: JSON.stringify({
              video_src: currentSrcRef.current,
              dir_path: currentDirRef.current || "",
              current_time: ct,
              duration: isFinite(dur) ? dur : 0,
            }),
          }).catch(() => {});
        }
      }
      resetState();
      lastSavedTimeRef.current = 0;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        try { screen.orientation.unlock(); } catch {}
      }
    } else {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container && !document.fullscreenElement) {
          container.requestFullscreen().then(() => {
            setIsFullscreen(true);
            try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
          }).catch(() => {});
        }
      });
    }
  }, [show, resetState]);

  // ── Controls auto-hide ──
  const showControlsTemporarily = useCallback((timeout = 2500) => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing && !dragging && !showVolumeSlider) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
        setShowSettingsMenu(false);
        setShowCcMenu(false);
        setShowAudioMenu(false);
        setShowVolumeSlider(false);
      }, timeout);
    }
  }, [playing, dragging, showVolumeSlider]);

  const handleMouseMoveControls = useCallback((e: React.MouseEvent) => {
    // On touch devices, ignore synthetic mousemove events
    if (isTouchDeviceRef.current) return;
    const last = lastMousePosRef.current;
    if (last && last.x === e.clientX && last.y === e.clientY) return;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  // ── Playback ──
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      safePlay(video);
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
    showControlsTemporarily();
  };

  const restartFromBeginning = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isStreamed) {
      seekStream(0);
    } else {
      video.currentTime = 0;
      setCurrentTime(0);
      safePlay(video);
      setPlaying(true);
    }
    showControlsTemporarily();
  };

  const skipIntro = () => {
    const video = videoRef.current;
    const t = timingsRef.current;
    if (!video || !t?.intro_end) return;
    // Mark for auto-skip on subsequent episodes (2D)
    autoSkipIntroRef.current = true;
    if (isStreamed) {
      seekStream(t.intro_end);
    } else {
      video.currentTime = t.intro_end;
      setCurrentTime(t.intro_end);
    }
    showControlsTemporarily();
  };

  const skipOutro = () => {
    const next = onNextRef.current;
    if (next) {
      cancelCountdown();
      next();
    }
  };

  const startCountdown = () => {
    if (countdownRef.current) return; // already running
    setCountdown(10);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          cancelCountdown();
          const next = onNextRef.current;
          if (next) { transitioningRef.current = true; setTimeout(next, 0); }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  };

  const toggleCC = () => {
    if (subtitles && subtitles.length > 1) {
      setShowCcMenu((v) => !v);
      setShowSettingsMenu(false);
      setShowAudioMenu(false);
      setShowVolumeSlider(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    if (tracks.length === 0) return;
    const newState = !ccEnabled;
    setCcEnabled(newState);
    setActiveTrackIndex(newState ? 0 : -1);
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = newState ? "showing" : "hidden";
    }
  };

  const selectCcTrack = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = i === index ? "showing" : "hidden";
    }
    setActiveTrackIndex(index);
    setCcEnabled(index >= 0);
    setShowCcMenu(false);
  };

  const disableCC = () => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = "hidden";
    }
    setActiveTrackIndex(-1);
    setCcEnabled(false);
    setShowCcMenu(false);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || dragging || seekLockRef.current) return;
    const ct = video.currentTime + streamOffsetRef.current;
    const dur = isStreamed ? durationRef.current : video.duration;
    setCurrentTime(ct);
    if (video.buffered.length > 0) {
      const bufEnd = video.buffered.end(video.buffered.length - 1);
      if (isStreamed) {
        // For streamed: buffered is relative to stream offset
        setBuffered(bufEnd + streamOffsetRef.current);
        // Update stream buffer percent from actual video buffer
        const totalDur = durationRef.current;
        if (totalDur > 0) {
          const bufPercent = ((bufEnd + streamOffsetRef.current) / totalDur) * 100;
          setStreamBufferedPercent((prev) => Math.max(prev, bufPercent));
        }
      } else {
        setBuffered(bufEnd);
      }
    }

    const t = timingsRef.current;
    const next = hasNextRef.current;
    const hasOutroTiming = t?.outro_start != null && t?.outro_end != null;
    const hasIntroTiming = t?.intro_start != null && t?.intro_end != null;

    // Skip intro button + auto-skip (2D)
    if (hasIntroTiming) {
      const inIntro = ct >= t!.intro_start! && ct < t!.intro_end!;
      setShowSkipIntro(inIntro);
      // Auto-skip intro on subsequent episodes if user manually skipped before
      if (inIntro && autoSkipIntroRef.current) {
        if (isStreamed) {
          seekStream(t!.intro_end!);
        } else {
          video.currentTime = t!.intro_end!;
          setCurrentTime(t!.intro_end!);
        }
      }
    } else {
      setShowSkipIntro(false);
    }

    // Prefetch next episode at 75% (2C)
    if (nextSrc && dur > 0 && ct >= dur * 0.75 && prefetchedRef.current !== nextSrc) {
      prefetchedRef.current = nextSrc;
      fetch(`/api/stream/prefetch?src=${encodeURIComponent(nextSrc)}`).catch(() => {});
    }

    // Determine countdown trigger point (3C)
    let countdownTrigger = -1;
    if (hasOutroTiming) {
      // Start countdown at outro_start (not 10s before it)
      countdownTrigger = t!.outro_start!;

      // Show skip outro button when in outro region
      setShowSkipOutro(ct >= t!.outro_start! && ct < t!.outro_end!);
    } else {
      setShowSkipOutro(false);
      // No outro set: trigger 15s before video ends
      if (dur > 15) {
        countdownTrigger = dur - 15;
      }
    }

    // Start/cancel countdown
    if (next && countdownTrigger > 0) {
      const pastTrigger = ct >= countdownTrigger;
      if (pastTrigger && !countdownRef.current) {
        startCountdown();
      }
      if (!pastTrigger && countdownRef.current) {
        cancelCountdown();
      }
    }
  };

  // Fetch real duration from server for streamed (transcoded) files
  useEffect(() => {
    if (!isStreamed) return;
    fetch(`/api/stream/probe?src=${encodeURIComponent(src)}`)
      .then((res) => res.json())
      .then((data: { duration?: number; audioTracks?: AudioTrack[] }) => {
        if (data.duration && isFinite(data.duration)) {
          setDuration(data.duration);
          durationRef.current = data.duration;
        }
        if (data.audioTracks) {
          setAudioTracks(data.audioTracks);
        }
      })
      .catch(() => {});
  }, [src, isStreamed]);

  // Poll cache/buffer status for streamed content
  useEffect(() => {
    if (!isStreamed || !show) {
      setCacheStatus(null);
      setStreamBufferedPercent(0);
      if (cachePollingRef.current) {
        clearInterval(cachePollingRef.current);
        cachePollingRef.current = null;
      }
      return;
    }

    const pollCache = () => {
      let url = `/api/stream/cache/status?src=${encodeURIComponent(src)}`;
      if (activeAudioTrackRef.current > 0) url += `&audio=${activeAudioTrackRef.current}`;
      fetch(url)
        .then((res) => res.json())
        .then((data: any) => {
          setCacheStatus(data);
          if (data.cached && !data.transcoding) {
            // Fully cached — 100% buffered
            setStreamBufferedPercent(100);
            // Stop polling once fully cached
            if (cachePollingRef.current) {
              clearInterval(cachePollingRef.current);
              cachePollingRef.current = null;
            }
          } else if (data.transcoding && data.duration > 0 && data.fileSize > 0) {
            // Estimate buffer progress based on bytes written vs estimated total
            // Use a rough estimate: (bytesWritten / fileSize) isn't useful during transcoding
            // Instead, we watch the file growing and estimate based on transcode speed
            // For simplicity, use bytesWritten relative to what we've seen as max
            setStreamBufferedPercent((prev) => Math.max(prev, 0));
          }
        })
        .catch(() => {});
    };

    pollCache();
    cachePollingRef.current = setInterval(pollCache, 2000);

    return () => {
      if (cachePollingRef.current) {
        clearInterval(cachePollingRef.current);
        cachePollingRef.current = null;
      }
    };
  }, [src, isStreamed, show]);

  // When cache completes mid-playback, switch to cached mode for instant seeking
  useEffect(() => {
    if (!cacheStatus?.cached || !isStreamed || !show) return;
    if (isCachedRef.current) return; // Already switched

    const video = videoRef.current;
    if (!video) return;

    // Record current playback position and state
    const absoluteTime = video.currentTime + streamOffsetRef.current;
    const wasPlaying = !video.paused;

    // Switch to cached mode
    isCachedRef.current = true;
    setCachedMode(true);

    // After the videoSrc updates (no &start= param), the video element will reload.
    // We need to seek to the correct position once loaded.
    streamOffsetRef.current = 0;
    setStreamOffset(0);

    const onCachedLoaded = () => {
      video.removeEventListener("loadedmetadata", onCachedLoaded);
      video.currentTime = absoluteTime;
      setCurrentTime(absoluteTime);
      if (wasPlaying) {
        safePlay(video);
        setPlaying(true);
      }
      setIsLoading(false);
    };
    video.addEventListener("loadedmetadata", onCachedLoaded);
  }, [cacheStatus?.cached, isStreamed, show]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    // Source ready gate (2A): defer if cache check hasn't resolved yet
    if (!sourceReadyRef.current) {
      pendingMetadataRef.current = true;
      return;
    }
    pendingMetadataRef.current = false;
    const dur = video.duration;
    // For streamed files, only update duration if the browser reports a valid one
    if (!isStreamed || (isFinite(dur) && dur > 60)) {
      setDuration(dur);
      durationRef.current = dur;
    }
    setBuffered(0);
    setIsLoading(false);
    // Reapply playback rate after source change
    video.playbackRate = playbackRate;
    // Check for text tracks (CC) - from <track> elements or subtitles prop
    const hasTracks = video.textTracks.length > 0 || (subtitles && subtitles.length > 0);
    setCcAvailable(!!hasTracks);
    if (ccEnabled && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === activeTrackIndex ? "showing" : "hidden";
      }
    }
    if (isStreamed && isCachedRef.current) {
      // Cached streamed file — use native seeking like a regular MP4
      if (isFinite(dur) && dur > 0) {
        setDuration(dur);
        durationRef.current = dur;
      }
      if (initialTime && initialTime > 0 && !initialTimeAppliedRef.current) {
        initialTimeAppliedRef.current = true;
        video.currentTime = Math.min(initialTime, dur - 1);
        setCurrentTime(video.currentTime);
      } else {
        setCurrentTime(video.currentTime);
      }
      if (wasPlayingRef.current) {
        safePlay(video);
        setPlaying(true);
      }
    } else if (isStreamed) {
      // Live transcoded streamed file — use stream offset
      setCurrentTime(streamOffsetRef.current);
      if (streamOffsetRef.current > 0 || wasPlayingRef.current) {
        safePlay(video);
        setPlaying(true);
      }
    } else if (initialTime && initialTime > 0 && !initialTimeAppliedRef.current) {
      initialTimeAppliedRef.current = true;
      video.currentTime = Math.min(initialTime, video.duration - 1);
      setCurrentTime(video.currentTime);
    } else {
      setCurrentTime(0);
    }
  };

  // ── Progress bar ──
  const getTimeFromXForRender = (clientX: number): { time: number; x: number } => {
    const bar = progressRef.current;
    if (!bar || duration <= 0) return { time: 0, x: 0 };
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { time: ratio * duration, x: clientX - rect.left };
  };

  const getTimeFromXRef = (clientX: number): { time: number; x: number } => {
    const bar = progressRef.current;
    const dur = durationRef.current;
    if (!bar || dur <= 0) return { time: 0, x: 0 };
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { time: ratio * dur, x: clientX - rect.left };
  };

  const startDrag = (clientX: number) => {
    const { time, x } = getTimeFromXRef(clientX);
    setDragging(true);
    setDragTime(time);
    setDragX(x);
    wasPlayingRef.current = playing;
    if (videoRef.current) {
      if (!videoRef.current.paused) videoRef.current.pause();
      // Allow real-time scrub preview for non-streamed and cached-streamed files
      if (!isStreamed || isCachedRef.current) videoRef.current.currentTime = time;
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startDrag(e.clientX);
  };

  const handleProgressTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // touch-action: none on the element already prevents scrolling, so no preventDefault needed
    startDrag(e.touches[0].clientX);
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (clientX: number) => {
      const { time, x } = getTimeFromXRef(clientX);
      setDragTime(time);
      setDragX(x);
      if ((!isStreamed || isCachedRef.current) && videoRef.current) videoRef.current.currentTime = time;
    };
    const handleEnd = (clientX: number) => {
      const { time } = getTimeFromXRef(clientX);
      const video = videoRef.current;
      if (video) {
        if (isStreamed) {
          seekStream(time);
        } else {
          seekLockRef.current = true;
          video.currentTime = time;
          setCurrentTime(time);
          const onSeeked = () => {
            seekLockRef.current = false;
            video.removeEventListener("seeked", onSeeked);
            if (wasPlayingRef.current) { safePlay(video); setPlaying(true); }
          };
          video.addEventListener("seeked", onSeeked);
          setTimeout(() => {
            if (seekLockRef.current) {
              seekLockRef.current = false;
              video.removeEventListener("seeked", onSeeked);
              if (wasPlayingRef.current) { safePlay(video); setPlaying(true); }
            }
          }, 2000);
        }
      }
      setDragging(false);
      showControlsTemporarily();
    };
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const handleMouseUp = (e: MouseEvent) => handleEnd(e.clientX);
    const handleTouchMove = (e: TouchEvent) => { e.preventDefault(); handleMove(e.touches[0].clientX); };
    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      handleEnd(touch.clientX);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dragging]);

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    const { time, x } = getTimeFromXForRender(e.clientX);
    setHoverTime(time);
    setHoverX(x);
  };

  const handleProgressLeave = () => {
    if (!dragging) { setHoverTime(null); setProgressHovered(false); }
  };

  // ── Volume ──
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) { videoRef.current.volume = val; setMuted(val === 0); }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const showVolumeTemporarily = () => {
    setShowVolumeSlider(true);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = window.setTimeout(() => setShowVolumeSlider(false), 2000);
  };

  // ── Speed ──
  const [speedIndicator, setSpeedIndicator] = useState<{ speed: number; key: number } | null>(null);

  const changeSpeed = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setShowSettingsMenu(false);
    setSpeedIndicator({ speed, key: Date.now() });
  };

  // ── Skip with feedback (incremental accumulation) ──
  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const direction: "left" | "right" = seconds > 0 ? "right" : "left";
    // Clear pending reset timeout
    if (skipResetTimeoutRef.current) {
      clearTimeout(skipResetTimeoutRef.current);
      skipResetTimeoutRef.current = null;
    }
    // Reset accumulator if direction changed
    if (lastSkipDirectionRef.current !== direction) {
      skipAccumulatorRef.current = 0;
      lastSkipDirectionRef.current = direction;
    }
    // Accumulate
    skipAccumulatorRef.current += Math.abs(seconds);
    if (isStreamed) {
      const absoluteCurrent = video.currentTime + streamOffsetRef.current;
      seekStream(absoluteCurrent + seconds);
    } else {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    }
    setSkipFeedback({ side: direction, key: Date.now(), seconds: skipAccumulatorRef.current });
    showControlsTemporarily();
    // Reset after 1 second of inactivity
    skipResetTimeoutRef.current = setTimeout(() => {
      skipAccumulatorRef.current = 0;
      lastSkipDirectionRef.current = null;
    }, 1000);
  };

  // ── Fullscreen ──
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
      }).catch(() => {});
    } else {
      document.exitFullscreen();
      try { screen.orientation.unlock(); } catch {}
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);
      if (!inFullscreen) {
        try { screen.orientation.unlock(); } catch {}
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      try { screen.orientation.unlock(); } catch {}
    };
  }, []);

  // ── Picture-in-Picture ──
  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false);
      } else {
        await video.requestPictureInPicture();
        setIsPip(true);
      }
    } catch { /* PiP not supported */ }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
    };
  }, []);

  // ── Wake Lock (4C) ──
  useEffect(() => {
    if (!show) return;
    const requestWakeLock = async () => {
      if (playing && "wakeLock" in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        } catch {}
      } else if (!playing && wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    requestWakeLock();
    // Re-acquire on visibility change (browser releases on tab switch)
    const onVisChange = () => {
      if (document.visibilityState === "visible" && playing) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [show, playing]);

  // ── Stall detection (4B) ──
  useEffect(() => {
    if (!show || !playing) {
      if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
      return;
    }
    if (isLoading) {
      if (!stallTimerRef.current) {
        stallTimerRef.current = setTimeout(() => {
          stallTimerRef.current = null;
          const video = videoRef.current;
          if (!video || !isLoading) return;
          if (isStreamed) {
            seekStream(video.currentTime + streamOffsetRef.current);
          } else {
            // Nudge currentTime to trigger re-buffer
            video.currentTime = video.currentTime;
          }
        }, 10000);
      }
    } else {
      if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
    }
  }, [show, playing, isLoading]);

  // ── Keyboard ──
  useEffect(() => {
    if (!show) return;
    const handleKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      // Prevent spacebar from activating focused buttons - always use it for play/pause
      if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
        return;
      }
      switch (e.key) {
        case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": case "j": e.preventDefault(); skip(-10); break;
        case "ArrowRight": case "l": e.preventDefault(); skip(10); break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.05);
          setVolume(video.volume);
          showVolumeTemporarily();
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.05);
          setVolume(video.volume);
          showVolumeTemporarily();
          break;
        case "m": toggleMute(); break;
        case "f": toggleFullscreen(); break;
        case "p": togglePip(); break;
        case "Escape": e.preventDefault(); onHide(); break;
        case "n": if (onNext) { e.preventDefault(); onNext(); } break;
        case "r": e.preventDefault(); restartFromBeginning(); break;
        case "c": e.preventDefault(); toggleCC(); break;
        case "a": if (isStreamed && audioTracks.length > 1) { e.preventDefault(); setShowAudioMenu((v) => !v); setShowSettingsMenu(false); setShowCcMenu(false); setShowVolumeSlider(false); } break;
        case ",": if (video.paused) {
          if (isStreamed) { seekStream(video.currentTime + streamOffsetRef.current - 1); }
          else { video.currentTime = Math.max(0, video.currentTime - 1/30); setCurrentTime(video.currentTime); }
        } break;
        case ".": if (video.paused) {
          if (isStreamed) { seekStream(video.currentTime + streamOffsetRef.current + 1); }
          else { video.currentTime = Math.min(video.duration, video.currentTime + 1/30); setCurrentTime(video.currentTime); }
        } break;
        case "<": case "[": {
          e.preventDefault();
          const idx = speeds.indexOf(playbackRate);
          if (idx > 0) changeSpeed(speeds[idx - 1]);
          break;
        }
        case ">": case "]": {
          e.preventDefault();
          const idx = speeds.indexOf(playbackRate);
          if (idx < speeds.length - 1) changeSpeed(speeds[idx + 1]);
          break;
        }
      }
      showControlsTemporarily();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [show, playing]);

  // ── Double click/tap sides to skip ──
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = useRef(0);
  const lastTapXRef = useRef(0);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-controls]")) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const third = rect.width / 3;
    if (x < third) skip(-10);
    else if (x > third * 2) skip(10);
    else toggleFullscreen();
  };

  const handleTouchTap = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("[data-controls]")) return;
    const touch = e.changedTouches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = touch.clientX - rect.left;

    tapCountRef.current++;
    lastTapXRef.current = x;

    if (tapCountRef.current === 1) {
      tapTimeoutRef.current = setTimeout(() => {
        // Single tap: toggle controls
        if (tapCountRef.current === 1) {
          if (showControls) {
            setShowControls(false);
          } else {
            showControlsTemporarily();
          }
        }
        tapCountRef.current = 0;
      }, 300);
    } else if (tapCountRef.current === 2) {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapCountRef.current = 0;
      const third = rect.width / 3;
      if (x < third) skip(-10);
      else if (x > third * 2) skip(10);
      else togglePlay();
    }
  };

  const displayTime = dragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const bufferedProgress = isStreamed
    ? Math.min(100, streamBufferedPercent)
    : (duration > 0 ? (buffered / duration) * 100 : 0);
  const remaining = duration - displayTime;

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#000",
      animation: "vpFadeIn 0.2s ease",
    }}>
      {/* Inject player keyframes */}
      <style>{`
        @keyframes vpFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vpFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes vpSpin { to { transform: rotate(360deg) } }
        @keyframes vpPulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 0.9 } 50% { transform: translate(-50%,-50%) scale(1.15); opacity: 1 } }
        .vp-ctrl-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; position: relative; outline: none; }
        .vp-ctrl-btn:hover { background: rgba(255,255,255,0.12); transform: scale(1.1); }
        .vp-ctrl-btn:active { transform: scale(0.95); }
        .vp-volume-track { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.2); outline: none; cursor: pointer; }
        .vp-volume-track::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; cursor: pointer; box-shadow: 0 0 4px rgba(0,0,0,0.4); }
        .vp-volume-track::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; cursor: pointer; border: none; box-shadow: 0 0 4px rgba(0,0,0,0.4); }
        .vp-volume-popup .vp-volume-track { width: 6px; height: 120px; }
        .vp-volume-popup .vp-volume-track::-webkit-slider-thumb { width: 22px; height: 22px; }
        .vp-volume-popup .vp-volume-track::-moz-range-thumb { width: 22px; height: 22px; }
        .vp-settings-panel { position: absolute; bottom: calc(100% + 8px); right: 0; background: rgba(20,20,28,0.96); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 6px; min-width: 180px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); animation: vpSlideUp 0.2s ease; }
        @keyframes vpSlideUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        .vp-speed-btn { width: 100%; padding: 8px 16px; border: none; background: transparent; color: rgba(255,255,255,0.7); font-size: 0.85rem; cursor: pointer; border-radius: 8px; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s ease; }
        .vp-speed-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .vp-speed-btn.active { color: #3b82f6; font-weight: 600; }
        .vp-tooltip { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: rgba(20,20,28,0.9); color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; pointer-events: none; margin-bottom: 6px; opacity: 0; transition: opacity 0.15s ease; font-variant-numeric: tabular-nums; }
        .vp-ctrl-btn:hover .vp-tooltip { opacity: 1; }
      `}</style>

      <div
        ref={containerRef}
        style={{
          width: "100%", height: "100%",
          position: "relative", overflow: "hidden",
          cursor: showControls ? "default" : "none",
          userSelect: "none",
          touchAction: "none",
        }}
        onMouseMove={handleMouseMoveControls}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-controls]")) return;
          // On touch devices, play/pause is handled by handleTouchTap
          if (isTouchDeviceRef.current) return;
          if ((e.target as HTMLElement).tagName === "VIDEO" || (e.target as HTMLElement).closest("[data-click-area]")) {
            togglePlay();
          }
        }}
        onDoubleClick={handleDoubleClick}
        onTouchStart={(e) => {
          isTouchDeviceRef.current = true;
          if ((e.target as HTMLElement).closest("[data-controls]")) return;
          const touch = e.touches[0];
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = touch.clientX - rect.left;
          // Right half of screen: prepare volume gesture
          if (x > rect.width / 2) {
            volumeGestureRef.current = {
              active: false,
              startY: touch.clientY,
              startVolume: videoRef.current?.muted ? 0 : (videoRef.current?.volume ?? volume),
            };
          }
        }}
        onTouchMove={(e) => {
          if (!volumeGestureRef.current) return;
          if ((e.target as HTMLElement).closest("[data-controls]")) return;
          const touch = e.touches[0];
          const deltaY = volumeGestureRef.current.startY - touch.clientY;
          // Require 20px of vertical movement to activate (5B)
          if (!volumeGestureRef.current.active && Math.abs(deltaY) < 20) return;
          // touch-action: none on the container already prevents scrolling, so no preventDefault needed
          volumeGestureRef.current.active = true;
          const rect = containerRef.current?.getBoundingClientRect();
          const height = rect?.height || 400;
          // Full swipe across half the screen height = full volume range
          const volumeDelta = deltaY / (height * 0.5);
          const newVol = Math.max(0, Math.min(1, volumeGestureRef.current.startVolume + volumeDelta));
          if (videoRef.current) {
            videoRef.current.volume = newVol;
            videoRef.current.muted = newVol === 0;
          }
          setVolume(newVol);
          setMuted(newVol === 0);
          setVolumeGestureValue(newVol);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        }}
        onTouchEnd={(e) => {
          const wasVolumeGesture = volumeGestureRef.current?.active;
          volumeGestureRef.current = null;
          if (wasVolumeGesture) {
            setVolumeGestureValue(null);
            showControlsTemporarily();
            return;
          }
          handleTouchTap(e);
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          crossOrigin="anonymous"
          style={{
            width: "100%", height: "100%", objectFit: "contain", background: "#000",
            opacity: transitioning2 ? 0 : 1,
            transition: "opacity 200ms ease",
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={() => setIsLoading(true)}
          onCanPlay={() => { setIsLoading(false); setTransitioning2(false); }}
          onError={() => {
            // Error recovery (4A): wait 2s then reload from current position
            const video = videoRef.current;
            if (!video) return;
            setShowReconnecting(true);
            setTimeout(() => {
              setShowReconnecting(false);
              if (isStreamed) {
                seekStream(video.currentTime + streamOffsetRef.current);
              } else {
                const pos = video.currentTime;
                video.load();
                video.addEventListener("loadedmetadata", () => {
                  video.currentTime = pos;
                  safePlay(video);
                }, { once: true });
              }
            }, 2000);
          }}
          onEnded={() => {
            setPlaying(false);
            setShowControls(true);
            // If countdown is already running, let it finish
            if (countdownRef.current) return;
            // If there's no next episode, just stop
            const next = onNextRef.current;
            if (!next || !hasNextRef.current) return;
            // Otherwise advance immediately
            transitioningRef.current = true;
            next();
          }}
          onPlay={() => { transitioningRef.current = false; setPlaying(true); }}
          onPause={() => { if (!transitioningRef.current) setPlaying(false); }}
        >
          {subtitles?.map((sub, i) => (
            <track
              key={sub.src}
              kind="subtitles"
              label={sub.label}
              srcLang={sub.language || "und"}
              src={`/api/subtitles?src=${encodeURIComponent(sub.src)}`}
              default={i === 0 && ccEnabled}
            />
          ))}
        </video>

        {/* Click area overlay for play/pause */}
        <div data-click-area style={{ position: "absolute", inset: 0, zIndex: 1 }} />

        {/* Loading spinner */}
        {isLoading && playing && <LoadingSpinner />}

        {/* Reconnecting indicator (4A) */}
        {showReconnecting && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(20,20,28,0.9)", backdropFilter: "blur(12px)",
            color: "#fff", padding: "12px 24px", borderRadius: "8px",
            fontSize: "0.9rem", fontWeight: 600, zIndex: 15,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            Reconnecting...
          </div>
        )}

        {/* Skip feedback */}
        {skipFeedback && <SkipFeedback key={skipFeedback.key} side={skipFeedback.side} seconds={skipFeedback.seconds} />}

        {/* Volume swipe gesture overlay */}
        {volumeGestureValue !== null && (
          <div style={{
            position: "absolute", top: "50%", right: "12%",
            transform: "translateY(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
            pointerEvents: "none", zIndex: 6,
          }}>
            <div style={{
              width: "36px", height: "140px",
              background: "rgba(0,0,0,0.5)", borderRadius: "18px",
              position: "relative", overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.15)",
            }}>
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                height: `${volumeGestureValue * 100}%`,
                background: "rgba(255,255,255,0.85)",
                borderRadius: "0 0 18px 18px",
                transition: "height 0.05s ease",
              }} />
            </div>
            <span style={{
              color: "#fff", fontSize: "0.9rem", fontWeight: 700,
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}>
              {Math.round(volumeGestureValue * 100)}%
            </span>
          </div>
        )}

        {/* Speed change indicator */}
        {speedIndicator && (
          <div key={speedIndicator.key} style={{
            position: "absolute", top: "12%", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(20,20,28,0.85)", backdropFilter: "blur(12px)",
            color: "#fff", padding: "8px 20px", borderRadius: "8px",
            fontSize: "1rem", fontWeight: 700, pointerEvents: "none", zIndex: 6,
            border: "1px solid rgba(255,255,255,0.1)",
            animation: "vpFadeOut 1.2s ease 0.5s forwards",
          }}>
            {speedIndicator.speed === 1 ? "Normal Speed" : `${speedIndicator.speed}x Speed`}
          </div>
        )}

        {/* Skip Intro button */}
        {showSkipIntro && (
          <button className="vp-skip-btn" onClick={skipIntro} style={{
            position: "absolute", bottom: "100px", right: "40px", zIndex: 20,
            background: "rgba(255,255,255,0.92)", color: "#000",
            border: "none", borderRadius: "4px",
            padding: "10px 24px", fontSize: "0.95rem", fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.5px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.92)"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            Skip Intro
          </button>
        )}

        {/* Skip Outro / Next Episode button */}
        {showSkipOutro && hasNext && countdown === null && (
          <button className="vp-skip-btn" onClick={skipOutro} style={{
            position: "absolute", bottom: "100px", right: "40px", zIndex: 20,
            background: "rgba(255,255,255,0.92)", color: "#000",
            border: "none", borderRadius: "4px",
            padding: "10px 24px", fontSize: "0.95rem", fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.5px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.92)"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            Next Episode
          </button>
        )}

        {/* Countdown to next episode */}
        {countdown !== null && (
          <div className="vp-countdown" style={{
            position: "absolute", bottom: "80px", right: "40px", zIndex: 20,
            background: "rgba(20,20,28,0.92)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px",
            padding: "16px 24px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: "10px", minWidth: "200px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            animation: "vpSlideUp 0.3s ease",
          }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", fontWeight: 500 }}>
              {nextSrc ? `Up Next: ${parseEpisodeFromSrc(nextSrc) || "Next Episode"}` : "Next episode in"}
            </div>
            <div style={{
              color: "#fff", fontSize: "2.5rem", fontWeight: 800,
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}>
              {countdown}
            </div>
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <button onClick={cancelCountdown} style={{
                flex: 1, padding: "8px", borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
                color: "rgba(255,255,255,0.7)", fontSize: "0.82rem", fontWeight: 600,
                cursor: "pointer",
              }}>
                Cancel
              </button>
              <button onClick={() => { cancelCountdown(); if (onNext) onNext(); }} style={{
                flex: 1, padding: "8px", borderRadius: "6px",
                border: "none", background: "#3b82f6",
                color: "#fff", fontSize: "0.82rem", fontWeight: 600,
                cursor: "pointer",
              }}>
                Play Now
              </button>
            </div>
            {/* Progress ring */}
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", top: "-4px", right: "-4px", opacity: 0.6 }}>
              <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#3b82f6" strokeWidth="3"
                strokeDasharray={`${(2 * Math.PI * 16)}`}
                strokeDashoffset={`${(2 * Math.PI * 16) * (1 - (countdown / 10))}`}
                strokeLinecap="round"
                transform="rotate(-90 20 20)"
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
          </div>
        )}

        {/* Drag time overlay */}
        {dragging && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff", fontSize: "3.5rem", fontWeight: 800,
            textShadow: "0 4px 24px rgba(0,0,0,0.7)",
            pointerEvents: "none", fontVariantNumeric: "tabular-nums", zIndex: 5,
            letterSpacing: "-1px",
          }}>
            {formatTime(dragTime)}
          </div>
        )}

        {/* Center play/pause icon */}
        {!playing && showControls && !dragging && !isLoading && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "72px", height: "72px",
            background: "rgba(59,130,246,0.85)",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", zIndex: 5,
            animation: "vpPulse 2s ease infinite",
            boxShadow: "0 0 40px rgba(59,130,246,0.4)",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><polygon points="8,4 20,12 8,20"/></svg>
          </div>
        )}

        {/* ── Top bar ── */}
        <div data-controls style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          padding: "16px 24px",
          background: "linear-gradient(rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
          display: "flex", alignItems: "center", gap: "16px",
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(-8px)",
          transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: showControls ? "auto" : "none",
        }}>
          <button className="vp-ctrl-btn" onClick={onHide} style={{ marginRight: "4px" }}>
            <IconBack />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 600, letterSpacing: "-0.2px" }}>{title}</span>
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div data-controls style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
          padding: "0 20px 16px",
          background: "linear-gradient(transparent 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.85) 100%)",
          opacity: showControls || dragging ? 1 : 0,
          transform: (showControls || dragging) ? "translateY(0)" : "translateY(8px)",
          transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: (showControls || dragging) ? "auto" : "none",
        }}>

          {/* ── Progress bar (outer touch target) ── */}
          <div
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
            onTouchStart={handleProgressTouchStart}
            onMouseMove={(e) => { handleProgressHover(e); setProgressHovered(true); }}
            onMouseLeave={handleProgressLeave}
            onMouseEnter={() => setProgressHovered(true)}
            style={{
              width: "100%",
              padding: "20px 0",
              marginBottom: "0px",
              cursor: "pointer",
              position: "relative",
              touchAction: "none",
            }}
          >
          {/* Visual bar */}
          <div style={{
              width: "100%",
              height: (dragging || progressHovered) ? "8px" : "4px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "4px",
              position: "relative",
              transition: "height 0.15s ease",
              pointerEvents: "none",
            }}
          >
            {/* Hover tooltip */}
            {hoverTime !== null && !dragging && (
              <div style={{
                position: "absolute", bottom: "18px",
                left: `${hoverX}px`, transform: "translateX(-50%)",
                background: "rgba(20,20,28,0.92)", backdropFilter: "blur(8px)",
                color: "#fff", padding: "4px 10px", borderRadius: "6px",
                fontSize: "0.78rem", fontWeight: 600, pointerEvents: "none",
                whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Drag tooltip */}
            {dragging && (
              <div style={{
                position: "absolute", bottom: "20px",
                left: `${dragX}px`, transform: "translateX(-50%)",
                background: "rgba(59,130,246,0.92)", backdropFilter: "blur(8px)",
                color: "#fff", padding: "5px 12px", borderRadius: "6px",
                fontSize: "0.82rem", fontWeight: 700, pointerEvents: "none",
                whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
              }}>
                {formatTime(dragTime)}
              </div>
            )}

            {/* Buffered */}
            <div style={{
              position: "absolute", top: 0, left: 0, height: "100%",
              width: `${bufferedProgress}%`,
              background: isStreamed
                ? "rgba(255,255,255,0.25)"
                : "rgba(255,255,255,0.2)",
              borderRadius: "4px",
              transition: "width 0.5s ease",
            }} />

            {/* Played */}
            <div style={{
              position: "absolute", top: 0, left: 0, height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
              borderRadius: "4px",
              boxShadow: "0 0 8px rgba(59,130,246,0.4)",
            }} />

            {/* Scrubber handle */}
            <div style={{
              position: "absolute", top: "50%",
              left: `${progress}%`,
              transform: "translate(-50%, -50%)",
              width: (dragging || progressHovered) ? "16px" : (isTouchDeviceRef.current ? "12px" : "0px"),
              height: (dragging || progressHovered) ? "16px" : (isTouchDeviceRef.current ? "12px" : "0px"),
              borderRadius: "50%",
              background: "#fff",
              transition: "all 0.15s ease",
              boxShadow: "0 0 8px rgba(0,0,0,0.4), 0 0 16px rgba(59,130,246,0.3)",
            }} />
          </div>
          </div>

          {/* ── Control buttons ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
              {/* Play/Pause */}
              <button className="vp-ctrl-btn" onClick={togglePlay}>
                {playing ? <IconPause /> : <IconPlay />}
                <span className="vp-tooltip">{playing ? "Pause (k)" : "Play (k)"}</span>
              </button>

              {/* Skip back */}
              <button className="vp-ctrl-btn" onClick={() => skip(-10)}>
                <IconSkipBack />
                <span className="vp-tooltip">-10s (j)</span>
              </button>

              {/* Skip forward */}
              <button className="vp-ctrl-btn" onClick={() => skip(10)}>
                <IconSkipForward />
                <span className="vp-tooltip">+10s (l)</span>
              </button>

              {/* Next episode */}
              {onNext && (
                <button className="vp-ctrl-btn" onClick={onNext}>
                  <IconNext />
                  <span className="vp-tooltip">Next (n)</span>
                </button>
              )}

              {/* Volume */}
              <div className="vp-volume-wrapper" style={{ display: "flex", alignItems: "center", position: "relative" }}
                onMouseEnter={() => { if (!isTouchDeviceRef.current) { setShowVolumeSlider(true); if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current); } }}
                onMouseLeave={() => { if (!isTouchDeviceRef.current) { volumeTimeoutRef.current = window.setTimeout(() => setShowVolumeSlider(false), 800); } }}
              >
                <button className="vp-ctrl-btn" onClick={() => {
                  if (isTouchDeviceRef.current) {
                    setShowVolumeSlider((v) => !v);
                    setShowSettingsMenu(false);
                    setShowCcMenu(false);
                    setShowAudioMenu(false);
                  } else {
                    toggleMute();
                  }
                }}>
                  {muted || volume === 0 ? <IconVolumeMuted /> : volume < 0.5 ? <IconVolumeLow /> : <IconVolumeHigh />}
                </button>
                {/* Desktop: horizontal slider */}
                <div className="vp-volume-horizontal" style={{
                  width: showVolumeSlider ? "100px" : "0px",
                  overflow: "hidden",
                  transition: "width 0.2s ease",
                  display: "flex", alignItems: "center",
                  paddingRight: showVolumeSlider ? "8px" : "0px",
                }}>
                  <input
                    type="range" min="0" max="1" step="0.02"
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="vp-volume-track"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(muted ? 0 : volume) * 100}%)`,
                    }}
                  />
                </div>
                {/* Mobile: vertical popup slider */}
                {showVolumeSlider && (
                  <div className="vp-volume-popup"
                    onTouchStart={(e) => { e.stopPropagation(); if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); }}
                    onTouchMove={(e) => { e.stopPropagation(); }}
                    onTouchEnd={(e) => { e.stopPropagation(); }}
                    style={{
                    position: "absolute", bottom: "calc(100% + 12px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(20,20,28,0.96)", backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px",
                    padding: "16px 12px", display: "none", flexDirection: "column",
                    alignItems: "center", gap: "10px", minHeight: "140px",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                    animation: "vpSlideUp 0.2s ease",
                  }}>
                    <input
                      type="range" min="0" max="1" step="0.02"
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="vp-volume-track"
                      style={{
                        writingMode: "vertical-lr",
                        direction: "rtl",
                        width: "6px", height: "120px",
                        background: `linear-gradient(to top, #3b82f6 ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(muted ? 0 : volume) * 100}%)`,
                      }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.72rem", fontWeight: 600 }}>
                      {Math.round((muted ? 0 : volume) * 100)}%
                    </span>
                    <button className="vp-speed-btn" onClick={toggleMute} style={{ padding: "6px 12px", fontSize: "0.78rem", justifyContent: "center" }}>
                      {muted ? "Unmute" : "Mute"}
                    </button>
                  </div>
                )}
              </div>

              {/* Time */}
              <span style={{
                color: "rgba(255,255,255,0.7)", fontSize: "0.82rem",
                marginLeft: "8px", fontVariantNumeric: "tabular-nums",
                fontWeight: 500, letterSpacing: "0.3px",
              }}>
                {formatTime(displayTime)}
                <span style={{ color: "rgba(255,255,255,0.35)", margin: "0 4px" }}>/</span>
                {formatTime(duration)}
              </span>
            </div>

            {/* Episode info (center) */}
            {episodeLabel && (
              <div className="vp-hide-mobile" style={{
                flex: 1, textAlign: "center", minWidth: 0,
                color: "rgba(255,255,255,0.7)", fontSize: "0.82rem",
                fontWeight: 500, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                padding: "0 12px",
              }}>
                {episodeLabel}
              </div>
            )}

            {/* Right controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
              {/* Remaining time badge */}
              {playing && duration > 0 && (
                <span className="vp-hide-mobile" style={{
                  color: "rgba(255,255,255,0.45)", fontSize: "0.78rem",
                  fontVariantNumeric: "tabular-nums", marginRight: "4px",
                }}>
                  -{formatTime(remaining)}
                </span>
              )}

              {/* Settings (speed) */}
              <div style={{ position: "relative" }}>
                <button className="vp-ctrl-btn" onClick={() => { setShowSettingsMenu((v) => !v); setShowCcMenu(false); setShowAudioMenu(false); setShowVolumeSlider(false); }}
                  style={{ fontSize: "0.82rem", fontWeight: 600, gap: "4px", display: "flex", alignItems: "center" }}>
                  <IconSettings />
                  {playbackRate !== 1 && <span style={{ fontSize: "0.72rem", color: "#3b82f6" }}>{playbackRate}x</span>}
                  <span className="vp-tooltip">Settings</span>
                </button>

                {showSettingsMenu && (
                  <div className="vp-settings-panel">
                    <div style={{ padding: "6px 16px 8px", color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>
                      Speed
                    </div>
                    {speeds.map((s) => (
                      <button key={s} className={`vp-speed-btn${s === playbackRate ? " active" : ""}`} onClick={() => changeSpeed(s)}>
                        <span>{s === 1 ? "Normal" : `${s}x`}</span>
                        {s === playbackRate && <span style={{ fontSize: "0.9rem" }}>&#10003;</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Restart */}
              <button className="vp-ctrl-btn vp-hide-mobile" onClick={restartFromBeginning}>
                <IconRestart />
                <span className="vp-tooltip">Restart</span>
              </button>

              {/* Closed Captions */}
              <div style={{ position: "relative" }}>
                <button className="vp-ctrl-btn" onClick={toggleCC}
                  style={{ opacity: ccAvailable ? 1 : 0.4 }}>
                  <IconCC active={ccEnabled} />
                  <span className="vp-tooltip">{ccEnabled ? "CC Off (c)" : "CC On (c)"}</span>
                </button>
                {showCcMenu && subtitles && subtitles.length > 0 && (
                  <div className="vp-settings-panel" style={{ right: 0 }}>
                    <div style={{ padding: "6px 16px 8px", color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>
                      Subtitles
                    </div>
                    <button className={`vp-speed-btn${activeTrackIndex === -1 ? " active" : ""}`} onClick={disableCC}>
                      <span>Off</span>
                      {activeTrackIndex === -1 && <span style={{ fontSize: "0.9rem" }}>&#10003;</span>}
                    </button>
                    {subtitles.map((sub, i) => (
                      <button key={sub.src} className={`vp-speed-btn${activeTrackIndex === i ? " active" : ""}`} onClick={() => selectCcTrack(i)}>
                        <span>{sub.label}</span>
                        {activeTrackIndex === i && <span style={{ fontSize: "0.9rem" }}>&#10003;</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Audio Track Selector */}
              {isStreamed && audioTracks.length > 1 && (
                <div style={{ position: "relative" }}>
                  <button className="vp-ctrl-btn" onClick={() => { setShowAudioMenu((v) => !v); setShowSettingsMenu(false); setShowCcMenu(false); setShowVolumeSlider(false); }}>
                    <IconAudio active={activeAudioTrack > 0} />
                    <span className="vp-tooltip">Audio (a)</span>
                  </button>
                  {showAudioMenu && (
                    <div className="vp-settings-panel" style={{ right: 0 }}>
                      <div style={{ padding: "6px 16px 8px", color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>
                        Audio
                      </div>
                      {audioTracks.map((track, i) => {
                        const label = track.title
                          ? track.title
                          : track.language !== "und"
                            ? track.language.toUpperCase()
                            : `Track ${i + 1}`;
                        const channelInfo = track.channels > 2
                          ? ` (${track.channelLayout || `${track.channels}ch`})`
                          : "";
                        return (
                          <button key={track.index} className={`vp-speed-btn${i === activeAudioTrack ? " active" : ""}`} onClick={() => selectAudioTrack(i)}>
                            <span>{label}{channelInfo}</span>
                            {i === activeAudioTrack && <span style={{ fontSize: "0.9rem" }}>&#10003;</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PiP */}
              <button className="vp-ctrl-btn vp-hide-mobile" onClick={togglePip}>
                <IconPip />
                <span className="vp-tooltip">{isPip ? "Exit PiP (p)" : "PiP (p)"}</span>
              </button>

              {/* Fullscreen */}
              <button className="vp-ctrl-btn" onClick={toggleFullscreen}>
                {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
                <span className="vp-tooltip">{isFullscreen ? "Exit Fullscreen (f)" : "Fullscreen (f)"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
