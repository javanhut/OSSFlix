import type React from "react";
import PosterWall from "./PosterWall";

type PageHeroProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Poster URLs for the backdrop wall; abstract tiles when empty. */
  images?: string[];
  children?: React.ReactNode;
};

// Page header in the same style as the login showcase: big display headline over a drifting poster wall.
export default function PageHero({ title, subtitle, images = [], children }: PageHeroProps) {
  // Unique, non-empty posters only, so the wall doesn't repeat one image back to back
  const posters = [...new Set(images.filter(Boolean))];
  return (
    <header className="oss-page-hero">
      <PosterWall images={posters} columns={6} className="oss-poster-wall-hero" />
      <div className="oss-page-hero-copy">
        <h1 className="oss-page-hero-title">{title}</h1>
        {subtitle && <p className="oss-page-hero-subtitle">{subtitle}</p>}
        {children}
      </div>
    </header>
  );
}
