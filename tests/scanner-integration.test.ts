import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDirectory } from "../scripts/mediascanner";

// Note: the local scanner reads a flat directory (no recursion into s1/ep1).
// So the most it can exercise locally is pattern B (flat filenames with SE tokens)
// plus the new TOML [[seasons]] + normalizeType behavior. Pattern A/C are
// unit-tested against parseEpisodePath and take effect at the KaidaDB scan layer.

describe("scanner integration (local, flat + TOML extensions)", () => {
  let base: string;

  beforeAll(() => {
    base = join(tmpdir(), `ossflix-scanner-test-${Date.now()}`);
    mkdirSync(base, { recursive: true });
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("type normalization accepts multiple spellings", async () => {
    const variants = [
      { dir: "ShowTvShow", type: "TV Show" },
      { dir: "ShowLower", type: "tv show" },
      { dir: "ShowCamel", type: "TvShow" },
      { dir: "ShowSeries", type: "series" },
      { dir: "ShowDash", type: "TV-Show" },
    ];
    for (const v of variants) {
      const titleDir = join(base, v.dir);
      mkdirSync(titleDir, { recursive: true });
      writeFileSync(
        join(titleDir, "metadata.toml"),
        `
[series]
name = "${v.dir}"
type = "${v.type}"
description = "desc"
genre = ["Drama"]
`,
      );
      writeFileSync(join(titleDir, `${v.dir}_s01_ep01.mkv`), "");
    }
    const results = await scanDirectory(base, "/media/tvshows");
    for (const v of variants) {
      const r = results.find((x) => x.name === v.dir);
      expect(r).toBeTruthy();
      expect(r!.type).toBe(v.type);
    }
  });

  test("per-season metadata parses and logo path resolves to serve path", async () => {
    const titleDir = join(base, "MultiSeason");
    mkdirSync(titleDir, { recursive: true });
    writeFileSync(
      join(titleDir, "metadata.toml"),
      `
[series]
name = "MultiSeason"
type = "TV Show"
description = "Default show desc"
genre = ["Sci-Fi"]

[[seasons]]
season = 1
description = "Season 1 desc"
logo = "s1_logo.png"

[[seasons]]
season = 2
description = "Season 2 desc"
logo = "s2_logo.png"
`,
    );
    writeFileSync(join(titleDir, "s1_logo.png"), "");
    writeFileSync(join(titleDir, "s2_logo.png"), "");
    writeFileSync(join(titleDir, "MultiSeason_s01_ep01.mkv"), "");
    writeFileSync(join(titleDir, "MultiSeason_s01_ep02.mkv"), "");
    writeFileSync(join(titleDir, "MultiSeason_s02_ep01.mkv"), "");

    const results = await scanDirectory(base, "/media/tvshows");
    const r = results.find((x) => x.name === "MultiSeason");
    expect(r).toBeTruthy();
    expect(r!.seasons).toBeDefined();
    expect(r!.seasons!.length).toBe(2);
    const s1 = r!.seasons!.find((s) => s.season === 1)!;
    const s2 = r!.seasons!.find((s) => s.season === 2)!;
    expect(s1.description).toBe("Season 1 desc");
    expect(s1.logo).toBe("/media/tvshows/MultiSeason/s1_logo.png");
    expect(s2.description).toBe("Season 2 desc");
    expect(s2.logo).toBe("/media/tvshows/MultiSeason/s2_logo.png");
  });

  test("missing logo file falls back to raw string (no crash)", async () => {
    const titleDir = join(base, "MissingLogo");
    mkdirSync(titleDir, { recursive: true });
    writeFileSync(
      join(titleDir, "metadata.toml"),
      `
[series]
name = "MissingLogo"
type = "tv show"
description = "d"
genre = ["Drama"]

[[seasons]]
season = 1
logo = "does_not_exist.png"
`,
    );
    writeFileSync(join(titleDir, "MissingLogo_s01_ep01.mkv"), "");

    const results = await scanDirectory(base, "/media/tvshows");
    const r = results.find((x) => x.name === "MissingLogo");
    expect(r).toBeTruthy();
    expect(r!.seasons![0].logo).toBe("does_not_exist.png");
  });

  test("TOMLs without [[seasons]] still scan correctly (backward compat)", async () => {
    const titleDir = join(base, "Legacy");
    mkdirSync(titleDir, { recursive: true });
    writeFileSync(
      join(titleDir, "metadata.toml"),
      `
[series]
name = "Legacy"
type = "TV Show"
season = 1
episodes = 2
description = "desc"
genre = ["Drama"]
`,
    );
    writeFileSync(join(titleDir, "Legacy_s01_ep01.mkv"), "");
    writeFileSync(join(titleDir, "Legacy_s01_ep02.mkv"), "");

    const results = await scanDirectory(base, "/media/tvshows");
    const r = results.find((x) => x.name === "Legacy");
    expect(r).toBeTruthy();
    expect(r!.seasons).toBeUndefined();
    expect(r!.season).toBe(1);
    expect(r!.episodes).toBe(2);
    expect(r!.videos.length).toBe(2);
  });

  test("invalid type is rejected (parseTomlString returns null, title skipped)", async () => {
    const titleDir = join(base, "Unknown");
    mkdirSync(titleDir, { recursive: true });
    writeFileSync(
      join(titleDir, "metadata.toml"),
      `
[series]
name = "Unknown"
type = "documentary"
description = "d"
genre = ["Doc"]
`,
    );
    writeFileSync(join(titleDir, "Unknown_s01_ep01.mkv"), "");

    const results = await scanDirectory(base, "/media/tvshows");
    const r = results.find((x) => x.name === "Unknown");
    expect(r).toBeUndefined();
  });

  test("movie aliases resolve to movie", async () => {
    const titleDir = join(base, "MovieFilm");
    mkdirSync(titleDir, { recursive: true });
    writeFileSync(
      join(titleDir, "metadata.toml"),
      `
[series]
name = "MovieFilm"
type = "Film"
description = "d"
genre = ["Action"]
`,
    );
    writeFileSync(join(titleDir, "MovieFilm.mp4"), "");

    const results = await scanDirectory(base, "/media/movies");
    const r = results.find((x) => x.name === "MovieFilm");
    expect(r).toBeTruthy();
    expect(r!.type).toBe("Film");
  });
});
