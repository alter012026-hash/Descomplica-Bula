// -----------------------------------------------------------------------
// Rate limiting simples, em memória, por IP.
//
// IMPORTANTE — limitação conhecida em ambiente serverless (Vercel):
// cada função pode rodar em instâncias diferentes (cold starts, múltiplas
// regiões), então esse Map NÃO é compartilhado globalmente entre todas as
// requisições — é "best effort", eficaz contra bots simples e brute-force
// básico enquanto a instância estiver quente, mas não é uma garantia dura.
// Para proteção robusta em produção com tráfego real, migrar para um
// contador central (ex: Upstash Redis — tem free tier e integra fácil com
// Vercel) usando o mesmo formato de chave/janela abaixo.
// -----------------------------------------------------------------------

const buckets = new Map();

// Limpa entradas velhas periodicamente para não vazar memória.
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart > entry.windowMs) buckets.delete(key);
  }
}

/**
 * @param {string} key       Identificador único (ex: `login:${ip}`)
 * @param {object} opts
 * @param {number} opts.limit     Máximo de tentativas na janela
 * @param {number} opts.windowMs  Duração da janela em ms
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, { limit = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (buckets.size > 5000) cleanup();

  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now, windowMs };
  }

  entry.count += 1;
  buckets.set(key, entry);

  const allowed = entry.count <= limit;
  const retryAfterMs = Math.max(0, entry.windowMs - (now - entry.windowStart));

  return { allowed, remaining: Math.max(0, limit - entry.count), retryAfterMs };
}

/** Extrai o IP do cliente a partir dos headers padrão da Vercel. */
export function getClientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
