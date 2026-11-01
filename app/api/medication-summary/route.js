import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import {
  buildMedicationSummaryPrompt,
  parseMedicationSummary,
} from "../../../lib/medication-summary";
import { generateMedicationSummary } from "../../../lib/medication-summary-ai";
import { getUrgentResponse } from "../../../lib/medical-safety";
import siteConfig from "../../../site.config";

export const maxDuration = 35;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 128 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_STRENGTH_LENGTH = 60;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUMMARY_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "A imagem deve ter no máximo 3 MB." }, { status: 413 });
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
    const image = form.get("image");

    if (medicineName.length > MAX_NAME_LENGTH || strength.length > MAX_STRENGTH_LENGTH) {
      return NextResponse.json({ error: "Confira o nome e a apresentação do medicamento." }, { status: 400 });
    }

    let imageData = null;
    if (image && typeof image.arrayBuffer === "function" && image.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
        return NextResponse.json(
          { error: "Envie uma imagem JPG, PNG ou WebP." },
          { status: 400 }
        );
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "A imagem deve ter no máximo 3 MB." }, { status: 413 });
      }

      const bytes = Buffer.from(await image.arrayBuffer());
      if (!hasValidImageSignature(bytes, image.type)) {
        return NextResponse.json({ error: "O arquivo enviado não parece ser uma imagem válida." }, { status: 400 });
      }
      imageData = `data:${image.type};base64,${bytes.toString("base64")}`;
    }

    if (!medicineName && !imageData) {
      return NextResponse.json(
        { error: "Informe o nome do medicamento ou envie uma foto da embalagem." },
        { status: 400 }
      );
    }

    const urgentResponse = getUrgentResponse(
      `${medicineName} ${strength}`,
      siteConfig.emergency
    );
    if (urgentResponse) {
      return NextResponse.json({ urgent: true, message: urgentResponse });
    }

    const prompt = buildMedicationSummaryPrompt({
      medicineName,
      strength,
      hasImage: Boolean(imageData),
    });
    let response;
    try {
      response = await generateMedicationSummary({ prompt, imageData });
    } catch (error) {
      if (error.code === "NO_SUMMARY_PROVIDER") {
        return NextResponse.json(
          { error: "O resumo ainda não está configurado. Cadastre GROQ_API_KEY ou GEMINI_API_KEY nas variáveis da Vercel e publique um novo deploy." },
          { status: 503 }
        );
      }
      throw error;
    }

    const summary = parseMedicationSummary(response.text);
    if (!summary.identified) {
      return NextResponse.json({
        identified: false,
        error: "Não consegui identificar o medicamento com segurança. Confira o nome na embalagem ou envie uma foto mais nítida.",
      });
    }

    return NextResponse.json({
      ...summary,
      provider: response.provider,
      officialLeafletUrl: "https://consultas.anvisa.gov.br/#/bulario/",
    });
  } catch (error) {
    console.error("[medication-summary][POST]", error.code || "SUMMARY_FAILED", error.message);
    return NextResponse.json(
      { error: "Não foi possível gerar o resumo agora. Confira se GROQ_API_KEY ou GEMINI_API_KEY está válida na Vercel. Se o problema continuar, consulte os logs da função medication-summary." },
      { status: 502 }
    );
  }
}

function getFormText(form, key) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function hasValidImageSignature(bytes, type) {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (type === "image/webp") {
    return bytes.length >= 12
      && bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}
