import { describe, expect, test } from "bun:test";
import { buildCacheTranscodeArgs, buildLiveTranscodeArgs, selectAudioStream, selectVideoStream } from "../scripts/streamingProfile";

describe("selectAudioStream", () => {
  const streams = [
    { index: 0, codec_type: "video" },
    { index: 1, codec_type: "audio", codec_name: "aac", channels: 2 },
    { index: 2, codec_type: "audio", codec_name: "eac3", channels: 6 },
  ];

  test("picks requested audio stream by ordinal index", () => {
    const selected = selectAudioStream(streams, 1);
    expect(selected).toEqual({ index: 2, channels: 6, codecName: "eac3" });
  });

  test("falls back to first audio stream", () => {
    const selected = selectAudioStream(streams, 9);
    expect(selected).toEqual({ index: 1, channels: 2, codecName: "aac" });
  });

  test("returns null when no audio stream exists", () => {
    const selected = selectAudioStream([{ index: 0, codec_type: "video" }], 0);
    expect(selected).toBeNull();
  });
});

describe("selectVideoStream", () => {
  test("returns first video stream details", () => {
    const selected = selectVideoStream([
      { index: 0, codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" },
      { index: 1, codec_type: "audio", codec_name: "aac", channels: 2 },
    ]);
    expect(selected).toEqual({ index: 0, codecName: "h264", pixFmt: "yuv420p" });
  });
});

describe("buildLiveTranscodeArgs", () => {
  test("uses low-latency transcode profile for incompatible streams", () => {
    const args = buildLiveTranscodeArgs(
      "/media/sample.mkv",
      { index: 2, channels: 6, codecName: "eac3" },
      { index: 0, codecName: "hevc", pixFmt: "yuv420p10le" },
      0
    );
    const joined = args.join(" ");

    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("yuv420p");
    expect(args).toContain("high");
    expect(args).toContain("frag_keyframe+empty_moov+default_base_moof+faststart");
    expect(args).toContain("-ac");
    expect(args).toContain("2");
    expect(args).toContain("0:2");
    expect(args).toContain("superfast");
    expect(joined.includes("loudnorm=I=-16:TP=-1.5:LRA=11")).toBe(false);
    expect(joined.includes("pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE")).toBe(true);
  });

  test("includes hybrid seek arguments when startTime is non-zero", () => {
    const args = buildLiveTranscodeArgs(
      "/media/sample.mkv",
      { index: 1, channels: 2, codecName: "aac" },
      { index: 0, codecName: "h264", pixFmt: "yuv420p" },
      75
    );

    // Includes a pre-input seek window and an accurate post-input seek.
    expect(args).toContain("-ss");
    expect(args).toContain("45");
    expect(args).toContain("-accurate_seek");
    expect(args).toContain("30");
  });

  test("copies already-compatible h264+aac streams at startup", () => {
    const args = buildLiveTranscodeArgs(
      "/media/sample.mkv",
      { index: 1, channels: 2, codecName: "aac" },
      { index: 0, codecName: "h264", pixFmt: "yuv420p" },
      0
    );

    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).toContain("-c:a");
    expect(args).toContain("copy");
  });
});

describe("buildCacheTranscodeArgs", () => {
  test("uses cache profile and faststart output", () => {
    const args = buildCacheTranscodeArgs("/media/sample.mkv", { index: 1, channels: 2, codecName: "aac" }, "/tmp/out.mp4");

    expect(args).toContain("libx264");
    expect(args).toContain("fast");
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
