export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-img skeleton-shimmer" />
      <div className="skeleton-card-title skeleton-shimmer" />
    </div>
  );
}

export function SkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <div className="oss-section">
      <h2 className="oss-section-title">
        <span className="skeleton-shimmer skeleton-section-title-text" />
      </h2>
      <div className="oss-row-wrapper">
        <div className="oss-row">
          <div className="oss-row-track">
            {Array.from({ length: count }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders are identical; index IS the identity
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "20px",
        padding: "0 4%",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders are identical; index IS the identity
        <div key={i} className="skeleton-grid-card">
          <div className="skeleton-grid-img skeleton-shimmer" />
          <div style={{ padding: "12px 14px" }}>
            <div className="skeleton-text skeleton-shimmer" style={{ width: "70%" }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: "40%", marginTop: "6px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div className="oss-hero" style={{ background: "var(--oss-bg-card)" }}>
      <div className="skeleton-shimmer" style={{ width: "100%", height: "100%" }} />
      <div className="oss-hero-vignette" />
      <div className="oss-hero-content">
        <div
          className="skeleton-shimmer"
          style={{ width: "300px", height: "40px", borderRadius: "8px", marginBottom: "12px" }}
        />
        <div
          className="skeleton-shimmer"
          style={{ width: "400px", height: "16px", borderRadius: "4px", marginBottom: "8px" }}
        />
        <div
          className="skeleton-shimmer"
          style={{ width: "280px", height: "16px", borderRadius: "4px", marginBottom: "20px" }}
        />
        <div style={{ display: "flex", gap: "12px" }}>
          <div className="skeleton-shimmer" style={{ width: "100px", height: "40px", borderRadius: "8px" }} />
          <div className="skeleton-shimmer" style={{ width: "120px", height: "40px", borderRadius: "8px" }} />
        </div>
      </div>
    </div>
  );
}

export default SkeletonCard;
