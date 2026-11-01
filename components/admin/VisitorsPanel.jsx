"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadTrafficReport } from "./exportReport";
import {
  BarsH, CSS, Card, Donut, Kpi, Segmented, countryName, fmtDur, nf, shortDay,
} from "./AnalyticsPanel";

/* ───────────────────────── constantes e utilitários ───────────────────────── */

const RANGES = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
];
const TZ = "America/Sao_Paulo";

const EVENT_LABELS = {
  newsletter_signup_start: "Inscrições começadas",
  newsletter_signup_success: "Inscrições concluídas",
  affiliate_click: "Cliques em afiliados",
  related_article_click: "Cliques em artigos relacionados",
  outbound_official_source_click: "Cliques em fontes oficiais",
  internal_search: "Buscas no site",
};

const EXTRA_CSS = `
.tv-note{font-size:12.5px;color:var(--c-muted);line-height:1.55;margin:0}
.tv-funnel{display:flex;flex-direction:column;gap:12px}
.tv-funnel-row{display:flex;justify-content:space-between;gap:12px;align-items:baseline;font-size:13.5px}
.tv-funnel-row b{font-variant-numeric:tabular-nums}
.tv-rate{font-family:var(--font-display);font-size:30px;font-weight:800;letter-spacing:-.02em}
.tv-tr{cursor:pointer}
.tv-tr:hover td{background:var(--c-soft)}
.tv-tr[aria-selected=true] td{background:rgba(180,35,44,.07)}
.tv-open{border:0;background:none;padding:0;font:inherit;font-weight:700;color:var(--c-primary);cursor:pointer;text-align:left}
.tv-open:focus-visible{outline:3px solid var(--c-primary);outline-offset:2px;border-radius:4px}
.tv-pill{display:inline-block;font-size:11px;font-weight:800;border-radius:99px;padding:1px 8px;white-space:nowrap}
.tv-pill.new{color:var(--c-green);background:rgba(11,122,71,.1)}
.tv-pill.back{color:var(--c-violet);background:rgba(37,99,235,.1)}
.tv-sub{display:block;font-size:11.5px;color:var(--c-faint);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tv-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.tv-chip{font-size:12.5px;background:var(--c-soft);border:1px solid var(--c-line);border-radius:99px;padding:4px 11px;color:var(--c-muted)}
.tv-chip b{color:var(--c-text)}
.tv-tl{list-style:none;margin:0;padding:0}
.tv-tl li{display:grid;grid-template-columns:64px 22px 1fr;gap:8px;padding:7px 0;border-top:1px solid var(--c-line);font-size:13.5px;align-items:start}
.tv-tl li:first-child{border-top:0}
.tv-tl time{font-size:12px;color:var(--c-faint);font-variant-numeric:tabular-nums;padding-top:1px}
.tv-tl .ev{font-weight:700;color:var(--c-primary)}
.tv-tl small{display:block;color:var(--c-faint);font-size:11.5px}
.tv-more{display:flex;justify-content:center;margin-top:14px}
.tv-btn-light{border:1px solid var(--c-line);background:var(--c-soft);color:var(--c-text);border-radius:11px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer}
.tv-btn-light:hover{background:#F8FAFC}
.tv-btn-light:disabled{opacity:.6;cursor:default}
`;

const fmtWhen = (ms) =>
  new Date(ms).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtClock = (ms) =>
  new Date(ms).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const fmtOffset = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function pageName(path, titles) {
  if (!path) return "—";
  if (path === "/") return "Página inicial";
  if (path.startsWith("/blog/")) return titles?.[path.slice(6)] || path;
  return path;
}

function originOf(s) {
  const campaign = s.campaign ? ` · campanha ${s.campaign.campaign && s.campaign.campaign !== "-" ? s.campaign.campaign : s.campaign.source}` : "";
  if (!s.channel && !s.referrer) return "—";
  if (s.referrer && s.referrer !== "Direto") return `${s.channel || "Referência"} · ${s.referrer}${campaign}`;
  return `${s.channel || "Direto"}${campaign}`;
}

