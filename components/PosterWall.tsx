import type React from "react";

type PosterWallProps = {
  /** Poster URLs to tile. Empty → abstract gradient tiles (e.g. the login page, before any art is available). */
  images?: string[];
  columns?: number;
  className?: string;
};

const TILES_PER_COLUMN = 6;

// Tilted wall of poster tiles drifting past, alternate columns in opposite directions.
// Each column renders its tiles twice so the translateY(-50%) loop is seamless.
export default function PosterWall({ images = [], columns = 5, className = "" }: PosterWallProps) {
  const hasImages = images.length > 0;
  // With only a handful of posters, repeating them edge to edge looks like a glitch — mix in abstract tiles
  const sparse = images.length < 8;
  return (
    <div className={`oss-poster-wall ${className}`} aria-hidden="true">
      {Array.from({ length: columns }, (_, col) => {
        const tiles = Array.from({ length: TILES_PER_COLUMN }, (_, i) => col * TILES_PER_COLUMN + i);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative columns
            key={col}
            className={`oss-poster-wall-col${col % 2 ? " reverse" : ""}`}
          >
            {[...tiles, ...tiles].map((n, k) =>
              hasImages && (!sparse || n % 3 === 0) ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative tiles, duplicated for a seamless loop
                <div key={k} className="oss-poster-tile">
                  <img
                    src={images[(sparse ? n / 3 : n) % images.length]}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static decorative tiles, duplicated for a seamless loop
                  key={k}
                  className="oss-poster-tile oss-poster-tile-abstract"
                  style={{ "--tile-hue": `${205 + ((n * 23) % 60)}` } as React.CSSProperties}
                />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
