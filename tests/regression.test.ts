import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Regression tests ──
// These verify that specific fixes and improvements from the Video Player Quality Overhaul
// remain in place. They read source files directly and check for the expected patterns.

const INDEX_TS = readFileSync(resolve("./index.ts"), "utf-8");
const VIDEOPLAYER_TSX = readFileSync(resolve("./components/VideoPlayer.tsx"), "utf-8");
const CARD_TSX = readFileSync(resolve("./components/Card.tsx"), "utf-8");
const STYLES_CSS = readFileSync(resolve("./styles.css"), "utf-8");

describe("1A: aresample fix — no aggressive async correction", () => {
  test("index.ts does not contain async=1000", () => {
    expect(INDEX_TS).not.toContain("async=1000");
  });

  test("index.ts uses async=1:first_pts=0", () => {
    expect(INDEX_TS).toContain("aresample=async=1:first_pts=0");
  });
});

describe("1B: Audio bitrate increase", () => {
  test("stereo bitrate is 256k (not 192k)", () => {
    // Check that the old 192k is gone
    expect(INDEX_TS).not.toMatch(/audioChannels > 2 \? "384k" : "192k"/);
    // Check new bitrates are present
    expect(INDEX_TS).toContain('"448k"');
    expect(INDEX_TS).toContain('"256k"');
  });
});

describe("1C: Cache transcode quality — no zerolatency in cache", () => {
  test("cache transcode uses preset medium", () => {
    // Cache transcode should have -preset medium
    expect(INDEX_TS).toContain('"medium"');
  });

  test("cache transcode uses CRF 20", () => {
    expect(INDEX_TS).toContain('"-crf", "20"');
  });

  test("live transcode uses veryfast (not ultrafast)", () => {
    expect(INDEX_TS).toContain('"veryfast"');
    expect(INDEX_TS).not.toContain('"ultrafast"');
  });

  test("live transcode still has zerolatency", () => {
    expect(INDEX_TS).toContain('"zerolatency"');
  });
});

describe("1D: 5.1→stereo downmix filter", () => {
  test("index.ts has pan=stereo downmix filter", () => {
    expect(INDEX_TS).toContain("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE");
  });

  test("downmix preserves center channel (dialog)", () => {
    expect(INDEX_TS).toContain("0.5*FC");
  });

  test("downmix includes LFE (bass)", () => {
    expect(INDEX_TS).toContain("0.5*LFE");
  });
});

describe("1E: Audio normalization in cache transcode", () => {
  test("index.ts has loudnorm filter", () => {
    expect(INDEX_TS).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
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

  test("VideoPlayer fires prefetch at 75%", () => {
    expect(VIDEOPLAYER_TSX).toContain("dur * 0.75");
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

  test("stall timeout is 10 seconds", () => {
    expect(VIDEOPLAYER_TSX).toContain("10000");
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
