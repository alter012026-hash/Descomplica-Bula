"use client";

import { useState } from "react";
import { trackSiteEvent } from "../lib/analytics-events";

/**
 * NewsletterBox — versão compacta usada no Footer.
 * Copy atualizado para ser mais persuasivo.
 */
export default function NewsletterBox() {
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
    setMessage("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, source: window.location.pathname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível concluir sua inscrição.");
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

  return (
    <div className="newsletter-box">
      <p className="newsletter-title">📬 Receba novos conteúdos por e-mail</p>
      <p className="newsletter-subtitle">
        Gratuito · Sem spam · Cancele quando quiser
      </p>

      {status !== "ok" ? (
        <form className="newsletter-form" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={status === "loading"}
            className="newsletter-input"
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
            className="newsletter-submit"
            disabled={status === "loading"}
          >
            {status === "loading" ? "…" : "Inscrever"}
          </button>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.5, flexBasis: "100%" }}>
            <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Aceito receber a newsletter e posso cancelar a inscrição quando quiser. <a href="/privacidade">Privacidade</a>.</span>
          </label>
        </form>
      ) : null}

      {message && (
        <p className={`newsletter-feedback ${status === "error" ? "is-error" : "is-ok"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
