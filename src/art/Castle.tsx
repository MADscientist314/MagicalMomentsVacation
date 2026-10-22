// A generic fairytale castle (not any real park landmark), drawn on a 140×120 grid
// with its base on y=120. Place it with the transform prop.

export function Castle({ body, roof, gate, transform }: { body: string; roof: string; gate: string; transform: string }) {
  return (
    <g transform={transform}>
      <g fill={body}>
        <rect x="10" y="70" width="120" height="50" />
        <rect x="0" y="56" width="20" height="64" />
        <rect x="120" y="56" width="20" height="64" />
        <rect x="50" y="44" width="40" height="76" />
        <rect x="28" y="60" width="16" height="60" />
        <rect x="96" y="60" width="16" height="60" />
      </g>
      <g fill={roof}>
        <path d="M-2 58 L10 30 L22 58Z" />
        <path d="M118 58 L130 30 L142 58Z" />
        <path d="M46 46 L70 6 L94 46Z" />
        <path d="M26 62 L36 40 L46 62Z" />
        <path d="M94 62 L104 40 L114 62Z" />
      </g>
      <path d="M62 120 v-16 a8 8 0 0 1 16 0 v16z" fill={gate} />
    </g>
  );
}
