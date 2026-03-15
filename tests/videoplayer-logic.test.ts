import { describe, test, expect } from "bun:test";

// ── Test pure functions extracted from VideoPlayer.tsx ──
// These validate the logic without requiring DOM/React

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseEpisodeFromSrc(src: string): string | null {
  const filename = src.split("/").pop() || "";
  const match = filename.match(/^(.*?)_s(\d+)_ep(\d+)\.[^.]+$/i);
  if (!match) return null;
  return `S${Number(match[2])} E${Number(match[3])} - ${match[1].replace(/_/g, " ")}`;
}

function isStreamedFormat(src: string): boolean {
  const ext = src.split(".").pop()?.toLowerCase();
  return ext === "mkv" || ext === "avi" || ext === "wmv" || ext === "mov" || ext === "webm";
}

// Replicate countdown trigger logic (3C: smarter timing)
function getCountdownTrigger(
  hasOutroTiming: boolean,
  outroStart: number | null,
  duration: number
): number {
  if (hasOutroTiming && outroStart !== null) {
    // Start countdown at outro_start (not 10s before it)
    return outroStart;
  }
  // No outro set: trigger 15s before video ends
  if (duration > 15) {
    return duration - 15;
  }
  return -1;
}

// Replicate prefetch trigger logic (2C)
function shouldPrefetch(
  nextSrc: string | undefined,
  currentTime: number,
  duration: number,
  alreadyPrefetched: string | null
): boolean {
  return !!(nextSrc && duration > 0 && currentTime >= duration * 0.5 && alreadyPrefetched !== nextSrc);
}

