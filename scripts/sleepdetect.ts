type ProgressEntry = {
  video_src: string;
  current_time: number;
  duration: number;
  updated_at: string;
};

type SleepResult = {
  fellAsleep: boolean;
  resumeEpisode?: string;
  consecutiveCount?: number;
};

export function detectSleepPattern(progressEntries: ProgressEntry[], videos: string[]): SleepResult {
  // Build a map of video_src -> index in the episode order
  const videoOrder = new Map<string, number>();
  for (let i = 0; i < videos.length; i++) {
    videoOrder.set(videos[i], i);
  }

  // Get completed episodes (watched >= duration - 5s), sorted by episode order
  const completed = progressEntries
    .filter((e) => e.duration > 0 && e.current_time >= e.duration - 5)
    .filter((e) => videoOrder.has(e.video_src))
    .sort((a, b) => videoOrder.get(a.video_src)! - videoOrder.get(b.video_src)!);

  if (completed.length < 3) return { fellAsleep: false };

  // Look for consecutive episodes where completion timestamps are ~episode duration apart
  let bestRun: { start: number; count: number } | null = null;

  for (let i = 0; i < completed.length - 1; i++) {
    const idx1 = videoOrder.get(completed[i].video_src)!;
    const idx2 = videoOrder.get(completed[i + 1].video_src)!;

    // Must be consecutive episodes
    if (idx2 !== idx1 + 1) continue;

    const t1 = new Date(`${completed[i].updated_at}Z`).getTime();
    const t2 = new Date(`${completed[i + 1].updated_at}Z`).getTime();
    const gapSecs = (t2 - t1) / 1000;
    const epDuration = completed[i + 1].duration;

    // Tolerance: gap should be approximately the episode duration (±3 min)
    const tolerance = 180; // 3 minutes
    const isAutoPlayed = Math.abs(gapSecs - epDuration) <= tolerance;

    if (!isAutoPlayed) continue;

    // Check if this extends a current run
    if (bestRun && i === bestRun.start + bestRun.count - 1) {
      bestRun.count++;
    } else {
      // Start a new potential run from episode i
      // Check if the next pair also matches
      const runStart = i;
      let runCount = 2;
      for (let j = i + 1; j < completed.length - 1; j++) {
        const jIdx1 = videoOrder.get(completed[j].video_src)!;
        const jIdx2 = videoOrder.get(completed[j + 1].video_src)!;
        if (jIdx2 !== jIdx1 + 1) break;

        const jt1 = new Date(`${completed[j].updated_at}Z`).getTime();
        const jt2 = new Date(`${completed[j + 1].updated_at}Z`).getTime();
        const jGap = (jt2 - jt1) / 1000;
        const jDur = completed[j + 1].duration;
        if (Math.abs(jGap - jDur) > tolerance) break;

        runCount++;
      }

      if (runCount >= 3 && (!bestRun || runCount > bestRun.count)) {
        bestRun = { start: runStart, count: runCount };
      }

      // Skip ahead past this run
      if (runCount >= 3) i += runCount - 2;
    }
  }

  if (!bestRun || bestRun.count < 3) return { fellAsleep: false };

  return {
    fellAsleep: true,
    resumeEpisode: completed[bestRun.start].video_src,
    consecutiveCount: bestRun.count,
  };
}
