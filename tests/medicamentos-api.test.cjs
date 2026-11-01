const test = require("node:test");
const assert = require("node:assert/strict");

async function loadApi() {
  return import("../lib/medicamentos-api.js");
}

test("validates and normalizes medication search terms", async () => {
  const { validateMedicationSearchName } = await loadApi();
  assert.equal(validateMedicationSearchName("  dipirona   sódica  "), "dipirona sódica");
  assert.throws(() => validateMedicationSearchName("a"), { code: "INVALID_NAME", status: 400 });
  assert.throws(() => validateMedicationSearchName("a".repeat(101)), {
    code: "INVALID_NAME",
    status: 400,
  });
  assert.throws(() => validateMedicationSearchName("dip\0irona"), {
    code: "INVALID_NAME",
    status: 400,
  });
});

test("searches only the free catalog endpoint and normalizes results", async () => {
  const { searchMedications } = await loadApi();
  let requestUrl;
  let requestOptions;
  const result = await searchMedications("dipirona", {
    apiKey: "server-only-key",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(JSON.stringify({
        total: 1,
        resultados: [{
          registro: "123456789",
          nome: "DIPIRONA",
          fabricante: "Laboratório",
          principioAtivo: "Dipirona sódica",
          situacao: "ativo",
          ignoredPrivateField: "not returned",
        }],
      }), {
        status: 200,
        headers: { "X-RateLimit-Remaining": "99" },
      });
    },
  });

  assert.equal(requestUrl.origin, "https://medicamentos.api.br");
  assert.equal(requestUrl.pathname, "/api/v1/medicamentos");
  assert.equal(requestUrl.searchParams.get("nome"), "dipirona");
  assert.equal(requestUrl.searchParams.get("porPagina"), "10");
  assert.equal(requestOptions.headers["X-API-Key"], "server-only-key");
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(result.total, 1);
  assert.equal(result.rateLimitRemaining, 99);
  assert.deepEqual(result.resultados[0], {
    registro: "123456789",
    nome: "DIPIRONA",
    fabricante: "Laboratório",
    principioAtivo: "Dipirona sódica",
    situacao: "ativo",
  });
});

test("rejects a missing API key without making an upstream request", async () => {
  const { searchMedications } = await loadApi();
  let called = false;
  await assert.rejects(
    searchMedications("dipirona", {
      apiKey: "",
      fetchImpl: async () => { called = true; },
    }),
    { code: "NOT_CONFIGURED", status: 503 }
  );
  assert.equal(called, false);
});

test("maps upstream quotas and authentication failures to safe messages", async () => {
  const { searchMedications } = await loadApi();
  for (const [status, code, expectedStatus] of [
    [429, "UPSTREAM_LIMIT", 429],
    [401, "UPSTREAM_AUTH", 503],
    [403, "UPSTREAM_AUTH", 503],
  ]) {
    await assert.rejects(
      searchMedications("dipirona", {
        apiKey: "server-only-key",
        fetchImpl: async () => new Response("{}", { status }),
      }),
      { code, status: expectedStatus }
    );
  }
});

test("handles provider outages, timeouts, and malformed JSON safely", async () => {
  const { searchMedications } = await loadApi();
  await assert.rejects(
    searchMedications("dipirona", {
      apiKey: "server-only-key",
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    { code: "UNAVAILABLE", status: 502 }
  );
  await assert.rejects(
    searchMedications("dipirona", {
      apiKey: "server-only-key",
      fetchImpl: async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); },
    }),
    { code: "TIMEOUT", status: 504 }
  );
  await assert.rejects(
    searchMedications("dipirona", {
      apiKey: "server-only-key",
      fetchImpl: async () => new Response("invalid", { status: 200 }),
    }),
    { code: "INVALID_RESPONSE", status: 502 }
  );
});
