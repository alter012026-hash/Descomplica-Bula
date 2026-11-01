"use client";

import { useState } from "react";

/**
 * ArticleQA — "Tire sua dúvida" no rodapé de cada artigo. A resposta usa
 * apenas o conteúdo
 * do próprio post (ver lib/article-qa.js + app/api/article-qa/route.js).
 *
 * Mantém um histórico simples em memória (não persiste entre visitas) pra
 * permitir 2-3 perguntas de acompanhamento na mesma sessão de leitura.
 */
export default function ArticleQA({ slug }) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState("");
  const [thread, setThread] = useState([]); // [{ question, answer }]

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || status === "loading") return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/article-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, question: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Não foi possível responder agora.");
      }

      if (!data.answer) {
        // fallback: true — IA indisponível, mas não é erro do usuário
        setThread(prev => [
          ...prev,
          {
            question: trimmed,
            answer: "Não consegui gerar uma resposta agora. Consulte a bula oficial ou converse com um profissional de saúde.",
          },
        ]);
      } else {
        setThread(prev => [...prev, { question: trimmed, answer: data.answer }]);
      }

      setQuestion("");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Algo deu errado. Tente novamente.");
    }
  }

  return (
    <section className="article-qa reveal">
      <div className="article-qa-header">
        <span className="article-qa-badge">Tire sua dúvida</span>
        <h3 className="article-qa-title">Ficou alguma dúvida sobre este artigo?</h3>
        <p className="article-qa-sub">
          A resposta se limita ao artigo. Não informe dados pessoais; não fornecemos diagnóstico nem doses.
        </p>
      </div>

      {thread.length > 0 && (
        <div className="article-qa-thread">
          {thread.map((item, i) => (
            <div className="article-qa-item" key={i}>
              <p className="article-qa-q">
                <span className="article-qa-q-label">Você</span> {item.question}
              </p>
              <p className="article-qa-a">
                <span className="article-qa-a-label">Resposta</span> {item.answer}
              </p>
            </div>
          ))}
        </div>
      )}

      <form className="article-qa-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ex: onde encontro essa informação na bula?"
          maxLength={300}
          disabled={status === "loading"}
          className="article-qa-input"
          aria-label="Sua dúvida sobre o artigo"
        />
        <button
          type="submit"
          className="article-qa-btn"
          disabled={status === "loading" || question.trim().length < 6}
        >
          {status === "loading" ? "Pensando…" : "Perguntar →"}
        </button>
      </form>

      {status === "error" && (
        <p className="article-qa-feedback article-qa-feedback--error">{errorMsg}</p>
      )}
    </section>
  );
}
