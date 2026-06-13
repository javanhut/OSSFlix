// Fallback poster shown when a title has no artwork, or its remote image 404s.
// Served from the static /images directory (see images/no-art.svg).
export const DEFAULT_POSTER = "/images/no-art.svg";

// onError handler for poster <img>s: swap to the default poster once, guarding
// against an infinite loop if the default itself fails to load.
export function posterFallback(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_POSTER)) img.src = DEFAULT_POSTER;
}
