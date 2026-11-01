import { cookies } from "next/headers";
import crypto from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Segredo usado para assinar o cookie de sessão. Se ADMIN_SESSION_SECRET
// não estiver setado, cai para uma derivação da própria senha — funciona,
// mas o ideal é configurar ADMIN_SESSION_SECRET (ex: `openssl rand -hex 32`)
// como variável de ambiente separada, pra não misturar "segredo de sessão"
// com "senha de login".
function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || `${ADMIN_PASSWORD || ""}::fallback-secret`;
}

function sign(payload) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/**
 * Gera um token de sessão assinado: `<expiresAt>.<hmac>`
 * Não é a senha em base64 — é opaco e tem validade própria, então trocar a
 * senha ou o ADMIN_SESSION_SECRET invalida imediatamente tokens antigos.
 */
export function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = sign(String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export function isPasswordConfigured() {
  return Boolean(ADMIN_PASSWORD);
}

export function verifyPassword(password) {
  if (!ADMIN_PASSWORD) return false;
  // Comparação em tempo constante evita timing attacks na checagem de senha.
  const a = Buffer.from(String(password || ""));
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function checkAdminAuth() {
  if (!ADMIN_PASSWORD) return false; // sem senha configurada, nega tudo

  const cookieStore = cookies();
  const token = cookieStore.get("admin_auth")?.value;
  if (!token) return false;

  const [expiresAtStr, signature] = token.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !signature) return false;
  if (Date.now() > expiresAt) return false; // expirado

  const expected = sign(expiresAtStr);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
