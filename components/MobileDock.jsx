"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const I = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM19 19v2H6" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {I[name]}
    </svg>
  );
}

const ITEMS = [
  { href: "/", label: "Início", icon: "home" },
  { href: "/blog", label: "Artigos", icon: "book" },
  { href: "/fontes-oficiais", label: "Fontes", icon: "folder" },
];

export default function MobileDock() {
  const pathname = usePathname() || "/";
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const off = pathname.startsWith("/admin");

  // Em páginas "modo foco" o dock some e o espaço reservado também
  useEffect(() => {
    const root = document.documentElement;
    if (off) root.setAttribute("data-nodock", "");
    else root.removeAttribute("data-nodock");
    return () => root.removeAttribute("data-nodock");
  }, [off]);

  // Some ao rolar para baixo (mais área de leitura), volta ao rolar para cima
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (Math.abs(delta) > 8) {
          setHidden(delta > 0 && y > 160);
          lastY.current = y;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => { setHidden(false); lastY.current = 0; }, [pathname]);

  if (off) return null;

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav className={`dock ${hidden ? "dock--hidden" : ""}`} aria-label="Navegação rápida">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className="dock-item" aria-current={isActive(it.href) ? "page" : undefined}>
          <span className="dock-icon"><Icon name={it.icon} /></span>
          {it.label}
        </Link>
      ))}
      <button type="button" className="dock-item" onClick={() => window.dispatchEvent(new CustomEvent("descomplica:search"))}>
        <span className="dock-icon"><Icon name="search" /></span>
        Buscar
      </button>
    </nav>
  );
}
