import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateMedicationSummary } = require("../lib/medication-summary-ai.js");

const summaryJson = JSON.stringify({
  identified: true,
  medicineName: "Medicamento Teste",
  activeIngredient: "Princípio ativo",
  purpose: "Informação geral sobre a finalidade.",
  contraindications: [],
  sideEffects: [],
  interactions: [],
  precautions: [],
  seekHelp: [],
});

test("resumo usa Gemini como fallback quando Groq falha", async () => {
  const requestedUrls = [];
  const result = await generateMedicationSummary({
    prompt: "Gere um resumo informativo em JSON.",
    imageData: "data:image/png;base64,aGVsbG8=",
    env: { GROQ_API_KEY: "groq-test", GEMINI_API_KEY: "gemini-test" },
    fetchImpl: async (url, options) => {
      requestedUrls.push(String(url));
      if (String(url).includes("groq.com")) {
        return new Response("indisponível", { status: 503 });
      }

      const request = JSON.parse(options.body);
      assert.deepEqual(request.contents[0].parts[1], {
        inline_data: { mime_type: "image/png", data: "aGVsbG8=" },
      });
      assert.equal(request.generationConfig.responseMimeType, "application/json");
      return Response.json({
        candidates: [{ content: { parts: [{ text: summaryJson }] } }],
      });
    },
  });

  assert.equal(result.provider, "Gemini");
  assert.equal(JSON.parse(result.text).medicineName, "Medicamento Teste");
  assert.equal(requestedUrls.length, 2);
});

test("resumo usa Groq quando está disponível e manda foto ao modelo multimodal", async () => {
  let requestBody;
  const result = await generateMedicationSummary({
    prompt: "Gere um resumo informativo em JSON.",
    imageData: "data:image/jpeg;base64,aGVsbG8=",
    env: { GROQ_API_KEY: "groq-test" },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return Response.json({
        choices: [{ message: { content: summaryJson } }],
      });
    },
  });

  assert.equal(result.provider, "Groq");
  assert.equal(requestBody.max_completion_tokens, 2048);
  assert.equal(requestBody.messages[0].content[1].image_url.url, "data:image/jpeg;base64,aGVsbG8=");
});

test("falha com erro acionável quando nenhum provedor está configurado", async () => {
  await assert.rejects(
    generateMedicationSummary({ prompt: "resumo", env: {}, fetchImpl: async () => assert.fail() }),
    (error) => error.code === "NO_SUMMARY_PROVIDER" && /GROQ_API_KEY ou GEMINI_API_KEY/.test(error.message)
  );
});

test("erro agrega falhas dos provedores sem expor a chave de API", async () => {
  await assert.rejects(
    generateMedicationSummary({
      prompt: "resumo",
      env: { GROQ_API_KEY: "segredo-groq", GEMINI_API_KEY: "segredo-gemini" },
      fetchImpl: async (url) => new Response("falhou", {
        status: String(url).includes("groq.com") ? 401 : 429,
      }),
    }),
    (error) => error.code === "SUMMARY_PROVIDERS_FAILED"
      && /Groq respondeu HTTP 401/.test(error.message)
      && /gemini-3\.5-flash: HTTP 429/.test(error.message)
      && !error.message.includes("segredo-")
  );
});
