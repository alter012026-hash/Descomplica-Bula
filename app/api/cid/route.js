import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import { CidLookupError, lookupCid, validateCidCode } from "../../../lib/cid-api";

export const dynamic = "force-dynamic";
const LOOKUP_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

export async function GET(request) {
  const url = new URL(request.url);
  const versions = url.searchParams.getAll("versao");
  const codes = url.searchParams.getAll("codigo");
  if (versions.length !== 1 || codes.length !== 1) {
    return NextResponse.json(
      { erro: "Informe a versão e o código CID." },
      { status: 400 }
    );
  }

  let version;
  try {
    version = versions[0];
    validateCidCode(version, codes[0]);
  } catch (error) {
    if (!(error instanceof CidLookupError)) throw error;
    return NextResponse.json({ erro: error.message }, { status: error.status });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfterMs } = checkRateLimit(`cid-lookup:${ip}`, LOOKUP_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { erro: "Você fez várias consultas em pouco tempo. Aguarde alguns minutos." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const result = await lookupCid(version, codes[0]);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (!(error instanceof CidLookupError)) {
      console.error("[cid-lookup][GET]", error.message);
      return NextResponse.json({ erro: "Não foi possível consultar a API de CID agora." }, { status: 502 });
    }
    if (error.status >= 500) console.error("[cid-lookup][GET]", error.code);
    return NextResponse.json({ erro: error.message }, { status: error.status });
  }
}
