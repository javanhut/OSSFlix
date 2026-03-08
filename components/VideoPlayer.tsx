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
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#6366f1" : "#fff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <path d="M10 10.5c-.5-.7-1.2-1-2-1-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-1"/>
    <path d="M19 10.5c-.5-.7-1.2-1-2-1-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-1"/>
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
        borderTopColor: "#6366f1",
        borderRadius: "50%",
        animation: "vpSpin 0.8s linear infinite",
      }} />
    </div>
  );
}

export default function VideoPlayer({ show, onHide, src, title, dirPath, initialTime, onNext, onProgress, timings, hasNext, profileId, subtitles }: VideoPlayerProps) {
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

  // Skip feedback
  const [skipFeedback, setSkipFeedback] = useState<{ side: "left" | "right"; key: number } | null>(null);

  // CC state
  const [ccEnabled, setCcEnabled] = useState(false);
  const [ccAvailable, setCcAvailable] = useState(false);
  const [showCcMenu, setShowCcMenu] = useState(false);
  const [activeTrackIndex, setActiveTrackIndex] = useState(-1);

  // Dragging state
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [progressHovered, setProgressHovered] = useState(false);
  const wasPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const seekLockRef = useRef(false);
  const transitioningRef = useRef(false);

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

  // Hover tooltip state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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
    const ct = video.currentTime;
    const dur = video.duration;
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
    // Clear countdown when src changes
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    setShowSkipIntro(false);
    setShowSkipOutro(false);
  }, [src]);

  const videoSrc = useMemo(() => {
    const ext = src.split(".").pop()?.toLowerCase();
    if (ext === "mkv" || ext === "avi" || ext === "wmv") {
      return `/api/stream?src=${encodeURIComponent(src)}`;
    }
    return src;
  }, [src]);

  const resetState = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setShowControls(true);
    setShowSettingsMenu(false);
    setShowCcMenu(false);
    setDragging(false);
    setHoverTime(null);
    setIsLoading(true);
    setShowVolumeSlider(false);
    setSkipFeedback(null);
    setShowSkipIntro(false);
    setShowSkipOutro(false);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
  }, []);

  // ── Show / hide lifecycle ──
  useEffect(() => {
    if (!show) {
      const video = videoRef.current;
      if (video && currentSrcRef.current) {
        const ct = video.currentTime;
        const dur = video.duration;
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
      }
    } else {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container && !document.fullscreenElement) {
          container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        }
      });
    }
  }, [show, resetState]);

  // ── Controls auto-hide ──
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing && !dragging) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
        setShowSettingsMenu(false);
        setShowCcMenu(false);
        setShowVolumeSlider(false);
      }, 2500);
    }
  }, [playing, dragging]);

  // ── Playback ──
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
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
    video.currentTime = 0;
    setCurrentTime(0);
    video.play();
    setPlaying(true);
    showControlsTemporarily();
  };

  const skipIntro = () => {
    const video = videoRef.current;
    const t = timingsRef.current;
    if (!video || !t?.intro_end) return;
    video.currentTime = t.intro_end;
    setCurrentTime(t.intro_end);
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
          if (next) { transitioningRef.current = true; next(); }
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
    const ct = video.currentTime;
    const dur = video.duration;
    setCurrentTime(ct);
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    const t = timingsRef.current;
    const next = hasNextRef.current;
    const hasOutroTiming = t?.outro_start != null && t?.outro_end != null;
    const hasIntroTiming = t?.intro_start != null && t?.intro_end != null;

    // Skip intro button
    if (hasIntroTiming) {
      setShowSkipIntro(ct >= t!.intro_start! && ct < t!.intro_end!);
    } else {
      setShowSkipIntro(false);
    }

    // Determine countdown trigger point
    let countdownTrigger = -1;
    if (hasOutroTiming) {
      // Start countdown 10s before outro starts
      countdownTrigger = t!.outro_start! - 10;
      if (countdownTrigger < 0) countdownTrigger = t!.outro_start!;

      // Show skip outro button when in outro region
      setShowSkipOutro(ct >= t!.outro_start! && ct < t!.outro_end!);
    } else {
      setShowSkipOutro(false);
      // No outro set: trigger 10s before video ends
      if (dur > 10) {
        countdownTrigger = dur - 10;
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

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    durationRef.current = video.duration;
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
    if (initialTime && initialTime > 0 && !initialTimeAppliedRef.current) {
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

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const { time, x } = getTimeFromXRef(e.clientX);
    setDragging(true);
    setDragTime(time);
    setDragX(x);
    wasPlayingRef.current = playing;
    if (videoRef.current) {
      if (!videoRef.current.paused) videoRef.current.pause();
      videoRef.current.currentTime = time;
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const { time, x } = getTimeFromXRef(e.clientX);
      setDragTime(time);
      setDragX(x);
      if (videoRef.current) videoRef.current.currentTime = time;
    };
    const handleMouseUp = (e: MouseEvent) => {
      const { time } = getTimeFromXRef(e.clientX);
      const video = videoRef.current;
      if (video) {
        seekLockRef.current = true;
        video.currentTime = time;
        setCurrentTime(time);
        const onSeeked = () => {
          seekLockRef.current = false;
          video.removeEventListener("seeked", onSeeked);
          if (wasPlayingRef.current) { video.play(); setPlaying(true); }
        };
        video.addEventListener("seeked", onSeeked);
        setTimeout(() => {
          if (seekLockRef.current) {
            seekLockRef.current = false;
            video.removeEventListener("seeked", onSeeked);
            if (wasPlayingRef.current) { video.play(); setPlaying(true); }
          }
        }, 2000);
      }
      setDragging(false);
      showControlsTemporarily();
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
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

  // ── Skip with feedback ──
  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    setSkipFeedback({ side: seconds > 0 ? "right" : "left", key: Date.now() });
    showControlsTemporarily();
  };

  // ── Fullscreen ──
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
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
        case ",": if (video.paused) { video.currentTime = Math.max(0, video.currentTime - 1/30); setCurrentTime(video.currentTime); } break;
        case ".": if (video.paused) { video.currentTime = Math.min(video.duration, video.currentTime + 1/30); setCurrentTime(video.currentTime); } break;
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

  // ── Double click sides to skip ──
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

  const displayTime = dragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;
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
        .vp-settings-panel { position: absolute; bottom: calc(100% + 8px); right: 0; background: rgba(20,20,28,0.96); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 6px; min-width: 180px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); animation: vpSlideUp 0.2s ease; }
        @keyframes vpSlideUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        .vp-speed-btn { width: 100%; padding: 8px 16px; border: none; background: transparent; color: rgba(255,255,255,0.7); font-size: 0.85rem; cursor: pointer; border-radius: 8px; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s ease; }
        .vp-speed-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .vp-speed-btn.active { color: #6366f1; font-weight: 600; }
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
        }}
        onMouseMove={showControlsTemporarily}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-controls]")) return;
          if ((e.target as HTMLElement).tagName === "VIDEO" || (e.target as HTMLElement).closest("[data-click-area]")) {
            togglePlay();
          }
        }}
        onDoubleClick={handleDoubleClick}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
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

        {/* Skip feedback */}
        {skipFeedback && <SkipFeedback key={skipFeedback.key} side={skipFeedback.side} seconds={10} />}

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
          <button onClick={skipIntro} style={{
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
          <button onClick={skipOutro} style={{
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
          <div style={{
            position: "absolute", bottom: "80px", right: "40px", zIndex: 20,
            background: "rgba(20,20,28,0.92)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px",
            padding: "16px 24px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: "10px", minWidth: "200px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            animation: "vpSlideUp 0.3s ease",
          }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", fontWeight: 500 }}>
              Next episode in
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
                border: "none", background: "#6366f1",
                color: "#fff", fontSize: "0.82rem", fontWeight: 600,
                cursor: "pointer",
              }}>
                Play Now
              </button>
            </div>
            {/* Progress ring */}
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", top: "-4px", right: "-4px", opacity: 0.6 }}>
              <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3"
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
            background: "rgba(99,102,241,0.85)",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", zIndex: 5,
            animation: "vpPulse 2s ease infinite",
            boxShadow: "0 0 40px rgba(99,102,241,0.4)",
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

          {/* ── Progress bar ── */}
          <div
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
            onMouseMove={(e) => { handleProgressHover(e); setProgressHovered(true); }}
            onMouseLeave={handleProgressLeave}
            onMouseEnter={() => setProgressHovered(true)}
            style={{
              width: "100%",
              height: (dragging || progressHovered) ? "8px" : "4px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "4px",
              cursor: "pointer",
              marginBottom: "12px",
              position: "relative",
              transition: "height 0.15s ease",
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
                background: "rgba(99,102,241,0.92)", backdropFilter: "blur(8px)",
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
              background: "rgba(255,255,255,0.2)",
              borderRadius: "4px",
              transition: "width 0.3s ease",
            }} />

            {/* Played */}
            <div style={{
              position: "absolute", top: 0, left: 0, height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #6366f1, #818cf8)",
              borderRadius: "4px",
              boxShadow: "0 0 8px rgba(99,102,241,0.4)",
            }} />

            {/* Scrubber handle */}
            <div style={{
              position: "absolute", top: "50%",
              left: `${progress}%`,
              transform: "translate(-50%, -50%)",
              width: (dragging || progressHovered) ? "16px" : "0px",
              height: (dragging || progressHovered) ? "16px" : "0px",
              borderRadius: "50%",
              background: "#fff",
              transition: "all 0.15s ease",
              boxShadow: "0 0 8px rgba(0,0,0,0.4), 0 0 16px rgba(99,102,241,0.3)",
            }} />
          </div>

          {/* ── Control buttons ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
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
              <div style={{ display: "flex", alignItems: "center", position: "relative" }}
                onMouseEnter={() => { setShowVolumeSlider(true); if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current); }}
                onMouseLeave={() => { volumeTimeoutRef.current = window.setTimeout(() => setShowVolumeSlider(false), 800); }}
              >
                <button className="vp-ctrl-btn" onClick={toggleMute}>
                  {muted || volume === 0 ? <IconVolumeMuted /> : volume < 0.5 ? <IconVolumeLow /> : <IconVolumeHigh />}
                </button>
                <div style={{
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
                      background: `linear-gradient(to right, #6366f1 ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(muted ? 0 : volume) * 100}%)`,
                    }}
                  />
                </div>
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

            {/* Right controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              {/* Remaining time badge */}
              {playing && duration > 0 && (
                <span style={{
                  color: "rgba(255,255,255,0.45)", fontSize: "0.78rem",
                  fontVariantNumeric: "tabular-nums", marginRight: "4px",
                }}>
                  -{formatTime(remaining)}
                </span>
              )}

              {/* Settings (speed) */}
              <div style={{ position: "relative" }}>
                <button className="vp-ctrl-btn" onClick={() => { setShowSettingsMenu((v) => !v); setShowCcMenu(false); }}
                  style={{ fontSize: "0.82rem", fontWeight: 600, gap: "4px", display: "flex", alignItems: "center" }}>
                  <IconSettings />
                  {playbackRate !== 1 && <span style={{ fontSize: "0.72rem", color: "#6366f1" }}>{playbackRate}x</span>}
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
              <button className="vp-ctrl-btn" onClick={restartFromBeginning}>
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

              {/* PiP */}
              <button className="vp-ctrl-btn" onClick={togglePip}>
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
