// -----------------------------------------------------------------------
// Metadados de uma visita, extraídos SEM guardar IP nem usar cookies:
//   • dispositivo / navegador / sistema  → do User-Agent
//   • país / estado / cidade             → dos cabeçalhos que a Vercel injeta
//   • canal de aquisição                 → do referrer + parâmetros utm_*
//   • hora do dia (fuso de Brasília)
// -----------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

export function parseUserAgent(ua = "") {
  const s = String(ua || "");

  let device = "Desktop";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(s)) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s)) device = "Mobile";

  let browser = "Outro";
  if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/Instagram/.test(s)) browser = "Instagram (app)";
  else if (/FBAN|FBAV/.test(s)) browser = "Facebook (app)";
  else if (/TikTok|musical_ly|Bytedance/i.test(s)) browser = "TikTok (app)";
  else if (/Firefox|FxiOS/.test(s)) browser = "Firefox";
  else if (/CriOS|Chrome\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";

  let os = "Outro";
  if (/Windows/.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";

  return { device, browser, os };
}

const SEARCH = new Set(["google", "bing", "duckduckgo", "yahoo", "ecosia", "brave", "yandex", "baidu"]);
const SOCIAL = /^(facebook\.com|instagram\.com|x\.com|linkedin\.com|lnkd\.in|youtube\.com|youtu\.be|tiktok\.com|pinterest\.[a-z.]+|reddit\.com|t\.me|telegram\.org|wa\.me|whatsapp\.com|threads\.net|kwai\.com)$/;

/** Classifica a origem em: Direto, Busca orgânica, Social, E-mail, Pago ou Referência. */
export function classifyChannel(source, utm = {}) {
  const medium = String(utm.medium || "").toLowerCase();
  const usource = String(utm.source || "").toLowerCase();
  if (/^(cpc|ppc|paid|ads?|display)/.test(medium)) return "Pago";
  if (/mail|newsletter/.test(medium) || /mail|newsletter/.test(usource)) return "E-mail";
  if (/^(social|sm)/.test(medium)) return "Social";
  const src = String(source || "Direto").toLowerCase();
  if (src === "direto") return usource ? "Referência" : "Direto";
  if (SEARCH.has(src)) return "Busca orgânica";
  if (SOCIAL.test(src)) return "Social";
  return "Referência";
}

/** País / estado / cidade a partir dos cabeçalhos da Vercel (vazios fora dela). */
export function parseGeo(headers) {
  const get = (name) => (headers && typeof headers.get === "function" ? headers.get(name) : "") || "";
  const country = /^[A-Za-z]{2}$/.test(get("x-vercel-ip-country")) ? get("x-vercel-ip-country").toUpperCase() : "??";
  const region = /^[A-Za-z0-9]{1,3}$/.test(get("x-vercel-ip-country-region")) ? get("x-vercel-ip-country-region").toUpperCase() : "";
  let city = get("x-vercel-ip-city");
  try { city = decodeURIComponent(city); } catch { /* mantém como veio */ }
  city = city.replace(/[|:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return { country, region, city };
}

/** Limpa os parâmetros utm_* enviados pelo navegador. */
export function cleanUtm(raw) {
  const clean = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9_.\- ]/g, "").trim().slice(0, 40);
  if (!raw || typeof raw !== "object") return { source: "", medium: "", campaign: "" };
  return { source: clean(raw.source), medium: clean(raw.medium), campaign: clean(raw.campaign) };
}

/** "00".."23" no fuso de Brasília. */
export function hourKey(date = new Date()) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(date);
  return String(h).padStart(2, "0").slice(-2);
}

/** Tipo de página, para o gráfico "o que as pessoas leem". */
export function pageType(path) {
  if (path === "/") return "Página inicial";
  if (path === "/blog") return "Lista do blog";
  if (path.startsWith("/blog/")) return "Artigos";
  if (path === "/fontes-oficiais") return "Fontes oficiais";
  if (path === "/aviso-de-saude") return "Aviso de saúde";
  if (path === "/sobre" || path === "/metodologia" || path === "/privacidade" || path === "/contato") return "Institucional";
  return "Institucional";
}
