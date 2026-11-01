"use client";

import { useEffect, useMemo, useState } from "react";

const MAX_ITEMS = 5;

export default function EditorialPlanPanel({ toast, onReview }) {
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState({});
  const [selectedTopics, setSelectedTopics] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/ideas", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as categorias.");
        if (!active) return;
        const categoryList = data.categories || [];
        setCategories(categoryList);
        setCounts(Object.fromEntries(categoryList.map(({ name }) => [name, 0])));
        setSelectedTopics(Object.fromEntries(categoryList.map(({ name }) => [name, []])));
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const plannedCount = useMemo(
    () => Object.values(counts).reduce((total, count) => total + count, 0),
    [counts]
  );
  const hasMissingTopics = categories.some(({ name, topics }) => (
    counts[name] > 0
      && (topics.length === 0
        || (selectedTopics[name] || []).length !== counts[name]
        || (selectedTopics[name] || []).some((topic) => !topic))
  ));
  const styles = {
    card: {
      background: "#F8FAFC",
      border: "1px solid #E4E7EC",
      borderRadius: 12,
      padding: 18,
    },
    input: {
      width: "100%",
      minHeight: 40,
      padding: "8px 10px",
      border: "1px solid #D0D5DD",
      borderRadius: 8,
      background: "#fff",
      color: "#17212B",
      fontSize: 13,
    },
    button: {
      border: 0,
      borderRadius: 8,
      padding: "11px 16px",
      background: "#B4232C",
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
    },
  };

  function updateCount(category, value) {
    const otherCount = plannedCount - (counts[category] || 0);
    const maxForCategory = Math.max(0, MAX_ITEMS - otherCount);
    const nextCount = Math.min(maxForCategory, Math.max(0, Number(value) || 0));
    setCounts((current) => ({ ...current, [category]: nextCount }));
    setSelectedTopics((current) => {
      const currentTopics = current[category] || [];
      return {
        ...current,
        [category]: currentTopics.slice(0, nextCount).concat(
          Array(Math.max(0, nextCount - currentTopics.length)).fill("")
        ),
      };
    });
    setResults(null);
  }

  function updateTopic(category, index, topic) {
    setSelectedTopics((current) => ({
      ...current,
      [category]: (current[category] || []).map((value, slot) => slot === index ? topic : value),
    }));
    setResults(null);
  }

  async function generatePlan() {
    const plan = categories
      .filter(({ name }) => counts[name] > 0)
      .map(({ name }) => ({ category: name, topics: selectedTopics[name] || [] }));

    if (plannedCount === 0 || hasMissingTopics) {
      toast("Defina a quantidade e escolha um tema para cada artigo.", "err");
      return;
    }

    setGenerating(true);
    setResults(null);
    try {
      const response = await fetch("/api/admin/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao gerar artigos.");
      setResults(data);
      const generatedCount = data.generated?.length || 0;
      const errorCount = data.errors?.length || 0;
      toast(
        `${generatedCount} artigo(s) enviado(s) para revisão${errorCount ? `; ${errorCount} falha(s)` : ""}.`,
        generatedCount ? "ok" : "err"
      );
    } catch (error) {
      toast(`Erro: ${error.message}`, "err");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p style={{ color: "#667085" }}>Carregando categorias e temas…</p>;
  if (loadError) {
    return (
      <div role="alert" style={{ ...styles.card, color: "#B42318" }}>
        Não foi possível carregar o planejamento editorial: {loadError}
      </div>
    );
  }

  return (
    <div>
      <section style={{ ...styles.card, marginBottom: 16, background: "#FFF7ED", borderColor: "#FED7AA" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "#17212B" }}>Monte um lote editorial por categoria</h2>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Defina quantos artigos quer em cada categoria e escolha um tema específico para cada um.
          O lote aceita até {MAX_ITEMS} artigos; tudo que for gerado ficará na fila de aprovação, sem publicação automática.
        </p>
        <p aria-live="polite" style={{ margin: "12px 0 0", fontWeight: 700, color: "#8F1821" }}>
          {plannedCount} de {MAX_ITEMS} artigo(s) planejado(s)
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        {categories.map(({ name, topics }) => {
          const count = counts[name] || 0;
          const chosen = selectedTopics[name] || [];
          return (
            <section key={name} style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, color: "#17212B" }}>{name}</h3>
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#475467", fontSize: 12 }}>
                  Artigos
                  <input
                    aria-label={`Quantidade de artigos para ${name}`}
                    type="number"
                    min="0"
                    max={MAX_ITEMS}
                    value={count}
                    onChange={(event) => updateCount(name, event.target.value)}
                    style={{ ...styles.input, width: 68, minHeight: 36 }}
                  />
                </label>
              </div>
              <p style={{ margin: "0 0 12px", color: "#667085", fontSize: 12 }}>
                {topics.length} temas editoriais disponíveis
              </p>
              {count > 0 && topics.length === 0 && (
                <p role="alert" style={{ color: "#B42318", fontSize: 13 }}>
                  Esta categoria não tem temas cadastrados.
                </p>
              )}
              {Array.from({ length: count }, (_, index) => {
                const usedInOtherSlots = new Set(chosen.filter((_, slot) => slot !== index));
                return (
                  <label key={`${name}-${index}`} style={{ display: "block", marginTop: 10, color: "#475467", fontSize: 12 }}>
                    Tema do artigo {index + 1}
                    <select
                      aria-label={`Tema ${index + 1} para ${name}`}
                      value={chosen[index] || ""}
                      onChange={(event) => updateTopic(name, index, event.target.value)}
                      style={{ ...styles.input, marginTop: 5 }}
                    >
                      <option value="">Selecione um tema…</option>
                      {topics.map((topic) => (
                        <option key={topic} value={topic} disabled={usedInOtherSlots.has(topic)}>
                          {topic}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </section>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 18 }}>
        <button
          type="button"
          onClick={generatePlan}
          disabled={generating || plannedCount === 0 || hasMissingTopics}
          style={{ ...styles.button, opacity: generating || plannedCount === 0 || hasMissingTopics ? 0.6 : 1 }}
        >
          {generating ? "Gerando lote…" : `Gerar ${plannedCount} artigo(s) para revisão`}
        </button>
        {results?.generated?.length > 0 && (
          <button type="button" onClick={onReview} style={{ ...styles.button, background: "#198754" }}>
            Abrir fila de revisão
          </button>
        )}
      </div>

      {results && (
        <section aria-live="polite" style={{ ...styles.card, marginTop: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Resultado do lote</h2>
          {results.generated?.map((item) => (
            <p key={`${item.category}-${item.file}`} style={{ margin: "8px 0", color: "#198754", lineHeight: 1.5 }}>
              ✓ {item.category}: {item.topic} — enviado para revisão.
            </p>
          ))}
          {results.errors?.map((item, index) => (
            <p key={`${item.category}-${item.topic}-${index}`} style={{ margin: "8px 0", color: "#B42318", lineHeight: 1.5 }}>
              ! {item.category}: {item.topic} — {item.error}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
