"use client";

import { useState, useEffect, useRef } from "react";
import RichEditor from "../../components/admin/RichEditor";
import EditorialReviewPanel from "../../components/admin/EditorialReviewPanel";
import EditorialPlanPanel from "../../components/admin/EditorialPlanPanel";
import WeeklyFeaturedPanel from "../../components/admin/WeeklyFeaturedPanel";
import TrafficTabs from "../../components/admin/TrafficTabs";
import { markdownToHtml, htmlToMarkdown } from "../../lib/markdown-html";
import titleQuality from "../../lib/article-title.cjs";

const { getEditorialTitleIssue } = titleQuality;

/* ─── Design tokens ─── */
const C = {
  bg: "#FFFFFF",
  bgElevated: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceHover: "#F8FAFC",
  border: "#E4E7EC",
  borderSoft: "#F1F4F6",
  primary: "#B4232C",
  primaryHover: "#8F1821",
  primaryGlow: "rgba(180,35,44,0.12)",
  accent: "#B54708",
  accentGlow: "rgba(181,71,8,0.18)",
  hl: "#B4232C",
  ink: "#17212B",
  green: "#198754",
  greenGlow: "rgba(25,135,84,0.10)",
  red: "#B42318",
  redGlow: "rgba(180,35,24,0.10)",
  purple: "#2563EB",
  text: "#17212B",
  textMuted: "#344054",
  textFaint: "#667085",
  gradient: "none",
};

/* ─── Injeta CSS global para responsividade ─── */
const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: ${C.bg}; }

  input, textarea, select, button {
    font-family: inherit;
  }
  button, input, textarea, select, a {
    transition: background-color .15s, border-color .15s, box-shadow .15s, color .15s;
  }
  button:disabled { cursor: not-allowed; opacity: .6; }
  button:not(:disabled):hover { filter: brightness(0.95); }
  :focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; }
  input:focus, textarea:focus, select:focus {
    border-color: ${C.primary} !important;
    box-shadow: 0 0 0 3px ${C.primaryGlow};
    outline: none;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }

  .nav-btn {
    display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 10px 12px; border-radius: 10px; border: 0;
    background: transparent; color: ${C.textMuted};
    font-size: 14px; font-weight: 500; cursor: pointer; text-align: left;
  }
  .nav-btn:hover { background: ${C.bgElevated}; color: ${C.text}; filter: none !important; }
  .nav-btn[aria-current="page"] {
    background: ${C.surface}; color: ${C.text}; font-weight: 700;
    box-shadow: inset 0 0 0 1px ${C.border};
  }
  .nav-bubble {
    width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
    border: 2px solid ${C.textFaint}; background: transparent;
  }
  .nav-btn:hover .nav-bubble { border-color: ${C.primary}; }
  [aria-current="page"] > .nav-bubble {
    background: ${C.primary}; border-color: ${C.primary};
    box-shadow: 0 0 0 3px ${C.primaryGlow};
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: ${C.bg}; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }

  .admin-layout {
    display: flex;
    gap: 0;
    max-width: 1200px;
    margin: 0 auto;
    padding: 28px 20px;
  }
  .admin-sidebar {
    width: 220px;
    flex-shrink: 0;
    margin-right: 24px;
    position: sticky;
    top: 72px;
    height: fit-content;
  }
  .admin-content {
    flex: 1;
    min-width: 0;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 20px;
  }
  .aff-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .manual-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  /* Bottom nav for mobile */
  .mobile-nav {
    display: none;
  }

  /* Mobile header back button */
  .desktop-sidebar { display: flex; }

  @media (max-width: 768px) {
    .admin-layout {
      flex-direction: column;
      padding: 16px 12px 80px;
    }
    .admin-sidebar { display: none; }
    .admin-content { width: 100%; }

    .stat-grid { grid-template-columns: 1fr 1fr; }
    .aff-form-grid { grid-template-columns: 1fr; }
    .config-grid { grid-template-columns: 1fr; }
    .manual-grid { grid-template-columns: 1fr; }

    .mobile-nav {
      display: flex;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: ${C.surface};
      border-top: 1px solid ${C.border};
      z-index: 200;
      padding: 8px 4px;
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
    }
    .mobile-nav-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 6px 4px;
      background: none;
      border: none;
      cursor: pointer;
      border-radius: 8px;
    }
    .mobile-nav-btn .nav-bubble { width: 14px; height: 14px; }
    .mobile-nav-label { font-size: 10px; font-weight: 600; }
    .mobile-nav-badge {
      position: absolute;
      top: 2px;
      right: calc(50% - 24px);
      min-width: 16px;
      padding: 1px 4px;
      border-radius: 999px;
      background: ${C.hl};
      color: ${C.ink};
      font-size: 9px;
      font-weight: 800;
      line-height: 14px;
    }
  }

  @media (max-width: 480px) {
    .stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .header-title { font-size: 14px !important; }
    .aff-card-actions { flex-direction: column; gap: 6px; }
    .aff-card-actions button { width: 100%; }
    .indexing-btn-row { flex-direction: column; }
    .indexing-btn-row a,
    .indexing-btn-row button { width: 100%; text-align: center; justify-content: center; }
  }

  .row-links td { overflow: hidden; text-overflow: ellipsis; max-width: 0; }

  @media (max-width: 600px) {
    .metrics-table thead th:nth-child(4),
    .metrics-table thead th:nth-child(5),
    .metrics-table tbody td:nth-child(4),
    .metrics-table tbody td:nth-child(5) { display: none; }
  }

  /* Editor visual (TipTap) — tipografia do conteúdo digitado */
  .rich-editor-content {
    outline: none;
    color: ${C.text};
    font-size: 15px;
    line-height: 1.75;
    min-height: 260px;
  }
  .rich-editor-content p { margin: 0 0 14px; }
  .rich-editor-content h2 { font-size: 1.4rem; font-weight: 700; margin: 24px 0 10px; }
  .rich-editor-content h3 { font-size: 1.18rem; font-weight: 700; margin: 20px 0 8px; }
  .rich-editor-content h4 { font-size: 1.02rem; font-weight: 700; margin: 16px 0 6px; }
  .rich-editor-content ul, .rich-editor-content ol { margin: 0 0 14px; padding-left: 22px; }
  .rich-editor-content li { margin-bottom: 4px; }
  .rich-editor-content blockquote {
    margin: 0 0 14px;
    padding: 4px 16px;
    border-left: 3px solid ${C.primary};
    color: ${C.textMuted};
    font-style: italic;
  }
  .rich-editor-content pre {
    background: ${C.bgElevated};
    border: 1px solid ${C.border};
    border-radius: 8px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0 0 14px;
  }
  .rich-editor-content code {
    background: ${C.bgElevated};
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.88em;
  }
  .rich-editor-content pre code { background: none; padding: 0; }
  .rich-editor-content img { max-width: 100%; border-radius: 10px; display: block; margin: 10px 0; }
  .rich-editor-content a { color: ${C.primary}; text-decoration: underline; }
  .rich-editor-content hr { border: none; border-top: 1px solid ${C.border}; margin: 22px 0; }
  .rich-editor-content p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: ${C.textFaint};
    pointer-events: none;
    height: 0;
  }
  @media (max-width: 640px) {
    .rich-editor-content { font-size: 14.5px; }
  }
