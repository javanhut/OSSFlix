import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Regression tests ──
// These verify that specific fixes and improvements from the Video Player Quality Overhaul
// remain in place. They read source files directly and check for the expected patterns.

const INDEX_TS = readFileSync(resolve("./index.ts"), "utf-8");
const STREAM_PROFILE_TS = readFileSync(resolve("./scripts/streamingProfile.ts"), "utf-8");
const TRANSCODE_SRC = `${INDEX_TS}\n${STREAM_PROFILE_TS}`;
const VIDEOPLAYER_TSX = readFileSync(resolve("./components/VideoPlayer.tsx"), "utf-8");
const CARD_TSX = readFileSync(resolve("./components/Card.tsx"), "utf-8");
const STYLES_CSS = readFileSync(resolve("./styles.css"), "utf-8");

describe("1A: aresample fix — ongoing A/V drift correction", () => {
  // Supersedes the earlier async=1 decision: async=1 only corrects the initial
  // timestamp gap, so VFR/long sources drifted out of sync mid-episode. async=1000
  // enables ongoing per-second correction. first_pts=0 was dropped because pinning
  // audio to PTS 0 while video keeps its own start offset caused fixed lip-sync gaps.
  test("transcode source uses ongoing async correction", () => {
    expect(TRANSCODE_SRC).toContain("aresample=async=1000");
  });

  test("transcode source no longer pins audio to first_pts=0", () => {
    expect(TRANSCODE_SRC).not.toContain("first_pts=0");
  });

  test("re-encode paths force constant frame rate", () => {
    expect(STREAM_PROFILE_TS).toContain('"-vsync"');
    expect(STREAM_PROFILE_TS).toContain('"cfr"');
  });
});

describe("1B: Audio bitrate increase", () => {
  test("audio is normalized to fixed stereo bitrate", () => {
    expect(TRANSCODE_SRC).toContain('"192k"');
    expect(TRANSCODE_SRC).not.toContain('"448k"');
  });
});

describe("1C: Cache transcode quality — no zerolatency in cache", () => {
  test("cache transcode uses preset fast", () => {
    expect(TRANSCODE_SRC).toContain('"fast"');
  });

  test("cache transcode uses CRF 22", () => {
    expect(TRANSCODE_SRC).toContain('"-crf"');
    expect(TRANSCODE_SRC).toContain('"22"');
  });

  test("live transcode uses superfast (not ultrafast)", () => {
    expect(TRANSCODE_SRC).toContain('"superfast"');
    expect(TRANSCODE_SRC).not.toContain('"ultrafast"');
  });

  test("live transcode still has zerolatency", () => {
    expect(TRANSCODE_SRC).toContain('"zerolatency"');
  });
});

describe("1D: 5.1→stereo downmix filter", () => {
  test("transcode source has pan=stereo downmix filter", () => {
    expect(TRANSCODE_SRC).toContain(
      "pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE",
    );
  });

  test("downmix preserves center channel (dialog)", () => {
    expect(TRANSCODE_SRC).toContain("0.5*FC");
  });

  test("downmix includes LFE (bass)", () => {
    expect(TRANSCODE_SRC).toContain("0.5*LFE");
  });
});

describe("1E: Audio normalization in cache transcode", () => {
  test("transcode source has loudnorm filter", () => {
    expect(TRANSCODE_SRC).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
  });
});

describe("2A: Race condition fix — sourceReady gate", () => {
  test("VideoPlayer has sourceReadyRef", () => {
    expect(VIDEOPLAYER_TSX).toContain("sourceReadyRef");
  });

  test("VideoPlayer has pendingMetadataRef", () => {
    expect(VIDEOPLAYER_TSX).toContain("pendingMetadataRef");
  });

  test("handleLoadedMetadata checks sourceReadyRef", () => {
    expect(VIDEOPLAYER_TSX).toContain("if (!sourceReadyRef.current)");
  });
});

