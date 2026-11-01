"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import config from "../site.config";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import SearchPalette from "./SearchPalette";
import { useLocationKey, isActiveHref } from "../lib/use-location";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export default function Header({ posts = [] }) {
  const pathname = usePathname();
  const locationKey = useLocationKey();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Fecha menu/busca ao trocar de rota
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Esc fecha o menu; Ctrl/Cmd+K abre a busca; o dock do celular abre
  // a busca disparando o evento "descomplica:search".
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    const onSearchEvent = () => { setMenuOpen(false); setSearchOpen(true); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("descomplica:search", onSearchEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("descomplica:search", onSearchEvent);
    };
  }, []);

  // Trava o scroll do fundo enquanto o menu está aberto
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <header className={`site-header ${scrolled ? "site-header--scrolled" : ""}`}>
        <div className="container site-header-inner">
          <Logo onClick={() => setMenuOpen(false)} />

          <nav className="site-nav" aria-label="Navegação principal">
            {config.navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={isActiveHref(item.href, locationKey) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar artigos"
            >
              <SearchIcon />
              <span>Buscar</span>
              <kbd>Ctrl K</kbd>
            </button>

            <ThemeToggle />

            <button
              type="button"
              className="menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuOpen}
              aria-controls="nav-sheet"
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      {/* Menu em tela cheia. Fica FORA do <header>: o backdrop-filter do
          header criaria um bloco de contenção e prenderia o position:fixed. */}
      <div id="nav-sheet" className={`nav-sheet ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen} data-no-vt>
        <nav className="nav-sheet-list" aria-label="Menu">
          {config.navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-sheet-link"
              aria-current={isActiveHref(item.href, locationKey) ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              tabIndex={menuOpen ? 0 : -1}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-sheet-meta">
          {config.footerNavigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <SearchPalette posts={posts} open={searchOpen} onClose={closeSearch} />
    </>
  );
}
