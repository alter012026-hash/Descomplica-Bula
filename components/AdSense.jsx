"use client";

import { useEffect, useRef } from "react";
import config from "../site.config";

/**
 * Anúncio em local FIXO do layout.
 *
 * Cada local (`placement`) é um contêiner com altura reservada (ver .ad-slot
 * em chrome.css): o anúncio só aparece dentro dele, não empurra o texto
 * quando carrega e some por inteiro se o Google não tiver o que exibir.
 *
 * Locais em uso:
 *   "home"    — painel ao lado do mapa de estados (app/page.js)
 *   "inline"  — meio do artigo (app/blog/[slug]/page.js)
 *   "end"     — fim do texto do artigo (app/blog/[slug]/page.js)
 */
export default function AdSense({
  slot,
  placement = "inline",
  format = "auto",
  layout = null,
  layoutKey = null,
  label = true,
  className = "",
}) {
  const isConfigured = Boolean(
    config.adsense.enabled &&
    slot &&
    config.adsense.publisherId !== "ca-pub-XXXXXXXXXXXXXXXX"
  );

  const insRef = useRef(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !isConfigured) return;
    const el = insRef.current;
    // Evita inicializar o mesmo <ins> duas vezes (gera bloco em branco/erro).
    if (!el || el.getAttribute("data-adsbygoogle-status")) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {}
  }, [isConfigured]);

  if (process.env.NODE_ENV !== "production" || !isConfigured) return null;

  return (
    <div
      className={`ad-slot ad-slot--${placement} ${className}`.trim()}
      data-ad-placement={placement}
    >
      {label && <span className="ad-slot__label">Publicidade</span>}
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={config.adsense.publisherId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
        {...(layout ? { "data-ad-layout": layout } : {})}
        {...(layoutKey ? { "data-ad-layout-key": layoutKey } : {})}
      />
    </div>
  );
}
