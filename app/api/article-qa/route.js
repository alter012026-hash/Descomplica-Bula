import { NextResponse } from "next/server";
import { getPostBySlug } from "../../../lib/posts";
import { answerArticleQuestion } from "../../../lib/article-qa";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import siteConfig from "../../../site.config";
import { getUrgentResponse } from "../../../lib/medical-safety";

export const maxDuration = 30;

// Até 8 perguntas por IP a cada 10 minutos por artigo — dá espaço pra um
// leitor genuíno fazer 2-3 perguntas de acompanhamento, mas corta bots e
// abuso óbvio (cada chamada custa uma requisição de IA).
const QA_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };

const MIN_QUESTION_LEN = 6;
const MAX_QUESTION_LEN = 300;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!slug) {
      return NextResponse.json({ answer: null, error: "Artigo não identificado." }, { status: 400 });
    }
    if (question.length < MIN_QUESTION_LEN || question.length > MAX_QUESTION_LEN) {
      return NextResponse.json(
        { answer: null, error: `A pergunta precisa ter entre ${MIN_QUESTION_LEN} e ${MAX_QUESTION_LEN} caracteres.` },
        { status: 400 }
      );
    }

    const urgentResponse = getUrgentResponse(question, siteConfig.emergency);
    if (urgentResponse) {
      return NextResponse.json({ answer: urgentResponse, fallback: true, urgent: true });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = checkRateLimit(`article-qa:${ip}`, QA_LIMIT);
    if (!allowed) {
      return NextResponse.json(
        { answer: null, error: "Muitas perguntas em pouco tempo. Espere alguns minutos e tente de novo." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const post = getPostBySlug(slug);
    if (!post) {
      return NextResponse.json({ answer: null, error: "Artigo não encontrado." }, { status: 404 });
    }

    const answer = await answerArticleQuestion({
      title: post.title,
      category: post.category,
      content: post.content,
      question,
    });

    if (!answer) {
      // Nunca 500 por falha de IA — o front mostra uma mensagem padrão.
      return NextResponse.json({ answer: null, fallback: true });
    }

    return NextResponse.json({ answer, fallback: false });
  } catch (err) {
    console.error("[article-qa][POST]", err);
    return NextResponse.json({ answer: null, error: "Não foi possível responder agora. Tente novamente." }, { status: 500 });
  }
}
