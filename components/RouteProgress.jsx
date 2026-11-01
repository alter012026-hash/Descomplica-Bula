"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Barra fininha no topo da página que "acende" assim que o usuário clica
 * em um link interno e completa quando a navegação termina (troca de
 * pathname). É só feedback visual — não bloqueia nada — e some sozinha
 * se a navegação não completar (ex.: usuário cancelou), evitando barra
 * "presa" na tela.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timeoutRef = useRef(null);
  const isFirstRender = useRef(true);

  // Detecta cliques em links internos (mesma origem, não em nova aba,
  // sem modificadores) para iniciar a barra antes da navegação de fato
  // acontecer — dá a sensação de resposta imediata.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    function onClick(e) {
      const link = e.target.closest("a");
      if (!link) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      setVisible(true);
      setWidth(20);
      clearTimeout(timeoutRef.current);
      // Sobe devagar até 80% enquanto espera o RSC chegar; os 20% finais
      // só entram quando a rota realmente troca (useEffect abaixo).
      timeoutRef.current = setTimeout(() => setWidth(80), 120);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Quando a rota muda de fato, completa a barra e some em seguida.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setWidth(100);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 260);
    return () => clearTimeout(timeoutRef.current);
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="route-progress"
      style={{
        opacity: visible ? 1 : 0,
        width: `${width}%`,
      }}
    />
  );
}
