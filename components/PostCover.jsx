import { getCategoryMeta } from "../lib/category-meta";
import { getCoverMarks, COVER_VIEWBOX } from "../lib/cover";

/**
 * Capa de artigo com cápsulas decorativas na cor da categoria.
 * Determinística por slug (ver lib/cover.js). Sem imagem para baixar:
 * funciona em todos os artigos e carrega na hora no celular.
 * Com `photo`, a ilustração entra por cima em duotone (usada só no destaque).
 */
export default function PostCover({ slug, category, photo, deep = false, className = "" }) {
  const meta = getCategoryMeta(category || "Geral");
  const marks = getCoverMarks(slug);
  return (
    <div
      className={`cover cat ${deep ? "cover--deep" : ""} ${className}`}
      style={{ "--h": meta.hue }}
      aria-hidden="true"
    >
      <svg className="cover-marks" viewBox={`0 0 ${COVER_VIEWBOX.w} ${COVER_VIEWBOX.h}`} preserveAspectRatio="xMidYMid slice">
        {marks.map((m, i) => (
          <rect key={i} x={m.cx - 14} y={m.cy - 5} width="28" height="10" rx="5" />
        ))}
      </svg>
      {photo && <img className="cover-photo" src={photo} alt="" loading="lazy" decoding="async" />}
    </div>
  );
}