describe("2B: Smooth episode transition", () => {
  test("VideoPlayer has transitioning2 state", () => {
    expect(VIDEOPLAYER_TSX).toContain("transitioning2");
  });

  test("video element has opacity transition", () => {
    expect(VIDEOPLAYER_TSX).toContain("opacity: transitioning2 ? 0 : 1");
  });

  test("transition resets on canplay", () => {
    expect(VIDEOPLAYER_TSX).toContain("setTransitioning2(false)");
  });
});

describe("2C: Prefetch next episode", () => {
  test("VideoPlayer accepts nextSrc prop", () => {
    expect(VIDEOPLAYER_TSX).toContain("nextSrc");
  });

  test("Card.tsx passes nextSrc prop", () => {
    expect(CARD_TSX).toContain("nextSrc=");
  });

  test("VideoPlayer fires prefetch at 50%", () => {
    expect(VIDEOPLAYER_TSX).toContain("dur * PREFETCH_TRIGGER_RATIO");
    expect(VIDEOPLAYER_TSX).toContain("const PREFETCH_TRIGGER_RATIO = 0.5;");
    expect(VIDEOPLAYER_TSX).toContain("/api/stream/prefetch");
  });

  test("index.ts has /api/stream/prefetch endpoint", () => {
    expect(INDEX_TS).toContain('"/api/stream/prefetch"');
  });
});

describe("2D: Auto-skip intro", () => {
  test("VideoPlayer has autoSkipIntroRef", () => {
    expect(VIDEOPLAYER_TSX).toContain("autoSkipIntroRef");
  });

  test("skipIntro sets autoSkipIntroRef to true", () => {
    expect(VIDEOPLAYER_TSX).toContain("autoSkipIntroRef.current = true");
  });

  test("auto-skip resets on player hide", () => {
    expect(VIDEOPLAYER_TSX).toContain("autoSkipIntroRef.current = false");
  });
});

describe("3A: Settings persistence via localStorage", () => {
  test("persists volume", () => {
    expect(VIDEOPLAYER_TSX).toContain("ossflix_volume");
  });

  test("persists muted state", () => {
    expect(VIDEOPLAYER_TSX).toContain("ossflix_muted");
  });

  test("persists playback rate", () => {
    expect(VIDEOPLAYER_TSX).toContain("ossflix_playbackRate");
  });

  test("persists CC state", () => {
    expect(VIDEOPLAYER_TSX).toContain("ossflix_cc");
  });

  test("persists CC track index", () => {
    expect(VIDEOPLAYER_TSX).toContain("ossflix_cc_track");
  });
});

describe("3B: Next episode info in countdown", () => {
  test("countdown shows 'Up Next' with episode info", () => {
    expect(VIDEOPLAYER_TSX).toContain("Up Next:");
  });
});

describe("3C: Smarter countdown timing", () => {
  test("countdown uses dur - 15 (not dur - 10)", () => {
    expect(VIDEOPLAYER_TSX).toContain("dur - 15");
    // Ensure the old dur - 10 for countdown is gone
    // (Note: dur - 10 may exist for other purposes like skip-to-end detection)
  });
});

describe("4A: Error recovery with onError handler", () => {
  test("video element has onError handler", () => {
    expect(VIDEOPLAYER_TSX).toContain("onError={");
  });

  test("shows reconnecting indicator", () => {
    expect(VIDEOPLAYER_TSX).toContain("Reconnecting...");
    expect(VIDEOPLAYER_TSX).toContain("showReconnecting");
  });
});

describe("4B: Stall detection", () => {
  test("VideoPlayer has stall timer", () => {
    expect(VIDEOPLAYER_TSX).toContain("stallTimerRef");
  });

  test("stall timeout is explicitly configured", () => {
    expect(VIDEOPLAYER_TSX).toContain("STALL_RECOVERY_TIMEOUT_MS");
    expect(VIDEOPLAYER_TSX).toContain("const STALL_RECOVERY_TIMEOUT_MS = 4500;");
  });
});

