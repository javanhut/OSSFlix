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
           SUM(CASE WHEN pp.current_time >= pp.duration - 5 AND pp.duration > 0 THEN 1 ELSE 0 END) AS completed_count
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

  const unwatchedTitles = allTitles.filter(t => !watchedSet.has(t.pathToDir));
  const scored: Recommendation[] = [];

  if (unwatchedTitles.length === 0) return [];

  // Bulk query: get all genre mappings for unwatched titles in one query
  const placeholders = unwatchedTitles.map(() => "?").join(",");
  const unwatchedIds = unwatchedTitles.map(t => t.id);
  const genreMappings = db.prepare(`
    SELECT tg.title_id, g.name FROM title_genres tg
    JOIN genres g ON g.id = tg.genre_id
    WHERE tg.title_id IN (${placeholders})
  `).all(...unwatchedIds) as { title_id: number; name: string }[];

  // Group genres by title_id
  const titleGenreMap = new Map<number, string[]>();
  for (const row of genreMappings) {
    let genres = titleGenreMap.get(row.title_id);
    if (!genres) {
      genres = [];
      titleGenreMap.set(row.title_id, genres);
    }
    genres.push(row.name);
  }

  for (const title of unwatchedTitles) {
    const titleGenres = titleGenreMap.get(title.id) || [];

    let totalScore = 0;
    const matchedGenres: string[] = [];

    for (const genre of titleGenres) {
      const affinity = genreScores.get(genre);
      if (affinity) {
        totalScore += affinity;
        matchedGenres.push(genre);
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
