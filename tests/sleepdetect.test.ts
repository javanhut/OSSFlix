import { describe, test, expect } from "bun:test";
import { detectSleepPattern } from "../scripts/sleepdetect";

describe("detectSleepPattern", () => {
  const videos = [
    "/media/tvshows/show/ep1.mkv",
    "/media/tvshows/show/ep2.mkv",
    "/media/tvshows/show/ep3.mkv",
    "/media/tvshows/show/ep4.mkv",
    "/media/tvshows/show/ep5.mkv",
    "/media/tvshows/show/ep6.mkv",
  ];

  test("returns false when fewer than 3 entries", () => {
    const result = detectSleepPattern([], videos);
    expect(result.fellAsleep).toBe(false);
  });

  test("returns false when fewer than 3 completed episodes", () => {
    const entries = [
      { video_src: videos[0], current_time: 1200, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[1], current_time: 600, duration: 1200, updated_at: "2026-01-01 10:20:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(false);
  });

  test("detects sleep pattern with 3+ consecutive auto-played episodes", () => {
    // Episodes ~20 min (1200s) each, completed about 1200s apart = auto-play
    const entries = [
      { video_src: videos[0], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[1], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:20:00" },
      { video_src: videos[2], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:40:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(true);
    expect(result.resumeEpisode).toBe(videos[0]);
    expect(result.consecutiveCount).toBe(3);
  });

  test("detects sleep pattern with longer run", () => {
    const entries = [
      { video_src: videos[0], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[1], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:20:00" },
      { video_src: videos[2], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:40:00" },
      { video_src: videos[3], current_time: 1195, duration: 1200, updated_at: "2026-01-01 11:00:00" },
      { video_src: videos[4], current_time: 1195, duration: 1200, updated_at: "2026-01-01 11:20:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(true);
    expect(result.consecutiveCount).toBe(5);
  });

  test("returns false when gaps between episodes are too large (manual watching)", () => {
    // 1 hour gaps = not auto-played
    const entries = [
      { video_src: videos[0], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[1], current_time: 1195, duration: 1200, updated_at: "2026-01-01 11:00:00" },
      { video_src: videos[2], current_time: 1195, duration: 1200, updated_at: "2026-01-01 12:00:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(false);
  });

  test("ignores episodes not in the video list", () => {
    const entries = [
      {
        video_src: "/media/tvshows/other/ep1.mkv",
        current_time: 1195,
        duration: 1200,
        updated_at: "2026-01-01 10:00:00",
      },
      {
        video_src: "/media/tvshows/other/ep2.mkv",
        current_time: 1195,
        duration: 1200,
        updated_at: "2026-01-01 10:20:00",
      },
      {
        video_src: "/media/tvshows/other/ep3.mkv",
        current_time: 1195,
        duration: 1200,
        updated_at: "2026-01-01 10:40:00",
      },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(false);
  });

  test("ignores non-completed episodes (watched < duration - 5s)", () => {
    const entries = [
      { video_src: videos[0], current_time: 600, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[1], current_time: 600, duration: 1200, updated_at: "2026-01-01 10:20:00" },
      { video_src: videos[2], current_time: 600, duration: 1200, updated_at: "2026-01-01 10:40:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(false);
  });

  test("handles non-consecutive episode indices", () => {
    // Episodes 0, 2, 4 — not consecutive, should not detect
    const entries = [
      { video_src: videos[0], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[2], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:20:00" },
      { video_src: videos[4], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:40:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(false);
  });

  test("tolerates small timing variance (within 3 min)", () => {
    // Gap is 1200s + 120s (2 min off) — within 3 min tolerance
    const entries = [
      { video_src: videos[0], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:00:00" },
      { video_src: videos[1], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:22:00" },
      { video_src: videos[2], current_time: 1195, duration: 1200, updated_at: "2026-01-01 10:44:00" },
    ];
    const result = detectSleepPattern(entries, videos);
    expect(result.fellAsleep).toBe(true);
  });
});
