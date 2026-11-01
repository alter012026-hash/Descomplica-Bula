/**
 * lib/cover.js
 *
 * Gera cápsulas decorativas determinísticas a partir do slug do artigo.
 * Mesmo slug → mesma capa, sem divergência de hidratação entre builds.
 */

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const COVER_VIEWBOX = { w: 320, h: 180 };

export function getCoverMarks(seed) {
  let h = hashString(String(seed || "descomplica-bula"));
  const marks = [];
  for (let i = 0; i < 18; i++) {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    const cx = 16 + (h % 288);

    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    const cy = 12 + (h % 156);

    marks.push({ cx, cy, d: i });
  }
  return marks;
}
