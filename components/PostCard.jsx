import Link from "next/link";
import { getCategoryMeta } from "../lib/category-meta";
import PostCover from "./PostCover";

function formatDate(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (isNaN(d.getTime())) return null;
  const sameYear = d.getUTCFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("pt-BR", sameYear
    ? { day: "numeric", month: "short", timeZone: "UTC" }
    : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Card de artigo. O card inteiro é clicável (link "esticado" no título),
 * então há UM só link por card — melhor para leitor de tela e para o toque.
 * Celular: linha compacta (miniatura + título). A partir de 640px: card
 * vertical. `featured` = destaque grande com a foto em duotone.
 */
export default function PostCard({ post, featured = false, photo = null, headingLevel = 3, related = false }) {
  const formattedDate = formatDate(post.date);
  const meta = getCategoryMeta(post.category || "Geral");
  const H = `h${headingLevel}`;

  return (
    <article
      className={`post-card cat ${featured ? "post-card--featured" : ""}`}
      style={{ "--h": meta.hue }}
      data-vt-card
    >
      <div className="post-card-media" data-vt-media>
        <PostCover
          slug={post.slug}
          category={post.category}
          photo={photo}
          deep={featured}
        />
      </div>

      <div className="post-card-body">
        <div className="post-card-meta">
          <span className="post-card-category">{post.category || "Geral"}</span>
        </div>

        <H className="post-card-title">
          <Link
            href={`/blog/${post.slug}`}
            data-analytics-event={related ? "related_article_click" : undefined}
            data-target-slug={related ? post.slug : undefined}
          >
            {post.title || "Sem título"}
          </Link>
        </H>

        {post.excerpt && <p className="post-card-excerpt">{post.excerpt}</p>}

        <div className="post-card-foot">
          {formattedDate && <time dateTime={post.date}>{formattedDate}</time>}
          {post.readingTime && <span className="post-card-reading">{post.readingTime}</span>}
        </div>
      </div>
    </article>
  );
}
