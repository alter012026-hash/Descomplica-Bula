"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadTrafficReport } from "./exportReport";

/* ───────────────────────── constantes ───────────────────────── */

const RANGES = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 365, label: "12 meses" },
];
const GROUPS = { day: "Dia", week: "Semana", month: "Mês" };
const GROUPS_BY_RANGE = { 7: ["day"], 30: ["day", "week"], 90: ["day", "week", "month"], 365: ["week", "month"] };
const DEFAULT_GROUP = { 7: "day", 30: "day", 90: "week", 365: "month" };

export const nf = new Intl.NumberFormat("pt-BR");
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAYS_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

export const PALETTE = ["#2430E6", "#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#64748B", "#14B8A6"];
export const CHANNEL_COLORS = {
  "Busca orgânica": "#10B981", Direto: "#2430E6", Social: "#EC4899", Referência: "#F59E0B", "E-mail": "#0EA5E9", Pago: "#7C3AED",
};

const UF = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba",
  PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};
// Mapa em "tiles": cada estado ocupa uma casa, na posição aproximada do país.
const TILES = {
  RR: [3, 0], AP: [4, 0], AM: [2, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [1, 2], RO: [2, 2], MT: [3, 2], TO: [4, 2], PI: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], PE: [6, 3],
  SP: [3, 4], MG: [4, 4], ES: [5, 4], AL: [6, 4], PR: [3, 5], RJ: [4, 5], SE: [6, 5], SC: [3, 6], RS: [3, 7],
};

const ICONS = {
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  layers: <><path d="m12 2 10 5-10 5L2 7l10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  exit: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  mouse: <><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 7v4" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
};

/* ───────────────────────── utilitários ───────────────────────── */

const parseKey = (key) => { const [y, m, d] = key.split("-").map(Number); return { y, m, d }; };
export const shortDay = (key) => { const { m, d } = parseKey(key); return `${d} ${MONTHS[m - 1]}`; };
const dow = (key) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0

function weekStart(key) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - dow(key));
  return date.toISOString().slice(0, 10);
}

function groupSeries(series, group) {
  if (group === "day") return series.map((p) => ({ ...p, key: p.date, label: shortDay(p.date), full: shortDay(p.date) }));
  const buckets = new Map();
  for (const p of series) {
    const key = group === "week" ? weekStart(p.date) : p.date.slice(0, 7);
    const b = buckets.get(key) || { key, views: 0, visitors: 0, sessions: 0 };
    b.views += p.views; b.visitors += p.visitors; b.sessions += p.sessions;
    buckets.set(key, b);
  }
  return [...buckets.values()].map((b) => {
    if (group === "week") return { ...b, label: shortDay(b.key), full: `Semana de ${shortDay(b.key)}` };
    const { y, m } = parseKey(`${b.key}-01`);
    return { ...b, label: MONTHS[m - 1], full: `${MONTHS[m - 1]} de ${y}` };
  });
}

export function fmtDur(sec) {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}min ${s}s` : `${m}min`;
}
export const pctOf = (n, total) => (total ? Math.round((n / total) * 100) : 0);
export const flag = (code) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
export function countryName(code) {
  if (code === "??") return "Desconhecido";
  try { return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(code) || code; } catch { return code; }
}

function niceMax(v) {
  const step = Math.max(1, v / 4);
  const p = 10 ** Math.floor(Math.log10(step));
  const n = step / p;
  const nice = [1, 2, 2.5, 5, 10].find((x) => x >= n) || 10;
  return nice * p * 4;
}

// Curva suave sem "overshoot": tangentes horizontais em cada ponto.
function smoothPath(pts) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* ───────────────────────── estilos ───────────────────────── */

export const CSS = `
.tp{--c-primary:#2430E6;--c-violet:#7C3AED;--c-text:#12163A;--c-muted:#454B73;--c-faint:#6A6F99;--c-line:#E3E7FA;--c-soft:#F3F5FF;--c-card:#fff;--c-green:#0B7A47;--c-red:#C93525;
  display:flex;flex-direction:column;gap:18px;color:var(--c-text)}
