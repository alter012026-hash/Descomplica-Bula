"use client";

import { useState } from "react";

const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 11.5A8.5 8.5 0 1 0 7.4 19L3 20.5l1.4-4.2A8.5 8.5 0 0 0 20 11.5z" />
    <path d="M9 9.5c.3 2 2.5 4.2 4.5 4.5l1.3-1.2-1.8-1-.7.6c-.8-.4-1.4-1-1.8-1.8l.6-.7-1-1.8L9 9.5z" />
  </svg>
);
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </svg>
);

/** Compartilhar: WhatsApp (principal canal de repasse no Brasil) e copiar link. */
export default function ShareBar({ url, title }) {
  const [done, setDone] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <div className="share-bar" data-no-vt>
      <a className="share-btn share-btn--wa" href={wa} target="_blank" rel="noopener noreferrer">
        <WaIcon /> Enviar no WhatsApp
      </a>
      <button type="button" className={`share-btn ${done ? "is-done" : ""}`} onClick={copy}>
        <LinkIcon /> {done ? "Link copiado!" : "Copiar link"}
      </button>
    </div>
  );
}
