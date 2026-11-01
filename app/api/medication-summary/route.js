import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import {
  buildMedicationIdentityPrompt,
  buildMedicationSummaryPrompt,
  parseMedicationIdentity,
  parseMedicationSummary,
} from "../../../lib/medication-summary";
import { generateMedicationSummary } from "../../../lib/medication-summary-ai";
import {
  AnvisaBularioError,
  fetchOfficialLeaflet,
  OFFICIAL_LEAFLET_URL,
} from "../../../lib/anvisa-bulario";
import { getUrgentResponse } from "../../../lib/medical-safety";
import siteConfig from "../../../site.config";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 128 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_STRENGTH_LENGTH = 60;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUMMARY_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
export async function POST(request) {
  let officialLeafletUrl = OFFICIAL_LEAFLET_URL;
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

    let identifiedMedicineName = medicineName;
    let identifiedStrength = strength;
    if (!identifiedMedicineName && imageData) {
      try {
        const identityResponse = await generateMedicationSummary({
          prompt: buildMedicationIdentityPrompt(),
          imageData,
        });
        const identity = parseMedicationIdentity(identityResponse.text);
        identifiedMedicineName = identity.medicineName;
      } catch (error) {
        if (error.code === "NO_SUMMARY_PROVIDER") {
          return NextResponse.json(
            {
              error: "Para ler o nome da foto, configure GROQ_API_KEY ou GEMINI_API_KEY na Vercel.",
              officialLeafletUrl,
            },
            { status: 503 }
          );
        }
        if (error.code === "SUMMARY_PROVIDERS_FAILED") {
          return NextResponse.json(
            {
              error: "Não foi possível ler o nome da foto agora. Digite o nome do medicamento para continuar.",
              officialLeafletUrl,
            },
            { status: 502 }
          );
        }
        throw error;
      }

      if (!identifiedMedicineName) {
        return NextResponse.json(
          { error: "Não consegui ler o nome com segurança. Digite o nome que aparece na embalagem." },
          { status: 422 }
        );
      }
    }

    const urgentResponse = getUrgentResponse(
      `${identifiedMedicineName} ${identifiedStrength}`,
      siteConfig.emergency
    );
    if (urgentResponse) {
      return NextResponse.json({ urgent: true, message: urgentResponse });
    }

    let officialLeaflet;
    try {
      officialLeaflet = await fetchOfficialLeaflet({
        medicineName: identifiedMedicineName,
        strength,
      });
    } catch (error) {
      if (!(error instanceof AnvisaBularioError)) throw error;
      console.warn("[medication-summary][ANVISA]", error.code);
      return NextResponse.json(
        { error: getAnvisaErrorMessage(error.code), officialLeafletUrl },
        { status: 503 }
      );
    }

    const prompt = buildMedicationSummaryPrompt({
      strength: identifiedStrength,
      officialLeaflet,
    });
    let response;
    try {
      response = await generateMedicationSummary({ prompt });
    } catch (error) {
      if (error.code === "NO_SUMMARY_PROVIDER") {
        return NextResponse.json(
          {
            error: "O resumo ainda não está configurado. Cadastre GROQ_API_KEY ou GEMINI_API_KEY nas variáveis da Vercel e publique um novo deploy.",
            officialLeafletUrl,
          },
          { status: 503 }
        );
      }
      if (error.code === "SUMMARY_PROVIDERS_FAILED") {
        return NextResponse.json(
          {
            error: "A bula foi confirmada, mas os serviços de IA estão indisponíveis. Consulte a bula oficial ou tente novamente.",
            officialLeafletUrl,
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
        error: "Não consegui identificar o medicamento com segurança. Confira o nome na embalagem ou envie uma foto mais nítida.",
        officialLeafletUrl,
      });
    }

    return NextResponse.json({
      ...summary,
      medicineName: officialLeaflet.medicineName,
      provider: response.provider,
      officialLeafletUrl,
      officialSource: {
        manufacturer: officialLeaflet.manufacturer,
        registration: officialLeaflet.registration,
        accessedAt: officialLeaflet.accessedAt,
      },
    });
  } catch (error) {
    console.error("[medication-summary][POST]", error.code || "SUMMARY_FAILED", error.message);
    return NextResponse.json(
      {
        error: "Não foi possível gerar o resumo com segurança. Tente novamente ou consulte a bula oficial da Anvisa.",
        officialLeafletUrl,
      },
      { status: 502 }
    );
  }
}

function getAnvisaErrorMessage(code) {
  if (code === "ANVISA_NOT_FOUND") {
    return "Não encontrei esse nome como produto exato na consulta da Anvisa. Confira a grafia ou pesquise diretamente no Bulário oficial.";
  }
  if (code === "ANVISA_AMBIGUOUS") {
    return "Encontrei mais de uma bula possível para esse nome. Informe o nome completo ou a apresentação para evitar usar a bula errada.";
  }
  if (code === "ANVISA_LEAFLET_UNAVAILABLE" || code === "ANVISA_PDF_UNREADABLE") {
    return "A Anvisa não disponibilizou uma bula legível para esta correspondência. Não geramos um resumo sem confirmar a bula.";
  }
  if (code === "ANVISA_STRENGTH_MISMATCH") {
    return "Não consegui confirmar a concentração informada no texto da bula oficial. Confira o nome e a apresentação na embalagem.";
  }
  return "Não foi possível consultar ou ler a bula oficial da Anvisa agora. Para evitar informações sem confirmação, o resumo não foi gerado.";
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
