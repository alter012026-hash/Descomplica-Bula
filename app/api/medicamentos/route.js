import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import {
  ANVISA_BULARIO_URL,
  MedicationSearchError,
  searchMedications,
  validateMedicationSearchName,
} from "../../../lib/medicamentos-api";

export const dynamic = "force-dynamic";
const SEARCH_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

export async function GET(request) {
  const url = new URL(request.url);
  const names = url.searchParams.getAll("nome");
  if (names.length !== 1) {
    return NextResponse.json(
      { erro: "Digite o nome de um medicamento.", resultados: [], bularioUrl: ANVISA_BULARIO_URL },
      { status: 400 }
    );
  }

  let nome;
  try {
    nome = validateMedicationSearchName(names[0]);
  } catch (error) {
    if (!(error instanceof MedicationSearchError)) throw error;
    return NextResponse.json(
      { erro: error.message, resultados: [], bularioUrl: ANVISA_BULARIO_URL },
      { status: error.status }
    );
  }

  const ip = getClientIp(request);
  const { allowed, retryAfterMs } = checkRateLimit(`medication-catalog:${ip}`, SEARCH_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      {
        erro: "Você fez várias buscas em pouco tempo. Aguarde alguns minutos ou consulte o Bulário da Anvisa.",
        resultados: [],
        bularioUrl: ANVISA_BULARIO_URL,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const data = await searchMedications(nome);
    return NextResponse.json(
      { ...data, bularioUrl: ANVISA_BULARIO_URL },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (!(error instanceof MedicationSearchError)) {
      console.error("[medication-catalog][GET]", error.message);
      return NextResponse.json(
        {
          erro: "Não foi possível consultar o catálogo agora. Tente novamente ou acesse o Bulário da Anvisa.",
          resultados: [],
          bularioUrl: ANVISA_BULARIO_URL,
        },
        { status: 502 }
      );
    }
    if (error.status >= 500) console.error("[medication-catalog][GET]", error.code);
    return NextResponse.json(
      { erro: error.message, resultados: [], bularioUrl: ANVISA_BULARIO_URL },
      { status: error.status }
    );
  }
}
