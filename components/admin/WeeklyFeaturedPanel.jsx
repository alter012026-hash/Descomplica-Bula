"use client";

import { useCallback, useEffect, useState } from "react";

const colors = {
  background: "#F4F6FF",
  border: "#D3D9F4",
  surface: "#FFFFFF",
  text: "#12163A",
  muted: "#454B73",
  primary: "#2430E6",
  green: "#0B7A47",
  red: "#C93525",
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR");
}

export default function WeeklyFeaturedPanel({ toast }) {
  const [posts, setPosts] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/weekly-featured", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar os destaques.");
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setFeatured(data.featured || null);
      setSelectedSlug((current) => current || data.featured?.slug || "");
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(action) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/weekly-featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slug: selectedSlug }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao atualizar o destaque.");
      setFeatured(data.featured || null);
      toast(action === "feature" ? "Destaque semanal atualizado por 7 dias." : "Destaque semanal encerrado.");
      await load();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const featuredPost = posts.find((post) => post.slug === featured?.slug);

  return (
    <section style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20 }}>
      <h2 style={{ color: colors.text, fontSize: 16, margin: "0 0 6px" }}>Destaque semanal</h2>
      <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>
        Escolha um artigo publicado. O destaque fica ativo por 7 dias e pode ser trocado ou encerrado antes do prazo.
        A imagem definida durante a revisão editorial só aparece enquanto o artigo estiver em destaque.
      </p>

      {error && <p role="alert" style={{ color: colors.red, fontSize: 13 }}>{error}</p>}

      {featured && (
        <div style={{ background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ color: colors.green, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>DESTAQUE ATIVO</div>
          <div style={{ color: colors.text, fontWeight: 700 }}>{featuredPost?.title || featured.slug}</div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
            Até {formatDate(featured.expiresAt)}
          </div>
          <a href={`/blog/${featured.slug}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", color: colors.primary, fontSize: 12, marginTop: 8 }}>
            Abrir artigo ↗
          </a>
        </div>
      )}

      <label style={{ display: "block", color: colors.muted, fontSize: 13, marginBottom: 12 }}>
        Artigo publicado
        <select
          value={selectedSlug}
          onChange={(event) => setSelectedSlug(event.target.value)}
          style={{ display: "block", width: "100%", marginTop: 6, background: colors.background, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 7, padding: 10 }}
        >
          <option value="">Selecione um artigo</option>
          {posts.map((post) => (
            <option key={post.slug} value={post.slug}>{post.title} — {post.category}</option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!selectedSlug || busy}
          onClick={() => submit("feature")}
          style={{ background: colors.primary, border: 0, borderRadius: 7, color: "#fff", padding: "9px 13px", cursor: selectedSlug && !busy ? "pointer" : "not-allowed", opacity: selectedSlug && !busy ? 1 : 0.55 }}
        >
          {busy ? "Salvando…" : featured ? "Trocar destaque" : "Ativar por 7 dias"}
        </button>
        {featured && (
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("end")}
            style={{ background: "transparent", border: `1px solid ${colors.red}`, borderRadius: 7, color: colors.red, padding: "9px 13px", cursor: "pointer" }}
          >
            Encerrar destaque
          </button>
        )}
      </div>
    </section>
  );
}
