import { Castle } from "./Castle";

/** Tool page banner: lavender dusk, a purple castle and a gold pixie-dust trail. */
export function CastleAtDusk() {
  return (
    <svg viewBox="0 0 1200 140" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A castle at dusk with a trail of pixie dust">
      <rect width="1200" height="140" fill="#e3c8f5" />
      <g fill="#fffbf5">
        <circle className="twinkle" cx="640" cy="24" r="1.6" />
        <circle className="twinkle" cx="1120" cy="30" r="1.6" />
        <circle className="twinkle" cx="760" cy="60" r="1.2" />
        <circle className="twinkle" cx="1170" cy="96" r="1.3" />
      </g>
      <path d="M620 120 Q 800 -10 1010 64" fill="none" stroke="#c9a43b" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
      <g fill="#c9a43b">
        <path className="twinkle" d="M1010 54 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5z" />
        <circle className="twinkle" cx="720" cy="46" r="2.2" />
        <circle className="twinkle" cx="880" cy="30" r="1.8" />
      </g>
      <Castle body="#7b3f99" roof="#7b3f99" gate="#e3c8f5" transform="translate(860 20)" />
    </svg>
  );
}
