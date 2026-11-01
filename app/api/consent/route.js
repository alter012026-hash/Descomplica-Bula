import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  SESSION_COOKIE,
  VISITOR_COOKIE,
  consentValue,
  parseCookieHeader,
} from "../../../lib/consent";
import { isVisitStoreConfigured } from "../../../lib/visit-store";
import { eraseVisitor, verifyId } from "../../../lib/visitor-store";

export const dynamic = "force-dynamic";

/**
 * Grava a escolha de cookies do visitante.
 *
 * O cookie de consentimento é gravado AQUI (Set-Cookie do servidor) e não por
 * JavaScript: o Safari limita cookies gravados por JS a 7 dias, o que faria o
 * banner reaparecer toda semana.
 *
 * Ao RECUSAR (ou revogar depois de aceitar): remove os cookies de identificação
 * e apaga as visitas individuais ligadas àquele visitante.
 */
export async function POST(request) {
  const host = request.headers.get("host") || "";
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return new NextResponse(null, { status: 403 });
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }
  if (!checkRateLimit(`consent:${getClientIp(request)}`, { limit: 30, windowMs: 60_000 }).allowed) {
    return new NextResponse(null, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const choice = body?.choice === "accepted" ? "accepted" : "rejected";
  const secure = process.env.NODE_ENV === "production";
  const res = new NextResponse(null, { status: 204 });

  // Legível por JS (o banner precisa saber se já existe uma escolha).
  res.cookies.set(CONSENT_COOKIE, consentValue(choice), {
    httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: CONSENT_MAX_AGE,
  });

  if (choice === "rejected") {
    for (const name of [VISITOR_COOKIE, SESSION_COOKIE]) {
      res.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    }
    try {
      const vid = verifyId(parseCookieHeader(request.headers.get("cookie") || "")[VISITOR_COOKIE]);
      if (vid && isVisitStoreConfigured()) await eraseVisitor(vid);
    } catch (error) {
      console.error("[consent]", error.message);
    }
  }
  return res;
}
