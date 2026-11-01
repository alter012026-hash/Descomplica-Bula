import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { generateValidatedArticle, buildArticleFile } from "../../../../lib/article-generator";
import { commitFile, getFile } from "../../../../lib/github-commit";
import config from "../../../../site.config.js";
import healthTopics from "../../../../lib/health-topics";
import editorialPlan from "../../../../lib/editorial-plan";

const SIGNATURES_REPO_PATH = ".content-signatures.json";
const QUALITY_LOG_REPO_PATH = ".quality-log.json";
const EDITORIAL_DRAFTS_REPO_PATH = ".editorial-drafts.json";
const { MAX_EDITORIAL_PLAN_ITEMS, normalizeEditorialPlan } = editorialPlan;

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  return NextResponse.json({
    maxItems: MAX_EDITORIAL_PLAN_ITEMS,
    categories: config.generation.categories.map((name) => ({
      name,
      topics: Array.isArray(healthTopics[name]) ? healthTopics[name] : [],
    })),
  });
}

/**
 * POST /api/admin/ideas
 *
 * Recebe um array de dúvidas e envia os artigos gerados à fila de revisão.
 *
 * Body: { doubts: string[], category?: string }
 *
 * Retorna: { generated: Array<{ topic, file, words, provider }>, errors: Array<{ topic, error }> }
 */
export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "O corpo da requisição deve ser um objeto." }, { status: 400 });
    }
    let articles;
    if (Array.isArray(body.plan)) {
      articles = normalizeEditorialPlan(
        body.plan,
        config.generation.categories,
        healthTopics
      );
    } else {
      const { doubts, category } = body;
      if (!Array.isArray(doubts) || doubts.length === 0) {
        return NextResponse.json({ error: "Envie ao menos uma dúvida." }, { status: 400 });
      }
      const selectedDoubts = doubts.slice(0, MAX_EDITORIAL_PLAN_ITEMS);
      if (selectedDoubts.some((topic) => typeof topic !== "string" || !topic.trim())) {
        return NextResponse.json(
          { error: "Cada dúvida deve ser um tema de texto não vazio." },
          { status: 400 }
        );
      }
      const chosenCategory = category || config.generation.categories[0];
      if (!config.generation.categories.includes(chosenCategory)) {
        return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
      }
      articles = selectedDoubts.map((topic) => ({ topic: topic.trim(), category: chosenCategory }));
    }

    const generated = [];
    const errors = [];

    // Carrega as assinaturas de conteúdo já publicado (mesmo arquivo que o
    // fluxo de regeneração usa) — sem isso, posts gerados a partir de
    // "dúvidas" nunca eram comparados contra o que já existe no blog, o que
    // foi uma das causas dos posts quase-duplicados.
    const signaturesFile = await getFile(SIGNATURES_REPO_PATH);
    let signatures = signaturesFile ? JSON.parse(signaturesFile.content || "[]") : [];

    const qualityLogFile = await getFile(QUALITY_LOG_REPO_PATH);
    const qualityLog = qualityLogFile ? JSON.parse(qualityLogFile.content || "[]") : [];
    const draftsFile = await getFile(EDITORIAL_DRAFTS_REPO_PATH);
    const editorialDrafts = draftsFile ? JSON.parse(draftsFile.content || "[]") : [];

    for (const { topic, category } of articles) {
      try {
        const result = await generateValidatedArticle({
          topic,
          category,
          generation: config.generation,
          existingSignatures: signatures.map((s) => ({ slug: s.slug, words: s.words })),
        });

        const article = buildArticleFile({
          title: result.title,
          body: result.body,
          topic,
          category,
        });

        const sourceUrls = [...new Set(
          [...article.content.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1])
        )];
        editorialDrafts.unshift({
          id: `${article.date}-${article.slug}`,
          file: article.file,
          targetFile: null,
          title: article.normalizedTitle,
          slug: article.slug,
          category: article.category,
          topic,
          content: article.content,
          sourceUrls,
          validationIssues: result.issues,
          status: "NEEDS_REVIEW",
          generatedAt: new Date().toISOString(),
          history: [
            { status: "DRAFT_GENERATED", at: new Date().toISOString() },
            { status: "NEEDS_REVIEW", at: new Date().toISOString() },
          ],
        });

        // Atualiza assinaturas e log de qualidade em memória nesta requisição,
        // pra que a 2ª/3ª dúvida do mesmo lote já seja comparada contra a 1ª
        // (evita gerar dois artigos quase iguais dentro do mesmo lote de 5).
        signatures.push({ slug: article.slug, words: result.signature });
        qualityLog.push({
          timestamp: new Date().toISOString(),
          file: article.file,
          slug: article.slug,
          title: article.normalizedTitle,
          category: article.category,
          provider: result.provider,
          wordCount: result.wordCount,
          fillerCount: result.fillerCount,
          similarity: Math.round(result.maxSim * 100),
          similarTo: result.mostSimilarSlug,
          status: "NEEDS_REVIEW",
          issues: result.issues,
        });

        generated.push({
          topic,
          category,
          file: article.file,
          words: result.wordCount,
          provider: result.provider,
          similarity: Math.round(result.maxSim * 100),
          similarTo: result.mostSimilarSlug,
          issues: result.issues,
        });
      } catch (err) {
        errors.push({ topic, category, error: err.message });
      }
    }

    // Persiste assinaturas e log atualizados (1x ao final, não por item)
    if (generated.length > 0) {
      await commitFile(
        SIGNATURES_REPO_PATH,
        JSON.stringify(signatures.slice(-400), null, 2),
        "chore: atualizar assinaturas de conteúdo (dúvidas)"
      );
      await commitFile(
        EDITORIAL_DRAFTS_REPO_PATH,
        JSON.stringify(editorialDrafts.slice(0, 400), null, 2),
        "editorial: adicionar artigos gerados à fila de revisão"
      );
      await commitFile(
        QUALITY_LOG_REPO_PATH,
        JSON.stringify(qualityLog.slice(-400), null, 2),
        "chore: atualizar log de qualidade (dúvidas)"
      );
    }

    return NextResponse.json({ generated, errors });
  } catch (err) {
    console.error("[ideas/route]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