function placeOf(s) {
  if (!s.country || s.country === "??") return "—";
  if (s.country === "BR") return [s.city, s.region].filter(Boolean).join(", ") || "Brasil";
  return [s.city, countryName(s.country)].filter(Boolean).join(", ");
}

function describeEvent(name, dim, titles) {
  const extra = dim && dim !== "outro" ? dim : "";
  switch (name) {
    case "affiliate_click": return `Clicou em link de afiliado${extra ? ` (${extra})` : ""}`;
    case "related_article_click": return `Clicou em artigo relacionado${extra ? `: ${pageName(`/blog/${extra}`, titles)}` : ""}`;
    case "outbound_official_source_click": return `Abriu fonte oficial${extra ? ` (${extra})` : ""}`;
    case "newsletter_signup_start": return "Começou a se inscrever na newsletter";
    case "newsletter_signup_success": return "Inscreveu-se na newsletter";
    case "internal_search": return "Usou a busca do site";
    default: return name;
  }
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || "Falha ao carregar os dados.");
  return json;
}

/* ───────────────────────── gráficos ───────────────────────── */

/** Colunas empilhadas por dia: visitas novas (embaixo) e de quem voltou (em cima). */
function StackedColumns({ points }) {
  const max = Math.max(...points.map((p) => p.sessions), 1);
  const [hov, setHov] = useState(null);
  const every = Math.max(1, Math.ceil(points.length / 8));
  const hp = hov !== null ? points[hov] : null;
  return (
    <div>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: points.length > 40 ? 1 : 3, height: 190 }}
        onMouseLeave={() => setHov(null)}
        role="img"
        aria-label={`Visitas por dia: ${nf.format(points.reduce((s, p) => s + p.sessions, 0))} no período, separadas entre novas e de quem voltou.`}
      >
        {points.map((p, i) => (
          <div key={p.date} onMouseEnter={() => setHov(i)} onClick={() => setHov(i)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "pointer", minWidth: 0 }}>
            {p.sessions === 0 ? (
              <div style={{ width: "100%", height: 2, background: "#E4E7EC" }} />
            ) : (
              <div style={{
                width: "100%", height: `${Math.max(4, (p.sessions / max) * 100)}%`, display: "flex", flexDirection: "column",
                borderRadius: "5px 5px 2px 2px", overflow: "hidden", opacity: hov === null || hov === i ? 1 : 0.55, transition: "opacity .12s",
              }}>
                <div style={{ flex: p.returningSessions, background: "#8F1821" }} />
                <div style={{ flex: p.newSessions, background: "#B4232C" }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: points.length > 40 ? 1 : 3, paddingTop: 6 }} aria-hidden="true">
        {points.map((p, i) => (
          <div key={p.date} style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "#667085", textAlign: "center", whiteSpace: "nowrap", overflow: "visible" }}>
            {i % every === 0 ? shortDay(p.date) : ""}
          </div>
        ))}
      </div>
      <p className="tp-sub" aria-live="polite" style={{ minHeight: 18, marginTop: 8 }}>
        {hp
          ? `${shortDay(hp.date)}: ${nf.format(hp.sessions)} visitas · ${nf.format(hp.newSessions)} novas · ${nf.format(hp.returningSessions)} de quem voltou`
          : "Passe o mouse (ou toque) para ver os números."}
      </p>
      <div className="tp-leg" style={{ gap: 14, marginTop: 4 }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i className="tp-sw" style={{ background: "#B4232C" }} />Novos</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i className="tp-sw" style={{ background: "#8F1821" }} />Voltaram</span>
      </div>
    </div>
  );
}

const asViews = (items, labelKey = "label") => items.map((i) => ({ ...i, label: i[labelKey], views: i.count }));

/* ───────────────────────── detalhe de uma visita ───────────────────────── */

