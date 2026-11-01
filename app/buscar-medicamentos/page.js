"use client";

import { useState } from "react";

const BULARIO_URL = "https://consultas.anvisa.gov.br/#/bulario/";

export default function BuscarMedicamentosPage() {
  const [nome, setNome] = useState("");
  const [resultados, setResultados] = useState([]);
  const [erro, setErro] = useState("");
  const [total, setTotal] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function pesquisar(event) {
    event.preventDefault();
    if (carregando) return;
    setErro("");
    setResultados([]);
    setTotal(null);
    setRemaining(null);

    if (nome.trim().length < 2) {
      setErro("Digite pelo menos 2 caracteres.");
      return;
    }

    setCarregando(true);
    try {
      const response = await fetch(`/api/medicamentos?nome=${encodeURIComponent(nome.trim())}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Não foi possível pesquisar.");

      setResultados(Array.isArray(data.resultados) ? data.resultados : []);
      setTotal(Number.isInteger(data.total) ? data.total : 0);
      setRemaining(Number.isInteger(data.rateLimitRemaining) ? data.rateLimitRemaining : null);
      if (!data.resultados?.length) setErro("Nenhum medicamento encontrado no catálogo.");
    } catch (requestError) {
      setErro(requestError.message || "Serviço temporariamente indisponível.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="section">
      <div className="container medication-search-page">
        <header className="section-header medication-search-header">
          <div>
            <p className="section-label">Busca no catálogo</p>
            <h1 className="section-title">Consulte medicamentos</h1>
            <p className="hero-desc">
              Pesquise por nome comercial ou princípio ativo e confira as apresentações cadastradas.
            </p>
          </div>
        </header>

        <div className="health-notice medication-search-notice">
          <strong>Sobre esta busca:</strong> o catálogo é fornecido por{" "}
          <a href="https://medicamentos.api.br/api/docs/" target="_blank" rel="noopener noreferrer">
            uma API de terceiros
          </a>{" "}
          que declara usar dados da Anvisa. Não é uma API oficial da Anvisa e os resultados não substituem a
          conferência da bula e da embalagem.
        </div>

        <form className="medication-search-form" onSubmit={pesquisar}>
          <label htmlFor="medicine-search-name">Nome comercial ou princípio ativo</label>
          <div className="medication-search-controls">
            <input
              id="medicine-search-name"
              type="search"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Ex.: dipirona"
              minLength={2}
              maxLength={100}
              autoComplete="off"
              required
              disabled={carregando}
            />
            <button type="submit" className="btn btn--hl" disabled={carregando}>
              {carregando ? "Buscando…" : "Pesquisar"}
            </button>
          </div>
          <p>Até 10 resultados por busca. A API pode aplicar limites diários e mensais.</p>
        </form>

        {erro && (
          <div className="medication-search-error" role="status">
            <p>{erro}</p>
            <a href={BULARIO_URL} target="_blank" rel="noopener noreferrer">
              Abrir o Bulário Eletrônico da Anvisa
            </a>
          </div>
        )}

        {resultados.length > 0 && (
          <section className="medication-search-results" aria-live="polite">
            <div className="medication-search-result-heading">
              <h2>Resultados</h2>
              <span>
                {total} {total === 1 ? "registro encontrado" : "registros encontrados"}
                {remaining !== null ? ` · ${remaining} consultas restantes na cota atual` : ""}
              </span>
            </div>
            <div className="medication-search-grid">
              {resultados.map((medicamento, index) => {
                return (
                  <article
                    className="medication-search-card"
                    key={`${medicamento.registro || medicamento.nome || "resultado"}-${index}`}
                  >
                    <h3>{medicamento.nome || "Nome não informado"}</h3>
                    <dl>
                      <div><dt>Princípio ativo</dt><dd>{medicamento.principioAtivo || "Não informado"}</dd></div>
                      <div><dt>Fabricante</dt><dd>{medicamento.fabricante || "Não informado"}</dd></div>
                      <div><dt>Registro Anvisa</dt><dd>{medicamento.registro || "Não informado"}</dd></div>
                      <div><dt>Situação no catálogo</dt><dd>{medicamento.situacao || "Não informada"}</dd></div>
                    </dl>
                    <a href={BULARIO_URL} target="_blank" rel="noopener noreferrer">
                      Buscar este registro no Bulário da Anvisa
                    </a>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <p className="medication-search-disclaimer">
          Confira se o nome, o fabricante e a apresentação correspondem ao medicamento que você tem. Para
          decisões sobre tratamento, consulte um profissional de saúde.
        </p>
      </div>
    </main>
  );
}
