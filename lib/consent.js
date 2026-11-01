// -----------------------------------------------------------------------
// Consentimento de cookies — constantes e utilitários puros.
// Sem dependências de Node: roda no navegador e no servidor.
//
// Cookies do site:
//   db_consent  escolha do visitante ("<versão>.a" aceito | "<versão>.r" recusado)
//               Gravado pelo servidor (Set-Cookie) para não ser cortado em 7 dias
//               pelo Safari. Legível por JS para o banner saber o que mostrar.
//   db_vid      código aleatório do visitante (HttpOnly). SÓ existe se aceitou.
//   db_sid      código aleatório da visita (HttpOnly, 30 min de inatividade).
//               SÓ existe se aceitou.
//
// Para pedir o consentimento de novo (ex.: a política mudou de forma
// relevante), aumente CONSENT_VERSION: quem tem versão antiga volta a ver o banner.
// -----------------------------------------------------------------------

export const CONSENT_COOKIE = "db_consent";
export const VISITOR_COOKIE = "db_vid";
export const SESSION_COOKIE = "db_sid";
export const CONSENT_VERSION = 1;

export const CONSENT_MAX_AGE = 180 * 24 * 3600; // 6 meses
export const VISITOR_MAX_AGE = 365 * 24 * 3600; // 12 meses
export const SESSION_MAX_AGE = 30 * 60; // 30 min de inatividade

/** "a=1; b=2" → { a: "1", b: "2" } */
export function parseCookieHeader(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[name] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/** Valor gravado no cookie de consentimento. */
export function consentValue(choice) {
  return `${CONSENT_VERSION}.${choice === "accepted" ? "a" : "r"}`;
}

/** "1.a" → "accepted" · "1.r" → "rejected" · versão antiga/ausente → null. */
export function parseConsent(value) {
  const m = /^(\d+)\.(a|r)$/.exec(String(value || ""));
  if (!m || Number(m[1]) !== CONSENT_VERSION) return null;
  return m[2] === "a" ? "accepted" : "rejected";
}

/** Lê a escolha atual direto do navegador (só no client). */
export function readConsentFromDocument() {
  if (typeof document === "undefined") return null;
  return parseConsent(parseCookieHeader(document.cookie)[CONSENT_COOKIE]);
}
