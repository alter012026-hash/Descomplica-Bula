"use client";

import { useState } from "react";

const SECTIONS = [
  ["purpose", "Para que serve"],
  ["contraindications", "Quando não usar"],
  ["sideEffects", "Possíveis efeitos colaterais"],
  ["interactions", "Interações importantes"],
  ["precautions", "Cuidados e alertas"],
  ["seekHelp", "Quando procurar ajuda"],
];

export default function MedicationSummary() {
  const [medicineName, setMedicineName] = useState("");
  const [strength, setStrength] = useState("");
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [officialLeafletUrl, setOfficialLeafletUrl] = useState("");

  function handleImageChange(event) {
    const selected = event.target.files?.[0] || null;
    setError("");
    setSummary(null);

    if (selected && selected.size > 3 * 1024 * 1024) {
      setImage(null);
      event.target.value = "";
      setError("A imagem deve ter no máximo 3 MB.");
      return;
    }
    setImage(selected);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    setSummary(null);
    setOfficialLeafletUrl("");

    try {
      const form = new FormData();
      form.set("medicineName", medicineName.trim());
      form.set("strength", strength.trim());
      if (image) form.set("image", image);

      const response = await fetch("/api/medication-summary", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Não foi possível gerar o resumo.");
        setOfficialLeafletUrl(data.officialLeafletUrl || "");
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

  return (
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
            onChange={(event) => setMedicineName(event.target.value)}
            placeholder="Ex.: nome que aparece na caixa"
            maxLength={120}
            required={!image}
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

        <label className="med-summary-upload">
          <span className="med-summary-upload-title">Ou envie uma foto da embalagem</span>
          <span className="med-summary-upload-help">Prefira uma imagem nítida, sem pessoas ou dados pessoais (JPG, PNG ou WebP; até 3 MB).</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            disabled={status === "loading"}
          />
          {image && <span className="med-summary-file">{image.name}</span>}
        </label>

        <button
          type="submit"
          className="btn btn--hl med-summary-submit"
          disabled={status === "loading" || (!medicineName.trim() && !image)}
        >
          {status === "loading" ? "Preparando resumo…" : "Entender este medicamento"}
        </button>
      </form>

      <p className="med-summary-disclaimer">
        O resumo usa o texto da bula do paciente localizado na consulta oficial da Anvisa. Se a bula
        não puder ser confirmada ou lida, o resumo não é gerado. Não fornece doses nem orientação de uso.
        Confira a bula completa e converse com um profissional de saúde.
      </p>
      <p className="med-summary-privacy">
        Se você enviar apenas uma foto, ela será processada por um serviço de IA somente para ler o nome
        do medicamento. A imagem não é salva pelo site.
      </p>

      {error && <p className="med-summary-error" role="alert">{error}</p>}
      {officialLeafletUrl && (
        <p>
          <a
            className="med-summary-source"
            href={officialLeafletUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir o Bulário Eletrônico da Anvisa
          </a>
        </p>
      )}

      {summary && (
        <div className="med-summary-result" aria-live="polite">
          <div className="med-summary-identity">
            <h3>{summary.medicineName}</h3>
            {summary.activeIngredient && <p>Princípio ativo: {summary.activeIngredient}</p>}
            {summary.officialSource?.manufacturer && <p>Fabricante: {summary.officialSource.manufacturer}</p>}
            {summary.officialSource?.accessedAt && (
              <p>
                Bula do paciente consultada na Anvisa em{" "}
                {new Date(summary.officialSource.accessedAt).toLocaleDateString("pt-BR")}.
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
            Conferir bula na consulta oficial da Anvisa
          </a>
        </div>
      )}
    </section>
  );
}
