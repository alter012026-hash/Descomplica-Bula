"use client";

import { useEffect, useState } from "react";

/**
 * Barra fixa no topo que avança conforme o scroll do artigo — reforça a
 * metáfora do site como "painel de progresso de estudo", em vez de ser
 * só um efeito decorativo solto.
 */
export default function ReadProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, pct)));
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div className="read-progress" style={{ width: `${progress}%` }} aria-hidden="true" />;
}