`;

/* ─── Injetar estilos no head ─── */
function StyleInjector() {
  useEffect(() => {
    const tag = document.createElement("style");
    tag.innerHTML = globalCSS;
    document.head.appendChild(tag);
    return () => document.head.removeChild(tag);
  }, []);
  return null;
}

/* ─── Estilos JS (para elementos dinâmicos) ─── */
const s = {
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "20px",
  },
  input: {
    width: "100%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    padding: "10px 14px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
  btn: {
    background: C.primary,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background 0.15s",
    whiteSpace: "nowrap",
  },
  btnDanger: {
    background: "transparent",
    color: C.red,
    border: `1px solid ${C.red}33`,
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  btnGhost: {
    background: "transparent",
    color: C.textMuted,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: C.textMuted,
    marginBottom: 6,
  },
  fieldGroup: { marginBottom: 0 },
  tag: (color) => ({
    display: "inline-block",
    background: color + "18",
    color,
    border: `1px solid ${color}30`,
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 600,
  }),
  sectionTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 16,
    fontWeight: 700,
    color: C.text,
    marginBottom: 12,
  },
};

/* ─── Toast ─── */
function Toast({ msg, type }) {
  if (!msg) return null;
  const color = type === "error" ? C.red : C.green;
  const icon = type === "error" ? "✕" : "✓";
  return (
    <div style={{
      position: "fixed", bottom: 80, right: 16, zIndex: 9999,
      background: C.surface, border: `1px solid ${color}44`,
      borderRadius: 12, padding: "12px 18px", color,
      fontWeight: 600, fontSize: 13,
      boxShadow: `0 8px 28px rgba(23,33,43,0.14), 0 0 0 1px ${color}22`,
      display: "flex", alignItems: "center", gap: 8,
      maxWidth: "calc(100vw - 32px)",
      animation: "fadeInUp 0.2s ease",
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span> {msg}
    </div>
  );
}

/* ─── StatCard ─── */
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...s.card, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800,
        color: color || C.text, lineHeight: 1, marginBottom: 6, letterSpacing: "-0.02em",
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 12, color: C.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      )}
    </div>
  );
}

/* ─── BarChart ─── */
function BarChart({ data }) {
  if (!data || Object.keys(data).length === 0)
    return <div style={{ color: C.textFaint, fontSize: 13, padding: "20px 0" }}>Sem dados suficientes.</div>;
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, padding: "0 4px" }}>
      {entries.map(([month, count]) => (
        <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.textFaint, fontWeight: 600 }}>{count}</div>
          <div style={{
            width: "100%", borderRadius: "4px 4px 0 0",
            background: `linear-gradient(180deg, ${C.primary} 0%, ${C.primary}88 100%)`,
            height: `${Math.max(4, (count / max) * 64)}px`,
            transition: "height 0.5s cubic-bezier(.4,0,.2,1)",
            boxShadow: `0 -2px 8px ${C.primaryGlow}`,
          }} />
          <div style={{ fontSize: 9, color: C.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
            {month.slice(5)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── LOGIN ─── */
function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) onLogin();
      else setError(data.error || "Senha incorreta");
    } catch {
      setError("Erro de conexão");
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: C.bg, padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: "36px 32px",
        boxShadow: "0 24px 64px rgba(23,33,43,0.12)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <span aria-hidden="true" style={{
            display: "block", width: 28, height: 28, borderRadius: "50%",
            background: C.primary, boxShadow: `0 0 0 6px ${C.primaryGlow}`, margin: "0 auto 20px",
          }} />
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Redação</h1>
          <p style={{ color: C.textMuted, fontSize: 14 }}>Descomplica Bula</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <label htmlFor="admin-password" style={s.label}>Senha de administrador</label>
            <input
              id="admin-password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={{ ...s.input, paddingRight: 44 }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
              style={{
                position: "absolute", right: 10, bottom: 9,
                background: "none", border: "none", cursor: "pointer",
                color: C.primary, fontSize: 12, fontWeight: 600, padding: "2px 4px",
              }}
            >{showPw ? "Ocultar" : "Mostrar"}</button>
          </div>

          {error && (
            <div style={{
              background: C.redGlow, border: `1px solid ${C.red}33`,
              borderRadius: 8, padding: "10px 14px",
              color: C.red, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
            }}>
              {error}
            </div>
          )}

          <button type="submit" style={{ ...s.btn, width: "100%", justifyContent: "center", padding: "12px 20px", fontSize: 15 }} disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

      </div>
    </div>
  );
}

/* ─── ABA: MÉTRICAS ─── */
function MetricsTab({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const r = await fetch("/api/admin/metrics");
      const d = await r.json();
      setData(d);
    } catch {
      toast("Erro ao carregar métricas", "error");
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ ...s.card, height: 80, background: C.surfaceHover, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );
  if (!data) return null;

  const topCats = Object.entries(data.categories || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Cards */}
      <div className="stat-grid">
        <StatCard label="Total de Posts" value={data.totalPosts} sub="publicados" color={C.primary} icon="📝" />
        <StatCard label="Últimas 24h" value={data.postsLast24h} sub="novos posts" color={C.green} icon="⚡" />
        <StatCard label="Últimos 7 dias" value={data.postsLast7d} sub="novos posts" color={C.accent} icon="📅" />
        <StatCard label="Últimos 30 dias" value={data.postsLast30d} sub="novos posts" color={C.purple} icon="📈" />
      </div>

      {/* Gráfico + Categorias */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ ...s.card, minWidth: 0 }}>
          <div style={s.sectionTitle}>Posts por mês</div>
          <BarChart data={data.byMonth} />
        </div>
        <div style={{ ...s.card, minWidth: 0 }}>
          <div style={s.sectionTitle}>Categorias</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topCats.length === 0 && <span style={{ color: C.textFaint, fontSize: 13 }}>Sem dados</span>}
            {topCats.map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                <span style={s.tag(C.primary)}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SearchPerformancePanel />

      {/* Posts recentes */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={s.sectionTitle}>Posts recentes</div>
          <button style={s.btnGhost} onClick={() => load(true)} disabled={refreshing} style={{
            ...s.btnGhost, padding: "6px 12px", fontSize: 12,
          }}>
            {refreshing ? "⟳ Atualizando…" : "⟳ Atualizar"}
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="metrics-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Título", "Categoria", "Data", "Palavras", "Leitura"].map((h) => (
                  <th key={h} style={{ textAlign: "left", color: C.textFaint, fontWeight: 700, padding: "0 12px 10px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.recent || []).map((p) => (
                <tr key={p.slug} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: "11px 12px 11px 0", maxWidth: 260 }}>
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer"
                      style={{ color: C.text, textDecoration: "none", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.title}
                    </a>
                  </td>
                  <td style={{ padding: "11px 12px 11px 0", whiteSpace: "nowrap" }}>
                    <span style={s.tag(C.accent)}>{p.category}</span>
                  </td>
                  <td style={{ padding: "11px 12px 11px 0", color: C.textMuted, whiteSpace: "nowrap" }}>{p.date}</td>
                  <td style={{ padding: "11px 12px 11px 0", color: C.textMuted }}>{(p.words || 0).toLocaleString()}</td>
                  <td style={{ padding: "11px 12px 11px 0", color: C.textMuted, whiteSpace: "nowrap" }}>{p.readingTime} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SearchPerformancePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/search-performance", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o desempenho da busca.");
      setData(result);
    } catch (loadError) {
      setError(loadError.message || "Erro ao carregar o Search Console.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const posts = data?.posts || [];
  const filteredPosts = posts.filter((post) =>
    post.title.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
  );
  const maxClicks = Math.max(0, ...posts.map((post) => post.clicks));
  const formatNumber = (value) => Number(value || 0).toLocaleString("pt-BR");
  const formatDate = (date) => date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : "—";
  const getTemperature = (clicks) => {
    const share = maxClicks > 0 ? clicks / maxClicks : 0;
    if (clicks === 0) return { label: "Sem cliques", color: C.textFaint, width: 0 };
    if (share >= 0.65) return { label: "Quente", color: C.green, width: share * 100 };
    if (share >= 0.25) return { label: "Morno", color: C.accent, width: share * 100 };
    return { label: "Frio", color: C.primary, width: Math.max(share * 100, 4) };
  };
  const getChange = (post) => {
    if (post.previousClicks === 0) {
      return post.clicks > 0 ? { label: "Novo", color: C.green } : { label: "—", color: C.textFaint };
    }
    const percent = Math.round(((post.clicks - post.previousClicks) / post.previousClicks) * 100);
    return {
      label: `${percent > 0 ? "+" : ""}${percent}%`,
      color: percent > 0 ? C.green : percent < 0 ? C.red : C.textMuted,
    };
  };

  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <div>
          <div style={s.sectionTitle}>Termômetro de tráfego da Busca Google</div>
          <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>
            Cliques e impressões orgânicas por artigo. Não inclui redes sociais, acesso direto ou outras fontes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          style={{ ...s.btnGhost, padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
        >
          {refreshing ? "⟳ Atualizando…" : "⟳ Atualizar"}
        </button>
      </div>

      {loading ? (
        <p style={{ color: C.textMuted, fontSize: 13, padding: "16px 0" }}>Carregando dados do Search Console…</p>
      ) : error ? (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: C.accentGlow, color: C.textMuted, fontSize: 13, lineHeight: 1.7 }}>
          <strong style={{ display: "block", color: C.accent, marginBottom: 4 }}>Conexão do Search Console pendente</strong>
          {error}
          <div style={{ marginTop: 8 }}>
            Configure a conta de serviço no ambiente da Vercel, ative a Search Console API no Google Cloud e conceda acesso restrito à propriedade. Se ela for uma propriedade de domínio, configure também <code>SEARCH_CONSOLE_SITE_URL</code> com o formato <code>sc-domain:seudominio.com</code>.
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: C.textFaint, fontSize: 11, margin: "10px 0 14px" }}>
            Período atual: {formatDate(data.currentPeriod.startDate)} a {formatDate(data.currentPeriod.endDate)} · comparação com os 28 dias anteriores. O Search Console pode atrasar alguns dias.
          </p>

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
              Filtrar artigos por título
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar um artigo…"
              style={{ width: "100%", maxWidth: 380, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgElevated, color: C.text, fontSize: 13 }}
            />
          </label>

          <div style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 650 }}>
              <thead style={{ position: "sticky", top: 0, background: C.surface, zIndex: 1 }}>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Artigo", "Temperatura relativa", "Cliques", "Impressões", "CTR", "Posição", "Δ cliques"].map((heading) => (
                    <th key={heading} style={{ textAlign: "left", color: C.textFaint, fontWeight: 700, padding: "9px 10px 9px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => {
                  const temperature = getTemperature(post.clicks);
                  const change = getChange(post);
                  return (
                    <tr key={post.slug} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                      <td style={{ padding: "10px 12px 10px 0", maxWidth: 280 }}>
                        <a href={post.path} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {post.title}
                        </a>
                      </td>
                      <td style={{ padding: "10px 14px 10px 0", minWidth: 130 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span aria-hidden="true" style={{ width: 56, height: 7, background: C.border, borderRadius: 99, overflow: "hidden", flexShrink: 0 }}>
                            <span style={{ display: "block", width: `${temperature.width}%`, height: "100%", background: temperature.color, borderRadius: 99 }} />
                          </span>
                          <span style={{ color: temperature.color, whiteSpace: "nowrap" }}>{temperature.label}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px 10px 0", color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatNumber(post.clicks)}</td>
                      <td style={{ padding: "10px 10px 10px 0", color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{formatNumber(post.impressions)}</td>
                      <td style={{ padding: "10px 10px 10px 0", color: C.textMuted }}>{(post.ctr * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                      <td style={{ padding: "10px 10px 10px 0", color: C.textMuted }}>{post.position === null ? "—" : post.position.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                      <td style={{ padding: "10px 0", color: change.color, fontWeight: 700 }}>{change.label}</td>
                    </tr>
                  );
                })}
                {filteredPosts.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 20, textAlign: "center", color: C.textFaint }}>
                      {posts.length ? "Nenhum artigo corresponde à busca." : "Nenhum artigo encontrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10, color: C.textFaint, fontSize: 11 }}>
            Frio, morno e quente são relativos aos cliques dos artigos deste site no período selecionado; não são notas do Google.
          </p>
        </>
      )}
    </div>
  );
}

/* ─── ABA: AFILIADOS ─── */
function AffiliatesTab({ toast }) {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const empty = { id: "", name: "", url: "", keywords: "", cta: "" };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    fetch("/api/admin/affiliates")
      .then((r) => r.json())
      .then((d) => { setAffiliates(d.affiliates || []); setLoading(false); })
      .catch(() => { toast("Erro ao carregar afiliados", "error"); setLoading(false); });
  }, []);

  async function save(list, previousList) {
    setSaving(true);
    const res = await fetch("/api/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affiliates: list }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.ok) {
      toast(d.note || "Afiliados salvos! O site vai atualizar após o próximo deploy.");
    } else {
      toast(d.error || "Erro ao salvar", "error");
      // commit falhou (ex: GITHUB_TOKEN ausente) — desfaz a atualização otimista
      // pra tela não mostrar algo que não foi de fato persistido no repositório.
      if (previousList) setAffiliates(previousList);
    }
  }

  function startEdit(i) {
    const a = affiliates[i];
    setForm({ ...a, keywords: (a.keywords || []).join(", ") });
    setEditing(i);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function cancelEdit() { setForm(empty); setEditing(null); }

  function applyEdit() {
    const aff = { ...form, keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean) };
    const previousList = affiliates;
    const list = editing === "new"
      ? [...affiliates, aff]
      : affiliates.map((a, i) => (i === editing ? aff : a));
    setAffiliates(list);
    save(list, previousList);
    cancelEdit();
  }

  function remove(i) {
    if (!confirm("Remover este afiliado?")) return;
    const previousList = affiliates;
    const list = affiliates.filter((_, idx) => idx !== i);
    setAffiliates(list);
    save(list, previousList);
  }

  if (loading) return <p style={{ color: C.textMuted }}>Carregando afiliados…</p>;

  const fields = [
    { key: "id", label: "ID (único, sem espaços)", placeholder: "estrategia" },
    { key: "name", label: "Nome do parceiro", placeholder: "Nome do parceiro" },
    { key: "url", label: "URL do link de afiliado", placeholder: "https://..." },
    { key: "cta", label: "Texto CTA (call to action)", placeholder: "Conheça os cursos..." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Formulário de edição/criação */}
      {editing !== null && (
        <div ref={formRef} style={{ ...s.card, border: `1px solid ${C.primary}33` }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: C.text }}>
            {editing === "new" ? "➕ Novo afiliado" : "✏️ Editar afiliado"}
          </div>
          <div className="aff-form-grid">
            {fields.map(({ key, label, placeholder }) => (
              <div key={key} style={s.fieldGroup}>
                <label style={s.label}>{label}</label>
                <input
                  style={s.input}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={s.label}>Palavras-chave (separadas por vírgula)</label>
              <input
                style={s.input}
                placeholder="livro, organizador, aferidor"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <button style={s.btn} onClick={applyEdit} disabled={saving}>
              {saving ? "Salvando…" : "💾 Salvar afiliado"}
            </button>
            <button style={s.btnGhost} onClick={cancelEdit}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Links de afiliados</div>
            <div style={{ color: C.textFaint, fontSize: 12, marginTop: 2 }}>{affiliates.length} cadastrado{affiliates.length !== 1 ? "s" : ""}</div>
          </div>
          <button style={s.btn} onClick={() => { setForm(empty); setEditing("new"); }}>+ Novo afiliado</button>
        </div>

        {affiliates.length === 0 && (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            color: C.textFaint, fontSize: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
            <div>Nenhum afiliado cadastrado ainda.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Clique em "Novo afiliado" para começar.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {affiliates.map((aff, i) => (
            <div key={aff.id || i} style={{
              background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "16px",
              display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: C.text }}>{aff.name}</div>
                <a href={aff.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: C.primary, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>
                  {aff.url} ↗
                </a>
                {aff.cta && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>"{aff.cta}"</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(aff.keywords || []).map((k) => (
                    <span key={k} style={s.tag(C.textFaint)}>{k}</span>
                  ))}
                </div>
              </div>
              <div className="aff-card-actions" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button style={s.btnGhost} onClick={() => startEdit(i)}>Editar</button>
                <button style={s.btnDanger} onClick={() => remove(i)}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── ABA: CONFIGURAÇÕES ─── */
function ConfigTab({ toast }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => { setCfg(d); setLoading(false); })
      .catch(() => { toast("Erro ao carregar configurações", "error"); setLoading(false); });
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const d = await res.json();
    setSaving(false);
    if (d.ok) toast("Configurações salvas!");
    else toast(d.error || "Erro ao salvar", "error");
  }

  if (loading || !cfg) return <p style={{ color: C.textMuted }}>Carregando configurações…</p>;

  function Field({ label, field, placeholder, type = "text", fullWidth = false }) {
    return (
      <div style={{ ...s.fieldGroup, ...(fullWidth ? { gridColumn: "1 / -1" } : {}) }}>
        <label style={s.label}>{label}</label>
        {type === "textarea" ? (
          <textarea
            rows={3}
            style={{ ...s.input, resize: "vertical" }}
            placeholder={placeholder}
            value={cfg[field] || ""}
            onChange={(e) => setCfg({ ...cfg, [field]: e.target.value })}
          />
        ) : (
          <input
            type={type}
            style={s.input}
            placeholder={placeholder}
            value={cfg[field] || ""}
            onChange={(e) => setCfg({ ...cfg, [field]: e.target.value })}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Identidade */}
      <div style={s.card}>
        <div style={s.sectionTitle}>🏷️ Identidade do blog</div>
        <div className="config-grid" style={{ gap: 16 }}>
          <Field label="Nome do site" field="name" placeholder="Descomplica Bula" />
          <Field label="URL do site" field="url" placeholder="https://..." />
          <Field label="Tagline" field="tagline" placeholder="Sua tagline aqui" fullWidth />
          <Field label="Descrição" field="description" placeholder="Descrição do site..." type="textarea" fullWidth />
          <Field label="Twitter Handle" field="twitterHandle" placeholder="@descomplicabula" />
          <Field label="Google Site Verification" field="googleSiteVerification" placeholder="código" />
        </div>
      </div>

      {/* AdSense */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={s.sectionTitle}>💰 Google AdSense</div>
          <button
            onClick={() => setCfg({ ...cfg, adsenseEnabled: !cfg.adsenseEnabled })}
            style={{
              background: cfg.adsenseEnabled ? C.greenGlow : "transparent",
              border: `1px solid ${cfg.adsenseEnabled ? C.green + "44" : C.border}`,
              borderRadius: 999, padding: "4px 14px",
              color: cfg.adsenseEnabled ? C.green : C.textFaint,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: cfg.adsenseEnabled ? C.green : C.textFaint,
              display: "inline-block",
            }} />
            {cfg.adsenseEnabled ? "Ativado" : "Desativado"}
          </button>
        </div>
        <div className="config-grid" style={{ gap: 16 }}>
          <Field label="Publisher ID (ca-pub-...)" field="adsensePublisherId" placeholder="ca-pub-XXXXXXXXXXXXXXXX" fullWidth />
          <Field label="Slot: Header" field="adsenseSlotHeader" placeholder="1234567890" />
          <Field label="Slot: In-Article" field="adsenseSlotInArticle" placeholder="0987654321" />
          <Field label="Slot: Sidebar" field="adsenseSlotSidebar" placeholder="1122334455" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={s.btn} onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : "💾 Salvar configurações"}
        </button>
      </div>
    </div>
  );
}

/* ─── ABA: INDEXAÇÃO ─── */
function IndexingTab({ toast }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");

  async function runPing(mode) {
    setRunning(true);
    setOutput("⏳ Iniciando ping de indexação…\n");
    try {
      const res = await fetch(`/api/admin/indexing?mode=${mode}`, { method: "POST" });
      const d = await res.json();
      setOutput(d.output || d.error || "Concluído.");
    } catch (e) {
      setOutput("Erro: " + e.message);
    }
    setRunning(false);
  }

  const quickLinks = [
    { label: "Google Search Console", url: "https://search.google.com/search-console", icon: "🔍" },
    { label: "Google Analytics", url: "https://analytics.google.com", icon: "📊" },
    { label: "Bing Webmaster Tools", url: "https://www.bing.com/webmasters", icon: "🌐" },
    { label: "IndexNow", url: "https://www.indexnow.org", icon: "⚡" },
    { label: "PageSpeed Insights", url: "https://pagespeed.web.dev", icon: "🚀" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={s.card}>
        <div style={s.sectionTitle}>🚀 Descoberta de URLs</div>
        <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 1.7 }}>
          IndexNow notifica mecanismos compatíveis. O Google descobre artigos pelo sitemap e pelos links internos;
          esta ferramenta não chama a Google Indexing API e nenhuma notificação garante indexação.
        </p>
        <div className="indexing-btn-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={s.btn} onClick={() => runPing("new")} disabled={running}>
            ⚡ {running ? "Enviando…" : "Pingar últimas 24h"}
          </button>
          <button style={{ ...s.btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => runPing("all")} disabled={running}>
            📡 Pingar todos os posts
          </button>
          <a
            href="https://search.google.com/search-console"
            target="_blank" rel="noreferrer"
            style={{ ...s.btnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            🔍 Abrir Search Console ↗
          </a>
        </div>

        {output && (
          <pre style={{
            marginTop: 20, background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 16, fontSize: 12, color: C.textMuted,
            whiteSpace: "pre-wrap", wordBreak: "break-all",
            maxHeight: 320, overflowY: "auto", lineHeight: 1.6,
          }}>
            {output}
          </pre>
        )}
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>🔗 Links rápidos</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {quickLinks.map(({ label, url, icon }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "12px 14px",
                color: C.textMuted, textDecoration: "none", fontSize: 13, fontWeight: 500,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.primary + "66"}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              {label}
              <span style={{ marginLeft: "auto", color: C.textFaint }}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── ABA: QUALIDADE ─── */
function DuplicateCandidate({ pair, onResolved, toast }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function markFalsePositive() {
    if (!reason.trim()) {
      toast("Registre por que este par é um falso positivo.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/duplicate-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pair.id, decision: "false_positive", reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao salvar a decisão.");
      toast("Par registrado como falso positivo.");
      onResolved();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        Similaridade estimada: {pair.score}% · {pair.id}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {pair.articles.map((article) => (
          <div key={article.file}>
            <a href={`/blog/${article.slug}`} target="_blank" rel="noreferrer" style={{ color: C.text, fontSize: 13 }}>
              {article.title}
            </a>
            <div style={{ color: C.textFaint, fontSize: 11 }}>{article.file} · {article.wordCount} palavras · {article.date}</div>
          </div>
        ))}
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, marginTop: 8 }}>
        {pair.reasons?.join(" · ") || "Sinais de conteúdo semelhante"}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          aria-label="Motivo para marcar como falso positivo"
          placeholder="Motivo da decisão (obrigatório)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={{ ...s.input, flex: "1 1 220px", padding: "8px 10px" }}
        />
        <button type="button" style={s.btnGhost} onClick={markFalsePositive} disabled={saving || !reason.trim()}>
          {saving ? "Salvando…" : "Marcar falso positivo"}
        </button>
      </div>
    </div>
  );
}

function QualityTab({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyFile, setBusyFile] = useState(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/quality");
      const d = await r.json();
      setData(d);
    } catch {
      toast("Erro ao carregar dados de qualidade", "error");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function regenerate(entry) {
    if (!confirm(`Regenerar o conteúdo de "${entry.title}"? O arquivo e a URL continuam os mesmos.`)) return;
    setBusyFile(entry.file);
    try {
      const res = await fetch("/api/admin/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", file: entry.file, topic: entry.title }),
      });
      const d = await res.json();
      if (d.ok) {
        toast(d.note || "Conteúdo regenerado! O site vai atualizar após o próximo deploy.");
        load();
      } else {
        toast(d.error || "Erro ao regenerar", "error");
      }
    } catch (e) {
      toast("Erro: " + e.message, "error");
    }
    setBusyFile(null);
  }

  async function removeDuplicate(entry) {
    if (!confirm(`Remover "${entry.file}"? Essa cópia duplicada será apagada permanentemente.`)) return;
    setBusyFile(entry.file);
    try {
      const res = await fetch("/api/admin/quality", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: entry.file }),
      });
      const d = await res.json();
      if (d.ok) {
        toast("Remoção comitada! O site vai atualizar após o próximo deploy.");
        load();
      } else {
        toast(d.error || "Erro ao remover", "error");
      }
    } catch (e) {
      toast("Erro: " + e.message, "error");
    }
    setBusyFile(null);
  }

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ ...s.card, height: 80, background: C.surfaceHover, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="stat-grid">
        <StatCard label="Posts OK" value={data.okCount} sub="qualidade aprovada" color={C.green} icon="✅" />
        <StatCard label="Conteúdo Raso" value={data.shallowCount} sub="precisam revisão" color={C.accent} icon="⚠️" />
        <StatCard label="Duplicados" value={data.duplicateCount} sub="mesmo tema repetido" color={C.red} icon="🔁" />
        <StatCard label="Erros de Geração" value={data.errorCount} sub="falharam ao gerar" color={C.purple} icon="❌" />
        {data.topicOverlap && (
          <StatCard
            label="Pares candidatos"
            value={data.topicOverlap.candidateCount ?? data.topicOverlap.groups?.length ?? 0}
            sub={`${data.topicOverlap.pendingCount ?? 0} aguardam revisão`}
            color={C.red}
            icon="🪞"
          />
        )}
      </div>

      {/* Pares candidatos à duplicidade: revisão humana, sem exclusão automática */}
      {data.topicOverlap && (data.topicOverlap.pairs || []).length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}>🪞 Auditoria de duplicidade e sobreposição</div>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
            São candidatos a sobreposição temática, não duplicatas confirmadas. Compare conteúdo, Search Console,
            backlinks e canonical antes de consolidar, redirecionar ou remover qualquer URL. Marcar falso positivo
            apenas retira o par da fila; não altera nem desindexa artigos.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {data.topicOverlap.pairs.filter((pair) => pair.decision === "pending").map((pair) => (
              <DuplicateCandidate key={pair.id} pair={pair} onResolved={load} toast={toast} />
            ))}
          </div>
          {data.topicOverlap.dismissedCount > 0 && (
            <p style={{ color: C.textFaint, fontSize: 12, marginTop: 14 }}>
              Falsos positivos liberados por revisor: {data.topicOverlap.dismissedCount}.
            </p>
          )}
        </div>
      )}

      {/* Duplicados */}
      <div style={s.card}>
        <div style={s.sectionTitle}>🔁 Posts Duplicados</div>
        <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
          Candidatos identificados por regras automáticas. Confirme cada caso com dados de tráfego, canonical e backlinks antes de alterar URLs.
        </p>
        {data.duplicates.length === 0 && <span style={{ color: C.textFaint, fontSize: 13 }}>Nenhum duplicado encontrado. 🎉</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.duplicates.map((d) => (
            <div key={d.file} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", flexWrap: "wrap",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                <div style={{ color: C.textFaint, fontSize: 11, marginTop: 2 }}>
                  {d.file} · duplica {d.duplicateOf}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conteúdo raso */}
      <div style={s.card}>
        <div style={s.sectionTitle}>⚠️ Conteúdo Raso ou Genérico</div>
        <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
          Poucas palavras, muitos clichês, ou muito parecido com outro post. Regenerar mantém a mesma URL.
        </p>
        {data.shallow.length === 0 && <span style={{ color: C.textFaint, fontSize: 13 }}>Nenhum post raso encontrado. 🎉</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.shallow.map((p) => (
            <div key={p.file} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", flexWrap: "wrap",
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                <div style={{ color: C.textFaint, fontSize: 11, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span>{(p.wordCount || 0).toLocaleString()} palavras</span>
                  {p.fillerCount > 0 && <span>· {p.fillerCount} clichês</span>}
                  {p.similarity > 0 && <span>· {p.similarity}% similar a {p.similarTo}</span>}
                </div>
              </div>
              <button
                style={s.btn}
                onClick={() => regenerate(p)}
                disabled={busyFile === p.file}
              >
                {busyFile === p.file ? "Gerando…" : "🔁 Regenerar"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── IDEAS TAB ─── */
const OFFICIAL_REFERENCE_URLS = [
  { label: "Bulas da Anvisa", url: "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/bulas-e-rotulos" },
  { label: "Ministério da Saúde", url: "https://www.gov.br/saude/pt-br" },
];

const CATEGORIES_LIST = [
  "Entenda a bula","Uso seguro","Efeitos e reações","Interações","Grupos especiais",
  "Formas e apresentações","Genéricos e similares","Armazenamento e descarte",
  "Alertas da Anvisa","Saúde e prevenção",
];

function IdeasTab({ toast }) {
  const [mode, setMode] = useState("text"); // "text" | "official"
  const [rawText, setRawText] = useState("");
  const [officialUrl, setOfficialUrl] = useState(OFFICIAL_REFERENCE_URLS[0].url);
  const [customUrl, setCustomUrl] = useState("");
  const [doubts, setDoubts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [category, setCategory] = useState(CATEGORIES_LIST[0]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState(null);

  // ── Extrai dúvidas do texto colado ──────────────────────────
  function extractFromText() {
    const lines = rawText
      .split(/\n/)
      .map(l => l.replace(/^[-•*>\d.]+\s*/, "").trim())
      .filter(l => l.length > 20 && l.length < 300);
    const unique = [...new Set(lines)];
    setDoubts(unique);
    setSelected(new Set(unique));
  }

  // ── Carrega temas editoriais para checagem em fonte oficial ──────────
  async function loadSuggestedTopics() {
    setExtracting(true);
    try {
      const targetUrl = customUrl.trim() || officialUrl;
      const res = await fetch(`/api/admin/ideas/fetch?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao buscar");

      setDoubts(data.doubts);
      setSelected(new Set(data.doubts));
      if (data.doubts.length === 0) toast("Nenhum tema de pauta disponível.", "err");
      else toast(`${data.doubts.length} temas iniciais carregados.`, "ok");
    } catch (e) {
      toast("Erro: " + e.message, "err");
    } finally {
      setExtracting(false);
    }
  }

  function toggleDoubt(d) {
    const s = new Set(selected);
    s.has(d) ? s.delete(d) : s.add(d);
    setSelected(s);
  }

  function toggleAll() {
    selected.size === doubts.length ? setSelected(new Set()) : setSelected(new Set(doubts));
  }

  // ── Gera artigos das dúvidas selecionadas ────────────────────
  async function generate() {
    const list = doubts.filter(d => selected.has(d));
    if (list.length === 0) { toast("Selecione ao menos uma dúvida.", "err"); return; }
    if (list.length > 5)  { toast("Máximo 5 por vez para não estourar a API.", "err"); return; }

    setLoading(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doubts: list, category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data);
      const ok = data.generated?.length || 0;
      const err = data.errors?.length || 0;
      toast(`${ok} artigo(s) gerado(s)${err ? `, ${err} erro(s)` : ""}.`, ok > 0 ? "ok" : "err");
    } catch (e) {
      toast("Erro: " + e.message, "err");
    } finally {
      setLoading(false);
    }
  }

  const boxStyle = {
    background: C.bgElevated, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 20, marginBottom: 16,
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, display: "block" };
  const inputStyle = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const btnPrimary = { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const btnGhost  = { background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" };

  return (
    <div>
      {/* Modo de entrada */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["text","✏️ Colar texto / dúvidas"], ["official","📚 Temas e fontes oficiais"]].map(([id, label]) => (
          <button key={id} onClick={() => { setMode(id); setDoubts([]); setSelected(new Set()); setResults(null); }}
            style={{ ...btnGhost, ...(mode === id ? { borderColor: C.primary, color: C.primary, background: C.primaryGlow } : {}) }}>
            {label}
          </button>
        ))}
      </div>

      {/* MODO TEXTO */}
      {mode === "text" && (
        <div style={boxStyle}>
          <label style={labelStyle}>Cole aqui as dúvidas (uma por linha, ou texto livre do grupo):</label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={7}
            placeholder={"Como localizar a bula oficial na Anvisa?\nO que fazer ao perceber uma reação inesperada?\nOnde descartar medicamentos vencidos?"}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          />
          <button onClick={extractFromText} style={{ ...btnPrimary, marginTop: 12 }}>
            Extrair dúvidas →
          </button>
        </div>
      )}

      {/* TEMAS E FONTES */}
      {mode === "official" && (
        <div style={boxStyle}>
          <label style={labelStyle}>Escolha uma referência oficial para consultar:</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {OFFICIAL_REFERENCE_URLS.map(f => (
              <button key={f.url} onClick={() => setOfficialUrl(f.url)}
                style={{ ...btnGhost, ...(officialUrl === f.url && !customUrl ? { borderColor: C.primary, color: C.primary, background: C.primaryGlow } : {}) }}>
                {f.label}
              </button>
            ))}
          </div>
          <label style={labelStyle}>Ou informe outra URL HTTPS oficial permitida:</label>
          <input
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="https://www.gov.br/anvisa"
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <button onClick={loadSuggestedTopics} disabled={extracting}
            style={{ ...btnPrimary, opacity: extracting ? 0.6 : 1 }}>
          {extracting ? "Carregando…" : "Carregar temas iniciais →"}
          </button>
          <p style={{ fontSize: 11, color: C.textFaint, marginTop: 10 }}>
          A URL selecionada não é rastreada nem extraída: a lista é um conjunto de temas iniciais. Consulte a fonte oficial e confirme cada afirmação antes de gerar ou aprovar conteúdo.
          </p>
        </div>
      )}

      {/* Lista de dúvidas extraídas */}
      {doubts.length > 0 && (
        <div style={boxStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>{doubts.length} dúvida(s) encontrada(s) — selecione para gerar artigos:</span>
            <button onClick={toggleAll} style={btnGhost}>{selected.size === doubts.length ? "Desmarcar tudo" : "Selecionar tudo"}</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
            {doubts.map((d, i) => (
              <label key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                background: selected.has(d) ? C.primaryGlow : C.surface,
                border: `1px solid ${selected.has(d) ? C.primary + "55" : C.border}`,
                borderRadius: 8, cursor: "pointer", fontSize: 13, color: C.text, lineHeight: 1.5,
              }}>
                <input type="checkbox" checked={selected.has(d)} onChange={() => toggleDoubt(d)}
                  style={{ marginTop: 2, accentColor: C.primary, flexShrink: 0 }} />
                {d}
              </label>
            ))}
          </div>

          {/* Categoria + botão gerar */}
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle}>Categoria dos artigos:</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle }}>
                {CATEGORIES_LIST.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize: 11, color: C.textFaint, marginBottom: 6 }}>
                {selected.size} selecionada(s) · máx 5 por vez
              </p>
              <button onClick={generate} disabled={loading || selected.size === 0}
                style={{ ...btnPrimary, opacity: (loading || selected.size === 0) ? 0.6 : 1, minWidth: 160 }}>
                {loading ? "Gerando…" : `✨ Gerar ${Math.min(selected.size, 5)} artigo(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultados */}
      {results && (
        <div style={boxStyle}>
          <span style={labelStyle}>Resultado</span>
          {results.generated?.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.greenGlow, border: `1px solid ${C.green}44`, borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: C.green, fontWeight: 700 }}>✓</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 600 }}>{r.topic}</div>
                <div style={{ color: C.textFaint, fontSize: 11, marginTop: 2 }}>{r.file} · {r.words} palavras · via {r.provider}</div>
              </div>
              <span style={{ color: C.textFaint, fontSize: 11, flexShrink: 0 }}>
                Aguardando revisão editorial
              </span>
            </div>
          ))}
          {results.errors?.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", background: C.redGlow, border: `1px solid ${C.red}44`, borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: C.red, fontWeight: 700 }}>✗</span>
              <div>
                <div style={{ color: C.text }}>{e.topic}</div>
                <div style={{ color: C.textFaint, fontSize: 11 }}>{e.error}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── ABA: POST MANUAL / LEGO ─── */
function ManualComposerTab({ toast, mode = "manual" }) {
  const [form, setForm] = useState({
    title: "",
    slug: "",
    category: "Geral",
    excerpt: "",
    body: "",
    coverImage: "",
    file: "",
  });
  const [composerMode, setComposerMode] = useState(mode);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [bodyHtml, setBodyHtml] = useState("");
  const [publishedPosts, setPublishedPosts] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [draftEditingId, setDraftEditingId] = useState(null);
  const [editingPostFile, setEditingPostFile] = useState(null);
  const [updatingPostFile, setUpdatingPostFile] = useState(null);
  const [updateSources, setUpdateSources] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);

  // Mantém form.body (markdown, o que é salvo no arquivo .md) sincronizado
  // com o HTML exibido no editor visual, nos dois sentidos.
  function setBodyFromMarkdown(md) {
    setForm((prev) => ({ ...prev, body: md || "" }));
    setBodyHtml(markdownToHtml(md || ""));
  }
  function handleEditorChange(html) {
    setBodyHtml(html);
    setForm((prev) => ({ ...prev, body: htmlToMarkdown(html) }));
  }

  async function loadPublishedPosts() {
    try {
      const r = await fetch("/api/admin/manual-post");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar posts publicados");
      setPublishedPosts(d.posts || []);
    } catch (err) {
      toast(err.message || "Erro ao carregar posts publicados", "error");
    }
  }

  async function loadDrafts() {
    try {
      const r = await fetch("/api/admin/manual-post/drafts");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar rascunhos");
      setDrafts(d.items || []);
    } catch (err) {
      toast(err.message || "Erro ao carregar rascunhos", "error");
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadPublishedPosts(), loadDrafts()]);
      setLoadingLibrary(false);
    })();
  }, []);

  function resetForm() {
    setForm({
      title: "",
      slug: "",
      category: "Geral",
      excerpt: "",
      body: "",
      coverImage: "",
      file: "",
    });
    setBodyHtml("");
    setDraftEditingId(null);
    setEditingPostFile(null);
  }

  async function uploadImage(file) {
    if (!file) return null;
    const reader = new FileReader();
    const contentBase64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/admin/manual-post/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "image/png",
        contentBase64,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no upload da imagem");
    return data.url;
  }

  async function uploadCoverImage(file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((prev) => ({ ...prev, coverImage: url }));
      toast("Imagem carregada com sucesso!", "ok");
    } catch (err) {
      toast(err.message || "Erro ao carregar imagem", "error");
    } finally {
      setUploading(false);
    }
  }

  async function uploadInlineImage(file) {
    try {
      return await uploadImage(file);
    } catch (err) {
      toast(err.message || "Erro ao carregar imagem", "error");
      throw err;
    }
  }

  async function runAiAction(action) {
    if (!form.title.trim() && action === "generate") {
      toast("Informe um título para gerar um texto com a IA.", "error");
      return;
    }
    if (!form.body.trim() && (action === "review" || action === "correct")) {
      toast("Escreva algo antes de usar a IA para revisar ou corrigir.", "error");
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/manual-post/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          title: form.title,
          category: form.category,
          body: form.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao usar a IA");

      if (action === "generate") {
        setForm((prev) => ({
          ...prev,
          title: data.title || prev.title,
          excerpt: data.excerpt || prev.excerpt,
        }));
        setBodyFromMarkdown(data.body || form.body);
        toast(`Texto gerado com IA via ${data.provider}.`, "ok");
        return;
      }

      setBodyFromMarkdown(data.body || form.body);
      toast(`Texto ${action === "review" ? "revisado" : "corrigido"} com IA via ${data.provider}.`, "ok");
    } catch (err) {
      toast(err.message || "Erro ao consultar a IA", "error");
    } finally {
      setAiLoading(false);
    }
  }

  async function publish() {
    if (!form.title.trim()) {
      toast("Informe um título para o post manual.", "error");
      return;
    }
    const titleIssue = getEditorialTitleIssue(form.title);
    if (titleIssue) {
      toast(titleIssue, "error");
      return;
    }
    if (!form.body.trim()) {
      toast("Escreva o conteúdo do post antes de publicar.", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/manual-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao publicar o post");
      toast(`Post publicado: ${data.file}`, "ok");
      resetForm();
      await loadPublishedPosts();
      await loadDrafts();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast(err.message || "Erro ao publicar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!form.title.trim() && !form.body.trim()) {
      toast("Escreva algo antes de salvar um rascunho.", "error");
      return;
    }

    try {
      const payload = {
        id: draftEditingId,
        ...form,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch("/api/admin/manual-post/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar rascunho");
      setDraftEditingId(data.draftId || draftEditingId);
      toast("Rascunho salvo com sucesso.", "ok");
      await loadDrafts();
    } catch (err) {
      toast(err.message || "Erro ao salvar rascunho", "error");
    }
  }

  async function loadDraftFromList(draft) {
    if (!draft) return;
    setForm({
      title: draft.title || "",
      slug: draft.slug || "",
      category: draft.category || "Geral",
      excerpt: draft.excerpt || "",
      body: draft.body || "",
      coverImage: draft.coverImage || "",
      file: draft.file || "",
    });
    setBodyHtml(markdownToHtml(draft.body || ""));
    setDraftEditingId(draft.id || null);
    setEditingPostFile(draft.file || null);
    toast("Rascunho carregado para revisão.", "ok");
  }

  async function deleteDraft(draftId) {
    if (!draftId || !confirm("Remover este rascunho?")) return;
    try {
      const res = await fetch("/api/admin/manual-post/drafts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao remover rascunho");
      toast("Rascunho removido.", "ok");
      await loadDrafts();
    } catch (err) {
      toast(err.message || "Erro ao remover rascunho", "error");
    }
  }

  async function editPublishedPost(post) {
    try {
      const res = await fetch(`/api/admin/manual-post?file=${encodeURIComponent(post.file)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar post");
      setForm({
        title: data.post?.title || "",
        slug: data.post?.slug || "",
        category: data.post?.category || "Geral",
        excerpt: data.post?.excerpt || "",
        body: data.post?.content || "",
        coverImage: data.post?.coverImage || "",
        file: post.file || "",
      });
      setBodyHtml(markdownToHtml(data.post?.content || ""));
      setEditingPostFile(post.file || null);
      setDraftEditingId(null);
      toast(`Editando ${post.file}`, "ok");
    } catch (err) {
      toast(err.message || "Erro ao abrir post para edição", "error");
    }
  }

  async function proposeArticleUpdate(post) {
    const sources = updateSources.split(/\r?\n/).map((source) => source.trim()).filter(Boolean);
    if (sources.length === 0) {
      toast("Adicione ao menos uma URL oficial da Anvisa ou de outro órgão permitido.", "error");
      return;
    }

    setUpdateBusy(true);
    try {
      const response = await fetch("/api/admin/article-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: post.file, sources }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar a atualização.");
      const checkedCount = data.verifiedSources?.length || 0;
      const failedCount = data.failedSources?.length || 0;
      toast(`Proposta criada com ${checkedCount} fonte(s) checada(s)${failedCount ? `; ${failedCount} link(s) não foram usados` : ""}. Revise antes de aprovar.`, "ok");
      setUpdatingPostFile(null);
      setUpdateSources("");
      await loadDrafts();
    } catch (error) {
      toast(error.message || "Erro ao propor atualização.", "error");
    } finally {
      setUpdateBusy(false);
    }
  }

  async function deletePublishedPost(post) {
    if (!confirm(`Remover permanentemente "${post.title}"?`)) return;
    try {
      const res = await fetch("/api/admin/manual-post", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: post.file }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao remover post");
      toast("Post removido do site.", "ok");
      await loadPublishedPosts();
      if (editingPostFile === post.file) resetForm();
    } catch (err) {
      toast(err.message || "Erro ao remover post", "error");
    }
  }

  const isLego = composerMode === "lego";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={s.sectionTitle}>{isLego ? "🧱 LEGO — montar post livre" : "📝 Post manual"}</div>
            <p style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              {isLego
                ? "Monte um post manualmente em markdown, adicione imagens e publique direto no blog."
                : "Crie um artigo com capa, resumo e conteúdo em markdown. O sistema publica automaticamente no site."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: 4 }}>
              {[
                { id: "manual", label: "Manual" },
                { id: "lego", label: "Lego" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setComposerMode(item.id)}
                  style={{
                    ...s.btnGhost,
                    padding: "6px 12px",
                    fontSize: 12,
                    border: "none",
                    background: composerMode === item.id ? C.primaryGlow : "transparent",
                    color: composerMode === item.id ? C.primary : C.textMuted,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button style={s.btnGhost} onClick={saveDraft}>
              💾 Salvar rascunho
            </button>
          </div>
        </div>

        {editingPostFile && (
          <div style={{ background: C.primaryGlow, border: `1px solid ${C.primary}44`, borderRadius: 10, padding: "10px 12px", marginBottom: 16, color: C.text, fontSize: 12 }}>
            Editando post publicado: <strong>{editingPostFile}</strong>
          </div>
        )}

        <div className="manual-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={s.label}>Título do post</label>
              <input
                style={s.input}
                placeholder="Ex.: O que significa uma reação adversa na bula"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <div style={{ color: C.textFaint, fontSize: 11, marginTop: 5, textAlign: "right" }}>
                {form.title.length} caracteres · recomendado: até 60
              </div>
              {getEditorialTitleIssue(form.title) && (
                <div role="alert" style={{ color: C.accent, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
                  {getEditorialTitleIssue(form.title)}
                </div>
              )}
            </div>
            <div>
              <label style={s.label}>Slug / URL</label>
              <input
                style={s.input}
                placeholder="opcional — se vazio, será gerado automaticamente"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div>
              <label style={s.label}>Categoria</label>
              <input
                style={s.input}
                placeholder="Geral"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <label style={s.label}>Resumo / excerpt</label>
              <textarea
                rows={3}
                style={{ ...s.input, resize: "vertical" }}
                placeholder="Resumo curto para o card e a página do post"
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
              <div style={{ color: C.textFaint, fontSize: 11, marginTop: 5, textAlign: "right" }}>
                {form.excerpt.length} caracteres · recomendado: até 160
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={s.label}>Imagem de capa</label>
              <input
                style={s.input}
                placeholder="URL externa ou imagem já carregada"
                value={form.coverImage}
                onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
              />
            </div>
            <div>
              <label style={s.label}>Enviar imagem local</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => uploadCoverImage(e.target.files?.[0])}
                  style={{ display: "none" }}
                  id="manual-cover-upload"
                />
                <label htmlFor="manual-cover-upload" style={{ ...s.btnGhost, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {uploading ? "Subindo…" : "📎 Escolher imagem"}
                </label>
                {form.coverImage && (
                  <span style={{ color: C.textFaint, fontSize: 12 }}>Capa pronta: {form.coverImage.slice(0, 48)}…</span>
                )}
              </div>
              {form.coverImage && (
                <img
                  src={form.coverImage}
                  alt="Pré-visualização da imagem de capa"
                  loading="lazy"
                  style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, marginTop: 10, border: `1px solid ${C.border}` }}
                />
              )}
            </div>
            <div>
              <label style={s.label}>IA do editor</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={s.btnGhost} disabled={aiLoading} onClick={() => runAiAction("generate")}>✨ Gerar post por IA</button>
                <button style={s.btnGhost} disabled={aiLoading} onClick={() => runAiAction("review")}>🧠 Revisar com IA</button>
                <button style={s.btnGhost} disabled={aiLoading} onClick={() => runAiAction("correct")}>🛠️ Correção automática</button>
              </div>
              {aiLoading && (
                <div style={{ marginTop: 8, color: C.textFaint, fontSize: 12 }}>
                  A IA está trabalhando no texto — isso pode levar alguns segundos…
                </div>
              )}
            </div>
            <div>
              <label style={s.label}>Dica de uso</label>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: C.textMuted, fontSize: 12, lineHeight: 1.7 }}>
                Escreva direto no editor abaixo — formatação (títulos, negrito, listas, imagens) fica visível na hora, sem precisar de markdown. Use <strong style={{ color: C.text }}>🧠 Revisar</strong> para melhorar clareza e <strong style={{ color: C.text }}>🛠️ Correção automática</strong> para gramática e pontuação.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={s.label}>Conteúdo do artigo</label>
          <RichEditor
            html={bodyHtml}
            onChangeHtml={handleEditorChange}
            onUploadImage={uploadInlineImage}
            placeholder={isLego
              ? "Escreva o conteúdo livre do seu post aqui…"
              : "Escreva o conteúdo do artigo manualmente…"}
          />
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={s.btn} onClick={publish} disabled={saving || uploading}>
            {saving ? "Publicando…" : `🚀 Publicar ${isLego ? "Lego" : "manual"}`}
          </button>
          <button style={s.btnGhost} onClick={resetForm}>
            Limpar
          </button>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={s.sectionTitle}>🗂️ Rascunhos</div>
            <div style={{ color: C.textFaint, fontSize: 12 }}>Revise antes de publicar e volte ao que precisa corrigir.</div>
          </div>
          <button style={s.btnGhost} onClick={loadDrafts}>↻ Atualizar</button>
        </div>

        {drafts.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 10 }}>Nenhum rascunho salvo ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {drafts.map((draft) => (
              <div key={draft.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{draft.title || "Rascunho sem título"}</div>
                    <div style={{ color: C.textFaint, fontSize: 11, marginTop: 3 }}>
                      {draft.category || "Geral"} · {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString("pt-BR") : "agora"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={s.btnGhost} onClick={() => loadDraftFromList(draft)}>Carregar</button>
                    <button style={s.btnDanger} onClick={() => deleteDraft(draft.id)}>Excluir</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={s.sectionTitle}>📚 Posts publicados</div>
            <div style={{ color: C.textFaint, fontSize: 12 }}>Edite um post já no ar ou remova o arquivo diretamente do repositório.</div>
          </div>
          <button style={s.btnGhost} onClick={loadPublishedPosts}>↻ Atualizar</button>
        </div>

        {loadingLibrary ? (
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 10 }}>Carregando lista de posts…</div>
        ) : publishedPosts.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 10 }}>Nenhum post encontrado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {publishedPosts.map((post) => (
              <div key={post.file} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{post.title}</div>
                    <div style={{ color: C.textFaint, fontSize: 11, marginTop: 3 }}>
                      {post.file} · {post.category} · {post.date}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" style={{ ...s.btnGhost, textDecoration: "none" }}>Abrir</a>
                    <button
                      style={s.btnGhost}
                      onClick={() => {
                        setUpdatingPostFile(updatingPostFile === post.file ? null : post.file);
                        setUpdateSources("");
                      }}
                    >
                      Atualizar com fontes oficiais
                    </button>
                    <button style={s.btnGhost} onClick={() => editPublishedPost(post)}>Editar</button>
                    <button style={s.btnDanger} onClick={() => deletePublishedPost(post)}>Remover</button>
                  </div>
                </div>
                {updatingPostFile === post.file && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                    <label style={{ ...s.label, display: "block" }}>
                      Links oficiais recentes (um por linha; até 3)
                      <textarea
                        rows={3}
                        style={{ ...s.input, resize: "vertical", marginTop: 6 }}
                        placeholder={"https://www.gov.br/anvisa/...\nhttps://consultas.anvisa.gov.br/..."}
                        value={updateSources}
                        onChange={(event) => setUpdateSources(event.target.value)}
                      />
                    </label>
                    <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.5, margin: "6px 0 10px" }}>
                      O sistema acessa as páginas oficiais e usa o texto encontrado para criar uma proposta. O artigo atual só muda depois da revisão e aprovação.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        style={s.btn}
                        disabled={updateBusy}
                        onClick={() => proposeArticleUpdate(post)}
                      >
                        {updateBusy ? "Checando fontes e gerando…" : "Gerar proposta para revisão"}
                      </button>
                      <button style={s.btnGhost} disabled={updateBusy} onClick={() => setUpdatingPostFile(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ABA: NEWSLETTER ─── */
function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}

function StaleSendNotice({ lastNotifiedDate }) {
  const days = daysSince(lastNotifiedDate);
  if (days === null || days < 4) return null;
  return (
    <div role="alert" style={{
      background: C.accentGlow, border: `1px solid ${C.hl}`, borderRadius: 12,
      padding: "12px 16px", fontSize: 14, color: C.text, lineHeight: 1.6,
    }}>
      <strong>Último envio há {days} dias.</strong> Se saíram artigos nesse período, abra a aba
      Actions do repositório e confira a execução “Enviar Newsletter Diária”.
    </div>
  );
}

function NewsletterTab({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const r = await fetch("/api/admin/newsletter");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar");
      setData(d);
    } catch (err) {
      toast(err.message || "Erro ao carregar newsletter", "error");
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  async function sendTest() {
    if (!testEmail) {
      toast("Informe um e-mail para o teste", "error");
      return;
    }
    setSendingTest(true);
    try {
      const r = await fetch("/api/admin/newsletter/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Falha ao enviar teste");
      toast(`E-mail de teste enviado para ${testEmail}`, "ok");
    } catch (err) {
      toast(err.message, "error");
    }
    setSendingTest(false);
  }

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[1, 2].map(i => (
        <div key={i} style={{ ...s.card, height: 80, background: C.surfaceHover, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <StaleSendNotice lastNotifiedDate={data.lastNotifiedDate} />
      {/* Cards */}
      <div className="stat-grid">
        <StatCard label="Inscritos ativos" value={data.active} sub="recebendo e-mails" color={C.green} icon="📬" />
        <StatCard label="Total cadastrado" value={data.total} sub="histórico" color={C.primary} icon="👥" />
        <StatCard label="Descadastrados" value={data.unsubscribed} sub="optaram por sair" color={C.textFaint} icon="🚫" />
        <StatCard
          label="Último envio"
          value={data.lastNotifiedDate ? new Date(data.lastNotifiedDate).toLocaleDateString("pt-BR") : "—"}
          sub={data.lastNotifiedSlug || "nenhum ainda"}
          color={C.accent}
          icon="🕒"
        />
      </div>

      {/* Como funciona */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Como funciona o envio automático</div>
        <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0, maxWidth: 70 + "ch" }}>
          Todo dia às 11h um GitHub Action procura artigos novos desde o último aviso.
          Entram no e-mail os publicados nas últimas 48 horas, até 5 por envio. Artigos
          com título genérico (como “Informações sobre medicamentos”) ficam de fora. Sem artigo elegível,
          o dia é pulado.
        </p>
      </div>

      {/* Teste manual */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Enviar e-mail de teste</div>
        <p style={{ fontSize: 12, color: C.textFaint, marginBottom: 12 }}>
          Envia o template com o post mais recente apenas para o e-mail abaixo
          (não dispara para a lista de inscritos).
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="seu@email.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ ...s.input, maxWidth: 280 }}
          />
          <button style={s.btn} onClick={sendTest} disabled={sendingTest}>
            {sendingTest ? "Enviando…" : "Enviar teste"}
          </button>
        </div>
      </div>

      {/* Lista de inscritos */}
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ ...s.sectionTitle, marginBottom: 0 }}>Inscritos ({data.contacts.length})</div>
          <button style={{ ...s.btnGhost, padding: "6px 12px", fontSize: 12 }} onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? "Atualizando…" : "↻ Atualizar"}
          </button>
        </div>
        {data.contacts.length === 0 ? (
          <p style={{ color: C.textFaint, fontSize: 13 }}>Nenhum inscrito ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {data.contacts.map((c) => (
              <div key={c.email} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: C.bgElevated, borderRadius: 8, fontSize: 13,
              }}>
                <span style={{ color: C.text }}>{c.email}</span>
                <span style={c.unsubscribed ? s.tag(C.textFaint) : s.tag(C.green)}>
                  {c.unsubscribed ? "Descadastrado" : "Ativo"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ABA: VISÃO GERAL ─── */
function OverviewTab({ pendingEditorialCount, goTo }) {
  const [metrics, setMetrics] = useState(null);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const get = (url) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url))));
    Promise.allSettled([get("/api/admin/metrics"), get("/api/admin/newsletter")]).then(([m, n]) => {
      if (!active) return;
      if (m.status === "fulfilled") setMetrics(m.value);
      if (n.status === "fulfilled") setNews(n.value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[1, 2].map((i) => (
        <div key={i} style={{ ...s.card, height: 80, background: C.surfaceHover, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );

  const staleDays = daysSince(news?.lastNotifiedDate);
  const todo = [];
  if (pendingEditorialCount > 0) {
    todo.push({
      key: "editorial",
      text: pendingEditorialCount === 1 ? "1 rascunho aguarda sua revisão." : `${pendingEditorialCount} rascunhos aguardam sua revisão.`,
      action: "Revisar", tab: "editorial",
    });
  }
  if (staleDays !== null && staleDays >= 4) {
    todo.push({
      key: "newsletter",
      text: `A newsletter não envia há ${staleDays} dias. Confira a execução no GitHub Actions.`,
      action: "Ver newsletter", tab: "newsletter",
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={s.card}>
        <div style={s.sectionTitle}>Precisa de atenção</div>
        {todo.length === 0 ? (
          <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>Nada pendente. Revisões e newsletter estão em dia.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {todo.map((item) => (
              <div key={item.key} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                padding: "12px 14px", background: C.accentGlow, borderRadius: 10, fontSize: 14, color: C.text,
              }}>
                <span style={{ flex: "1 1 240px" }}>{item.text}</span>
                <button style={s.btn} onClick={() => goTo(item.tab)}>{item.action}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stat-grid">
        <StatCard label="Artigos publicados" value={metrics?.totalPosts ?? "—"} sub="no site" color={C.primary} />
        <StatCard label="Nos últimos 7 dias" value={metrics?.postsLast7d ?? "—"} sub="artigos novos" color={C.green} />
        <StatCard label="Inscritos ativos" value={news?.active ?? "—"} sub="recebem a newsletter" color={C.text} />
        <StatCard
          label="Último envio"
          value={news?.lastNotifiedDate ? new Date(news.lastNotifiedDate).toLocaleDateString("pt-BR") : "—"}
          sub={news?.lastNotifiedSlug || "nenhum registro"}
          color={staleDays !== null && staleDays >= 4 ? C.red : C.text}
        />
      </div>
    </div>
  );
}

/* ─── TABS config ─── */
const TABS = [
  { id: "overview", label: "Visão geral", shortLabel: "Início", hint: "O que precisa da sua atenção hoje." },
  { id: "traffic", label: "Tráfego", shortLabel: "Tráfego", hint: "Visitas ao site: visão geral anônima e, para quem aceitou os cookies, cada visita em detalhe." },
  { id: "editorial", label: "Aprovações editoriais", shortLabel: "Revisar", hint: "Rascunhos aguardando revisão antes de publicar." },
  { id: "planning", label: "Planejamento editorial", shortLabel: "Planejar", hint: "Distribua os próximos artigos pelas categorias e escolha um tema para cada pauta." },
  { id: "editor", label: "Artigos", shortLabel: "Artigos", hint: "Escreva e edite artigos com o editor visual." },
  { id: "weekly", label: "Destaque semanal", shortLabel: "Destaque", hint: "O artigo em evidência na home esta semana." },
  { id: "newsletter", label: "Newsletter", shortLabel: "Newsletter", hint: "Inscritos e envio diário por e-mail." },
  { id: "config", label: "Configurações", shortLabel: "Config.", hint: "Ajustes gerais do site e controle de funcionalidades." },
];

/* ─── PÁGINA PRINCIPAL ─── */
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("overview");
  const [pendingEditorialCount, setPendingEditorialCount] = useState(null);
  const [toastState, setToastState] = useState({ msg: "", type: "ok" });

  function showToast(msg, type = "ok") {
    setToastState({ msg, type });
    setTimeout(() => setToastState({ msg: "", type: "ok" }), 3500);
  }

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => { if (r.ok) setAuthed(true); setChecking(false); })
      .catch(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!authed) return undefined;
    let active = true;
    fetch("/api/admin/editorial-review", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao carregar a fila editorial.");
        if (active) setPendingEditorialCount(data.drafts.length);
      })
      .catch((error) => {
        console.error("[admin] Não foi possível carregar a contagem da fila editorial.", error);
      });
    return () => { active = false; };
  }, [authed]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthed(false);
  }

  if (checking) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.textFaint, fontSize: 14 }}>Verificando autenticação…</div>
    </div>
  );

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <StyleInjector />
      <LoginScreen onLogin={() => setAuthed(true)} />
    </div>
  );

  const activeTab = TABS.find((t) => t.id === tab);

  const pendingBadge = (t, mobile) => t.id === "editorial" && pendingEditorialCount > 0 && (
    <span
      aria-label={`${pendingEditorialCount} aguardando revisão`}
      className={mobile ? "mobile-nav-badge" : undefined}
      style={mobile ? undefined : {
        minWidth: 22, padding: "2px 7px", borderRadius: 999, background: C.hl, color: C.ink,
        fontSize: 12, fontWeight: 800, textAlign: "center",
      }}
    >
      {pendingEditorialCount}
    </span>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: "var(--font-body), system-ui, sans-serif",
      fontSize: 14,
    }}>
      <StyleInjector />

      {/* Cabeçalho */}
      <header style={{
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(12px)",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 56,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="header-title" style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>
            <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: C.primary }} />
            Descomplica Bula <span style={{ color: C.textFaint, fontWeight: 600 }}>redação</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" target="_blank" rel="noreferrer"
            style={{ color: C.primary, fontSize: 13, fontWeight: 600, textDecoration: "none", padding: "6px 8px" }}>
            Ver site ↗
          </a>
          <button style={{ ...s.btnGhost, padding: "6px 14px", fontSize: 13 }} onClick={handleLogout}>Sair</button>
        </div>
      </header>

      {/* Layout principal */}
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <nav aria-label="Seções do admin" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className="nav-btn"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                <span className="nav-bubble" aria-hidden="true" />
                <span style={{ flex: 1 }}>{t.label}</span>
                {pendingBadge(t, false)}
              </button>
            ))}
          </nav>
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 4px", color: C.text }}>
            {activeTab?.label}
          </h1>
          <p style={{ margin: "0 0 24px", color: C.textMuted, fontSize: 14 }}>{activeTab?.hint}</p>
          {tab === "overview" && <OverviewTab pendingEditorialCount={pendingEditorialCount} goTo={setTab} />}
          {tab === "traffic" && <TrafficTabs />}
          {tab === "editorial" && (
            <EditorialReviewPanel
              toast={showToast}
              onPendingCountChange={setPendingEditorialCount}
            />
          )}
          {tab === "planning" && (
            <EditorialPlanPanel
              toast={showToast}
              onReview={() => setTab("editorial")}
            />
          )}
          {tab === "weekly" && <WeeklyFeaturedPanel toast={showToast} />}
          {tab === "editor" && <ManualComposerTab toast={showToast} mode="manual" />}
          {tab === "newsletter" && <NewsletterTab toast={showToast} />}
          {tab === "config" && <ConfigTab toast={showToast} />}
        </main>
      </div>

      {/* Navegação mobile (inferior) */}
      <nav className="mobile-nav" aria-label="Seções do admin">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="mobile-nav-btn"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            style={{ color: tab === t.id ? C.primary : C.textFaint, position: "relative", fontWeight: tab === t.id ? 700 : 500 }}
          >
            <span className="nav-bubble" aria-hidden="true" />
            <span className="mobile-nav-label">{t.shortLabel}</span>
            {pendingBadge(t, true)}
          </button>
        ))}
      </nav>

      <Toast msg={toastState.msg} type={toastState.type} />
    </div>
  );
}