const STAR = "M12 0 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z";

/** Pixie-dust sparkles for the waiting state (still when reduced motion is on). */
export function Sparkles() {
  return (
    <svg width="120" height="60" viewBox="0 0 120 60" aria-hidden="true">
      <path className="sparkle" d={STAR} fill="#c9a43b" transform="translate(4 18)" />
      <path className="sparkle" d={STAR} fill="#7b3f99" transform="translate(34 4) scale(0.8)" />
      <path className="sparkle" d={STAR} fill="#f4a6c8" transform="translate(62 24) scale(0.9)" />
      <path className="sparkle" d={STAR} fill="#c9a43b" transform="translate(92 8) scale(0.7)" />
    </svg>
  );
}
