"use client";

/**
 * useLocationKey() — "pathname + search" da URL atual, reativo.
 *
 * Por que existe: usePathname() ignora a query string, e o menu precisa
 * saber se /blog?categoria=Editais (e não /blog inteiro) está ativo.
 * useSearchParams() exigiria <Suspense> em todas as páginas estáticas.
 * Este hook observa pushState/replaceState/popstate uma única vez por
 * página, sem custo extra e sem quebrar o prerender (snapshot do servidor
 * é string vazia → "nada ativo" até hidratar).
 */
import { useSyncExternalStore } from "react";

let patched = false;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

function patch() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(emit);
      return result;
    };
  }
  window.addEventListener("popstate", emit);
}

function subscribe(cb) {
  patch();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLocationKey() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
    () => ""
  );
}

/** Compara um href do menu ("/blog?categoria=X") com a URL atual. */
export function isActiveHref(href, key) {
  if (!key) return false;
  const [hp, hs] = href.split("?");
  const [kp, ks = ""] = key.split("?");
  if (hs) {
    if (hp !== kp) return false;
    return new URLSearchParams(hs).get("categoria") === new URLSearchParams(ks).get("categoria");
  }
  if (hp === "/") return kp === "/";
  return kp === hp || kp.startsWith(hp + "/");
}
