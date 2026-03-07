import { Modal } from "react-bootstrap";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

type VideoPlayerProps = {
  show: boolean;
  onHide: () => void;
  src: string;
  title: string;
  dirPath?: string;
  initialTime?: number;
  onNext?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({ show, onHide, src, title, dirPath, initialTime, onNext, onProgress }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Dragging state
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [dragX, setDragX] = useState(0);
  const wasPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const seekLockRef = useRef(false);
  const transitioningRef = useRef(false);

  // Hover tooltip state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const saveProgressRef = useRef<(force?: boolean) => void>(() => {});
  const lastSavedTimeRef = useRef(0);
  const initialTimeAppliedRef = useRef(false);
  const currentSrcRef = useRef(src);
  const currentDirRef = useRef(dirPath);

  // Keep refs in sync with props
  useEffect(() => {
    if (src) currentSrcRef.current = src;
    if (dirPath) currentDirRef.current = dirPath;
  }, [src, dirPath]);

  // Save progress to server
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
    fetch("/api/playback/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_src: videoSrcToSave,
        dir_path: currentDirRef.current || "",
        current_time: ct,
        duration: isFinite(dur) ? dur : 0,
      }),
    }).catch(() => {});
  };

  // Periodic progress saving every 5 seconds
  useEffect(() => {
    if (!show || !src) return;
    const interval = setInterval(() => saveProgressRef.current(), 5000);
    return () => clearInterval(interval);
  }, [show, src]);

  // Seek to initialTime when video loads
  useEffect(() => {
    initialTimeAppliedRef.current = false;
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
    setShowSpeedMenu(false);
    setDragging(false);
    setHoverTime(null);
  }, []);

  useEffect(() => {
    if (!show) {
      // Save progress before clearing video - use refs since props may already be stale
      const video = videoRef.current;
      if (video && currentSrcRef.current) {
        const ct = video.currentTime;
        const dur = video.duration;
        if (isFinite(ct) && ct > 0) {
          fetch("/api/playback/progress", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
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
      // Auto-fullscreen when player opens
      requestAnimationFrame(() => {
        const container = videoRef.current?.parentElement;
        if (container && !document.fullscreenElement) {
          container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        }
      });
    }
  }, [show, resetState]);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing && !dragging) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 1500);
    }
  }, [playing, dragging]);

  const togglePlay = (enterFullscreen = false) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
      if (enterFullscreen && !document.fullscreenElement) {
        const container = video.parentElement;
        if (container) {
          container.requestFullscreen();
          setIsFullscreen(true);
        }
      }
    } else {
      video.pause();
      setPlaying(false);
    }
    showControlsTemporarily();
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || dragging || seekLockRef.current) return;
    setCurrentTime(video.currentTime);
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    durationRef.current = video.duration;
    setBuffered(0);
    // Resume from saved position
    if (initialTime && initialTime > 0 && !initialTimeAppliedRef.current) {
      initialTimeAppliedRef.current = true;
      video.currentTime = Math.min(initialTime, video.duration - 1);
      setCurrentTime(video.currentTime);
    } else {
      setCurrentTime(0);
    }
  };

  // --- Progress bar: drag support ---
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
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
      videoRef.current.currentTime = time;
    }
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { time, x } = getTimeFromXRef(e.clientX);
      setDragTime(time);
      setDragX(x);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
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
          if (wasPlayingRef.current) {
            video.play();
            setPlaying(true);
          }
        };
        video.addEventListener("seeked", onSeeked);

        // Fallback in case seeked never fires
        setTimeout(() => {
          if (seekLockRef.current) {
            seekLockRef.current = false;
            video.removeEventListener("seeked", onSeeked);
            if (wasPlayingRef.current) {
              video.play();
              setPlaying(true);
            }
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

  // Hover tooltip on progress bar
  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    const { time, x } = getTimeFromXForRender(e.clientX);
    setHoverTime(time);
    setHoverX(x);
  };

  const handleProgressLeave = () => {
    if (!dragging) setHoverTime(null);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setMuted(val === 0);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const changeSpeed = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setShowSpeedMenu(false);
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    showControlsTemporarily();
  };

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement?.parentElement;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    if (!show) return;
    const handleKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          setVolume(video.volume);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          setVolume(video.volume);
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "Escape":
          e.preventDefault();
          onHide();
          break;
        case "j":
          skip(-10);
          break;
        case "l":
          skip(10);
          break;
      }
      showControlsTemporarily();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [show, playing]);

  const displayTime = dragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  const btnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: "1.1rem",
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      fullscreen
      className="bg-black"
      contentClassName="bg-black border-0"
      style={{ overflow: "hidden" }}
    >
      <div
        style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden", cursor: showControls ? "default" : "none" }}
        onMouseMove={showControlsTemporarily}
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName === "VIDEO") togglePlay();
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).tagName === "VIDEO") toggleFullscreen();
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => {
            if (onNext) {
              transitioningRef.current = true;
              setShowControls(false);
              onNext();
            } else {
              setPlaying(false);
              setShowControls(true);
            }
          }}
          onPlay={() => { transitioningRef.current = false; setPlaying(true); }}
          onPause={() => { if (!transitioningRef.current) setPlaying(false); }}
        />

        {/* Drag time overlay - large centered display */}
        {dragging && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#fff",
              fontSize: "3rem",
              fontWeight: 700,
              textShadow: "0 2px 12px rgba(0,0,0,0.8)",
              pointerEvents: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatTime(dragTime)}
          </div>
        )}

        {/* Top bar - title */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "16px 20px",
            background: "linear-gradient(rgba(0,0,0,0.7), transparent)",
            display: "flex",
            justifyContent: "flex-start",
            opacity: showControls ? 1 : 0,
            transition: "opacity 0.3s",
          }}
        >
          <span style={{ color: "#fff", fontSize: "1.2rem", fontWeight: 600 }}>{title}</span>
        </div>

        {/* Center play icon on pause */}
        {!playing && showControls && !dragging && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: "4rem",
              color: "rgba(255,255,255,0.8)",
              pointerEvents: "none",
            }}
          >
            &#9654;
          </div>
        )}

        {/* Bottom controls */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0 16px 12px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
            opacity: showControls || dragging ? 1 : 0,
            transition: "opacity 0.3s",
            pointerEvents: showControls || dragging ? "auto" : "none",
          }}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressHover}
            onMouseLeave={handleProgressLeave}
            style={{
              width: "100%",
              height: dragging ? "10px" : "6px",
              background: "rgba(255,255,255,0.2)",
              borderRadius: "5px",
              cursor: "pointer",
              marginBottom: "10px",
              position: "relative",
              transition: "height 0.15s",
            }}
          >
            {/* Hover tooltip */}
            {hoverTime !== null && !dragging && (
              <div
                style={{
                  position: "absolute",
                  bottom: "20px",
                  left: `${hoverX}px`,
                  transform: "translateX(-50%)",
                  background: "rgba(0,0,0,0.85)",
                  color: "#fff",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Drag tooltip on bar */}
            {dragging && (
              <div
                style={{
                  position: "absolute",
                  bottom: "20px",
                  left: `${dragX}px`,
                  transform: "translateX(-50%)",
                  background: "rgba(37,99,235,0.9)",
                  color: "#fff",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatTime(dragTime)}
              </div>
            )}

            {/* Buffered */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${bufferedProgress}%`,
                background: "rgba(255,255,255,0.3)",
                borderRadius: "5px",
              }}
            />
            {/* Played */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${progress}%`,
                background: "#2563eb",
                borderRadius: "5px",
              }}
            />
            {/* Scrubber handle */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: `${progress}%`,
                transform: "translate(-50%, -50%)",
                width: dragging ? "18px" : "14px",
                height: dragging ? "18px" : "14px",
                borderRadius: "50%",
                background: "#2563eb",
                border: "2px solid #fff",
                transition: "width 0.15s, height 0.15s",
                boxShadow: "0 0 4px rgba(0,0,0,0.5)",
              }}
            />
          </div>

          {/* Control buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button onClick={() => togglePlay(true)} style={btnStyle}>
                {playing ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><rect x="5" y="3" width="5" height="18" rx="1" /><rect x="14" y="3" width="5" height="18" rx="1" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
                )}
              </button>

              <button onClick={() => skip(-10)} style={btnStyle} title="Back 10s">
                &#8634; 10
              </button>

              <button onClick={() => skip(10)} style={btnStyle} title="Forward 10s">
                10 &#8635;
              </button>

              <button onClick={toggleMute} style={btnStyle}>
                {muted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#fff" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                ) : volume < 0.5 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#fff" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#fff" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                style={{ width: "80px", accentColor: "#2563eb" }}
              />

              <span style={{ color: "#fff", fontSize: "0.85rem", marginLeft: "8px", fontVariantNumeric: "tabular-nums" }}>
                {formatTime(displayTime)} / {formatTime(duration)}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "4px", position: "relative" }}>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowSpeedMenu((v) => !v)}
                  style={{ ...btnStyle, fontSize: "0.85rem" }}
                  title="Playback speed"
                >
                  {playbackRate}x
                </button>
                {showSpeedMenu && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      right: 0,
                      background: "rgba(30,30,30,0.95)",
                      borderRadius: "6px",
                      padding: "4px 0",
                      marginBottom: "4px",
                      minWidth: "80px",
                    }}
                  >
                    {speeds.map((s) => (
                      <button
                        key={s}
                        onClick={() => changeSpeed(s)}
                        style={{
                          ...btnStyle,
                          width: "100%",
                          justifyContent: "center",
                          fontSize: "0.85rem",
                          background: s === playbackRate ? "rgba(37,99,235,0.4)" : "transparent",
                          padding: "6px 12px",
                        }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={toggleFullscreen} style={{ ...btnStyle, fontSize: "0.85rem", gap: "4px" }} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                {isFullscreen ? (
                  <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,14 4,20 10,20" /><polyline points="20,10 20,4 14,4" /><line x1="14" y1="10" x2="20" y2="4" /><line x1="4" y1="20" x2="10" y2="14" /></svg> Exit Fullscreen</>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,3 21,3 21,9" /><polyline points="9,21 3,21 3,15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
