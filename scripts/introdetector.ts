import db from "./db";

type JobStatus = "pending" | "running" | "completed" | "failed";

export function createJob(type: string, dirPath: string): number {
  const result = db.run("INSERT INTO background_jobs (type, dir_path, status) VALUES (?, ?, 'pending')", [
    type,
    dirPath,
  ]);
  return Number(result.lastInsertRowid);
}

export function updateJobStatus(
  jobId: number,
  status: JobStatus,
  extra?: { progress?: string; result?: string; error?: string },
) {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const vals: any[] = [status];
  if (extra?.progress !== undefined) {
    sets.push("progress = ?");
    vals.push(extra.progress);
  }
  if (extra?.result !== undefined) {
    sets.push("result = ?");
    vals.push(extra.result);
  }
  if (extra?.error !== undefined) {
    sets.push("error = ?");
    vals.push(extra.error);
  }
  vals.push(jobId);
  db.run(`UPDATE background_jobs SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export function getJob(jobId: number) {
  return db.prepare("SELECT * FROM background_jobs WHERE id = ?").get(jobId) as any;
}

async function checkFpcalc(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["fpcalc", "-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function runFpcalc(filePath: string, offset: number, length: number): Promise<number[]> {
  const args = ["fpcalc", "-raw", "-length", String(length), "-offset", String(offset), filePath];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  if (proc.exitCode !== 0) throw new Error(`fpcalc failed for ${filePath}`);

  const fpLine = output.split("\n").find((l) => l.startsWith("FINGERPRINT="));
  if (!fpLine) throw new Error("No fingerprint in output");

  return fpLine.replace("FINGERPRINT=", "").split(",").map(Number);
}

async function getDuration(filePath: string): Promise<number> {
  const proc = Bun.spawn(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return parseFloat(output.trim()) || 0;
}

function correlateFingerprints(fp1: number[], fp2: number[]): { offset: number; score: number } {
  let bestOffset = 0;
  let bestScore = 0;
  const maxShift = Math.min(fp1.length, fp2.length, 200);

  for (let shift = -maxShift; shift <= maxShift; shift++) {
    let matchBits = 0;
    let totalBits = 0;

    const start1 = Math.max(0, shift);
    const start2 = Math.max(0, -shift);
    const len = Math.min(fp1.length - start1, fp2.length - start2);

    if (len < 10) continue;

    for (let i = 0; i < len; i++) {
      const xor = fp1[start1 + i] ^ fp2[start2 + i];
      // Count matching bits (32 - popcount)
      let bits = xor;
      let popcount = 0;
      while (bits) {
        popcount++;
        bits &= bits - 1;
      }
      matchBits += 32 - popcount;
      totalBits += 32;
    }

    const score = totalBits > 0 ? matchBits / totalBits : 0;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = shift;
    }
  }

  return { offset: bestOffset, score: bestScore };
}

function resolveSourcePath(servePath: string): string | null {
  const title = db
    .prepare("SELECT source_path FROM titles WHERE dir_path = ?")
    .get(servePath.replace(/\/[^/]+$/, "")) as { source_path: string } | null;
  if (!title) return null;
  const filename = servePath.split("/").pop()!;
  return `${title.source_path}/${filename}`;
}

export async function detectIntros(dirPath: string, jobId: number) {
  try {
    updateJobStatus(jobId, "running", { progress: "Checking fpcalc availability..." });

    const hasFpcalc = await checkFpcalc();
    if (!hasFpcalc) {
      updateJobStatus(jobId, "failed", {
        error:
          "fpcalc not found. Install chromaprint (e.g., 'sudo pacman -S chromaprint' or 'brew install chromaprint').",
      });
      return;
    }

    // Get videos for this title
    const title = db.prepare("SELECT videos FROM titles WHERE dir_path = ?").get(dirPath) as {
      videos: string | null;
    } | null;

    if (!title?.videos) {
      updateJobStatus(jobId, "failed", { error: "No videos found for this title" });
      return;
    }

    const videos: string[] = JSON.parse(title.videos);
    if (videos.length < 2) {
      updateJobStatus(jobId, "failed", { error: "Need at least 2 episodes for detection" });
      return;
    }

    const INTRO_LENGTH = 300; // Analyze first 5 min
    const OUTRO_LENGTH = 300; // Analyze last 5 min
    const SCORE_THRESHOLD = 0.55;

    // Collect fingerprints for all episodes
    type EpFP = {
      src: string;
      introFp: number[];
      outroFp: number[];
      duration: number;
    };
    const epData: EpFP[] = [];

    for (let i = 0; i < videos.length; i++) {
      updateJobStatus(jobId, "running", {
        progress: `Fingerprinting episode ${i + 1}/${videos.length}...`,
      });

      const sourcePath = resolveSourcePath(videos[i]);
      if (!sourcePath) continue;

      try {
        const duration = await getDuration(sourcePath);
        if (duration < 60) continue;

        const introFp = await runFpcalc(sourcePath, 0, Math.min(INTRO_LENGTH, Math.floor(duration)));
        const outroOffset = Math.max(0, Math.floor(duration) - OUTRO_LENGTH);
        const outroFp = await runFpcalc(
          sourcePath,
          outroOffset,
          Math.min(OUTRO_LENGTH, Math.floor(duration) - outroOffset),
        );

        epData.push({ src: videos[i], introFp, outroFp, duration });
      } catch {
        // Skip episodes that fail fingerprinting
      }
    }

    if (epData.length < 2) {
      updateJobStatus(jobId, "failed", { error: "Could not fingerprint enough episodes" });
      return;
    }

    // Cross-correlate intro fingerprints across pairs
    updateJobStatus(jobId, "running", { progress: "Analyzing intro patterns..." });

    type TimingResult = {
      introStart: number | null;
      introEnd: number | null;
      outroStart: number | null;
      outroEnd: number | null;
    };

    // For each pair, find common intro segment
    const introOffsets: number[] = [];
    const introLengths: number[] = [];
    const outroOffsets: number[] = [];

    for (let i = 0; i < epData.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 4, epData.length); j++) {
        // Intro correlation
        const introCorr = correlateFingerprints(epData[i].introFp, epData[j].introFp);
        if (introCorr.score > SCORE_THRESHOLD) {
          // Estimate intro boundaries: ~3 fingerprints per second
          const fpPerSec = epData[i].introFp.length / Math.min(INTRO_LENGTH, epData[i].duration);
          const offsetSecs = Math.abs(introCorr.offset) / Math.max(fpPerSec, 1);
          introOffsets.push(offsetSecs);

          // Estimate intro length by finding where correlation drops
          const introLen = estimateSegmentLength(epData[i].introFp, epData[j].introFp, introCorr.offset, fpPerSec);
          if (introLen > 10) introLengths.push(introLen);
        }

        // Outro correlation
        const outroCorr = correlateFingerprints(epData[i].outroFp, epData[j].outroFp);
        if (outroCorr.score > SCORE_THRESHOLD) {
          const fpPerSec = epData[i].outroFp.length / Math.min(OUTRO_LENGTH, epData[i].duration);
          const offsetSecs = Math.abs(outroCorr.offset) / Math.max(fpPerSec, 1);
          outroOffsets.push(offsetSecs);
        }
      }
    }

    updateJobStatus(jobId, "running", { progress: "Computing timings..." });

    // Compute consensus timings
    const medianIntroStart = introOffsets.length > 0 ? median(introOffsets) : null;
    const medianIntroLen = introLengths.length > 0 ? median(introLengths) : null;
    const medianOutroOffset = outroOffsets.length > 0 ? median(outroOffsets) : null;

    // Write timings to DB
    const upsertTiming = db.prepare(`
      INSERT INTO episode_timings (video_src, intro_start, intro_end, outro_start, outro_end)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(video_src) DO UPDATE SET
        intro_start = excluded.intro_start,
        intro_end = excluded.intro_end,
        outro_start = excluded.outro_start,
        outro_end = excluded.outro_end
    `);

    let timingsCount = 0;
    for (const ep of epData) {
      const introStart = medianIntroStart != null ? Math.round(medianIntroStart) : null;
      const introEnd =
        medianIntroStart != null && medianIntroLen != null ? Math.round(medianIntroStart + medianIntroLen) : null;
      const outroStart = medianOutroOffset != null ? Math.round(ep.duration - OUTRO_LENGTH + medianOutroOffset) : null;
      const outroEnd = outroStart != null ? Math.round(ep.duration) : null;

      if (introStart != null || outroStart != null) {
        upsertTiming.run(ep.src, introStart, introEnd, outroStart, outroEnd);
        timingsCount++;
      }
    }

    updateJobStatus(jobId, "completed", {
      progress: `Done! Updated timings for ${timingsCount} episodes.`,
      result: JSON.stringify({ timingsCount, episodes: epData.length }),
    });
  } catch (err: any) {
    updateJobStatus(jobId, "failed", { error: err.message || "Unknown error" });
  }
}

function estimateSegmentLength(fp1: number[], fp2: number[], offset: number, fpPerSec: number): number {
  const start1 = Math.max(0, offset);
  const start2 = Math.max(0, -offset);
  const len = Math.min(fp1.length - start1, fp2.length - start2);

  // Sliding window to find where correlation drops
  const windowSize = Math.max(10, Math.floor(fpPerSec * 5));
  let lastGoodIdx = 0;

  for (let i = 0; i < len - windowSize; i += Math.floor(windowSize / 2)) {
    let matchBits = 0;
    let totalBits = 0;

    for (let j = 0; j < windowSize; j++) {
      const xor = fp1[start1 + i + j] ^ fp2[start2 + i + j];
      let bits = xor;
      let popcount = 0;
      while (bits) {
        popcount++;
        bits &= bits - 1;
      }
      matchBits += 32 - popcount;
      totalBits += 32;
    }

    if (totalBits > 0 && matchBits / totalBits > 0.5) {
      lastGoodIdx = i + windowSize;
    } else {
      break;
    }
  }

  return lastGoodIdx / Math.max(fpPerSec, 1);
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
