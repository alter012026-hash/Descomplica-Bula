"use client";

import { useEffect, useState } from "react";
import { trackSiteEvent } from "../lib/analytics-events";

export default function NewsletterPopup() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("nl_popup_shown")) return;

    let timeElapsed = false;
    let enoughRead = false;
    let triggered = false;

    function maybeShow() {
      if (triggered || !timeElapsed || !enoughRead) return;
      triggered = true;
      sessionStorage.setItem("nl_popup_shown", "1");
      setVisible(true);
    }

    const timer = setTimeout(() => {
      timeElapsed = true;
      maybeShow();
    }, 60000);

    function onScroll() {
      const doc = document.documentElement;
      const scrolled = doc.scrollTop || document.body.scrollTop;
      const total = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      if (total > 0 && scrolled / total >= 0.65) {
        enoughRead = true;
        maybeShow();
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function dismiss() {
    setDismissing(true);
    setTimeout(() => setVisible(false), 180);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "loading") return;
    if (!consent) return;

    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, source: window.location.pathname }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível concluir sua inscrição.");
      }

      setStatus("ok");
      trackSiteEvent("newsletter_signup_success", {
        source: window.location.pathname,
        consented_at: new Date().toISOString().slice(0, 10),
      });
      setMessage("Inscrição confirmada! Obrigado.");
      setEmail("");
      setTimeout(dismiss, 4000);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Algo deu errado. Tente novamente.");
    }
  }

  if (!visible) return null;

  return (
    <aside
      className={`nl-float ${dismissing ? "nl-float--closing" : ""}`}
      aria-label="Inscrição na newsletter"
      aria-live="polite"
    >
      <button
        className="nl-float-close"
        type="button"
        onClick={dismiss}
        aria-label="Fechar convite da newsletter"
      >
        ×
      </button>

      {status === "ok" ? (
        <p className="nl-float-success">{message}</p>
      ) : (
        <>
          <p className="nl-float-title">Receba os próximos artigos por e-mail</p>
          <p className="nl-float-copy">Gratuito e sem spam. Cancele quando quiser.</p>
          <form className="nl-float-form" onSubmit={handleSubmit}>
            <input
              type="email"
              required
              placeholder="Seu e-mail"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={status === "loading"}
              aria-label="Seu e-mail"
              onFocus={() => {
                if (!started) {
                  setStarted(true);
                  trackSiteEvent("newsletter_signup_start", { source: window.location.pathname });
                }
              }}
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Enviando…" : "Quero receber"}
            </button>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 7, color: "#d1d5db", fontSize: 11, lineHeight: 1.5, flexBasis: "100%" }}>
              <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Aceito receber a newsletter e posso cancelar quando quiser. <a href="/privacidade">Privacidade</a>.</span>
            </label>
          </form>
          {status === "error" && <p className="nl-float-error">{message}</p>}
        </>
      )}
    </aside>
  );
}