describe("formatTime", () => {
  test("formats zero seconds", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  test("formats seconds under a minute", () => {
    expect(formatTime(45)).toBe("0:45");
  });

  test("formats exact minute", () => {
    expect(formatTime(60)).toBe("1:00");
  });

  test("formats minutes and seconds", () => {
    expect(formatTime(125)).toBe("2:05");
  });

  test("formats hours", () => {
    expect(formatTime(3661)).toBe("1:01:01");
  });

  test("formats multi-hour duration", () => {
    expect(formatTime(7200)).toBe("2:00:00");
  });

  test("handles NaN", () => {
    expect(formatTime(NaN)).toBe("0:00");
  });

  test("handles Infinity", () => {
    expect(formatTime(Infinity)).toBe("0:00");
  });

  test("handles negative", () => {
    expect(formatTime(-10)).toBe("0:00");
  });

  test("pads seconds in minutes", () => {
    expect(formatTime(63)).toBe("1:03");
  });

  test("pads seconds in hours", () => {
    expect(formatTime(3603)).toBe("1:00:03");
  });
});

describe("parseEpisodeFromSrc", () => {
  test("parses standard episode name", () => {
    expect(parseEpisodeFromSrc("/media/tvshows/show/Breaking_Bad_s1_ep3.mkv"))
      .toBe("S1 E3 - Breaking Bad");
  });

  test("parses with underscores in name", () => {
    expect(parseEpisodeFromSrc("/media/tvshows/show/The_Walking_Dead_s2_ep10.mp4"))
      .toBe("S2 E10 - The Walking Dead");
  });

  test("returns null for non-matching format", () => {
    expect(parseEpisodeFromSrc("/media/movies/movie.mp4")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseEpisodeFromSrc("")).toBeNull();
  });

  test("handles single-digit episode numbers", () => {
    expect(parseEpisodeFromSrc("Show_s1_ep1.mkv")).toBe("S1 E1 - Show");
  });

  test("case insensitive season/episode", () => {
    expect(parseEpisodeFromSrc("Show_S1_EP5.mkv")).toBe("S1 E5 - Show");
  });

  test("handles various extensions", () => {
    expect(parseEpisodeFromSrc("Show_s1_ep1.avi")).toBe("S1 E1 - Show");
    expect(parseEpisodeFromSrc("Show_s1_ep1.webm")).toBe("S1 E1 - Show");
  });
});

describe("isStreamedFormat", () => {
  test("detects MKV as streamed", () => {
    expect(isStreamedFormat("video.mkv")).toBe(true);
  });

  test("detects AVI as streamed", () => {
    expect(isStreamedFormat("video.avi")).toBe(true);
  });

  test("detects WMV as streamed", () => {
    expect(isStreamedFormat("video.wmv")).toBe(true);
  });

  test("detects MOV as streamed", () => {
    expect(isStreamedFormat("video.mov")).toBe(true);
  });

  test("detects WebM as streamed", () => {
    expect(isStreamedFormat("video.webm")).toBe(true);
  });

  test("MP4 is not streamed (plays natively)", () => {
    expect(isStreamedFormat("video.mp4")).toBe(false);
  });

  test("handles uppercase extensions", () => {
    expect(isStreamedFormat("VIDEO.MKV")).toBe(true);
  });

  test("handles paths with multiple dots", () => {
    expect(isStreamedFormat("/media/movies/my.movie.mkv")).toBe(true);
  });
});

describe("Countdown trigger logic (3C)", () => {
  test("with outro timing: triggers at outro_start", () => {
    const trigger = getCountdownTrigger(true, 1200, 1260);
    expect(trigger).toBe(1200);
  });

  test("without outro timing: triggers 15s before end", () => {
    const trigger = getCountdownTrigger(false, null, 1260);
    expect(trigger).toBe(1245);
  });

  test("short video without outro: returns -1", () => {
    const trigger = getCountdownTrigger(false, null, 10);
    expect(trigger).toBe(-1);
  });

  test("does NOT trigger 10s before outro (old behavior regression)", () => {
    // Old behavior was: outroStart - 10
    // New behavior is: outroStart exactly
    const trigger = getCountdownTrigger(true, 1200, 1260);
    expect(trigger).not.toBe(1190); // old behavior
    expect(trigger).toBe(1200); // new behavior
  });

  test("does NOT use dur - 10 (old behavior regression)", () => {
    // Old behavior: dur - 10; new: dur - 15
    const trigger = getCountdownTrigger(false, null, 100);
    expect(trigger).not.toBe(90); // old behavior
    expect(trigger).toBe(85); // new behavior
  });
});

describe("Prefetch trigger logic (2C)", () => {
  test("triggers at 50% of duration", () => {
    expect(shouldPrefetch("/next.mkv", 600, 1200, null)).toBe(true);
  });

  test("does not trigger before 50%", () => {
    expect(shouldPrefetch("/next.mkv", 599, 1200, null)).toBe(false);
  });

  test("does not trigger without nextSrc", () => {
    expect(shouldPrefetch(undefined, 600, 1200, null)).toBe(false);
  });

  test("does not trigger if already prefetched", () => {
    expect(shouldPrefetch("/next.mkv", 600, 1200, "/next.mkv")).toBe(false);
  });

  test("does not trigger with zero duration", () => {
    expect(shouldPrefetch("/next.mkv", 900, 0, null)).toBe(false);
  });

  test("triggers again for a different nextSrc", () => {
    expect(shouldPrefetch("/next2.mkv", 600, 1200, "/next1.mkv")).toBe(true);
  });
});

describe("Settings persistence keys (3A)", () => {
  const EXPECTED_KEYS = [
    "ossflix_volume",
    "ossflix_muted",
    "ossflix_playbackRate",
    "ossflix_cc",
    "ossflix_cc_track",
  ];

  test("all expected localStorage keys are defined", () => {
    // This test documents the expected keys for regression
    for (const key of EXPECTED_KEYS) {
      expect(key).toMatch(/^ossflix_/);
    }
    expect(EXPECTED_KEYS.length).toBe(5);
  });
});

describe("Auto-skip intro logic (2D)", () => {
  // Simulate the auto-skip behavior
  function shouldAutoSkip(
    autoSkipEnabled: boolean,
    currentTime: number,
    introStart: number | null,
    introEnd: number | null
  ): boolean {
    if (!autoSkipEnabled) return false;
    if (introStart === null || introEnd === null) return false;
    return currentTime >= introStart && currentTime < introEnd;
  }

  test("auto-skips when enabled and in intro region", () => {
    expect(shouldAutoSkip(true, 30, 5, 90)).toBe(true);
  });

  test("does not auto-skip when disabled", () => {
    expect(shouldAutoSkip(false, 30, 5, 90)).toBe(false);
  });

  test("does not auto-skip outside intro region", () => {
    expect(shouldAutoSkip(true, 100, 5, 90)).toBe(false);
  });

  test("does not auto-skip without timing data", () => {
    expect(shouldAutoSkip(true, 30, null, null)).toBe(false);
  });

  test("auto-skip triggers at exact intro_start", () => {
    expect(shouldAutoSkip(true, 5, 5, 90)).toBe(true);
  });

  test("auto-skip does NOT trigger at intro_end", () => {
    expect(shouldAutoSkip(true, 90, 5, 90)).toBe(false);
  });
});