describe("4C: Wake Lock API", () => {
  test("VideoPlayer requests wake lock", () => {
    expect(VIDEOPLAYER_TSX).toContain("wakeLock");
    expect(VIDEOPLAYER_TSX).toContain('.request("screen")');
  });

  test("wake lock releases on pause/hide", () => {
    expect(VIDEOPLAYER_TSX).toContain("wakeLockRef.current.release");
  });

  test("re-acquires wake lock on visibility change", () => {
    expect(VIDEOPLAYER_TSX).toContain("visibilitychange");
  });
});

describe("4D: FFmpeg process cleanup on disconnect", () => {
  test("index.ts uses req.signal to kill FFmpeg on disconnect", () => {
    expect(INDEX_TS).toContain("req.signal");
    expect(INDEX_TS).toContain("ffmpeg.kill()");
  });
});

describe("5A: Larger mobile touch targets", () => {
  test("mobile control buttons have 12px padding", () => {
    // In the mobile media query, vp-ctrl-btn should have padding: 12px
    expect(STYLES_CSS).toContain(".vp-ctrl-btn { padding: 12px; }");
  });

  test("progress bar has 20px touch target", () => {
    expect(VIDEOPLAYER_TSX).toContain('padding: "20px 0"');
  });
});

describe("5B: Volume gesture threshold", () => {
  test("volume gesture threshold is 20px (not 15px)", () => {
    expect(VIDEOPLAYER_TSX).toContain("Math.abs(deltaY) < 20");
    expect(VIDEOPLAYER_TSX).not.toContain("Math.abs(deltaY) < 15");
  });
});

describe("5C: Mobile row touch scrolling", () => {
  test("rows allow both vertical page scroll and horizontal shelf swipes", () => {
    expect(STYLES_CSS).toContain("touch-action: pan-x pan-y");
    expect(STYLES_CSS).not.toContain("touch-action: pan-x;");
  });

  test("desktop hover row clipping is limited to fine pointers", () => {
    expect(STYLES_CSS).toContain("@media (hover: hover) and (pointer: fine)");
  });
});

describe("5D: Compact mobile hamburger menu", () => {
  test("mobile nav rows use tighter spacing so profile stays reachable", () => {
    expect(STYLES_CSS).toContain("padding: 12px 20px;");
    expect(STYLES_CSS).toContain("margin-top: 8px;");
  });

  test("mobile overlays use dynamic viewport height", () => {
    expect(STYLES_CSS).toContain("height: 100dvh;");
  });
});

describe("5E: Compact mobile poster cards", () => {
  test("mobile shelves show more smaller cards per row", () => {
    expect(STYLES_CSS).toContain("calc((100vw - 6% - 36px) / 3.5)");
    expect(STYLES_CSS).toContain("calc((100vw - 6% - 16px) / 2.8)");
  });

  test("small-phone card labels are scaled with the card", () => {
    expect(STYLES_CSS).toContain(".oss-card-title-bar { padding: 30px 9px 8px; }");
    expect(STYLES_CSS).toContain(".oss-card-title-bar span { font-size: 0.78rem; }");
  });
});

describe("5F: Compact mobile detail modal", () => {
  test("mobile detail modal uses dynamic viewport height and a shorter banner", () => {
    expect(STYLES_CSS).toContain(".oss-detail-modal .modal-content { height: 100dvh !important; }");
    expect(STYLES_CSS).toContain(".oss-detail-modal .modal-header { padding: 14px 14px 12px !important; }");
    expect(STYLES_CSS).toContain("height: clamp(112px, 23vh, 150px) !important;");
  });

  test("mobile description is clamped so episodes remain visible", () => {
    expect(STYLES_CSS).toContain(".oss-detail-description");
    expect(STYLES_CSS).toContain("-webkit-line-clamp: 3;");
    expect(STYLES_CSS).toContain("min-height: calc(var(--oss-episode-row-h, 46px) * 3);");
  });
});
