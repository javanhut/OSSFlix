import { describe, expect, test } from "bun:test";
import { buildCacheTranscodeArgs, buildLiveTranscodeArgs, selectAudioStream } from "../scripts/streamingProfile";

describe("selectAudioStream", () => {
  const streams = [
    { index: 0, codec_type: "video" },
    { index: 1, codec_type: "audio", channels: 2 },
    { index: 2, codec_type: "audio", channels: 6 },
  ];

  test("picks requested audio stream by ordinal index", () => {
    const selected = selectAudioStream(streams, 1);
    expect(selected).toEqual({ index: 2, channels: 6 });
  });

  test("falls back to first audio stream", () => {
    const selected = selectAudioStream(streams, 9);
    expect(selected).toEqual({ index: 1, channels: 2 });
  });

  test("returns null when no audio stream exists", () => {
    const selected = selectAudioStream([{ index: 0, codec_type: "video" }], 0);
    expect(selected).toBeNull();
  });
});

describe("buildLiveTranscodeArgs", () => {
  test("always uses web-safe H.264 + AAC profile", () => {
    const args = buildLiveTranscodeArgs("/media/sample.mkv", { index: 2, channels: 6 }, 0);
    const joined = args.join(" ");

    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("yuv420p");
    expect(args).toContain("high");
    expect(args).toContain("frag_keyframe+empty_moov+faststart");
    expect(args).toContain("-ac");
    expect(args).toContain("2");
    expect(args).toContain("0:2");
    expect(joined.includes("loudnorm=I=-16:TP=-1.5:LRA=11")).toBe(true);
    expect(joined.includes("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE")).toBe(true);
  });

  test("includes hybrid seek arguments when startTime is non-zero", () => {
    const args = buildLiveTranscodeArgs("/media/sample.mkv", { index: 1, channels: 2 }, 75);

    // First seek is pre-input and should be 45 (75 - 30)
    expect(args[1]).toBe("-ss");
    expect(args[2]).toBe("45");
    expect(args).toContain("-accurate_seek");
    expect(args).toContain("30");
  });
});

describe("buildCacheTranscodeArgs", () => {
  test("uses cache profile and faststart output", () => {
    const args = buildCacheTranscodeArgs("/media/sample.mkv", { index: 1, channels: 2 }, "/tmp/out.mp4");

    expect(args).toContain("libx264");
    expect(args).toContain("medium");
    expect(args).toContain("22");
    expect(args).toContain("+faststart");
    expect(args).toContain("aac");
    expect(args).toContain("0:1");
  });

  test("omits audio args when no audio track exists", () => {
    const args = buildCacheTranscodeArgs("/media/sample.mkv", null, "/tmp/out.mp4");

    expect(args).not.toContain("aac");
    expect(args).not.toContain("-af");
    expect(args).not.toContain("-ac");
  });
});
