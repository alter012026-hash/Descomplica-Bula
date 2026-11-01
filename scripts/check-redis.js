// Verifica a conexão com o Upstash Redis usando as variáveis do .env.local.
// Uso: npm run check:redis
require("dotenv").config({ path: ".env.local" });

const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function main() {
  if (!url || !token) {
    console.error("✗ KV_REST_API_URL / KV_REST_API_TOKEN não encontradas no .env.local");
    process.exit(1);
  }
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["PING"], ["SET", "check:redis", String(Date.now()), "EX", "60"], ["GET", "check:redis"]]),
  });
  if (!res.ok) {
    console.error(`✗ Upstash respondeu ${res.status} — confira URL e token.`);
    process.exit(1);
  }
  const [ping, , value] = (await res.json()).map((r) => r.result);
  console.log(`✓ Conectado ao Upstash (PING: ${ping}, leitura/escrita OK: ${value ? "sim" : "não"})`);
}

main().catch((e) => {
  console.error("✗ Falha na conexão:", e.message);
  process.exit(1);
});
