"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function send(body) {
  const payload = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      if (ok) return;
    }
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* rastreio nunca deve quebrar a página */
  }
}

function readUtm() {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm = { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") };
    return utm.source || utm.medium || utm.campaign ? utm : undefined;
  } catch {
    return undefined;
  }
}

function scrollPercent() {
  const el = document.documentElement;
  const total = Math.max(el.scrollHeight, 1);
  return Math.min(100, Math.round(((window.scrollY + window.innerHeight) / total) * 100));
}

/**
 * Registra visualizações (inclusive navegação interna do Next) e, ao sair de
 * cada página, o tempo de leitura, a rolagem e se foi uma visita de uma
 * página só (rejeição). Esta camada é anônima: sem cookies, sem localStorage,
 * tudo vive na memória da aba. Quem aceita os cookies (ver ConsentBanner) tem
 * também a visita individual registrada pelo servidor, que reconhece o
 * consentimento pelo cookie enviado nessas mesmas requisições.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const st = useRef({ path: null, pages: 0, firstSent: false, since: null, acc: 0, scroll: 0, entry: true, ref0: "", utm0: undefined });

  // Envia o que foi medido da página atual e zera os contadores.
  function flush() {
    const s = st.current;
    if (!s.path) return;
    if (s.since !== null) {
      s.acc += Date.now() - s.since;
      s.since = document.visibilityState === "visible" ? Date.now() : null;
    }
    const sec = Math.round(s.acc / 1000);
    if (sec < 1 && s.firstSent) return;
    send({ t: "e", path: s.path, sec, scroll: s.scroll, pages: s.pages, first: !s.firstSent });
    s.firstSent = true;
    s.acc = 0;
  }

  // Ouvintes globais (uma vez só).
  useEffect(() => {
    const s = st.current;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        s.scroll = Math.max(s.scroll, scrollPercent());
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else if (s.path) s.since = Date.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aceitou os cookies agora: abre a visita individual com a página atual.
  // (As visualizações anteriores ao aceite ficam só no painel anônimo.)
  useEffect(() => {
    const onConsent = (event) => {
      const s = st.current;
      if (event.detail?.choice !== "accepted" || !s.path) return;
      const first = s.pages === 1;
      send({ t: "c", path: s.path, entry: first, referrer: first ? s.ref0 : "", ...(first ? { utm: s.utm0 } : {}) });
    };
    window.addEventListener("pj:consent", onConsent);
    return () => window.removeEventListener("pj:consent", onConsent);
  }, []);

  useEffect(() => {
    const s = st.current;
    if (!pathname || pathname === s.path) return;

    // Foi para o /admin: fecha a medição da página pública e para de contar.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      flush();
      s.path = null;
      s.since = null;
      return;
    }

    // Saindo de uma página pública para outra: envia o tempo da anterior.
    s.pages += 1;
    if (s.path) flush();

    s.path = pathname;
    s.scroll = 0;
    s.acc = 0;
    s.since = document.visibilityState === "visible" ? Date.now() : null;
    const t = setTimeout(() => { s.scroll = Math.max(s.scroll, scrollPercent()); }, 500);

    // O referrer externo só vale para a primeira página do carregamento.
    const entry = s.entry;
    if (entry) {
      s.ref0 = document.referrer;
      s.utm0 = readUtm();
    }
    send({
      path: pathname,
      referrer: entry ? s.ref0 : "",
      entry,
      ...(entry ? { utm: s.utm0 } : {}),
    });
    s.entry = false;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