function SessionDetail({ detail, titles, onPick, onClose }) {
  const { session: s, timeline, others } = detail;
  return (
    <Card
      title={`Visita ${fmtWhen(s.start)}`}
      sub={`Visitante ${s.visitor || "—"} · ${s.visitNo > 1 ? `${s.visitNo}ª visita` : s.visitNo === 1 ? "primeira visita" : "—"}`}
      right={<button type="button" className="tv-btn-light" onClick={onClose}>Fechar</button>}
    >
      <div className="tv-chips">
        <span className="tv-chip">Origem: <b>{originOf(s)}</b></span>
        <span className="tv-chip">Local: <b>{placeOf(s)}</b></span>
        <span className="tv-chip">Aparelho: <b>{s.device} · {s.browser} · {s.os}</b></span>
        <span className="tv-chip">Páginas: <b>{s.pages}</b></span>
        <span className="tv-chip">Tempo de leitura: <b>{fmtDur(s.seconds || null)}</b></span>
        <span className="tv-chip">Ações: <b>{s.events}</b></span>
      </div>

      <h4 style={{ margin: "0 0 6px", fontSize: 13, color: "#344054" }}>O que a pessoa fez, em ordem</h4>
      {timeline.length === 0 ? (
        <div className="tp-empty">Sem passos registrados.</div>
      ) : (
        <ol className="tv-tl">
          {timeline.map((it, i) => (
            <li key={`${it.t}-${i}`}>
              <time dateTime={new Date(it.t).toISOString()} title={fmtClock(it.t)}>{fmtOffset(it.t - s.start)}</time>
              <span aria-hidden="true">{it.kind === "view" ? "📄" : it.kind === "leave" ? "↩️" : "⚡"}</span>
              <div>
                {it.kind === "view" && <>Abriu <b>{pageName(it.path, titles)}</b><small>{it.path}</small></>}
                {it.kind === "leave" && <>Saiu de <b>{pageName(it.path, titles)}</b><small>{it.seconds ? `leu por ${fmtDur(it.seconds)}` : "saiu logo"} · rolou {it.scroll}%</small></>}
                {it.kind === "event" && <span className="ev">{describeEvent(it.name, it.dim, titles)}<small style={{ fontWeight: 400 }}>em {pageName(it.path, titles)}</small></span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {timeline.length >= 60 && <p className="tp-note">A linha do tempo guarda os 60 passos mais recentes de cada visita.</p>}

      {others.length > 0 && (
        <>
          <h4 style={{ margin: "20px 0 8px", fontSize: 13, color: "#344054" }}>Outras visitas deste mesmo visitante</h4>
          <div className="tp-scroll">
            <table className="tp-table">
              <thead><tr><th>Quando</th><th>Começou em</th><th className="r">Páginas</th><th className="r">Tempo</th></tr></thead>
              <tbody>
                {others.map((o) => (
                  <tr key={o.id} className="tv-tr" onClick={() => onPick(o.id)}>
                    <td><button type="button" className="tv-open" onClick={(e) => { e.stopPropagation(); onPick(o.id); }}>{fmtWhen(o.start)}</button></td>
                    <td><span className="t">{pageName(o.landing, titles)}</span></td>
                    <td className="r">{o.pages}</td>
                    <td className="r">{fmtDur(o.seconds || null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ───────────────────────── painel ───────────────────────── */

export default function VisitorsPanel() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [list, setList] = useState({ sessions: [], total: 0, titles: {} });
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState(null); // { id, loading, error, detail }

  const load = useCallback(async (value) => {
    setLoading(true);
    setError("");
    try {
      const [stats, recent] = await Promise.all([
        getJson(`/api/admin/visitors?range=${value}`),
        getJson("/api/admin/visitors?list=1&offset=0"),
      ]);
      setData(stats);
      setList({ sessions: recent.sessions || [], total: recent.total || 0, titles: recent.titles || {} });
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  async function loadMore() {
    setListLoading(true);
    try {
      const more = await getJson(`/api/admin/visitors?list=1&offset=${list.sessions.length}`);
      setList((cur) => ({ ...cur, sessions: [...cur.sessions, ...(more.sessions || [])], total: more.total || cur.total }));
    } catch (e) {
      setError(e.message);
    } finally {
      setListLoading(false);
    }
  }

  async function openSession(id) {
    setSelected({ id, loading: true, error: "", detail: null });
    try {
      const detail = await getJson(`/api/admin/visitors?sid=${id}`);
      setSelected({ id, loading: false, error: "", detail });
      requestAnimationFrame(() => document.getElementById("tv-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setSelected({ id, loading: false, error: e.message, detail: null });
    }
  }

  const totals = data?.totals;
  const events = data?.events || [];
  const ev = (name) => events.find((e) => e.name === name) || { count: 0, dims: [], pages: [] };

  const insights = useMemo(() => {
    if (!data || !totals || totals.sessions === 0) return [];
    const out = [];
    if (totals.returningRate !== null) {
      out.push({ icon: "🔁", title: `${totals.returningRate}% são visitas de quem voltou`, text: "Gente que já conhecia o site. Quanto maior, mais fiel é a audiência." });
    }
    const news = data.funnels.newsletter;
    if (news.start > 0 && news.rate !== null) {
      out.push({ icon: "✉️", title: `${news.rate}% concluem a inscrição`, text: `${nf.format(news.done)} inscrições de ${nf.format(news.start)} que começaram.` });
    }
    if (totals.coverage !== null) {
      out.push({
        icon: "🍪",
        title: `Estes números cobrem ${totals.coverage}% das visitas`,
        text: "Só entra aqui quem aceitou os cookies. O total do site está em Visão geral.",
      });
    }
    return out.slice(0, 4);
  }, [data, totals]);

  if (data && data.configured === false) {
    return (
      <>
        <style>{CSS}{EXTRA_CSS}</style>
        <div className="tp"><div className="tp-card"><p className="tv-note">
          Para ver as visitas é preciso conectar o Upstash Redis, o mesmo da aba Visão geral (variáveis <code>KV_REST_API_URL</code> e <code>KV_REST_API_TOKEN</code>).
        </p></div></div>
      </>
    );
  }

  const empty = totals && totals.sessions === 0;
  async function exportReport() {
    setExporting(true);
    setError("");
    try { await downloadTrafficReport({ range, format: "xlsx" }); } catch (e) { setError(e.message); } finally { setExporting(false); }
  }

  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase();
  const spark = (key) => data?.series?.slice(-30).map((p) => p[key]);

  return (
    <div className="tp">
      <style>{CSS}{EXTRA_CSS}</style>

      <div className="tp-hero">
        <div className="tp-hero-row">
          <div>
            <h2>Cada visita, em detalhe</h2>
            <p>
              Só de quem aceitou os cookies
              {updatedAt ? ` · atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })} (Brasília)` : " · carregando…"}
            </p>
          </div>
        </div>
        <div className="tp-controls">
          <Segmented label="Período" options={RANGES} value={range} onChange={setRange} />
          <button type="button" className="tp-btn" onClick={() => load(range)} disabled={loading}>{loading ? "Atualizando…" : "↻ Atualizar"}</button>
          <button type="button" className="tp-btn" onClick={exportReport} disabled={exporting} title="Excel com 15 abas (inclui visão geral e dados de quem aceitou cookies)">{exporting ? "Gerando…" : "⬇ Relatório completo (Excel)"}</button>
        </div>
      </div>

      {error && <div role="alert" className="tp-card tp-err">{error}</div>}

      <div className="tp-kpis" style={{ opacity: loading && !data ? 0.5 : 1 }}>
        <Kpi label="Visitas" icon="zap" color="#B4232C" value={totals ? nf.format(totals.sessions) : "—"} sub={`em ${rangeLabel}`} spark={spark("sessions")} />
        <Kpi label="Visitantes" icon="users" color="#2563EB" value={totals ? nf.format(totals.visitors) : "—"} sub="únicos por dia, somados" spark={spark("visitors")} />
        <Kpi label="Voltaram ao site" icon="eye" color="#0E7490" value={totals?.returningRate != null ? `${totals.returningRate}%` : "—"} sub="das visitas são de recorrentes" />
        <Kpi label="Páginas por visita" icon="layers" color="#198754" value={totals?.pagesPerSession ?? "—"} sub="quanto mais, melhor" />
        <Kpi label="Tempo por visita" icon="clock" color="#B54708" value={totals ? fmtDur(totals.avgSeconds) : "—"} sub="leitura ativa" />
        <Kpi label="Ações no site" icon="mouse" color="#8F1821" value={totals ? nf.format(totals.actions) : "—"} sub="cliques e inscrições" />
        <Kpi label="Cobertura" icon="calendar" color="#667085" value={totals?.coverage != null ? `${totals.coverage}%` : "—"} sub="das visitas aceitaram cookies" />
      </div>

      {insights.length > 0 && (
        <div className="tp-insights">
          {insights.map((i) => (
            <div className="tp-insight" key={i.title}>
              <span className="tp-emoji" aria-hidden="true">{i.icon}</span>
              <div><b>{i.title}</b><span>{i.text}</span></div>
            </div>
          ))}
        </div>
      )}

      {empty && !loading && (
        <div className="tp-card">
          <h3 className="tp-h">Ainda não há visitas com cookies neste período</h3>
          <p className="tv-note" style={{ marginTop: 8 }}>
            Os dados aparecem quando alguém aceita o aviso de cookies. Para testar: abra o site em uma janela anônima
            (<b>sem</b> estar logado no admin — suas visitas logado não são contadas), clique em <b>Aceitar</b> e abra duas ou três páginas.
            Em seguida volte aqui e clique em Atualizar.
          </p>
        </div>
      )}

      {data && !empty && (
        <>
          <div className="tp-grid2">
            <Card title="Visitas novas e de quem voltou" sub="Por dia" delay={40}>
              <StackedColumns points={data.series} />
            </Card>
            <Card title="Novos x recorrentes" sub="Quantas visitas vêm de gente que já conhecia o site" delay={80}>
              <Donut
                items={[
                  { label: "Primeira visita", views: totals.newSessions },
                  { label: "Já tinham visitado", views: totals.returningSessions },
                ]}
                colorOf={(_l, i) => (i === 0 ? "#B4232C" : "#8F1821")}
                centerValue={totals.returningRate != null ? `${totals.returningRate}%` : "—"}
                centerLabel="voltaram"
              />
              <h4 style={{ margin: "20px 0 12px", fontSize: 13, color: "#344054" }}>Em qual visita estão</h4>
              <BarsH items={asViews(data.visitNumber)} total={totals.sessions} labelOf={(i) => i.label} />
            </Card>
          </div>

          <div className="tp-grid2">
            <Card title="Quantas páginas por visita" sub="Profundidade da leitura" delay={40}>
              <BarsH items={asViews(data.depth)} total={totals.sessions} labelOf={(i) => i.label} />
            </Card>
            <Card title="Quanto tempo ficam" sub="Tempo de leitura ativo por visita" delay={80}>
              <BarsH items={asViews(data.duration)} total={totals.sessions} labelOf={(i) => i.label} />
              <p className="tp-note">Visitas em que a pessoa sai sem o navegador avisar entram em “menos de 10 s”.</p>
            </Card>
          </div>

          <div className="tp-grid3">
            <Card title="Newsletter" sub="Quem começa, quem conclui" delay={80}>
              <div className="tv-funnel">
                <div className="tv-funnel-row"><span>Começaram</span><b>{nf.format(data.funnels.newsletter.start)}</b></div>
                <div className="tv-funnel-row"><span>Inscreveram-se</span><b>{nf.format(data.funnels.newsletter.done)}</b></div>
                <div className="tv-rate">{data.funnels.newsletter.rate != null ? `${data.funnels.newsletter.rate}%` : "—"}</div>
                <p className="tv-note">taxa de conclusão</p>
              </div>
              {ev("newsletter_signup_success").pages.length > 0 && (
                <>
                  <h4 style={{ margin: "18px 0 12px", fontSize: 13, color: "#344054" }}>Onde as pessoas se inscrevem</h4>
                  <BarsH items={ev("newsletter_signup_success").pages.map((p) => ({ ...p, label: p.title, views: p.count }))}
                    total={ev("newsletter_signup_success").count} labelOf={(i) => i.label} subOf={(i) => i.path} />
                </>
              )}
            </Card>
            <Card title="Todas as ações" sub="O que as pessoas fazem no site" delay={120}>
              <BarsH
                items={events.filter((e) => e.count > 0).sort((a, b) => b.count - a.count).map((e) => ({ label: EVENT_LABELS[e.name] || e.name, views: e.count }))}
                total={Math.max(totals.actions, 1)} labelOf={(i) => i.label}
              />
            </Card>
          </div>

          <div className="tp-grid3">
            <Card title="Afiliados" sub="Parceiros mais clicados e onde" delay={40}>
              <BarsH items={asViews(ev("affiliate_click").dims, "label")} total={ev("affiliate_click").count} labelOf={(i) => i.label} />
              {ev("affiliate_click").pages.length > 0 && (
                <>
                  <h4 style={{ margin: "18px 0 12px", fontSize: 13, color: "#344054" }}>Páginas que mais geram cliques</h4>
                  <BarsH items={ev("affiliate_click").pages.map((p) => ({ ...p, label: p.title, views: p.count }))}
                    total={ev("affiliate_click").count} labelOf={(i) => i.label} subOf={(i) => i.path} />
                </>
              )}
            </Card>
            <Card title="Artigos relacionados" sub="O que leva as pessoas a continuar lendo" delay={80}>
              <BarsH items={asViews(ev("related_article_click").dims, "label")} total={ev("related_article_click").count} labelOf={(i) => i.label} />
            </Card>
            <Card title="Fontes oficiais" sub="Domínios que as pessoas abrem" delay={120}>
              <BarsH items={asViews(ev("outbound_official_source_click").dims, "label")} total={ev("outbound_official_source_click").count} labelOf={(i) => i.label} />
            </Card>
          </div>
        </>
      )}

      <Card
        title="Visitas recentes"
        sub={list.total ? `${nf.format(list.total)} visitas guardadas (os detalhes expiram em 90 dias). Clique em uma para ver o passo a passo.` : "As visitas aparecem aqui assim que alguém aceitar os cookies."}
        delay={40}
      >
        {list.sessions.length === 0 ? (
          <div className="tp-empty">{loading ? "Carregando…" : "Nenhuma visita registrada ainda."}</div>
        ) : (
          <>
            <div className="tp-scroll">
              <table className="tp-table">
                <thead>
                  <tr><th>Quando</th><th>Visitante</th><th>Origem</th><th>Local</th><th>Aparelho</th><th className="r">Págs.</th><th className="r">Tempo</th><th className="r">Ações</th></tr>
                </thead>
                <tbody>
                  {list.sessions.map((s) => (
                    <tr key={s.id} className="tv-tr" aria-selected={selected?.id === s.id} onClick={() => openSession(s.id)}>
                      <td>
                        <button type="button" className="tv-open" onClick={(e) => { e.stopPropagation(); openSession(s.id); }}>{fmtWhen(s.start)}</button>
                        <span className="tv-sub" title={s.landing}>{pageName(s.landing, list.titles)}</span>
                      </td>
                      <td>
                        {s.visitNo > 1 ? <span className="tv-pill back">{s.visitNo}ª visita</span> : s.visitNo === 1 ? <span className="tv-pill new">Novo</span> : "—"}
                        <span className="tv-sub">{s.visitor}</span>
                      </td>
                      <td>{originOf(s)}</td>
                      <td>{placeOf(s)}</td>
                      <td>{s.device} · {s.browser}</td>
                      <td className="r">{s.pages}</td>
                      <td className="r">{fmtDur(s.seconds || null)}</td>
                      <td className="r">{s.events || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.sessions.length < list.total && (
              <div className="tv-more">
                <button type="button" className="tv-btn-light" onClick={loadMore} disabled={listLoading}>{listLoading ? "Carregando…" : "Ver mais visitas"}</button>
              </div>
            )}
          </>
        )}
      </Card>

      {selected && (
        <div id="tv-detail">
          {selected.loading && <div className="tp-card"><div className="tp-empty">Carregando a visita…</div></div>}
          {selected.error && <div role="alert" className="tp-card tp-err">{selected.error}</div>}
          {selected.detail && (
            <SessionDetail detail={selected.detail} titles={selected.detail.titles} onPick={openSession} onClose={() => setSelected(null)} />
          )}
        </div>
      )}

      <p className="tp-note" style={{ textAlign: "center" }}>
        Privacidade: cada visita é ligada a um código aleatório guardado em cookie, sem nome, e-mail ou IP. Só entra quem clicou em “Aceitar”;
        quem recusa depois tem os registros apagados. Suas visitas logado no admin e as de robôs não são contadas.
      </p>
    </div>
  );
}
