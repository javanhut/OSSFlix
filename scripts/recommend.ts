import db from "./db";

type TitleInfo = {
  name: string;
  imagePath: string | null;
  pathToDir: string;
  type: string;
};

type Recommendation = TitleInfo & {
  score: number;
  reason: string;
};

export function getRecommendations(profileId: number, limit = 6): Recommendation[] {
  // 1. Get all titles the user has watched (any progress at all)
  const watchedDirs = db.prepare(`
    SELECT DISTINCT dir_path FROM playback_progress WHERE profile_id = ?
  `).all(profileId) as { dir_path: string }[];

  if (watchedDirs.length === 0) return [];

  const watchedSet = new Set(watchedDirs.map(r => r.dir_path));

  // 2. Build a genre affinity score from watch history
  //    Weight completed titles higher than partially watched
  const genreRows = db.prepare(`
    SELECT g.name AS genre,
           COUNT(DISTINCT pp.dir_path) AS watch_count,
           SUM(CASE WHEN pp.current_time >= pp.duration - 10 AND pp.duration > 0 THEN 1 ELSE 0 END) AS completed_count
    FROM playback_progress pp
    JOIN titles t ON t.dir_path = pp.dir_path
    JOIN title_genres tg ON tg.title_id = t.id
    JOIN genres g ON g.id = tg.genre_id
    WHERE pp.profile_id = ?
    GROUP BY g.name
  `).all(profileId) as { genre: string; watch_count: number; completed_count: number }[];

  if (genreRows.length === 0) return [];

  // Score each genre: completed episodes count double
  const genreScores = new Map<string, number>();
  let maxScore = 0;
  for (const row of genreRows) {
    const score = row.watch_count + row.completed_count;
    genreScores.set(row.genre, score);
    if (score > maxScore) maxScore = score;
  }

  // Normalize scores to 0-1
  if (maxScore > 0) {
    for (const [genre, score] of genreScores) {
      genreScores.set(genre, score / maxScore);
    }
  }

  // 3. Score all unwatched titles by genre affinity
  const allTitles = db.prepare(`
    SELECT t.id, t.name, t.image_path AS imagePath, t.dir_path AS pathToDir, t.type
    FROM titles t
  `).all() as (TitleInfo & { id: number })[];

  const scored: Recommendation[] = [];

  for (const title of allTitles) {
    if (watchedSet.has(title.pathToDir)) continue;

    const titleGenres = db.prepare(`
      SELECT g.name FROM genres g
      JOIN title_genres tg ON tg.genre_id = g.id
      WHERE tg.title_id = ?
    `).all(title.id) as { name: string }[];

    let totalScore = 0;
    const matchedGenres: string[] = [];

    for (const g of titleGenres) {
      const affinity = genreScores.get(g.name);
      if (affinity) {
        totalScore += affinity;
        matchedGenres.push(g.name);
      }
    }

    // Normalize by number of genres to avoid bias toward titles with many genres
    if (titleGenres.length > 0) {
      totalScore = totalScore / Math.sqrt(titleGenres.length);
    }

    if (totalScore > 0 && matchedGenres.length > 0) {
      // Build a human-readable reason
      const topGenres = matchedGenres
        .sort((a, b) => (genreScores.get(b) || 0) - (genreScores.get(a) || 0))
        .slice(0, 3);
      const reason = `Because you watch ${topGenres.join(", ")}`;

      scored.push({
        name: title.name,
        imagePath: title.imagePath,
        pathToDir: title.pathToDir,
        type: title.type,
        score: totalScore,
        reason,
      });
    }
  }

  // Sort by score descending, return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
