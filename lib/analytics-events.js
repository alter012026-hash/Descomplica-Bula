"use client";

import { track } from "@vercel/analytics/react";
import { readConsentFromDocument } from "./consent";

const EVENT_NAMES = new Set([
  "newsletter_signup_start",
  "newsletter_signup_success",
  "affiliate_click",
  "internal_search",
  "related_article_click",
  "outbound_official_source_click",
]);

// Envia a ação para o painel próprio (aba Tráfego → Visitas do /admin).
// Só quando o visitante aceitou os cookies — e o servidor confere de novo.
// O servidor guarda apenas o nome da ação e uma dimensão higienizada
// (parceiro, artigo, domínio…), nunca texto digitado pelo usuário.
function sendOwnEvent(name, properties) {
  try {
    if (readConsentFromDocument() !== "accepted") return;
    const payload = JSON.stringify({ t: "ev", name, path: window.location.pathname, props: properties });
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

export function trackSiteEvent(name, properties = {}) {
  if (!EVENT_NAMES.has(name)) return;
  track(name, properties);
  sendOwnEvent(name, properties);
}
