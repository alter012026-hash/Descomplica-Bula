"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Transições modernas entre páginas (View Transitions API) no App Router.
 *
 * Intercepta cliques em links internos, executa router.push() DENTRO de
 * document.startViewTransition() e só "libera" a transição quando a nova
 * página já foi montada (a URL mudou). Resultado: a página antiga recua,
 * a nova sobe, header/dock ficam fixos e a capa do card clicado viaja
 * até a faixa do artigo (view-transition-name: post-cover).
 *
 * Sem suporte (ou com "reduzir movimento") nada é interceptado: o Next
 * navega normalmente e o PageTransition aplica um fade simples.
 * Links com [data-no-vt] (menu, busca) também navegam do jeito normal.
 */
export default function ViewTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (typeof document.startViewTransition !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.setAttribute("data-vt", "1");

    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-no-vt]")) return;

      let url;
      try { url = new URL(a.getAttribute("href"), window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (/^\/(admin|api|og)(\/|$)/.test(url.pathname) || window.location.pathname.startsWith("/admin")) return;
      const next = url.pathname + url.search;
      const current = window.location.pathname + window.location.search;
      if (next === current || (url.pathname === window.location.pathname && url.hash)) return;

      e.preventDefault();
      e.stopPropagation();

      // capa compartilhada: só UM elemento pode ter o nome na página antiga
      document.querySelectorAll(".article-art").forEach((el) => { el.style.viewTransitionName = "none"; });
      const media = a.closest("[data-vt-card]")?.querySelector("[data-vt-media]");
      if (media) media.style.viewTransitionName = "post-cover";

      const startHref = window.location.href;
      const t = document.startViewTransition(
        () =>
          new Promise((resolve) => {
            routerRef.current.push(next);
            const started = performance.now();
            const tick = () => {
              if (window.location.href !== startHref) {
                // 2 frames para o React concluir o commit antes do "depois"
                requestAnimationFrame(() => requestAnimationFrame(resolve));
              } else if (performance.now() - started > 3000) {
                resolve();
              } else {
                requestAnimationFrame(tick);
              }
            };
            tick();
          })
      );
      t.finished.finally(() => { if (media) media.style.viewTransitionName = ""; });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // sem uso direto do pathname, mas garante re-render ao navegar
  void pathname;
  return null;
}
