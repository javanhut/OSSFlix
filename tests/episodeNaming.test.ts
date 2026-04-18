import { describe, test, expect } from "bun:test";
import {
  parseEpisodePath,
  formatEpisodeLabel,
  canonicalFilename,
  compareVideoSrc,
  titleFromStem,
} from "../scripts/episodeNaming";
import { normalizeType } from "../scripts/tomlreader";

describe("parseEpisodePath — pattern A (s{N}/ep{N}/<file>.ext)", () => {
  test("short tokens, spaces in filename", () => {
    const p = parseEpisodePath("s1/ep1/the heist.mkv");
    expect(p).toEqual({ season: 1, episode: 1, title: "The Heist", ext: "mkv" });
  });
  test("zero-padded dir tokens, underscore title", () => {
    const p = parseEpisodePath("s01/ep02/the_bank_job.mkv");
    expect(p).toEqual({ season: 1, episode: 2, title: "The Bank Job", ext: "mkv" });
  });
  test("verbose 'Season N' / 'Episode N' dirs", () => {
    const p = parseEpisodePath("Season 02/Episode 03/return.mp4");
    expect(p).toEqual({ season: 2, episode: 3, title: "Return", ext: "mp4" });
  });
});

describe("parseEpisodePath — pattern B (season dir + title_sN_epM filename)", () => {
  test("title before SE tokens", () => {
    const p = parseEpisodePath("s1/MyShow_s1_ep02.mkv");
    expect(p).toEqual({ season: 1, episode: 2, title: "MyShow", ext: "mkv" });
  });
  test("space-separated SE tokens in filename", () => {
    const p = parseEpisodePath("Season 1/MyShow s01e02.mp4");
    expect(p).toEqual({ season: 1, episode: 2, title: "MyShow", ext: "mp4" });
  });
});

describe("parseEpisodePath — pattern C (s/ep dirs + title filename)", () => {
  test("title with spaces", () => {
    const p = parseEpisodePath("s01/ep01/The Pilot.mkv");
    expect(p).toEqual({ season: 1, episode: 1, title: "The Pilot", ext: "mkv" });
  });
});

describe("parseEpisodePath — legacy flat filenames", () => {
  test("Show_s01_ep02.mkv", () => {
    const p = parseEpisodePath("Show_s01_ep02.mkv");
    expect(p).toEqual({ season: 1, episode: 2, title: "Show", ext: "mkv" });
  });
  test("UPPER_CASE_S_EP tokens", () => {
    const p = parseEpisodePath("Show_S1_EP5.mkv");
    expect(p).toEqual({ season: 1, episode: 5, title: "Show", ext: "mkv" });
  });
  test("multi-word title underscores", () => {
    const p = parseEpisodePath("Breaking_Bad_s1_ep3.mkv");
    expect(p).toEqual({ season: 1, episode: 3, title: "Breaking Bad", ext: "mkv" });
  });
});

describe("parseEpisodePath — negatives", () => {
  test("no season token returns null", () => {
    expect(parseEpisodePath("just_a_movie.mp4")).toBeNull();
  });
  test("only season, no episode returns null", () => {
    expect(parseEpisodePath("s1/justafile.mkv")).toBeNull();
  });
  test("empty path returns null", () => {
    expect(parseEpisodePath("")).toBeNull();
  });
});

describe("formatEpisodeLabel", () => {
  test("with title", () => {
    expect(formatEpisodeLabel({ season: 1, episode: 2, title: "Pilot", ext: "mkv" })).toBe("S1 E2 - Pilot");
  });
  test("without title", () => {
    expect(formatEpisodeLabel({ season: 1, episode: 2, title: "", ext: "mkv" })).toBe("S1 E2");
  });
});

describe("canonicalFilename", () => {
  test("produces _s{NN}_ep{NN} suffix matching downstream regex", () => {
    const p = parseEpisodePath("s01/ep02/The Bank Job.mkv")!;
    expect(canonicalFilename(p)).toBe("the_bank_job_s01_ep02.mkv");
  });
  test("empty title falls back to 'episode' slug", () => {
    expect(canonicalFilename({ season: 1, episode: 2, title: "", ext: "mkv" })).toBe("episode_s01_ep02.mkv");
  });
});

describe("compareVideoSrc", () => {
  test("sorts by season then episode", () => {
    const arr = ["/media/x/a_s02_ep01.mkv", "/media/x/a_s01_ep10.mkv", "/media/x/a_s01_ep02.mkv"];
    arr.sort(compareVideoSrc);
    expect(arr).toEqual(["/media/x/a_s01_ep02.mkv", "/media/x/a_s01_ep10.mkv", "/media/x/a_s02_ep01.mkv"]);
  });
  test("handles mixed zero-padding", () => {
    const arr = ["/x/y_s1_ep1.mkv", "/x/y_s01_ep02.mkv"];
    arr.sort(compareVideoSrc);
    expect(arr[0]).toBe("/x/y_s1_ep1.mkv");
    expect(arr[1]).toBe("/x/y_s01_ep02.mkv");
  });
});

describe("titleFromStem", () => {
  test("underscores to spaces, title case", () => {
    expect(titleFromStem("the_heist")).toBe("The Heist");
  });
  test("trims whitespace", () => {
    expect(titleFromStem("  pilot  ")).toBe("Pilot");
  });
  test("empty returns empty", () => {
    expect(titleFromStem("")).toBe("");
  });
});

describe("normalizeType", () => {
  test("accepts TV Show variants", () => {
    expect(normalizeType("TV Show")).toBe("tv");
    expect(normalizeType("tv show")).toBe("tv");
    expect(normalizeType("TvShow")).toBe("tv");
    expect(normalizeType("TV-Show")).toBe("tv");
    expect(normalizeType("series")).toBe("tv");
    expect(normalizeType("Show")).toBe("tv");
    expect(normalizeType("TV Series")).toBe("tv");
  });
  test("accepts Movie variants", () => {
    expect(normalizeType("Movie")).toBe("movie");
    expect(normalizeType("movie")).toBe("movie");
    expect(normalizeType("film")).toBe("movie");
    expect(normalizeType("Film")).toBe("movie");
  });
  test("rejects unknown", () => {
    expect(normalizeType("")).toBeNull();
    expect(normalizeType("documentary")).toBeNull();
    expect(normalizeType(undefined)).toBeNull();
    expect(normalizeType(42)).toBeNull();
  });
});
