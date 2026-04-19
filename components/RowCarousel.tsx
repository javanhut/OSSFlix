import { useEffect, useRef, useState, type ReactNode } from "react";

type RowCarouselProps = {
  children: ReactNode;
  role?: string;
};

const HOVER_SCROLL_PX_PER_SEC = 320;

export function RowCarousel({ children, role }: RowCarouselProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const computeMax = (): number => {
    const row = rowRef.current;
    const track = trackRef.current;
    if (!row || !track) return 0;
    return Math.max(0, track.scrollWidth - row.clientWidth);
  };

  const readCurrentOffset = (): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const t = getComputedStyle(track).transform;
    if (!t || t === "none") return 0;
    return -new DOMMatrix(t).m41;
  };

  const updateChevronVisibility = () => {
    const max = computeMax();
    const offset = offsetRef.current;
    const left = offset > 1;
    const right = offset < max - 1;
    setCanScrollLeft((prev) => (prev !== left ? left : prev));
    setCanScrollRight((prev) => (prev !== right ? right : prev));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when children change so bounds stay correct
  useEffect(() => {
    const row = rowRef.current;
    const track = trackRef.current;
    if (!row || !track) return;
    updateChevronVisibility();
    const ro = new ResizeObserver(updateChevronVisibility);
    ro.observe(row);
    ro.observe(track);
    return () => ro.disconnect();
  }, [children]);

  useEffect(
    () => () => {
      const track = trackRef.current;
      if (track) track.style.transition = "";
    },
    [],
  );

  const startScrolling = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const max = computeMax();
    const current = readCurrentOffset();
    const target = dir === 1 ? max : 0;
    const distance = Math.abs(target - current);
    if (distance < 1) return;
    const duration = distance / HOVER_SCROLL_PX_PER_SEC;
    // Pin to the live (possibly mid-animation) value, force reflow, then transition to target.
    track.style.transition = "none";
    track.style.transform = `translate3d(${-current}px, 0, 0)`;
    void track.offsetWidth;
    track.style.transition = `transform ${duration}s linear`;
    track.style.transform = `translate3d(${-target}px, 0, 0)`;
    offsetRef.current = target;
    const onEnd = () => {
      offsetRef.current = readCurrentOffset();
      updateChevronVisibility();
    };
    track.addEventListener("transitionend", onEnd, { once: true });
  };

  const stopScrolling = () => {
    const track = trackRef.current;
    if (!track) return;
    const current = readCurrentOffset();
    track.style.transition = "none";
    track.style.transform = `translate3d(${-current}px, 0, 0)`;
    offsetRef.current = current;
    updateChevronVisibility();
  };

  return (
    <div className="oss-row-wrapper">
      <button
        type="button"
        className={`oss-row-chevron left${canScrollLeft ? " visible" : ""}`}
        onMouseEnter={() => startScrolling(-1)}
        onMouseLeave={stopScrolling}
        onFocus={() => startScrolling(-1)}
        onBlur={stopScrolling}
        aria-label="Scroll left"
        tabIndex={canScrollLeft ? 0 : -1}
      >
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className={`oss-row${canScrollLeft ? " fade-left" : ""}${canScrollRight ? " fade-right" : ""}`} ref={rowRef}>
        <div className="oss-row-track" role={role} ref={trackRef}>
          {children}
        </div>
      </div>
      <button
        type="button"
        className={`oss-row-chevron right${canScrollRight ? " visible" : ""}`}
        onMouseEnter={() => startScrolling(1)}
        onMouseLeave={stopScrolling}
        onFocus={() => startScrolling(1)}
        onBlur={stopScrolling}
        aria-label="Scroll right"
        tabIndex={canScrollRight ? 0 : -1}
      >
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

export default RowCarousel;
