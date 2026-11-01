"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackSiteEvent } from "../lib/analytics-events";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Busca local simples: pontua por presença do termo no título (peso maior),
 * categoria e resumo. Sem dependência externa — o índice (posts) já é
 * pequeno o bastante (gerado estaticamente) para varrer em memória.
 */
function searchPosts(posts, query) {
  const q = normalize(query).trim();
  if (!q) return [];

  const terms = q.split(/\s+/).filter(Boolean);

  return posts
    .map((post) => {
      const title = normalize(post.title);
      const category = normalize(post.category);
      const excerpt = normalize(post.excerpt);

      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += title.startsWith(term) ? 6 : 4;
        if (category.includes(term)) score += 2;
        if (excerpt.includes(term)) score += 1;
      }
      return { post, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.post);
}

export default function SearchPalette({ posts, open, onClose }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const router = useRouter();

  const results = useMemo(() => searchPosts(posts, query), [posts, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // foco logo após a animação de abertura começar
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function goTo(slug) {
    trackSiteEvent("internal_search", {
      query_length: query.trim().length,
      result_count: results.length,
    });
    onClose();
    router.push(`/blog/${slug}`);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) goTo(chosen.slug);
    }
  }

  return (
    <div
      className={`search-overlay ${open ? "is-open" : ""}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden={!open}
      data-no-vt
    >
      <div className="search-panel" role="dialog" aria-modal="true" aria-label="Buscar artigos">
        <div className="search-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Buscar: dipirona, interações, bulas…"
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Buscar artigos"
          />
          <span className="search-esc">Esc</span>
        </div>

        <div className="search-results">
          {query.trim() === "" ? (
            <p className="search-empty">Digite para buscar por título, tema ou categoria.</p>
          ) : results.length === 0 ? (
            <p className="search-empty">Nenhum artigo encontrado para “{query}”.</p>
          ) : (
            results.map((post, i) => (
              <a
                key={post.slug}
                className={`search-result ${i === activeIndex ? "is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={(e) => { e.preventDefault(); goTo(post.slug); }}
                href={`/blog/${post.slug}`}
              >
                <span className="search-result-title">{post.title}</span>
                <span className="search-result-meta">{post.category}</span>
              </a>
            ))
          )}
        </div>

        <div className="search-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}
