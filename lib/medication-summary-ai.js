const GROQ_MODEL = "qwen/qwen3.8-27b";
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];
const REQUEST_TIMEOUT_MS = 10_000;

function extractSummaryText(payload, provider) {
  const text = provider === "Gemini"
    ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")
    : payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`${provider} retornou uma resposta vazia.`);
  }
  return text;
}

async function callGroq({ prompt, imageData, apiKey, fetchImpl }) {
  const content = [{ type: "text", text: prompt }];
  if (imageData) content.push({ type: "image_url", image_url: { url: imageData } });

  const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content }],
      temperature: 0.2,
      max_completion_tokens: 2048,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Groq respondeu HTTP ${response.status}.`);
  return extractSummaryText(await response.json(), "Groq");
}

async function callGemini({ prompt, imageData, apiKey, fetchImpl }) {
  const parts = [{ text: prompt }];
  if (imageData) {
    const match = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("A imagem não está em um formato suportado pelo Gemini.");
    parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }

  const errors = [];
  for (const model of GEMINI_MODELS) {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      errors.push(`${model}: HTTP ${response.status}`);
      continue;
    }

    try {
      return extractSummaryText(await response.json(), "Gemini");
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }
  throw new Error(`Gemini falhou em todos os modelos (${errors.join("; ")}).`);
}

async function generateMedicationSummary({
  prompt,
  imageData,
  env = process.env,
  fetchImpl = fetch,
}) {
  const providers = [];
  if (env.GROQ_API_KEY?.trim()) {
    providers.push({
      name: "Groq",
      call: () => callGroq({ prompt, imageData, apiKey: env.GROQ_API_KEY.trim(), fetchImpl }),
    });
  }
  if (env.GEMINI_API_KEY?.trim()) {
    providers.push({
      name: "Gemini",
      call: () => callGemini({ prompt, imageData, apiKey: env.GEMINI_API_KEY.trim(), fetchImpl }),
    });
  }

  if (providers.length === 0) {
    const error = new Error("Configure GROQ_API_KEY ou GEMINI_API_KEY no ambiente de produção.");
    error.code = "NO_SUMMARY_PROVIDER";
    throw error;
  }

  const errors = [];
  for (const provider of providers) {
    try {
      return { text: await provider.call(), provider: provider.name };
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  const error = new Error(`Todos os provedores de resumo falharam: ${errors.join(" | ")}`);
  error.code = "SUMMARY_PROVIDERS_FAILED";
  throw error;
}

module.exports = {
  generateMedicationSummary,
  GROQ_MODEL,
  GEMINI_MODELS,
};
