import { Castle } from "./Castle";

function Burst({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const d = r * 0.7;
  return (
    <g className="twinkle" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path
        d={`M${x} ${y - r}V${y + r}M${x - r} ${y}H${x + r}M${x - d} ${y - d}L${x + d} ${y + d}M${x - d} ${y + d}L${x + d} ${y - d}`}
      />
    </g>
  );
}

const STARS: [number, number, number][] = [
  [60, 40, 1.8], [150, 22, 1.4], [260, 70, 1.4], [420, 30, 1.6], [880, 26, 1.6],
  [960, 80, 1.3], [1060, 40, 1.8], [1150, 96, 1.4], [700, 18, 1.3], [330, 120, 1.2],
];

/** Home screen header: royal-blue night, fireworks over a pink-and-blue castle. */
export function FireworksNight() {
  return (
    <svg viewBox="0 0 1200 230" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Fireworks over a fairytale castle at night">
      <rect width="1200" height="230" fill="#1f2560" />
      <g fill="#fffbf5">
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} className="twinkle" cx={x} cy={y} r={r} />
        ))}
      </g>
      <Burst x={560} y={56} r={20} color="#f3d58a" />
      <Burst x={840} y={70} r={26} color="#f4a6c8" />
      <Burst x={1010} y={130} r={14} color="#cdb4f0" />
      <Burst x={1100} y={50} r={12} color="#f3d58a" />
      <Burst x={460} y={130} r={10} color="#cdb4f0" />
      <Castle body="#f4c6da" roof="#5b7fd6" gate="#1f2560" transform="translate(640 68) scale(1.35)" />
    </svg>
  );
}
