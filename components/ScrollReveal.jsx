"use client";

import { useEffect } from "react";

/**
 * Observa todos os elementos .reveal / .reveal-stagger da página e adiciona
 * .is-visible quando entram na viewport. Um único observer compartilhado
 * por página, em vez de um por seção — mais barato e simples de manter.
 *
 * Renderiza nada (component "efeito colateral"): basta montá-lo uma vez por
 * página que use essas classes.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll(".reveal, .reveal-stagger");
    if (elements.length === 0) return;

    // Respeita prefers-reduced-motion: mostra tudo de imediato, sem animação.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
