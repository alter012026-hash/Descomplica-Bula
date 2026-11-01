"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PostCover from "./PostCover";
import SwipeHint from "./SwipeHint";
import { getCategoryMeta } from "../lib/category-meta";

function formatDate(dateStr) {
  const match = String(dateStr || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Carrossel de artigos no desktop e faixa de stories rolável no celular.
 */
export default function LatestCarousel({ posts }) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [thumb, setThumb] = useState({ width: 40, left: 0 });

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.clientWidth || !el.scrollWidth) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
    const width = Math.min(100, Math.max(12, (el.clientWidth / el.scrollWidth) * 100));
    setThumb({ width, left: max > 0 ? (el.scrollLeft / max) * (100 - width) : 0 });
  }, []);

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return undefined;
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [update, posts]);

  function scrollByPage(direction) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector(".lc-slide");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    const visible = Math.max(1, Math.floor(el.clientWidth / step));
    el.scrollBy({ left: direction * step * visible, behavior: "smooth" });
  }

  function onKeyDown(event) {
    if (event.key === "ArrowRight") { event.preventDefault(); scrollByPage(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); scrollByPage(-1); }
  }

  if (!posts?.length) return null;

  return (
    <div className="lc">
      <div className="lc-desktop" role="region" aria-roledescription="carrossel" aria-label="Novos artigos">
        <button type="button" className="lc-arrow lc-arrow--prev" onClick={() => scrollByPage(-1)} disabled={!canPrev} aria-label="Artigos anteriores">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button type="button" className="lc-arrow lc-arrow--next" onClick={() => scrollByPage(1)} disabled={!canNext} aria-label="Próximos artigos">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>

        <ul className="lc-track" ref={trackRef} onScroll={update} onKeyDown={onKeyDown}>
          {posts.map((post) => {
            const meta = getCategoryMeta(post.category || "Geral");
            const date = formatDate(post.date);
            return (
              <li key={post.slug} className="lc-slide">
                <article className="lc-card cat" style={{ "--h": meta.hue }} data-vt-card>
                  <div className="lc-media" data-vt-media>
                    <PostCover slug={post.slug} category={post.category} />
                    <span className="lc-chip">{post.category || "Geral"}</span>
                  </div>
                  <div className="lc-body">
                    <h3 className="lc-title">
                      <Link href={`/blog/${post.slug}`}>{post.title || "Sem título"}</Link>
                    </h3>
                    <div className="lc-foot">
                      {date && <time dateTime={post.date}>{date}</time>}
                      {post.readingTime && <span>{post.readingTime}</span>}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>

        <div className="lc-progress" aria-hidden="true">
          <span style={{ width: `${thumb.width}%`, left: `${thumb.left}%` }} />
        </div>
      </div>

      <ul className="lc-story-track" role="region" aria-label="Stories de novos artigos">
        {posts.map((post) => <StorySlide key={post.slug} post={post} />)}
      </ul>
      {posts.length > 2 && <SwipeHint>Arraste para ver mais artigos</SwipeHint>}
    </div>
  );
}

function StorySlide({ post }) {
  const date = formatDate(post.date);

  return (
    <li className="lc-story-slide">
      <Link className="lc-story-card" href={`/blog/${post.slug}`} aria-label={`Ler artigo: ${post.title || "Sem título"}`}>
        <PostCover slug={post.slug} category={post.category} className="lc-story-cover" />
        <span className="lc-story-topline">
          <span className="lc-story-ring" aria-hidden="true" />
          <span>{post.category || "Geral"}</span>
        </span>
        <span className="lc-story-caption">
          <span className="lc-story-eyebrow">{date || "Novo artigo"}</span>
          <span className="lc-story-title">{post.title || "Sem título"}</span>
        </span>
      </Link>
    </li>
  );
}
