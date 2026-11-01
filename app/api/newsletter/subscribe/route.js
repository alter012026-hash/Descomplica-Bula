import { NextResponse } from "next/server";
import { addSubscriber, isValidEmail } from "../../../../lib/newsletter-service";
import { checkRateLimit, getClientIp } from "../../../../lib/rate-limit";

export const maxDuration = 15;

// Até 5 inscrições por IP a cada 10 minutos — evita spam automatizado
// consumindo a cota diária do Resend (100 e-mails/dia no plano free).
const SUBSCRIBE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

// Limite simples de tamanho para evitar abuso óbvio do campo "nome".
function sanitizeName(name) {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, 80);
  return trimmed || undefined;
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = checkRateLimit(`newsletter-subscribe:${ip}`, SUBSCRIBE_LIMIT);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Muitas tentativas. Tente novamente em alguns minutos." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const firstName = sanitizeName(body.name);
    const source = typeof body.source === "string" && body.source.startsWith("/")
      ? body.source.slice(0, 120)
      : "";

    if (body.consent !== true) {
      return NextResponse.json(
        { ok: false, error: "Confirme o consentimento para receber a newsletter." },
        { status: 400 }
      );
    }
    if (!source) {
      return NextResponse.json(
        { ok: false, error: "Origem da inscrição inválida." },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    await addSubscriber({ email, firstName });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Só expomos a mensagem do erro quando ELE PRÓPRIO foi lançado por nós
    // de forma controlada (ex: addSubscriber lança err.status = 400 para
    // "e-mail inválido"). Qualquer erro vindo da API do Resend (chave
    // ausente/inválida, audience errada, rede, etc.) é tratado como erro
    // interno genérico — não expomos esses detalhes para quem está se
    // inscrevendo no site.
    const isClientError = err.status === 400;
    const status = isClientError ? 400 : 500;
    const message = isClientError
      ? err.message
      : "Não foi possível concluir sua inscrição agora. Tente novamente em alguns minutos.";

    if (!isClientError) {
      console.error("Erro ao inscrever na newsletter:", err.message);
    }

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
