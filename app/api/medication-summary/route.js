import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import {
  MedicationLeafletError,
  parseUploadedLeaflet,
  OFFICIAL_LEAFLET_URL,
} from "../../../lib/medication-leaflet";
import { buildMedicationSummaryPrompt, parseMedicationSummary } from "../../../lib/medication-summary";
import { generateMedicationSummary } from "../../../lib/medication-summary-ai";
import { getMedicationSummaryEnabled } from "../../../lib/feature-flags";
import { getUrgentResponse } from "../../../lib/medical-safety";
import siteConfig from "../../../site.config";

export const maxDuration = 60;

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_PDF_BYTES + 128 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_STRENGTH_LENGTH = 60;
const SUMMARY_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };

export async function POST(request) {
  try {
    let enabled;
    try {
      enabled = await getMedicationSummaryEnabled();
    } catch (error) {
      console.error("[medication-summary][FEATURE_FLAG]", error.message);
      return NextResponse.json(
        { error: "O resumo da bula está indisponível porque não foi possível consultar a configuração." },
        { status: 503 }
      );
    }
    if (!enabled) {
      return NextResponse.json({ error: "O resumo da bula está desativado no momento." }, { status: 404 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "O PDF deve ter no máximo 4 MB." }, { status: 413 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = checkRateLimit(`medication-summary:${ip}`, SUMMARY_LIMIT);
    if (!allowed) {
      return NextResponse.json(
        { error: "Você fez várias consultas em pouco tempo. Aguarde alguns minutos e tente novamente." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const form = await request.formData();
    const medicineName = getFormText(form, "medicineName");
    const strength = getFormText(form, "strength");

    if (!medicineName || medicineName.length > MAX_NAME_LENGTH || strength.length > MAX_STRENGTH_LENGTH) {
      return NextResponse.json({ error: "Informe o nome e confira a apresentação do medicamento." }, { status: 400 });
    }

    const urgentResponse = getUrgentResponse(`${medicineName} ${strength}`, siteConfig.emergency);
    if (urgentResponse) {
      return NextResponse.json({ urgent: true, message: urgentResponse });
    }

    const pdf = form.get("leafletPdf");
    if (!pdf || typeof pdf.arrayBuffer !== "function" || pdf.size === 0) {
      return NextResponse.json(
        { error: "Baixe a bula no Bulário da Anvisa e envie o arquivo PDF para continuar.", officialLeafletUrl: OFFICIAL_LEAFLET_URL },
        { status: 400 }
      );
    }
    if (pdf.type && pdf.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Envie a bula em formato PDF.", officialLeafletUrl: OFFICIAL_LEAFLET_URL },
        { status: 400 }
      );
    }
    if (pdf.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "O PDF deve ter no máximo 4 MB." }, { status: 413 });
    }

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    const uploadedLeaflet = await parseUploadedLeaflet({ medicineName, strength, pdfBuffer });
    let response;
    try {
      response = await generateMedicationSummary({
        prompt: buildMedicationSummaryPrompt({ medicineName, strength, uploadedLeaflet }),
      });
    } catch (error) {
      if (error.code === "NO_SUMMARY_PROVIDER") {
        return NextResponse.json(
          {
            error: "O resumo ainda não está configurado. Cadastre GROQ_API_KEY ou GEMINI_API_KEY nas variáveis da Vercel e publique um novo deploy.",
            officialLeafletUrl: OFFICIAL_LEAFLET_URL,
          },
          { status: 503 }
        );
      }
      if (error.code === "SUMMARY_PROVIDERS_FAILED") {
        return NextResponse.json(
          {
            error: "Não foi possível gerar o resumo agora. Consulte o PDF enviado e tente novamente mais tarde.",
            officialLeafletUrl: OFFICIAL_LEAFLET_URL,
          },
          { status: 502 }
        );
      }
      throw error;
    }

    const summary = parseMedicationSummary(response.text);
    if (!summary.identified) {
      return NextResponse.json({
        identified: false,
        error: "Não consegui confirmar o medicamento com segurança pelo texto do PDF.",
        officialLeafletUrl: OFFICIAL_LEAFLET_URL,
      });
    }

    return NextResponse.json({
      ...summary,
      medicineName: uploadedLeaflet.medicineName,
      provider: response.provider,
      officialLeafletUrl: OFFICIAL_LEAFLET_URL,
      uploadedSource: { uploadedAt: uploadedLeaflet.uploadedAt },
    });
  } catch (error) {
    if (error instanceof MedicationLeafletError) {
      console.warn("[medication-summary][PDF]", error.code);
      return NextResponse.json(
        { error: error.message, officialLeafletUrl: OFFICIAL_LEAFLET_URL },
        { status: error.code === "PDF_TOO_LARGE" ? 413 : 422 }
      );
    }
    console.error("[medication-summary][POST]", error.message);
    return NextResponse.json(
      {
        error: "Não foi possível gerar o resumo com segurança. Confira o PDF e tente novamente ou consulte o Bulário oficial da Anvisa.",
        officialLeafletUrl: OFFICIAL_LEAFLET_URL,
      },
      { status: 502 }
    );
  }
}

function getFormText(form, key) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
