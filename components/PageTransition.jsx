"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Fallback de transição para navegadores SEM View Transitions API:
 * remonta o wrapper a cada rota e aplica um fade+slide curto (CSS
 * .page-transition). Onde a API existe, não faz nada (a animação é feita
 * por components/ViewTransitions.jsx) — evita animação dupla e remontagem.
 * O carregamento inicial nunca anima (protege LCP e evita flash).
 */
export default function PageTransition({ children }) {
  const pathname = usePathname();
  const first = useRef(true);
  const [displayKey, setDisplayKey] = useState(pathname);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (typeof document.startViewTransition === "function") return;
    setAnimate(true);
    setDisplayKey(pathname);
  }, [pathname]);

  return (
    <div key={displayKey} className={animate ? "page-transition" : undefined}>
      {children}
    </div>
  );
}
