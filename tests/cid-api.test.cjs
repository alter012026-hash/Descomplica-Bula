const test = require("node:test");
const assert = require("node:assert/strict");

async function loadApi() {
  return import("../lib/cid-api.js");
}

test("validates and normalizes CID-10 and CID-11 codes", async () => {
  const { validateCidCode } = await loadApi();
  assert.equal(validateCidCode("10", " a15.0 "), "A15.0");
  assert.equal(validateCidCode("11", "1a00"), "1A00");
  assert.throws(() => validateCidCode("10", "1A00"), { code: "INVALID_CODE", status: 400 });
  assert.throws(() => validateCidCode("11", "A15.0"), { code: "INVALID_CODE", status: 400 });
  assert.throws(() => validateCidCode("9", "A00"), { code: "INVALID_VERSION", status: 400 });
});

test("looks up a CID code with the server-side API key and normalizes details", async () => {
  const { lookupCid } = await loadApi();
  let requestUrl;
  let requestOptions;
  const result = await lookupCid("10", "a00", {
    apiKey: "server-only-key",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(JSON.stringify({
        codigo: "A00",
        descricao: " Cólera ",
        capitulo: "I",
        capituloDesc: "Doenças infecciosas",
        grupo: "A00-A09",
        grupoDesc: "Doenças intestinais",
        categoria: "A00",
        categoriaDesc: "Cólera",
        tipo: "categoria",
        referenciaDados: "2026-07-11T00:03:28.792Z",
        privateField: "not returned",
      }), {
        status: 200,
        headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "49" },
      });
    },
  });

  assert.equal(requestUrl.origin, "https://southamerica-east1-no-api-br.cloudfunctions.net");
  assert.equal(requestUrl.pathname, "/apiCid/v1/cid10/A00");
  assert.equal(requestOptions.headers["X-API-Key"], "server-only-key");
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(result.detalhe.codigo, "A00");
  assert.equal(result.detalhe.descricao, "Cólera");
  assert.equal(result.detalhe.privateField, undefined);
  assert.equal(result.rateLimitLimit, 50);
  assert.equal(result.rateLimitRemaining, 49);
});

test("rejects a missing key without making an upstream request", async () => {
  const { lookupCid } = await loadApi();
  let called = false;
  await assert.rejects(
    lookupCid("10", "A00", {
      apiKey: "",
      fetchImpl: async () => { called = true; },
    }),
    { code: "NOT_CONFIGURED", status: 503 }
  );
  assert.equal(called, false);
});

test("maps not found, plan, authentication, and quota errors", async () => {
  const { lookupCid } = await loadApi();
  for (const [status, code, expectedStatus] of [
    [401, "UPSTREAM_AUTH", 503],
    [403, "UPSTREAM_TIER", 503],
    [404, "NOT_FOUND", 404],
    [429, "UPSTREAM_LIMIT", 429],
  ]) {
    await assert.rejects(
      lookupCid("10", "A00", {
        apiKey: "server-only-key",
        fetchImpl: async () => new Response("{}", { status }),
      }),
      { code, status: expectedStatus }
    );
  }
});

test("handles provider outages, timeouts, and malformed responses", async () => {
  const { lookupCid } = await loadApi();
  await assert.rejects(
    lookupCid("10", "A00", {
      apiKey: "server-only-key",
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    { code: "UNAVAILABLE", status: 502 }
  );
  await assert.rejects(
    lookupCid("10", "A00", {
      apiKey: "server-only-key",
      fetchImpl: async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); },
    }),
    { code: "TIMEOUT", status: 504 }
  );
  await assert.rejects(
    lookupCid("10", "A00", {
      apiKey: "server-only-key",
      fetchImpl: async () => new Response("invalid", { status: 200 }),
    }),
    { code: "INVALID_RESPONSE", status: 502 }
  );
});
