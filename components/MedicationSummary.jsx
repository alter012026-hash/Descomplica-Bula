"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  ["purpose", "Para que serve"],
  ["contraindications", "Quando não usar"],
  ["sideEffects", "Possíveis efeitos colaterais"],
  ["interactions", "Interações importantes"],
  ["precautions", "Cuidados e alertas"],
  ["seekHelp", "Quando procurar ajuda"],
];

export default function MedicationSummary() {
  const [enabled, setEnabled] = useState(false);
  const [medicineName, setMedicineName] = useState("");
  const [strength, setStrength] = useState("");
  const [leafletPdf, setLeafletPdf] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const officialLeafletUrl = "https://consultas.anvisa.gov.br/#/bulario/";

  useEffect(() => {
    let active = true;
    fetch("/api/medication-summary/status", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível consultar a disponibilidade.");
        if (active) setEnabled(data.enabled === true);
      })
      .catch((requestError) => {
        console.error("[medication-summary][status]", requestError.message);
      });
    return () => { active = false; };
  }, []);

  function handlePdfChange(event) {
    const selected = event.target.files?.[0] || null;
    setError("");
    setSummary(null);

    if (selected && selected.size > 4 * 1024 * 1024) {
      setLeafletPdf(null);
      event.target.value = "";
      setError("O PDF deve ter no máximo 4 MB.");
      return;
    }
    if (selected && selected.type && selected.type !== "application/pdf") {
      setLeafletPdf(null);
      event.target.value = "";
      setError("Selecione a bula em formato PDF.");
      return;
    }
    setLeafletPdf(selected);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    setSummary(null);

    try {
      const form = new FormData();
      form.set("medicineName", medicineName.trim());
      form.set("strength", strength.trim());
      if (leafletPdf) form.set("leafletPdf", leafletPdf);

      const response = await fetch("/api/medication-summary", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Não foi possível gerar o resumo.");
        return;
      }
      if (data.urgent) {
        setError(data.message);
        return;
      }
      if (data.error) throw new Error(data.error);
      setSummary(data);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível gerar o resumo.");
    } finally {
      setStatus("idle");
    }
  }

  if (!enabled) return null;

  return (
    <section className="section section--alt home-med-summary">
      <div className="container">
        <section className="med-summary" aria-labelledby="med-summary-title">
      <div className="med-summary-head">
        <span className="med-summary-kicker">Ferramenta informativa</span>
        <h2 id="med-summary-title">Resumo da bula</h2>
        <p>Entenda os principais pontos de um medicamento em linguagem simples.</p>
      </div>

      <form className="med-summary-form" onSubmit={handleSubmit}>
        <label className="med-summary-field">
          <span>Nome do medicamento</span>
          <input
            type="text"
            value={medicineName}
            onChange={(event) => {
              setMedicineName(event.target.value);
              setSummary(null);
            }}
            placeholder="Ex.: nome que aparece na caixa"
            maxLength={120}
            required
            disabled={status === "loading"}
            autoComplete="off"
          />
        </label>

        <label className="med-summary-field">
          <span>Concentração ou apresentação <small>(opcional)</small></span>
          <input
            type="text"
            value={strength}
            onChange={(event) => setStrength(event.target.value)}
            placeholder="Ex.: comprimido, gotas, concentração"
            maxLength={60}
            disabled={status === "loading"}
            autoComplete="off"
          />
        </label>

        <p className="med-summary-upload-help">
          1. <a href={officialLeafletUrl} target="_blank" rel="noopener noreferrer">Busque e baixe a bula do paciente no Bulário Eletrônico da Anvisa</a>.
          Confira se o medicamento e a apresentação correspondem à embalagem.
        </p>

        <label className="med-summary-upload">
          <span className="med-summary-upload-title">2. Envie o PDF da bula</span>
          <span className="med-summary-upload-help">PDF com texto selecionável, até 4 MB. PDFs digitalizados como imagem podem não ser legíveis.</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfChange}
            required
            disabled={status === "loading"}
          />
          {leafletPdf && <span className="med-summary-file">{leafletPdf.name}</span>}
        </label>

        <button
          type="submit"
          className="btn btn--hl med-summary-submit"
          disabled={status === "loading" || !medicineName.trim() || !leafletPdf}
        >
          {status === "loading" ? "Preparando resumo…" : "Entender este medicamento"}
        </button>
      </form>

      <p className="med-summary-disclaimer">
        O site confere se o nome informado aparece no texto do PDF, mas não consegue confirmar a autenticidade
        nem se aquela é a versão vigente. Não fornece doses nem orientação de uso. Confira a bula completa no
        Bulário da Anvisa e converse com um profissional de saúde.
      </p>
      <p className="med-summary-privacy">
        O PDF é processado para extrair o texto e não é armazenado pelo site. O texto extraído é enviado ao
        provedor de IA configurado para gerar o resumo.
      </p>

      {error && <p className="med-summary-error" role="alert">{error}</p>}

      {summary && (
        <div className="med-summary-result" aria-live="polite">
          <div className="med-summary-identity">
            <h3>{summary.medicineName}</h3>
            {summary.activeIngredient && <p>Princípio ativo: {summary.activeIngredient}</p>}
            {summary.uploadedSource?.uploadedAt && (
              <p>
                Resumo baseado no arquivo enviado. Autenticidade e vigência não verificadas.
              </p>
            )}
          </div>
          {SECTIONS.map(([key, title]) => (
            <section className="med-summary-result-section" key={key}>
              <h4>{title}</h4>
              {summary[key]?.length
                ? <ul>{summary[key].map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul>
                : <p>Não foi possível confirmar com segurança; confira a bula oficial.</p>}
            </section>
          ))}
          <a
            className="med-summary-source"
            href={summary.officialLeafletUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Conferir novamente no Bulário Eletrônico da Anvisa
          </a>
        </div>
      )}
        </section>
      </div>
    </section>
  );
}