.tp *{box-sizing:border-box}
.tp-hero{position:relative;overflow:hidden;border-radius:20px;padding:22px 24px;color:#fff;
  background:radial-gradient(1200px 300px at 90% -20%,rgba(255,255,255,.22),transparent 60%),linear-gradient(120deg,#1B24C4 0%,#2430E6 40%,#7C3AED 100%);
  box-shadow:0 10px 30px -12px rgba(36,48,230,.55)}
.tp-hero h2{margin:0;font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-.02em}
.tp-hero p{margin:4px 0 0;font-size:13.5px;opacity:.85}
.tp-hero-row{display:flex;gap:14px;flex-wrap:wrap;justify-content:space-between;align-items:center}
.tp-live{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);backdrop-filter:blur(6px);
  border-radius:999px;padding:7px 14px;font-size:13px;font-weight:700}
.tp-dot{width:9px;height:9px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 0 rgba(74,222,128,.7);animation:tp-pulse 1.8s infinite}
@keyframes tp-pulse{70%{box-shadow:0 0 0 9px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
.tp-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:16px}
.tp-seg{display:inline-flex;background:rgba(255,255,255,.16);border-radius:12px;padding:3px;gap:2px}
.tp-seg.light{background:var(--c-soft)}
.tp-seg button{border:0;cursor:pointer;border-radius:9px;padding:6px 13px;font-size:13px;font-weight:600;background:transparent;color:rgba(255,255,255,.85);transition:.15s}
.tp-seg.light button{color:var(--c-muted)}
.tp-seg button[aria-pressed=true]{background:#fff;color:var(--c-primary);font-weight:800;box-shadow:0 2px 6px rgba(18,22,58,.18)}
.tp-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:11px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
.tp-btn:hover{background:rgba(255,255,255,.26)}
.tp-btn:disabled{opacity:.6;cursor:default}
.tp-kpis{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.tp-card{background:var(--c-card);border:1px solid var(--c-line);border-radius:18px;padding:18px 20px;box-shadow:0 1px 2px rgba(18,22,58,.04);min-width:0;animation:tp-in .4s ease both}
@keyframes tp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.tp-kpi{position:relative;overflow:hidden;transition:transform .15s,box-shadow .15s}
.tp-kpi:hover{transform:translateY(-2px);box-shadow:0 10px 24px -14px rgba(36,48,230,.45)}
.tp-kpi-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.tp-kpi-label{font-size:13px;color:var(--c-muted);font-weight:600}
.tp-ico{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff}
.tp-ico svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tp-kpi-val{font-family:var(--font-display);font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1}
.tp-kpi-sub{margin-top:7px;font-size:12px;color:var(--c-faint);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tp-delta{font-weight:800;padding:1px 7px;border-radius:99px;font-size:11.5px}
.tp-up{color:var(--c-green);background:rgba(11,122,71,.1)}.tp-down{color:var(--c-red);background:rgba(201,53,37,.1)}.tp-flat{color:var(--c-faint);background:var(--c-soft)}
.tp-spark{position:absolute;right:0;bottom:0;width:46%;height:46px;opacity:.9;pointer-events:none}
.tp-h{margin:0;font-family:var(--font-display);font-size:16.5px;font-weight:800;letter-spacing:-.01em}
.tp-sub{margin:3px 0 0;font-size:12.5px;color:var(--c-faint)}
.tp-head{display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.tp-grid2{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.tp-grid3{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.tp-insights{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.tp-insight{display:flex;gap:12px;align-items:flex-start;border-radius:16px;padding:14px 16px;background:linear-gradient(135deg,#F3F5FF,#fff);border:1px solid var(--c-line)}
.tp-insight b{display:block;font-size:13.5px}.tp-insight span{font-size:12.5px;color:var(--c-muted)}
.tp-emoji{font-size:22px;line-height:1}
.tp-legend{display:flex;flex-direction:column;gap:9px;min-width:0;flex:1}
.tp-leg{display:flex;align-items:center;gap:9px;font-size:13px;min-width:0}
.tp-sw{width:10px;height:10px;border-radius:4px;flex:none}
.tp-leg .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.tp-leg .v{color:var(--c-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.tp-rank{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px}
.tp-rank-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.tp-rank-name{font-size:13.5px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-rank-val{font-size:12.5px;color:var(--c-muted);flex:none;font-variant-numeric:tabular-nums}
.tp-rank-sub{font-size:12px;color:var(--c-faint);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-bar{height:6px;background:var(--c-soft);border-radius:99px;margin-top:6px;overflow:hidden}
.tp-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#2430E6,#7C3AED)}
.tp-chip{display:inline-block;font-size:11px;font-weight:700;color:var(--c-primary);background:rgba(36,48,230,.09);border-radius:99px;padding:1px 8px;margin-left:6px}
.tp-empty{padding:26px 8px;text-align:center;color:var(--c-faint);font-size:14px}
.tp-map{display:grid;gap:5px;max-width:330px;margin:0 auto}
.tp-tile{aspect-ratio:1;border-radius:9px;display:grid;place-items:center;font-size:11.5px;font-weight:800;cursor:default;transition:transform .12s}
.tp-tile:hover{transform:scale(1.12);z-index:2}
.tp-tooltip{position:absolute;pointer-events:none;background:#12163A;color:#fff;border-radius:12px;padding:9px 12px;font-size:12.5px;line-height:1.5;box-shadow:0 10px 24px -8px rgba(18,22,58,.5);white-space:nowrap;z-index:5}
.tp-tooltip b{display:block;margin-bottom:2px}
.tp-err{border-color:var(--c-red);color:var(--c-red);font-size:14px}
.tp-table{width:100%;border-collapse:collapse;font-size:13px}
.tp-table th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--c-faint);font-weight:700;padding:0 8px 8px 0}
.tp-table th.r,.tp-table td.r{text-align:right}
.tp-table td{padding:9px 8px 9px 0;border-top:1px solid var(--c-line);vertical-align:top;font-variant-numeric:tabular-nums}
.tp-table .t{font-weight:700;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.tp-table .p{font-size:11.5px;color:var(--c-faint);display:block;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-scroll{overflow-x:auto}
.tp-note{margin:14px 0 0;font-size:12px;color:var(--c-faint);line-height:1.55}
@media(max-width:600px){.tp-hero{padding:18px}.tp-kpi-val{font-size:26px}}
@media(prefers-reduced-motion:reduce){.tp *{animation:none!important;transition:none!important}}
`;

/* ───────────────────────── blocos visuais ───────────────────────── */

export function Segmented({ options, value, onChange, label, light }) {
  return (
    <div role="group" aria-label={label} className={`tp-seg${light ? " light" : ""}`}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Spark({ values, color }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 36 - (v / max) * 30]);
  const line = smoothPath(pts);
  const id = `sp${color.replace("#", "")}`;
  return (
    <svg className="tp-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L100,40 L0,40 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Kpi({ label, value, sub, delta, icon, color, spark }) {
  return (
    <div className="tp-card tp-kpi">
      <div className="tp-kpi-top">
        <span className="tp-kpi-label">{label}</span>
        <span className="tp-ico" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[icon]}</svg>
        </span>
      </div>
      <div className="tp-kpi-val">{value}</div>
      <div className="tp-kpi-sub">
        {delta && <span className={`tp-delta ${delta.up ? "tp-up" : delta.down ? "tp-down" : "tp-flat"}`}>{delta.text}</span>}
        {sub && <span>{sub}</span>}
      </div>
      <Spark values={spark} color={color} />
    </div>
  );
}

export function deltaOf(now, before) {
  if (before === null || before === undefined) return null;
  if (before === 0) return now > 0 ? { text: "novo", up: true } : null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? "▲ +" : pct < 0 ? "▼ " : ""}${pct}%`, up: pct > 0, down: pct < 0 };
}

function AreaChart({ points }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 270, padL = 40, padR = 14, padT = 14, padB = 28;
  const w = Math.max(width, 280);
  const innerW = w - padL - padR, innerH = H - padT - padB;
  const maxV = niceMax(Math.max(...points.map((p) => p.views), 1));
  const x = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / maxV) * innerH;
  const viewsPts = points.map((p, i) => [x(i), y(p.views)]);
  const visPts = points.map((p, i) => [x(i), y(p.visitors)]);
  const vLine = smoothPath(viewsPts);
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - padL;
    const i = Math.round((px / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }
  const hp = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) - 70, 4), w - 150) : 0;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {width > 0 && (
        <svg width={w} height={H} role="img" aria-label={`Gráfico de área: ${nf.format(points.reduce((s, p) => s + p.views, 0))} visualizações no período.`}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y", display: "block" }}>
          <defs>
            <linearGradient id="tpArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2430E6" stopOpacity=".32" /><stop offset="1" stopColor="#2430E6" stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((t) => {
            const v = (maxV / 4) * t;
            return (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#E3E7FA" strokeDasharray={t ? "3 5" : "0"} />
                <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6A6F99">{nf.format(Math.round(v))}</text>
              </g>
            );
          })}
          <path d={`${vLine} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#tpArea)" />
          <path d={smoothPath(visPts)} fill="none" stroke="#7C3AED" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
          <path d={vLine} fill="none" stroke="#2430E6" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => i % every === 0 && (
            <text key={p.key} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6A6F99">{p.label}</text>
          ))}
          {hp && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="#2430E6" strokeOpacity=".35" />
              <circle cx={x(hover)} cy={y(hp.visitors)} r="4.5" fill="#fff" stroke="#7C3AED" strokeWidth="2.5" />
              <circle cx={x(hover)} cy={y(hp.views)} r="5.5" fill="#fff" stroke="#2430E6" strokeWidth="3" />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <div className="tp-tooltip" style={{ left: tipLeft, top: 6 }}>
          <b>{hp.full}</b>
          <span style={{ color: "#A9B1FF" }}>●</span> {nf.format(hp.views)} visualizações<br />
          <span style={{ color: "#C4A8FF" }}>●</span> {nf.format(hp.visitors)} visitantes
        </div>
      )}
    </div>
  );
}

export function Donut({ items, colorOf, centerValue, centerLabel }) {
  const total = items.reduce((s, i) => s + i.views, 0);
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`${centerLabel}: ${items.map((i) => `${i.label} ${pctOf(i.views, total)}%`).join(", ")}`}>
        <circle cx="75" cy="75" r={R} fill="none" stroke="#F3F5FF" strokeWidth="18" />
        {total > 0 && items.map((it, idx) => {
          const len = (it.views / total) * C;
          const el = (
            <circle key={it.label} cx="75" cy="75" r={R} fill="none" stroke={colorOf(it.label, idx)} strokeWidth="18"
              strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 75 75)" strokeLinecap="butt" />
          );
          acc += len;
          return el;
        })}
        <text x="75" y="73" textAnchor="middle" fontSize="22" fontWeight="800" fill="#12163A" fontFamily="var(--font-display)">{centerValue}</text>
        <text x="75" y="91" textAnchor="middle" fontSize="11" fill="#6A6F99">{centerLabel}</text>
      </svg>
      <div className="tp-legend">
        {items.map((it, idx) => (
          <div className="tp-leg" key={it.label}>
            <span className="tp-sw" style={{ background: colorOf(it.label, idx) }} />
            <span className="n">{it.label}</span>
            <span className="v">{pctOf(it.views, total)}% · {nf.format(it.views)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarsH({ items, labelOf, subOf, total }) {
  const max = Math.max(...items.map((i) => i.views), 1);
  if (!items.length) return <div className="tp-empty">Ainda sem dados neste período.</div>;
  return (
    <ol className="tp-rank">
      {items.map((it, idx) => (
        <li key={`${labelOf(it)}-${idx}`}>
          <div className="tp-rank-top">
            <span className="tp-rank-name" title={labelOf(it)}>{labelOf(it)}</span>
            <span className="tp-rank-val">{nf.format(it.views)} <span style={{ color: "#6A6F99" }}>· {pctOf(it.views, total)}%</span></span>
          </div>
          {subOf && subOf(it) && <div className="tp-rank-sub">{subOf(it)}</div>}
          <div className="tp-bar"><i style={{ width: `${(it.views / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

export function ColumnChart({ values, labels, labelEvery = 1, highlight, unit = "visualizações", height = 150 }) {
  const max = Math.max(...values, 1);
  const [hov, setHov] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, position: "relative" }} onMouseLeave={() => setHov(null)}>
        {values.map((v, i) => (
          <div key={i} onMouseEnter={() => setHov(i)} onClick={() => setHov(i)} title={`${labels[i]}: ${nf.format(v)} ${unit}`}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "pointer" }}>
            <div style={{
              width: "100%", height: `${v === 0 ? 2 : Math.max(5, (v / max) * 100)}%`, borderRadius: "6px 6px 2px 2px",
              background: v === 0 ? "#E3E7FA" : i === highlight ? "linear-gradient(180deg,#FFD43B,#F59E0B)" : hov === i ? "#7C3AED" : "linear-gradient(180deg,#4B55F0,#2430E6)",
              transition: "background .12s",
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, paddingTop: 6 }} aria-hidden="true">
        {labels.map((l, i) => (
          <div key={i} style={{ flex: 1, fontSize: 10.5, color: "#6A6F99", textAlign: "center", whiteSpace: "nowrap" }}>{i % labelEvery === 0 ? l : ""}</div>
        ))}
      </div>
      <p className="tp-sub" aria-live="polite" style={{ minHeight: 18, marginTop: 8 }}>
        {hov !== null ? `${labels[hov]}: ${nf.format(values[hov])} ${unit}` : "Passe o mouse (ou toque) para ver os números."}
      </p>
    </div>
  );
}

function BrazilTiles({ regions }) {
  const byCode = Object.fromEntries(regions.map((r) => [r.code, r.views]));
  const max = Math.max(...regions.map((r) => r.views), 1);
  return (
    <div className="tp-map" style={{ gridTemplateColumns: "repeat(6, 1fr)" }} role="img" aria-label="Mapa de acessos por estado do Brasil">
      {Array.from({ length: 8 * 6 }, (_, idx) => {
        const row = Math.floor(idx / 6), col = (idx % 6) + 1;
        const code = Object.keys(TILES).find((k) => TILES[k][0] === col && TILES[k][1] === row);
        if (!code) return <div key={idx} />;
        const v = byCode[code] || 0;
        const a = v ? 0.18 + 0.82 * (v / max) : 0;
        return (
          <div key={idx} className="tp-tile" title={`${UF[code]}: ${nf.format(v)} visualizações`}
            style={{ background: v ? `rgba(36,48,230,${a})` : "#F3F5FF", color: a > 0.5 ? "#fff" : v ? "#2430E6" : "#9AA0C8" }}>
            {code}
          </div>
        );
      })}
    </div>
  );
}

export function Card({ title, sub, children, right, delay = 0 }) {
  return (
    <section className="tp-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="tp-head">
        <div><h3 className="tp-h">{title}</h3>{sub && <p className="tp-sub">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function SetupNotice() {
  const code = { background: "#F3F5FF", borderRadius: 6, padding: "1px 6px", fontSize: 13 };
  return (
    <div className="tp-card">
      <h2 style={{ margin: "0 0 8px", fontSize: 17, fontFamily: "var(--font-display)" }}>Falta um passo para ativar o painel</h2>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: "#454B73", lineHeight: 1.55 }}>
        O painel precisa de um lugar para guardar as visitas (o site na Vercel não tem banco de dados). Use o Upstash Redis, que tem plano gratuito:
      </p>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
        <li>Na Vercel: projeto → <b>Storage</b> → <b>Create Database</b> → <b>Upstash (Redis)</b> → plano Free.</li>
        <li>Conecte ao projeto, ou crie as variáveis <code style={code}>KV_REST_API_URL</code> e <code style={code}>KV_REST_API_TOKEN</code> em Settings → Environment Variables.</li>
        <li>Faça um novo deploy. As visitas passam a ser contadas a partir daí.</li>
      </ol>
    </div>
  );
}

/* ───────────────────────── painel ───────────────────────── */

export default function AnalyticsPanel() {
  const [range, setRange] = useState(30);
  const [group, setGroup] = useState(DEFAULT_GROUP[30]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [exporting, setExporting] = useState("");

  const load = useCallback(async (value) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/analytics?range=${value}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Falha ao carregar as estatísticas.");
      if (json.error) throw new Error(json.error);
      setData(json);
      setLive(json.live || 0);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  // "Online agora": consulta leve (1 comando) a cada 30 s com a aba aberta.
  useEffect(() => {
    if (!data || data.configured === false) return undefined;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/admin/analytics?live=1", { cache: "no-store" });
        const j = await r.json();
        if (typeof j.live === "number") setLive(j.live);
      } catch { /* mantém o último valor */ }
    }, 30000);
    return () => clearInterval(id);
  }, [data]);

  const points = useMemo(() => (data?.series ? groupSeries(data.series, group) : []), [data, group]);
  const totals = data?.totals;

  const weekday = useMemo(() => {
    const sums = Array(7).fill(0);
    (data?.series || []).forEach((p) => { sums[dow(p.date)] += p.views; });
    return sums;
  }, [data]);

  const insights = useMemo(() => {
    if (!data || !totals || totals.views === 0) return [];
    const out = [];
    const peakHour = data.hours.indexOf(Math.max(...data.hours));
    if (Math.max(...data.hours) > 0) out.push({ icon: "⏰", title: `Pico às ${String(peakHour).padStart(2, "0")}h`, text: `${pctOf(data.hours[peakHour], totals.views)}% dos acessos acontecem nessa hora. Publique um pouco antes.` });
    const bestDow = weekday.indexOf(Math.max(...weekday));
    if (data.range >= 30 && Math.max(...weekday) > 0) out.push({ icon: "📅", title: `Melhor dia: ${WEEKDAYS_LONG[bestDow]}`, text: `${pctOf(weekday[bestDow], totals.views)}% das visualizações do período.` });
    const bestDay = [...data.series].sort((a, b) => b.views - a.views)[0];
    if (bestDay?.views > 0) out.push({ icon: "🏆", title: `Recorde: ${shortDay(bestDay.date)}`, text: `${nf.format(bestDay.views)} visualizações em um único dia.` });
    const ch = data.channels[0];
    if (ch) out.push({ icon: "🧭", title: `${ch.label} lidera`, text: `${pctOf(ch.views, totals.views)}% dos acessos chegam por esse canal.` });
    const dev = data.devices[0];
    if (dev) out.push({ icon: dev.label === "Desktop" ? "💻" : "📱", title: `${pctOf(dev.views, totals.views)}% em ${dev.label.toLowerCase()}`, text: dev.label === "Mobile" ? "Priorize a leitura no celular: fontes, anúncios e velocidade." : "Confira também como o site se comporta no celular." });
    return out.slice(0, 5);
  }, [data, totals, weekday]);

  async function exportReport(format) {
    setExporting(format);
    setError("");
    try { await downloadTrafficReport({ range, format }); } catch (e) { setError(e.message); } finally { setExporting(""); }
  }

  if (data && data.configured === false) return <><style>{CSS}</style><div className="tp"><SetupNotice /></div></>;

  const empty = totals && totals.views === 0;
  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase();
  const viewsSpark = data?.series?.slice(-30).map((p) => p.views);
  const visSpark = data?.series?.slice(-30).map((p) => p.visitors);
  const sesSpark = data?.series?.slice(-30).map((p) => p.sessions);
  const channelColor = (label, i) => CHANNEL_COLORS[label] || PALETTE[i % PALETTE.length];
  const paletteColor = (_l, i) => PALETTE[i % PALETTE.length];
  const deviceIcon = { Mobile: "📱 Celular", Desktop: "💻 Computador", Tablet: "📟 Tablet" };

  return (
    <div className="tp">
      <style>{CSS}</style>

      <div className="tp-hero">
        <div className="tp-hero-row">
          <div>
            <h2>Painel de tráfego</h2>
            <p>{updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · horário de Brasília` : "Carregando…"}</p>
          </div>
          <div className="tp-live" aria-live="polite"><span className="tp-dot" />{nf.format(live)} {live === 1 ? "pessoa online agora" : "pessoas online agora"}</div>
        </div>
        <div className="tp-controls">
          <Segmented label="Período" options={RANGES} value={range} onChange={(v) => { setRange(v); setGroup(DEFAULT_GROUP[v]); }} />
          <button type="button" className="tp-btn" onClick={() => load(range)} disabled={loading}>{loading ? "Atualizando…" : "↻ Atualizar"}</button>
          {data?.series && (
            <>
              <button type="button" className="tp-btn" onClick={() => exportReport("xlsx")} disabled={!!exporting} title="Excel com 15 abas: resumo, oportunidades, páginas, artigos, canais, horários e mais">{exporting === "xlsx" ? "Gerando…" : "⬇ Relatório completo (Excel)"}</button>
              <button type="button" className="tp-btn" onClick={() => exportReport("csv")} disabled={!!exporting} title="Só a série diária, em CSV">{exporting === "csv" ? "Gerando…" : "⬇ CSV diário"}</button>
            </>
          )}
        </div>
      </div>

      {error && <div role="alert" className="tp-card tp-err">{error}</div>}

      <div className="tp-kpis" style={{ opacity: loading && !data ? 0.5 : 1 }}>
        <Kpi label="Visualizações" icon="eye" color="#2430E6" value={totals ? nf.format(totals.views) : "—"} sub={`em ${rangeLabel}`} delta={totals ? deltaOf(totals.views, totals.previousViews) : null} spark={viewsSpark} />
        <Kpi label="Visitantes" icon="users" color="#7C3AED" value={totals ? nf.format(totals.visitors) : "—"} sub="únicos por dia, somados" spark={visSpark} />
        <Kpi label="Sessões" icon="zap" color="#0EA5E9" value={totals ? nf.format(totals.sessions) : "—"} sub="visitas completas" delta={totals ? deltaOf(totals.sessions, totals.previousSessions) : null} spark={sesSpark} />
        <Kpi label="Páginas por sessão" icon="layers" color="#10B981" value={totals?.pagesPerSession ?? "—"} sub="quanto mais, melhor" />
        <Kpi label="Tempo por sessão" icon="clock" color="#F59E0B" value={totals ? fmtDur(totals.avgSeconds) : "—"} sub="tempo de leitura ativo" />
        <Kpi label="Taxa de rejeição" icon="exit" color="#EC4899" value={totals?.bounceRate != null ? `${totals.bounceRate}%` : "—"} sub="saíram após 1 página" />
        <Kpi label="Rolagem média" icon="mouse" color="#14B8A6" value={totals?.avgScroll != null ? `${totals.avgScroll}%` : "—"} sub="do conteúdo percorrido" />
        <Kpi label="Hoje" icon="calendar" color="#64748B" value={totals ? nf.format(totals.today.views) : "—"} sub={totals ? `ontem: ${nf.format(totals.yesterday.views)}` : ""} />
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

      <Card
        title="Tráfego ao longo do tempo"
        sub="Linha cheia: visualizações · tracejada: visitantes"
        right={GROUPS_BY_RANGE[range].length > 1 && (
          <Segmented light label="Agrupar por" options={GROUPS_BY_RANGE[range].map((g) => ({ value: g, label: GROUPS[g] }))} value={group} onChange={setGroup} />
        )}
      >
        {points.length > 0 ? <AreaChart points={points} /> : <div className="tp-empty">{loading ? "Carregando…" : "Sem dados."}</div>}
        {empty && !loading && (
          <p className="tp-note">
            Nenhuma visita registrada neste período ainda. As visitas aparecem a partir do momento em que o rastreio foi ativado;
            suas próprias visitas (logado no admin) e as de robôs não são contadas.
          </p>
        )}
      </Card>

      {!empty && data && (
        <>
          <div className="tp-grid2">
            <Card title="Canais de aquisição" sub="Como as pessoas chegam ao site" delay={40}>
              <Donut items={data.channels} colorOf={channelColor} centerValue={nf.format(totals.views)} centerLabel="visualizações" />
            </Card>
            <Card title="Aparelhos" sub="Celular, computador ou tablet" delay={80}>
              <Donut
                items={data.devices.map((d) => ({ ...d, label: deviceIcon[d.label] || d.label }))}
                colorOf={paletteColor} centerValue={`${pctOf(data.devices[0]?.views || 0, totals.views)}%`}
                centerLabel={(deviceIcon[data.devices[0]?.label] || "").split(" ").slice(1).join(" ").toLowerCase() || "—"}
              />
            </Card>
          </div>

          <div className="tp-grid2">
            <Card title="Horário de maior acesso" sub="Visualizações por hora do dia (Brasília)" delay={40}>
              <ColumnChart
                values={data.hours}
                labels={data.hours.map((_, h) => `${String(h).padStart(2, "0")}h`)}
                labelEvery={3}
                highlight={data.hours.indexOf(Math.max(...data.hours))}
              />
            </Card>
            <Card title="Dias da semana" sub="Soma das visualizações no período" delay={80}>
              <ColumnChart values={weekday} labels={WEEKDAYS} highlight={weekday.indexOf(Math.max(...weekday))} />
            </Card>
          </div>

          <div className="tp-grid2">
            <Card title="Acessos por estado" sub="Brasil · quanto mais escuro, mais visitas" delay={40}>
              {data.regions.length ? <BrazilTiles regions={data.regions} /> : (
                <div className="tp-empty">Os estados aparecem quando o site está hospedado na Vercel e há visitas do Brasil.</div>
              )}
            </Card>
            <Card title="Países e cidades" sub="De onde vêm os leitores" delay={80}>
              <BarsH items={data.countries} total={totals.views} labelOf={(c) => `${flag(c.code)}  ${countryName(c.code)}`} />
              {data.cities.length > 0 && (
                <>
                  <h4 style={{ margin: "20px 0 12px", fontSize: 13, color: "#454B73" }}>Principais cidades</h4>
                  <BarsH items={data.cities.slice(0, 6)} total={totals.views}
                    labelOf={(c) => `${c.city}${c.region ? `, ${c.region}` : ""}`} />
                </>
              )}
            </Card>
          </div>

          <Card title="Páginas mais acessadas" sub="Com tempo médio de leitura e quantas vezes foram a porta de entrada" delay={40}>
            <div className="tp-scroll">
              <table className="tp-table">
                <thead><tr><th>Página</th><th className="r">Views</th><th className="r">Entradas</th><th className="r">Tempo médio</th></tr></thead>
                <tbody>
                  {data.pages.map((p) => (
                    <tr key={p.path}>
                      <td><span className="t" title={p.title}>{p.title}</span><span className="p">{p.path}</span></td>
                      <td className="r">{nf.format(p.views)}<span style={{ color: "#6A6F99" }}> · {pctOf(p.views, totals.views)}%</span></td>
                      <td className="r">{nf.format(p.entries)}</td>
                      <td className="r">{fmtDur(p.avgSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="tp-grid3">
            <Card title="O que as pessoas leem" sub="Tipo de página" delay={40}>
              <Donut items={data.types} colorOf={paletteColor} centerValue={nf.format(data.types.length)} centerLabel="tipos" />
            </Card>
            <Card title="Sites de origem" sub="Domínios que enviam visitas" delay={80}>
              <BarsH items={data.referrers.map((r) => ({ ...r, views: r.views }))} total={totals.views} labelOf={(r) => r.source} />
              <p className="tp-note">“Direto” inclui quem digitou o endereço, abriu por favoritos ou veio de apps que não informam a origem.</p>
            </Card>
            <Card title="Páginas de entrada" sub="Onde a visita começa" delay={120}>
              <BarsH items={data.landing} total={totals.sessions || 1} labelOf={(p) => p.title} subOf={(p) => p.path} />
            </Card>
          </div>

          <div className="tp-grid3">
            <Card title="Navegadores" delay={40}><BarsH items={data.browsers} total={totals.views} labelOf={(b) => b.label} /></Card>
            <Card title="Sistemas" delay={80}><BarsH items={data.systems} total={totals.views} labelOf={(b) => b.label} /></Card>
            <Card title="Campanhas (UTM)" sub="Links com utm_source / utm_medium" delay={120}>
              {data.campaigns.length ? (
                <BarsH items={data.campaigns} total={totals.sessions || 1}
                  labelOf={(c) => `${c.source}${c.medium !== "-" ? ` / ${c.medium}` : ""}`} subOf={(c) => (c.campaign !== "-" ? `campanha: ${c.campaign}` : "")} />
              ) : (
                <div className="tp-empty">Nenhuma campanha ainda. Use links como <code>?utm_source=newsletter&amp;utm_medium=email</code> nos e-mails e posts.</div>
              )}
            </Card>
          </div>

          <p className="tp-note" style={{ textAlign: "center" }}>
            Privacidade: sem cookies e sem guardar IP. O visitante é um código diário irreversível; país, estado e cidade vêm dos cabeçalhos da Vercel.
            Robôs e suas visitas logado no admin não entram na conta.
          </p>
        </>
      )}
    </div>
  );
}
