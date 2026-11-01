/**
 * lib/traffic-report.js — monta o relatório completo de tráfego (todas as abas).
 *
 * Função PURA (sem Redis, sem rede): recebe os agregados já lidos
 * (aggregateStats / aggregateVisitors em modo `full`) + a lista de artigos, e
 * devolve as abas prontas para lib/xlsx-lite.js. Isso permite testar o
 * relatório inteiro com dados sintéticos.
 *
 * Princípio: cada aba responde a uma decisão.
 *   Resumo        → "como estamos vs. o período anterior?"
 *   Oportunidades → "o que fazer primeiro?" (lista priorizada, com evidência)
 *   Diário        → "há tendência? qual dia foi fora do normal?"
 *   Páginas/Artigos/Categorias → "o que atualizar, promover, consolidar ou cortar?"
 *   Canais/Origens/UTM → "de onde vem e o que vale investir?"
 *   Horários      → "quando publicar?"
 *   Leitores/Ações → "as ferramentas de leitura e a newsletter são usadas?"
 */

import { getBrazilState } from "./brazil-states.js";

// ── regras dos diagnósticos (também documentadas na aba "Leia-me") ──────────
export const RULES = {
  MIN_VIEWS: 10,        // abaixo disso a amostra é pequena demais para diagnosticar
  SHORT_READ_S: 30,     // "pouca leitura": tempo médio menor que isto
  DEEP_READ_S: 120,     // "leitura profunda": tempo médio igual ou maior que isto
  ENTRY_STRONG: 0.6,    // "porta de entrada": 60%+ das views são início de visita
  NEW_POST_DAYS: 7,     // artigo com menos de 7 dias não é cobrado por visitas
  CONF_HIGH: 50,        // views para confiança Alta
  CONF_MID: 20,         // views para confiança Média
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const TZ = "America/Sao_Paulo";

const EVENT_LABELS = {
  newsletter_signup_start: "Newsletter: inscrições começadas",
  newsletter_signup_success: "Newsletter: inscrições concluídas",
  affiliate_click: "Cliques em afiliados",
  related_article_click: "Cliques em artigos relacionados",
  outbound_official_source_click: "Cliques em fontes oficiais",
  internal_search: "Buscas no site",
};
const EVENT_DIM = {
  newsletter_signup_start: "Página de origem",
  newsletter_signup_success: "Página de origem",
  affiliate_click: "Parceiro",
  related_article_click: "Artigo de destino",
  outbound_official_source_click: "Site de destino",
  internal_search: "—",
};
// ── helpers ─────────────────────────────────────────────────────────────────
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const frac = (a, b) => (b ? a / b : null);
const change = (now, before) => (before ? (now - before) / before : null);
const I = (v) => ({ v, f: "int" });
const P = (v) => ({ v, f: "pct" });
const D1 = (v) => ({ v, f: "dec1" });
const DELTA = (v) => ({ v, f: "delta" });
const H = (v) => ({ v, f: "header" });
const W = (v) => ({ v, f: "wrap" });
const dow = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();
const br = (key) => (key ? key.split("-").reverse().join("/") : "");
const hourLabel = (h) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}h`;
const brDateTime = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(d);

function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

export function confidence(views) {
  return views >= RULES.CONF_HIGH ? "Alta" : views >= RULES.CONF_MID ? "Média" : "Baixa";
}

function countryName(code) {
  if (!/^[A-Z]{2}$/.test(code)) return code === "??" ? "Desconhecido" : code;
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function pageKind(path) {
  if (path.startsWith("/blog/")) return "Artigo";
  const map = { "/": "Página inicial", "/blog": "Lista do blog", "/fontes-oficiais": "Fontes oficiais", "/aviso-de-saude": "Aviso de saúde", "/sobre": "Institucional", "/metodologia": "Institucional", "/privacidade": "Institucional", "/contato": "Institucional" };
  return map[path] || "Outra";
}

/** Diagnóstico de uma página/artigo a partir de views, entradas e tempo. */
function diagnose({ views, entries, avgSeconds }, ctx) {
  if (views < RULES.MIN_VIEWS) return "Amostra pequena";
  const entryRate = frac(entries, views) ?? 0;
  // "estritamente acima" do corte: com empates (comum em site pequeno) o corte cai no valor do empate
  // e, com >=, quase todo mundo viraria "muito acessado".
  const top = ctx.enough && views > ctx.p75;
  if (top && avgSeconds != null && avgSeconds < RULES.SHORT_READ_S) return "Muita visita, pouca leitura";
  if (ctx.enough && views <= ctx.median && avgSeconds != null && avgSeconds >= RULES.DEEP_READ_S) return "Leitura profunda, poucas visitas";
  if (top && entryRate >= RULES.ENTRY_STRONG) return "Porta de entrada forte";
  if (top) return "Muito acessada";
  return "Normal";
}

function distribution(items, getKey, getViews) {
  const total = items.reduce((a, it) => a + num(getViews(it)), 0);
  return { total, rows: items.map((it) => [getKey(it), I(getViews(it)), P(frac(getViews(it), total))]) };
}

// ═════════════════════════════════════════════════════════════════════════════
export function buildTrafficReport({ stats, visitors = null, posts = [], range, generatedAt = new Date(), siteName = "Descomplica Bula" }) {
  const series = stats.series || [];
  const totals = stats.totals || {};
  const totalViews = num(totals.views);
  const firstDay = series[0]?.date;
  const lastDay = series.at(-1)?.date;
  const periodo = `${br(firstDay)} a ${br(lastDay)}`;
  const generated = brDateTime(generatedAt);
  const vTotals = visitors?.totals || null;

  // ── páginas e artigos ────────────────────────────────────────────────────
  const pages = (stats.pages || []).map((p) => ({ ...p, views: num(p.views), entries: num(p.entries) }));
  const pageByPath = new Map(pages.map((p) => [p.path, p]));
  const articleRows = posts.map((post) => {
    const path = `/blog/${post.slug}`;
    const pg = pageByPath.get(path);
    const published = post.date ? new Date(post.date) : null;
    const age = published && !Number.isNaN(published.getTime()) ? Math.max(0, Math.floor((generatedAt - published) / 86400000)) : null;
    return {
      post, path, age,
      views: pg?.views || 0, entries: pg?.entries || 0, avgSeconds: pg?.avgSeconds ?? null,
    };
  });

  const qualifying = articleRows.filter((a) => a.views >= RULES.MIN_VIEWS).map((a) => a.views).sort((a, b) => a - b);
  const ctx = { enough: qualifying.length >= 4, p75: quantile(qualifying, 0.75), median: quantile(qualifying, 0.5) };
  const pageViewsSorted = pages.filter((p) => p.views >= RULES.MIN_VIEWS).map((p) => p.views).sort((a, b) => a - b);
  const pageCtx = { enough: pageViewsSorted.length >= 4, p75: quantile(pageViewsSorted, 0.75), median: quantile(pageViewsSorted, 0.5) };

  for (const a of articleRows) {
    if (a.views === 0) a.diag = a.age != null && a.age < RULES.NEW_POST_DAYS ? "Novo (menos de 7 dias)" : "Sem visitas no período";
    else a.diag = diagnose(a, ctx);
  }

  // ═══ Aba: Páginas (todas) ═══
  const sheetPages = {
    name: "Páginas", tab: "FF2430E6", headerRow: 1, widths: [46, 40, 16, 11, 11, 12, 12, 13, 14, 30],
    rows: [
      ["Página", "Caminho", "Tipo", "Visualizações", "% do total", "Entradas", "% views que são entrada", "Tempo médio (s)", "Confiança da amostra", "Diagnóstico"].map(H),
      ...pages.map((p) => [
        p.title, p.path, pageKind(p.path), I(p.views), P(frac(p.views, totalViews)), I(p.entries), P(frac(p.entries, p.views)),
        p.avgSeconds == null ? null : I(p.avgSeconds), confidence(p.views), diagnose(p, pageCtx),
      ]),
    ],
  };

  // ═══ Aba: Artigos (inventário completo, inclusive os sem visita) ═══
  const sortedArticles = [...articleRows].sort((a, b) => b.views - a.views || (b.post.date || "").localeCompare(a.post.date || ""));
  const sheetArticles = {
    name: "Artigos", tab: "FF7C3AED", headerRow: 1, widths: [54, 44, 22, 13, 10, 10, 11, 13, 11, 11, 12, 13, 14, 30],
    rows: [
      ["Título", "Caminho", "Categoria", "Publicado em", "Idade (dias)", "Palavras", "noindex", "Visualizações", "% do total", "Entradas", "Tempo médio (s)", "Views por dia", "Confiança da amostra", "Diagnóstico"].map(H),
      ...sortedArticles.map((a) => [
        a.post.title, a.path, a.post.category || "—", a.post.date ? a.post.date.slice(0, 10) : "", a.age == null ? null : I(a.age), I(num(a.post.wordCount)),
        a.post.noindex ? "Sim" : "Não", I(a.views), P(frac(a.views, totalViews)), I(a.entries), a.avgSeconds == null ? null : I(a.avgSeconds),
        D1(a.views / Math.max(1, Math.min(range, a.age == null ? range : Math.max(a.age, 1)))), confidence(a.views), a.diag,
      ]),
    ],
  };

  // ═══ Aba: Categorias ═══
  const cats = new Map();
  for (const a of articleRows) {
    const key = a.post.category || "Sem categoria";
    const c = cats.get(key) || { n: 0, withViews: 0, views: 0, entries: 0, secW: 0, secViews: 0 };
    c.n += 1; c.views += a.views; c.entries += a.entries;
    if (a.views > 0) c.withViews += 1;
    if (a.avgSeconds != null && a.views > 0) { c.secW += a.avgSeconds * a.views; c.secViews += a.views; }
    cats.set(key, c);
  }
  const articleViews = articleRows.reduce((s, a) => s + a.views, 0);
  const avgPerArticle = frac(articleViews, articleRows.length) || 0;
  const sheetCats = {
    name: "Categorias", tab: "FF10B981", headerRow: 1, widths: [30, 12, 12, 12, 15, 11, 15, 15, 12, 24],
    rows: [
      ["Categoria", "Artigos", "Com visita", "Sem visita", "Visualizações", "% das views de artigos", "Views por artigo", "Tempo médio (s)*", "Entradas", "Leitura"].map(H),
      ...[...cats.entries()].sort((a, b) => b[1].views - a[1].views).map(([name, c]) => {
        const perArticle = c.n ? c.views / c.n : 0;
        return [
          name, I(c.n), I(c.withViews), I(c.n - c.withViews), I(c.views), P(frac(c.views, articleViews)), D1(perArticle),
          c.secViews ? I(Math.round(c.secW / c.secViews)) : null, I(c.entries),
          c.n < 3 ? "Poucos artigos" : perArticle >= avgPerArticle * 1.25 ? "Acima da média" : perArticle <= avgPerArticle * 0.75 ? "Abaixo da média" : "Na média",
        ];
      }),
      [],
      [{ v: "* Tempo médio ponderado pelas visualizações dos artigos que têm medição de tempo. Referência: média do site = " + avgPerArticle.toFixed(1).replace(".", ",") + " views por artigo.", f: "hint" }],
    ],
  };

  // ═══ Aba: Diário ═══
  const viewsArr = series.map((d) => num(d.views));
  const avgDay = frac(viewsArr.reduce((a, b) => a + b, 0), viewsArr.length) || 0;
  const vByDate = new Map((visitors?.series || []).map((d) => [d.date, d]));
  const sheetDaily = {
    name: "Diário", tab: "FF0EA5E9", headerRow: 1, widths: [12, 14, 14, 12, 11, 13, 16, 18, 14, 18],
    rows: [
      ["Data", "Dia da semana", "Visualizações", "Visitantes", "Sessões", "Págs por sessão", "Média móvel 7 dias (views)", "Vs. média do período", "Sessões novas*", "Sessões de quem voltou*"].map(H),
      ...series.map((d, i) => {
        const win = viewsArr.slice(Math.max(0, i - 6), i + 1);
        const v = vByDate.get(d.date);
        return [
          d.date, WEEKDAYS[dow(d.date)], I(num(d.views)), I(num(d.visitors)), I(num(d.sessions)), D1(frac(num(d.views), num(d.sessions)) ?? 0),
          D1(win.reduce((a, b) => a + b, 0) / win.length), DELTA(change(num(d.views), avgDay)),
          v ? I(v.newSessions) : null, v ? I(v.returningSessions) : null,
        ];
      }),
      [],
      [{ v: "* Só sessões de quem aceitou os cookies (ver aba Leia-me). Média móvel: média das views dos 7 dias até a data.", f: "hint" }],
    ],
  };

  // ═══ Aba: Canais / Origens / UTM ═══
  const ch = distribution(stats.channels || [], (c) => c.label, (c) => num(c.views));
  const sheetChannels = { name: "Canais", tab: "FFF59E0B", headerRow: 1, widths: [30, 15, 12], rows: [["Canal", "Visualizações", "% do total"].map(H), ...ch.rows] };
  const rf = distribution(stats.referrers || [], (r) => r.source, (r) => num(r.views));
  const sheetRefs = { name: "Origens", tab: "FFF59E0B", headerRow: 1, widths: [40, 15, 12], rows: [["Site de origem", "Visualizações", "% do total"].map(H), ...rf.rows] };
  const sheetUtm = {
    name: "Campanhas UTM", tab: "FFF59E0B", headerRow: 1, widths: [24, 20, 34, 15, 12],
    rows: [
      ["utm_source", "utm_medium", "utm_campaign", "Sessões", "% das sessões"].map(H),
      ...(stats.campaigns || []).map((c) => [c.source, c.medium, c.campaign, I(num(c.views)), P(frac(num(c.views), num(totals.sessions)))]),
    ],
  };

  // ═══ Aba: Aparelhos ═══
  const sheetDevices = {
    name: "Aparelhos", tab: "FF64748B", headerRow: 1, widths: [16, 30, 15, 12],
    rows: [
      ["Tipo", "Item", "Visualizações", "% do total"].map(H),
      ...(stats.devices || []).map((d) => ["Aparelho", d.label, I(num(d.views)), P(frac(num(d.views), totalViews))]),
      ...(stats.browsers || []).map((d) => ["Navegador", d.label, I(num(d.views)), P(frac(num(d.views), totalViews))]),
      ...(stats.systems || []).map((d) => ["Sistema", d.label, I(num(d.views)), P(frac(num(d.views), totalViews))]),
    ],
  };

  // ═══ Aba: Geografia ═══
  const sheetGeo = {
    name: "Geografia", tab: "FF64748B", headerRow: 1, widths: [12, 34, 22, 15, 12],
    rows: [
      ["Tipo", "Local", "Estado/País", "Visualizações", "% do total"].map(H),
      ...(stats.countries || []).map((c) => ["País", countryName(c.code), c.code, I(num(c.views)), P(frac(num(c.views), totalViews))]),
      ...[...(stats.regions || [])].sort((a, b) => num(b.views) - num(a.views)).map((r) => ["Estado", getBrazilState(r.code)?.name || r.code, r.code, I(num(r.views)), P(frac(num(r.views), totalViews))]),
      ...(stats.cities || []).map((c) => ["Cidade", c.city, [c.region, c.country].filter(Boolean).join(", "), I(num(c.views)), P(frac(num(c.views), totalViews))]),
    ],
  };

  // ═══ Aba: Horários (hora do dia + dia da semana normalizado) ═══
  const hours = stats.hours || Array(24).fill(0);
  const hourTotal = hours.reduce((a, b) => a + num(b), 0);
  const peakHour = hours.indexOf(Math.max(...hours));
  const wdSum = Array(7).fill(0);
  const wdDays = Array(7).fill(0);
  series.forEach((d) => { wdSum[dow(d.date)] += num(d.views); wdDays[dow(d.date)] += 1; });
  const wdAvg = wdSum.map((s, i) => (wdDays[i] ? s / wdDays[i] : 0));
  const bestWd = wdAvg.indexOf(Math.max(...wdAvg));
  let win3 = { start: 0, sum: -1 };
  for (let h = 0; h < 24; h += 1) {
    const sum = num(hours[h]) + num(hours[(h + 1) % 24]) + num(hours[(h + 2) % 24]);
    if (sum > win3.sum) win3 = { start: h, sum };
  }
  const sheetTime = {
    name: "Horários", tab: "FF14B8A6", headerRow: 1, widths: [16, 18, 15, 12, 20, 18],
    rows: [
      ["Tipo", "Item", "Visualizações", "% do total", "Dias no período", "Média por dia"].map(H),
      ...hours.map((v, h) => ["Hora do dia", hourLabel(h) + (h === peakHour && hourTotal ? "  ← pico" : ""), I(num(v)), P(frac(num(v), hourTotal)), null, null]),
      ...WEEKDAYS.map((name, i) => ["Dia da semana", name + (i === bestWd && series.length >= 14 && wdAvg[bestWd] > 0 ? "  ← melhor" : ""), I(wdSum[i]), P(frac(wdSum[i], totalViews)), I(wdDays[i]), D1(wdAvg[i])]),
      [],
      [{ v: "Horário de Brasília. Para comparar dias da semana use a coluna \"Média por dia\": a soma depende de quantas segundas, terças etc. cabem no período.", f: "hint" }],
    ],
  };

  // ═══ Aba: Leitores (cookies) ═══
  const groupRows = (label, list) => {
    const total = list.reduce((a, it) => a + num(it.count), 0);
    return list.map((it) => [label, it.label, I(num(it.count)), P(frac(num(it.count), total))]);
  };
  const sheetReaders = {
    name: "Leitores (cookies)", tab: "FF7C3AED", headerRow: 1, widths: [24, 24, 14, 14],
    rows: visitors
      ? [
          ["Grupo", "Faixa", "Sessões", "% do grupo"].map(H),
          ...groupRows("Número da visita", visitors.visitNumber || []),
          ...groupRows("Páginas por visita", visitors.depth || []),
          ...groupRows("Duração da visita", visitors.duration || []),
          [],
          [{ v: `Só sessões de quem aceitou os cookies${vTotals?.coverage != null ? ` (${vTotals.coverage}% das sessões do período)` : ""}.`, f: "hint" }],
        ]
      : [["Sem dados de visitas com cookies para este período."]],
  };

  // ═══ Aba: Ações e funis ═══
  const events = visitors?.events || [];
  const ev = (name) => events.find((e) => e.name === name);
  const evCount = (name) => num(ev(name)?.count);
  const nlStart = evCount("newsletter_signup_start"), nlDone = evCount("newsletter_signup_success");
  const sheetActions = {
    name: "Ações e funis", tab: "FFEC4899", headerRow: 1, widths: [40, 36, 14, 14],
    rows: visitors
      ? [
          ["Ação", "Detalhe", "Total", "% da ação"].map(H),
          ...events.flatMap((e) => {
            const head = [EVENT_LABELS[e.name] || e.name, "Total", I(e.count), null];
            const dims = (e.dims || []).map((d) => [EVENT_LABELS[e.name] || e.name, `${EVENT_DIM[e.name] || "Detalhe"}: ${d.label}`, I(d.count), P(frac(d.count, e.count))]);
            const where = (e.pages || []).map((p) => [EVENT_LABELS[e.name] || e.name, `Na página: ${p.title}`, I(p.count), P(frac(p.count, e.count))]);
            return [head, ...dims, ...where];
          }),
          [],
          [{ v: "Funis", f: "section" }],
          ["Newsletter: concluídas ÷ começadas", `${nlDone} de ${nlStart}`, null, P(frac(nlDone, nlStart))],
          [],
          [{ v: "Só ações de quem aceitou os cookies. Os números são mínimos reais: quem recusou não aparece.", f: "hint" }],
        ]
      : [["Sem dados de ações com cookies para este período."]],
  };

  // ═══ Resumo (KPIs com comparação) ═══
  const pv = totals.previousViews, ps = totals.previousSessions;
  const hasPrev = pv != null;
  const kpi = (label, now, prev, fmt, how) => [label, now == null ? null : fmt(now), prev == null ? null : fmt(prev), prev == null || now == null ? null : DELTA(change(now, prev)), W(how)];
  const sessions = num(totals.sessions);
  const sheetSummary = {
    name: "Resumo", tab: "FF12163A", grid: false, widths: [34, 16, 18, 13, 70],
    rows: [
      [{ v: `Relatório de tráfego · ${siteName}`, f: "title" }],
      [{ v: `Período: ${periodo} (${series.length} dias) · gerado em ${generated} (horário de Brasília) · dados anônimos de todos os visitantes.${range > 90 ? " Comparação com o período anterior só existe até 90 dias." : ""}`, f: "hint" }],
      [],
      ["Métrica", "Período atual", "Período anterior", "Variação", "Como interpretar"].map(H),
      kpi("Visualizações de página", totalViews, hasPrev ? pv : null, I, "Total de páginas abertas. É a métrica de volume."),
      kpi("Sessões (visitas)", sessions, hasPrev ? ps : null, I, "Uma sessão = uma visita completa, com várias páginas."),
      ["Visitantes únicos (soma dos dias)", I(num(totals.visitors)), null, null, W("Cada dia conta o visitante uma vez; a mesma pessoa em dias diferentes soma de novo.")],
      ["Média de views por dia", D1(num(totals.avgPerDay)), null, null, W("Use para dimensionar metas diárias.")],
      ["Páginas por sessão", totals.pagesPerSession == null ? null : D1(totals.pagesPerSession), null, null, W("Acima de 1,5 indica que os links internos estão funcionando.")],
      ["Tempo médio por sessão (s)", totals.avgSeconds == null ? null : I(totals.avgSeconds), null, null, W("Tempo de leitura ativo (aba aberta e em uso).")],
      ["Taxa de rejeição", totals.bounceRate == null ? null : P(totals.bounceRate / 100), null, null, W("Saíram após 1 página. Em blog é alta por natureza; compare com o seu histórico.")],
      ["Rolagem média", totals.avgScroll == null ? null : P(totals.avgScroll / 100), null, null, W("Quanto do artigo foi percorrido, em média.")],
      ["Views hoje / ontem", `${num(totals.today?.views)} / ${num(totals.yesterday?.views)}`, null, null, W("Hoje ainda está em andamento no momento da exportação.")],
      [],
      [{ v: "Quem aceitou os cookies (comportamento individual)", f: "section" }],
      ["Sessões com cookies", vTotals ? I(vTotals.sessions) : null, null, null, W(vTotals?.coverage != null ? `Equivale a ${vTotals.coverage}% das sessões. Abaixo de ~30%, trate os números desta parte como indicativos.` : "Sem dados.")],
      ["Taxa de quem volta", vTotals?.returningRate == null ? null : P(vTotals.returningRate / 100), null, null, W("Sessões que não são a 1ª visita. É um sinal de fidelidade e retorno ao conteúdo.")],
      ["Newsletter: concluídas ÷ começadas", nlStart ? P(nlDone / nlStart) : null, null, null, W(`${nlDone} de ${nlStart}.`)],
      [],
      [{ v: "Veja a aba Oportunidades para a lista priorizada do que fazer, e a aba Leia-me para as definições.", f: "hint" }],
    ],
  };

  // ═══ Oportunidades (priorizadas, com evidência) ═══
  const ops = [];
  const add = (prioridade, tema, alvo, evidencia, acao, conf) => ops.push([prioridade, tema, alvo, evidencia, acao, conf]);
  const confSite = totalViews >= 500 ? "Alta" : totalViews >= 150 ? "Média" : "Baixa";
  const pick = (diag, n = 8) => articleRows.filter((a) => a.diag === diag).sort((a, b) => b.views - a.views).slice(0, n);

  pick("Muita visita, pouca leitura").forEach((a, i) => add(i < 3 ? "Alta" : "Média", "Atualizar conteúdo", a.post.title,
    `${a.views} views e tempo médio de ${a.avgSeconds}s (menos de ${RULES.SHORT_READ_S}s). ${Math.round((frac(a.entries, a.views) || 0) * 100)}% das views são início de visita.`,
    "Revisar título e introdução (a promessa bate com o conteúdo?), subir a resposta principal para o começo e melhorar a leitura no celular.", confidence(a.views)));

  pick("Leitura profunda, poucas visitas").forEach((a) => add("Média", "Promover", a.post.title,
    `Tempo médio de ${a.avgSeconds}s (leitura profunda) com só ${a.views} views, abaixo da mediana dos artigos (${Math.round(ctx.median)}).`,
    "Conteúdo bom que ninguém vê: linkar a partir dos artigos mais visitados, destacar na newsletter e testar um título mais claro.", confidence(a.views)));

  pick("Porta de entrada forte", 5).forEach((a) => add("Média", "Aproveitar a entrada", a.post.title,
    `${a.views} views, ${Math.round((frac(a.entries, a.views) || 0) * 100)}% delas são o começo da visita.`,
    "Muita gente começa a visita aqui: deixar fontes oficiais, artigos relacionados e newsletter visíveis após a resposta principal.", confidence(a.views)));

  const zero = articleRows.filter((a) => a.diag === "Sem visitas no período");
  if (zero.length) {
    const byCat = {};
    zero.forEach((a) => { const k = a.post.category || "Sem categoria"; byCat[k] = (byCat[k] || 0) + 1; });
    const worst = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(", ");
    add(zero.length / Math.max(1, articleRows.length) > 0.3 ? "Alta" : "Média", "Artigos sem visita", `${zero.length} de ${articleRows.length} artigos`,
      `${Math.round((zero.length / Math.max(1, articleRows.length)) * 100)}% do acervo não recebeu nenhuma visita em ${range} dias. Mais afetadas: ${worst}.`,
      "Na aba Artigos, filtre \"Sem visitas no período\": consolidar os que repetem tema, atualizar os que valem a pena e marcar noindex nos fracos.", confSite);
  }

  const top5 = pages.slice(0, 5).reduce((a, p) => a + p.views, 0);
  if (totalViews && pages.length > 5 && top5 / totalViews > 0.6) add("Média", "Concentração de tráfego", "5 páginas mais vistas",
    `${Math.round((top5 / totalViews) * 100)}% das visualizações vêm de 5 páginas (${pages.slice(0, 5).map((p) => p.title).join("; ")}).`,
    "Risco de depender de poucas páginas: levar o leitor delas para outros artigos com links internos e a newsletter.", confSite);

  const chan = (re) => (stats.channels || []).find((c) => re.test(c.label));
  const organic = chan(/busca/i), direct = chan(/direto/i), social = chan(/social/i);
  if (totalViews >= 100) {
    const so = frac(num(organic?.views), totalViews) ?? 0, sd = frac(num(direct?.views), totalViews) ?? 0;
    if (so < 0.25) add("Média", "Aquisição", organic?.label || "Busca orgânica", `Busca orgânica responde por ${Math.round(so * 100)}% das visualizações.`, "SEO ainda é a alavanca de crescimento: priorizar os guias com potencial de busca, corrigir canibalização e acompanhar a indexação no Search Console.", confSite);
    if (sd > 0.5) add("Média", "Aquisição", direct?.label || "Direto", `${Math.round(sd * 100)}% das visualizações são "Direto" (inclui apps e links sem origem).`, "Colocar utm_source/utm_medium nos links de newsletter, WhatsApp e redes para enxergar de onde realmente vem.", confSite);
    if (social && frac(num(social.views), totalViews) > 0.15) add("Info", "Aquisição", social.label, `${Math.round((social.views / totalViews) * 100)}% do tráfego vem de redes sociais.`, "Tráfego social costuma rejeitar mais: conferir a primeira tela dos artigos mais compartilhados.", confSite);
  }

  if (totals.bounceRate != null && totals.bounceRate > 75) add("Média", "Retenção", "Site inteiro", `Taxa de rejeição de ${totals.bounceRate}%.`, "Reforçar links internos para fontes oficiais e artigos relacionados.", confSite);
  if (totals.pagesPerSession != null && totals.pagesPerSession < 1.3) add("Média", "Retenção", "Site inteiro", `${String(totals.pagesPerSession).replace(".", ",")} páginas por sessão.`, "Sugerir fontes oficiais e conteúdos relacionados ao final dos artigos.", confSite);

  const mobile = (stats.devices || []).find((d) => d.label === "Mobile");
  if (mobile && totalViews && mobile.views / totalViews >= 0.7) add("Info", "Experiência", "Celular", `${Math.round((mobile.views / totalViews) * 100)}% do acesso é pelo celular.`, "Testar leitura das bulas, avisos de saúde e fontes oficiais em telas pequenas.", confSite);

  if (hourTotal >= 100) add("Info", "Quando publicar", `${hourLabel(win3.start)} às ${hourLabel(win3.start + 3)}`,
    `Janela de 3 horas com mais acesso (${Math.round((win3.sum / hourTotal) * 100)}% das views); pico às ${hourLabel(peakHour)}.${series.length >= 14 ? ` Melhor dia por média: ${WEEKDAYS[bestWd]}.` : ""}`,
    `Publicar e enviar newsletter cerca de 1 hora antes (por volta de ${hourLabel(win3.start - 1)}).`, confSite);

  if (series.length >= 14) {
    const last7 = viewsArr.slice(-7).reduce((a, b) => a + b, 0), prev7 = viewsArr.slice(-14, -7).reduce((a, b) => a + b, 0);
    const d = change(last7, prev7);
    if (d != null && Math.abs(d) >= 0.2) add(d < 0 ? "Média" : "Info", "Tendência", "Últimos 7 dias", `${last7} views contra ${prev7} nos 7 dias anteriores (${d > 0 ? "+" : ""}${Math.round(d * 100)}%).`, d < 0 ? "Queda recente: conferir indexação, mudanças de URL e se houve dia sem publicação." : "Alta recente: identificar na aba Diário o que gerou e repetir.", confSite);
  }

  if (visitors) {
    if (nlStart >= 3 && nlDone / nlStart < 0.5) add("Alta", "Newsletter", "Funil de inscrição", nlDone === 0 ? `Nenhuma das ${nlStart} inscrições começadas foi concluída.` : `Só ${Math.round((nlDone / nlStart) * 100)}% concluem a inscrição (${nlDone} de ${nlStart}).`, "Revisar o formulário: menos campos, mensagem de confirmação clara, teste no celular.", confidence(nlStart));
    if (nlStart === 0 && totalViews >= 200) add("Média", "Newsletter", "Caixas de inscrição", "Ninguém começou a se inscrever (entre quem aceitou cookies).", "Posicionar a caixa mais cedo e oferecer um resumo periódico de conteúdo revisado.", confSite);
    if (vTotals?.coverage != null && vTotals.coverage < 30) add("Info", "Qualidade dos dados", "Consentimento de cookies", `Só ${vTotals.coverage}% das sessões têm dados individuais.`, "Tratar as abas Leitores e Ações como indicativas; a visão anônima (demais abas) cobre todos.", "Alta");
  }

  const order = { Alta: 0, Média: 1, Baixa: 2, Info: 3 };
  ops.sort((a, b) => order[a[0]] - order[b[0]]);
  const fillOf = { Alta: "high", Média: "mid", Baixa: "low", Info: "wrap" };
  const sheetOps = {
    name: "Oportunidades", tab: "FFEF4444", headerRow: 1, widths: [12, 24, 46, 62, 62, 12],
    rows: [
      ["Prioridade", "Tema", "Alvo", "Evidência (dados do período)", "Ação sugerida", "Confiança"].map(H),
      ...(ops.length
        ? ops.map(([pr, tema, alvo, evid, acao, conf]) => [{ v: pr, f: fillOf[pr] }, W(tema), W(alvo), W(evid), W(acao), W(conf)])
        : [["Info", "Sem dados suficientes", "—", "Ainda não há tráfego suficiente neste período para sugerir ações.", "Acompanhe por mais alguns dias.", "Baixa"]]),
    ],
  };

  // ═══ Leia-me ═══
  const R = RULES;
  const read = (t, f) => [{ v: t, f: f || "wrap" }];
  const sheetReadme = {
    name: "Leia-me", tab: "FF94A3B8", grid: false, widths: [120],
    rows: [
      read(`Como ler este relatório · ${siteName}`, "title"),
      read(`Período: ${periodo} (${series.length} dias). Gerado em ${generated} (horário de Brasília).`, "note"),
      [],
      read("De onde vêm os dados", "section"),
      read("• Anônimos (todas as abas, exceto \"Leitores\" e \"Ações\"): contagem de todos os visitantes, sem cookies e sem guardar IP. Robôs e visitas suas, logado no admin, não entram."),
      read(`• Com cookies (abas "Leitores (cookies)", "Ações e funis" e as colunas marcadas com *): só quem aceitou o banner de cookies${vTotals?.coverage != null ? `; neste período, ${vTotals.coverage}% das sessões` : ""}. Servem para entender comportamento, não para contar o total.${range > 90 ? " Estes dados cobrem no máximo 90 dias." : ""}`),
      read("• \"Sessão\" é uma visita completa; \"visualização\" é cada página aberta; \"entrada\" é a primeira página de uma visita."),
      read("• Tempo médio é tempo de leitura ativo (aba aberta e em uso), não tempo total de permanência."),
      [],
      read("Regras dos diagnósticos (abas Páginas, Artigos e Oportunidades)", "section"),
      read(`• Amostra pequena: menos de ${R.MIN_VIEWS} visualizações. Nenhum diagnóstico é feito; os números ainda são ruído.`),
      read(`• Muita visita, pouca leitura: views acima do quartil superior (os 25% mais vistos) e tempo médio abaixo de ${R.SHORT_READ_S}s. Candidato a revisar título e introdução.`),
      read(`• Leitura profunda, poucas visitas: tempo médio de ${R.DEEP_READ_S}s ou mais e views na metade inferior. Candidato a promoção interna.`),
      read(`• Porta de entrada forte: views acima do quartil superior e ${Math.round(R.ENTRY_STRONG * 100)}% ou mais delas são início de visita.`),
      read(`• Sem visitas no período: nenhuma visualização em artigo com mais de ${R.NEW_POST_DAYS} dias. Artigos mais novos aparecem como "Novo".`),
      read(`• Confiança da amostra: Alta com ${R.CONF_HIGH}+ views, Média com ${R.CONF_MID}+, Baixa abaixo disso. Com tráfego pequeno, decida por padrões repetidos, não por um número isolado.`),
      read("• Os limites usam as páginas do próprio site como referência (quartis e mediana), então mudam conforme o tráfego."),
      [],
      read("O que este relatório NÃO diz", "section"),
      read("• Não cruza canal com comportamento (não dá para saber, por exemplo, se quem veio da busca lê mais que quem veio do social): o sistema não guarda essa combinação."),
      read("• Não mostra posição no Google nem palavras-chave: isso está no Search Console."),
      read("• Variação contra o período anterior só existe para views e sessões, até 90 dias."),
      read("• Os diagnósticos são pistas para investigar, não veredictos. Sempre abra o artigo antes de mudar algo."),
    ],
  };

  return {
    sheets: [sheetSummary, sheetOps, sheetDaily, sheetPages, sheetArticles, sheetCats, sheetChannels, sheetRefs, sheetUtm, sheetDevices, sheetGeo, sheetTime, sheetReaders, sheetActions, sheetReadme],
    meta: { periodo, days: series.length, generated, opportunities: ops.length, articles: articleRows.length, zeroViewArticles: zero.length },
    // Diário em linhas simples (para o CSV)
    dailyRows: sheetDaily.rows.slice(0, 1 + series.length),
  };
}

export function reportFileName(kind, range, dateKey, ext) {
  return `descomplica-bula-${kind}-${range}d-${dateKey}.${ext}`;
}
