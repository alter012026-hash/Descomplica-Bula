"use client";

import { useState } from "react";

export default function ConsultarCidPage() {
  const [versao, setVersao] = useState("10");
  const [codigo, setCodigo] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [limite, setLimite] = useState(null);
  const [restante, setRestante] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function consultar(event) {
    event.preventDefault();
    if (carregando) return;
    setDetalhe(null);
    setErro("");
    setLimite(null);
    setRestante(null);
    setCarregando(true);

    try {
      const params = new URLSearchParams({ versao, codigo: codigo.trim() });
      const response = await fetch(`/api/cid?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Não foi possível consultar o código.");
      setDetalhe(data.detalhe);
      setLimite(Number.isInteger(data.rateLimitLimit) ? data.rateLimitLimit : null);
      setRestante(Number.isInteger(data.rateLimitRemaining) ? data.rateLimitRemaining : null);
    } catch (requestError) {
      setErro(requestError.message || "Serviço temporariamente indisponível.");
    } finally {
      setCarregando(false);
    }
  }

  const hierarquia = detalhe
    ? [
        ["Capítulo", detalhe.capitulo && detalhe.capituloDesc ? `${detalhe.capitulo} — ${detalhe.capituloDesc}` : detalhe.capituloDesc],
        ["Grupo", detalhe.grupo && detalhe.grupoDesc ? `${detalhe.grupo} — ${detalhe.grupoDesc}` : detalhe.grupoDesc],
        ["Categoria", detalhe.categoria && detalhe.categoriaDesc ? `${detalhe.categoria} — ${detalhe.categoriaDesc}` : detalhe.categoriaDesc],
        ["Bloco", detalhe.bloco && detalhe.blocoDesc ? `${detalhe.bloco} — ${detalhe.blocoDesc}` : detalhe.blocoDesc],
      ].filter(([, value]) => value)
    : [];

  return (
    <main className="section">
      <div className="container cid-search-page">
        <header className="section-header medication-search-header">
          <div>
            <p className="section-label">Classificação de doenças</p>
            <h1 className="section-title">Consulte um código CID</h1>
            <p className="hero-desc">
              Consulte a descrição e a hierarquia de um código CID-10 ou CID-11.
            </p>
          </div>
        </header>

        <div className="health-notice medication-search-notice">
          <strong>Importante:</strong> a CID é uma classificação, não um diagnóstico. A interpretação do código
          deve ser feita por um profissional de saúde.
        </div>

        <form className="medication-search-form" onSubmit={consultar}>
          <label htmlFor="cid-version">Versão</label>
          <select
            id="cid-version"
            className="cid-search-select"
            value={versao}
            onChange={(event) => {
              setVersao(event.target.value);
              setDetalhe(null);
              setErro("");
            }}
            disabled={carregando}
          >
            <option value="10">CID-10</option>
            <option value="11">CID-11</option>
          </select>

          <label htmlFor="cid-code">Código</label>
          <div className="medication-search-controls">
            <input
              id="cid-code"
              type="text"
              value={codigo}
              onChange={(event) => setCodigo(event.target.value)}
              placeholder={versao === "10" ? "Ex.: A00 ou A15.0" : "Ex.: 1A00"}
              maxLength={12}
              autoComplete="off"
              required
              disabled={carregando}
            />
            <button type="submit" className="btn btn--hl" disabled={carregando}>
              {carregando ? "Consultando…" : "Consultar"}
            </button>
          </div>
          <p>Consulta por código disponível no plano Free. A API tem limite mensal de requisições.</p>
        </form>

        {erro && (
          <div className="medication-search-error" role="status">
            <p>{erro}</p>
          </div>
        )}

        {detalhe && (
          <section className="medication-search-results" aria-live="polite">
            <div className="medication-search-result-heading">
              <h2>Resultado</h2>
              <span>
                {restante !== null
                  ? `${restante}${limite !== null ? ` de ${limite}` : ""} consultas restantes`
                  : ""}
              </span>
            </div>
            <article className="medication-search-card">
              <h3>{detalhe.codigo} — {detalhe.descricao}</h3>
              {hierarquia.length > 0 && (
                <dl>
                  {hierarquia.map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              )}
              {detalhe.tipo && <p className="cid-search-meta">Tipo: {detalhe.tipo}</p>}
              {detalhe.referenciaDados && (
                <p className="cid-search-meta">
                  Referência dos dados: {new Date(detalhe.referenciaDados).toLocaleDateString("pt-BR")}
                </p>
              )}
            </article>
          </section>
        )}

        <p className="medication-search-disclaimer">
          Esta consulta é informativa e não substitui avaliação, diagnóstico ou orientação de um profissional
          de saúde.
        </p>
      </div>
    </main>
  );
}
