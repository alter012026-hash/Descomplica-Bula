"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, consentValue, readConsentFromDocument } from "../lib/consent";

/**
 * Grava a escolha no servidor (Set-Cookie: o Safari não corta em 7 dias) e avisa
 * o resto do site. Se a rede falhar, grava direto no navegador como plano B.
 */
async function saveChoice(choice) {
  let saved = false;
  try {
    const res = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    });
    saved = res.ok;
  } catch {
    /* cai no plano B abaixo */
  }
  if (!saved) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${consentValue(choice)}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  }
  window.dispatchEvent(new CustomEvent("pj:consent", { detail: { choice } }));
}

/** Botão para reabrir o banner (usado no rodapé): permite mudar de ideia a qualquer momento. */
export function CookiePrefsButton({ className = "", children = "Preferências de cookies" }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("pj:open-consent"))}>
      {children}
    </button>
  );
}

export default function ConsentBanner() {
  const [view, setView] = useState({ ready: false, open: false, current: null });
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const askedByUser = useRef(false);

  useEffect(() => {
    const current = readConsentFromDocument();
    setView({ ready: true, open: current === null, current });
    const reopen = () => {
      askedByUser.current = true;
      setView({ ready: true, open: true, current: readConsentFromDocument() });
    };
    window.addEventListener("pj:open-consent", reopen);
    return () => window.removeEventListener("pj:open-consent", reopen);
  }, []);

  // Quando a pessoa reabre pelo rodapé, o foco vai para o banner (leitor de tela e teclado).
  useEffect(() => {
    if (view.open && askedByUser.current) {
      boxRef.current?.focus();
      askedByUser.current = false;
    }
  }, [view.open]);

  const close = useCallback(() => setView((v) => ({ ...v, open: false })), []);

  // Esc fecha, mas só quando já existe uma escolha (na primeira vez ela é necessária).
  useEffect(() => {
    if (!view.open || view.current === null) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view.open, view.current, close]);

  async function choose(choice) {
    if (busy) return;
    setBusy(true);
    await saveChoice(choice);
    setView({ ready: true, open: false, current: choice });
    setBusy(false);
  }

  if (!view.ready || !view.open) return null;

  return (
    <section
      ref={boxRef}
      tabIndex={-1}
      className="consent"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-text"
    >
      <h2 id="consent-title" className="consent-title">Cookies de estatística</h2>
      <p id="consent-text" className="consent-text">
        Com a sua permissão, usamos um cookie próprio com um código aleatório para entender como
        cada visita acontece: quais páginas são lidas, por onde você chegou e se você volta
        depois. Isso não identifica você por nome ou e-mail. Recusar não tira nada do site. Os
        anúncios do Google seguem regras próprias, explicadas na{" "}
        <Link href="/privacidade#cookies">Política de Privacidade</Link>.
      </p>
      {view.current !== null && (
        <p className="consent-current" aria-live="polite">
          Sua escolha atual: {view.current === "accepted" ? "aceitou" : "recusou"}. Ao recusar,
          apagamos o seu código de visitante e os registros ligados a ele.
        </p>
      )}
      <div className="consent-actions">
        <button type="button" className="consent-btn consent-btn--reject" onClick={() => choose("rejected")} disabled={busy}>
          Recusar
        </button>
        <button type="button" className="consent-btn consent-btn--accept" onClick={() => choose("accepted")} disabled={busy}>
          Aceitar
        </button>
      </div>
      {view.current !== null && (
        <button type="button" className="consent-close" onClick={close} aria-label="Fechar sem alterar">
          ✕
        </button>
      )}
    </section>
  );
}
