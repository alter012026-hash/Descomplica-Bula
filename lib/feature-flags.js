import { isVisitStoreConfigured, pipeline } from "./visit-store.js";

const MEDICATION_SUMMARY_FLAG_KEY = "feature:medication-summary:enabled";

export async function getMedicationSummaryEnabled({
  isConfigured = isVisitStoreConfigured,
  runPipeline = pipeline,
} = {}) {
  if (!isConfigured()) {
    throw new Error("Configure o Upstash Redis para salvar o estado das funcionalidades.");
  }

  const [value] = await runPipeline([["GET", MEDICATION_SUMMARY_FLAG_KEY]]);
  if (value === null) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("O estado salvo do resumo da bula é inválido.");
}

export async function setMedicationSummaryEnabled(enabled, {
  isConfigured = isVisitStoreConfigured,
  runPipeline = pipeline,
} = {}) {
  if (typeof enabled !== "boolean") {
    throw new TypeError("O estado do resumo da bula deve ser booleano.");
  }
  if (!isConfigured()) {
    throw new Error("Configure o Upstash Redis para salvar o estado das funcionalidades.");
  }

  await runPipeline([["SET", MEDICATION_SUMMARY_FLAG_KEY, String(enabled)]]);
  return enabled;
}
