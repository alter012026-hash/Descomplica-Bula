import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import { sendDailyBroadcast, isValidEmail } from "../../../../../lib/newsletter-service";
import { getAllPosts } from "../../../../../lib/posts";
import config from "../../../../../site.config";

export const maxDuration = 30;

/**
 * POST /api/admin/newsletter/test-send
 * Body: { testEmail?: string }
 *
 * Dispara manualmente um e-mail com o post mais recente, para o admin
 * conferir como o template fica antes de confiar no cron automático.
 * Se "testEmail" vier preenchido, o ideal é o admin usar um e-mail só dele —
 * mas como o Broadcast do Resend vai para a Audience inteira, aqui o envio
 * de teste é feito via /emails (transacional), não /broadcasts, para não
 * disparar para todos os inscritos por engano.
 */
export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const testEmail = typeof body.testEmail === "string" ? body.testEmail.trim() : "";

    if (!isValidEmail(testEmail)) {
      return NextResponse.json(
        { ok: false, error: "Informe um e-mail válido para o teste." },
        { status: 400 }
      );
    }

    const posts = getAllPosts();
    if (!posts.length) {
      return NextResponse.json({ ok: false, error: "Nenhum post encontrado." }, { status: 400 });
    }

    const { buildDailyEmailHtml, buildNewsletterSubject } = require("../../../../../lib/newsletter-service");
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY ausente nas variáveis de ambiente." },
        { status: 500 }
      );
    }
    const from =
      process.env.RESEND_FROM_EMAIL?.trim() || "Descomplica Bula <onboarding@resend.dev>";

    const latestPost = posts[0];
    const html = buildDailyEmailHtml({
      posts: [latestPost],
      siteUrl: config.url,
      siteName: config.name,
    }).replace(
      "{{{RESEND_UNSUBSCRIBE_URL}}}",
      "(link de descadastro aparece aqui no envio real para inscritos)"
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [testEmail],
        subject: buildNewsletterSubject([latestPost], { test: true }),
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      return NextResponse.json(
        { ok: false, error: errBody?.message || `Resend HTTP ${res.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, postUsed: latestPost.slug });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
