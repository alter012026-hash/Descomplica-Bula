import { getCoverMarks, COVER_VIEWBOX } from "../lib/cover";

const rings = [];
for (let row = 0; row < 4; row++) {
  for (let column = 0; column < 5; column++) {
    rings.push({ cx: 32 + column * 62, cy: 24 + row * 44 });
  }
}

/** Fundo decorativo do hero com cápsulas da identidade do site. */
export default function HeroSheet() {
  const marks = getCoverMarks("descomplica-bula-home").filter((m) => m.cx > 220);
  return (
    <svg className="hero-sheet" viewBox={`0 0 ${COVER_VIEWBOX.w} ${COVER_VIEWBOX.h}`} preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g className="hero-rings">{rings.map((p, i) => <rect key={i} x={p.cx - 14} y={p.cy - 5} width="28" height="10" rx="5" />)}</g>
      <g className="hero-marks">{marks.map((m, i) => <rect key={i} x={m.cx - 14} y={m.cy - 5} width="28" height="10" rx="5" style={{ "--i": i }} />)}</g>
    </svg>
  );
}
