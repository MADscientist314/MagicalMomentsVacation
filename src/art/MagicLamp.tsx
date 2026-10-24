// A generic golden oil lamp with a wisp of wish-smoke (folklore, not any studio's character).

const STAR = "M0 -5 L1.3 -1.3 5 0 1.3 1.3 0 5 -1.3 1.3 -5 0 -1.3 -1.3Z";

export function MagicLamp({ size = 64 }: { size?: number }) {
  return (
    <svg className="lamp" width={size} height={(size * 90) / 120} viewBox="0 0 120 90" aria-hidden="true">
      <path
        className="wisp"
        d="M10 45 C2 36 18 30 11 21 S20 8 31 5"
        fill="none"
        stroke="#7b3f99"
        strokeOpacity="0.75"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g fill="#c9a43b">
        <path className="sparkle" d={STAR} transform="translate(36 6) scale(1.3)" />
        <path className="sparkle" d={STAR} transform="translate(22 16) scale(0.7)" />
        <path className="sparkle" d={STAR} transform="translate(4 26) scale(0.6)" />
      </g>
      <g fill="#f3d58a" stroke="#c9a43b" strokeWidth="2" strokeLinejoin="round">
        <path d="M88 58 C104 55 106 72 91 70" fill="none" strokeWidth="4" strokeLinecap="round" />
        <path d="M39 58 C27 58 19 54 9 47 L11 44 C21 49 29 52 41 53 Z" />
        <path d="M33 63 C33 49 87 49 91 63 C87 71 37 71 33 63 Z" />
        <path d="M49 53 Q60 39 71 53 Z" />
        <circle cx="60" cy="41" r="3.5" />
        <path d="M54 70 L66 70 L68 77 L52 77 Z" />
        <ellipse cx="60" cy="79" rx="15" ry="3.5" />
      </g>
      <path d="M44 59 C52 55 66 55 76 58" fill="none" stroke="#fffbf5" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
