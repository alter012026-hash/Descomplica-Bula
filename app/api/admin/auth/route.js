import { NextResponse } from "next/server";
import { verifyPassword, createSessionToken, isPasswordConfigured, SESSION_TTL_SECONDS } from "../../../../lib/admin-auth";
import { checkRateLimit, getClientIp } from "../../../../lib/rate-limit";

// Máximo de 5 tentativas de login por IP a cada 10 minutos.
const LOGIN_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function POST(request) {
  try {
    if (!isPasswordConfigured()) {
      // Nunca cai para uma senha padrão — se ADMIN_PASSWORD não estiver
      // configurada na Vercel, o login fica bloqueado (fail closed).
      return NextResponse.json(
        { ok: false, error: "Login administrativo não configurado no servidor." },
        { status: 503 }
      );
    }

    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = checkRateLimit(`admin-login:${ip}`, LOGIN_LIMIT);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Muitas tentativas. Tente novamente em alguns minutos." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const { password } = await request.json();

    if (verifyPassword(password)) {
      const response = NextResponse.json({ ok: true });
      response.cookies.set("admin_auth", createSessionToken(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_TTL_SECONDS,
        path: "/",
        sameSite: "strict",
      });
      return response;
    }

    return NextResponse.json({ ok: false, error: "Senha incorreta" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("admin_auth");
  return response;
}
