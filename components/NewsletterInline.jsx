"use client";

import { useState } from "react";
import { trackSiteEvent } from "../lib/analytics-events";

/**
 * NewsletterInline — bloco de alta conversão inserido no meio dos artigos
 * (entre o conteúdo dividido) e também na homepage após os artigos recentes.
 * Diferente do NewsletterBox do footer: copy persuasivo, visual destacado.
 */
export default function NewsletterInline({ variant = "article" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [started, setStarted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "loading") return;
    if (!consent) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, source: window.location.pathname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Tente novamente.");
      setStatus("ok");
      trackSiteEvent("newsletter_signup_success", {
        source: window.location.pathname,
        consented_at: new Date().toISOString().slice(0, 10),
      });
      setMessage("Inscrição confirmada! Você receberá novidades por e-mail. 🎉");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Algo deu errado. Tente novamente.");
    }
  }

  const isArticle = variant === "article";

  if (status === "ok") {
    return (
      <div className="nl-inline nl-inline--ok">
        <span className="nl-inline-ok-icon">🎉</span>
        <div>
          <p className="nl-inline-ok-title">Você está na lista!</p>
          <p className="nl-inline-ok-sub">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`nl-inline ${isArticle ? "nl-inline--article" : "nl-inline--home"}`}>
      <div className="nl-inline-left">
        <span className="nl-inline-badge">📬 Novidades por e-mail</span>
        <p className="nl-inline-title">
          Informação clara, direto no seu e-mail.
        </p>
        <p className="nl-inline-sub">
          Receba novos conteúdos sobre medicamentos, bulas e cuidados em linguagem simples.
        </p>
        <ul className="nl-inline-bullets">
          <li>✅ Conteúdo informativo com fontes oficiais</li>
          <li>✅ 100% gratuito, cancele quando quiser</li>
          <li>✅ Sem spam — só conteúdo que vale a pena</li>
        </ul>
      </div>

      <div className="nl-inline-right">
        <form className="nl-inline-form" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={status === "loading"}
            className="nl-inline-input"
            aria-label="Seu e-mail"
            onFocus={() => {
              if (!started) {
                setStarted(true);
                trackSiteEvent("newsletter_signup_start", { source: window.location.pathname });
              }
            }}
          />
          <button
            type="submit"
            className="nl-inline-btn"
            disabled={status === "loading"}
          >
            {status === "loading" ? "Enviando…" : "Quero receber →"}
          </button>
          <label className="nl-inline-consent" style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.5, margin: "8px 0" }}>
            <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Aceito receber a newsletter e posso cancelar a inscrição quando quiser. <a href="/privacidade">Privacidade</a>.</span>
          </label>
        </form>

        {message && status === "error" && (
          <p className="nl-inline-feedback nl-inline-feedback--error">{message}</p>
        )}

        <p className="nl-inline-disclaimer">
          🔒 Seus dados ficam só aqui. Zero spam.
        </p>
      </div>
    </div>
  );
}
