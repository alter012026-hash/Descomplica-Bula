import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { commitFile, getFile, triggerVercelDeploy } from "../../../../lib/github-commit";
import siteConfig from "../../../../site.config";
import { validateHealthArticle } from "../../../../lib/article-generator";
import { normalizeOfficialSources } from "../../../../lib/source-validation";

const DRAFTS_PATH = ".editorial-drafts.json";

async function readDrafts() {
  const file = await getFile(DRAFTS_PATH);
  if (!file) return [];
  const drafts = JSON.parse(file.content || "[]");
  if (!Array.isArray(drafts)) throw new Error(`${DRAFTS_PATH} precisa conter um array.`);
  return drafts;
}

async function writeDrafts(drafts, message) {
  await commitFile(DRAFTS_PATH, `${JSON.stringify(drafts, null, 2)}\n`, message);
}

function validateSources(sources) {
  return normalizeOfficialSources(sources, siteConfig.officialSourceDomains);
}

function markPublished(content, verifiedAt, coverImage) {
  const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!header) throw new Error("O rascunho não tem frontmatter válido.");
  const lines = header[1].split(/\r?\n/);
  const existingCoverImage = lines.find((line) => /^coverImage\s*:/.test(line));
  const cleanFrontmatter = lines
    .filter((line) => !/^(editorialStatus|lastVerifiedAt|coverImage)\s*:/.test(line))
    .join("\n");
  const imageLine = coverImage
    ? `coverImage: "${String(coverImage).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : existingCoverImage;
  return content.replace(
    header[0],
    `---\n${[cleanFrontmatter, imageLine, `editorialStatus: "PUBLISHED"`, `lastVerifiedAt: "${verifiedAt}"`].filter(Boolean).join("\n")}\n---`
  );
}

function validateCoverImage(value) {
  const image = String(value || "").trim();
  if (!image) return "";
  if (image.startsWith("/") && !image.startsWith("//")) return image;
  try {
    const url = new URL(image);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Return a validation error below for malformed URLs.
  }
  throw new Error("A imagem deve usar um caminho local ou uma URL HTTPS.");
}

function appendVerifiedSources(content, sources) {
  const sourceLines = sources.map((source) => {
    const url = new URL(source);
    return `- [${url.hostname}](${source})`;
  });
  const withoutPreviousVerifiedBlock = content.replace(/\n## Fontes oficiais verificadas\n[\s\S]*$/i, "").trimEnd();
  return `${withoutPreviousVerifiedBlock}\n\n## Fontes oficiais verificadas\n\n${sourceLines.join("\n")}\n`;
}

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const drafts = await readDrafts();
    return NextResponse.json({
      drafts: drafts.filter((draft) => ["NEEDS_REVIEW", "VALIDATION_FAILED"].includes(draft.status)),
    });
  } catch (error) {
    console.error("[admin/editorial-review][GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar a fila editorial." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const { action, draftId } = payload || {};
    const drafts = await readDrafts();
    const index = drafts.findIndex((draft) => draft.id === draftId);
    if (index < 0) {
      return NextResponse.json({ error: "Rascunho não encontrado." }, { status: 404 });
    }

    const draft = drafts[index];
    if (!["NEEDS_REVIEW", "VALIDATION_FAILED"].includes(draft.status)) {
      return NextResponse.json({ error: "Este rascunho não está aguardando revisão." }, { status: 409 });
    }

    const reviewedAt = new Date().toISOString();
    if (action === "reject") {
      const reason = String(payload.reason || "").trim();
      if (!reason) {
        return NextResponse.json({ error: "Informe o motivo da rejeição." }, { status: 400 });
      }
      drafts[index] = {
        ...draft,
        status: "REJECTED",
        rejectionReason: reason.slice(0, 1000),
        history: [...(draft.history || []), { status: "REJECTED", at: reviewedAt, reason: reason.slice(0, 1000) }],
      };
      await writeDrafts(drafts, `editorial: rejeitar rascunho ${draft.file}`);
      return NextResponse.json({ ok: true, status: "REJECTED" });
    }

    if (action !== "approve") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    if (!payload.verifiedFacts || !payload.verifiedOfficialSources) {
      return NextResponse.json({
        error: "Confirme a checagem dos fatos e das fontes oficiais antes de publicar.",
      }, { status: 400 });
    }
    if (draft.validationIssues?.length) {
      return NextResponse.json({
        error: "O rascunho falhou nas validações automáticas e não pode ser aprovado. Gere uma nova versão.",
      }, { status: 409 });
    }
    const safetyIssues = validateHealthArticle(draft.content);
    if (safetyIssues.length) {
      return NextResponse.json({
        error: `O conteúdo não passou nas salvaguardas de saúde: ${safetyIssues.join("; ")}.`,
      }, { status: 409 });
    }

    let sources;
    try {
      sources = validateSources(payload.sources);
    } catch (error) {
      return NextResponse.json({ error: error.message || "URL de fonte inválida." }, { status: 400 });
    }
    if (!sources.length) {
      return NextResponse.json({ error: "Adicione ao menos uma fonte HTTPS oficial permitida." }, { status: 400 });
    }

    const safeFile = String(draft.file || "");
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/i.test(safeFile)) {
      return NextResponse.json({ error: "Nome de arquivo do rascunho inválido." }, { status: 400 });
    }
    if (draft.targetFile && draft.targetFile !== safeFile) {
      return NextResponse.json({ error: "O rascunho aponta para um arquivo de atualização diferente." }, { status: 409 });
    }
    const existingPost = await getFile(`posts/${safeFile}`);
    if (draft.targetFile && !existingPost) {
      return NextResponse.json({ error: "O artigo original desta atualização não existe mais." }, { status: 409 });
    }
    if (existingPost && !draft.targetFile) {
      return NextResponse.json({
        error: "Já existe um artigo publicado com esse arquivo. Revise a duplicidade antes de aprovar.",
      }, { status: 409 });
    }

    let coverImage;
    try {
      coverImage = validateCoverImage(payload.coverImage);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const publishedAt = new Date().toISOString();
    const contentWithSources = appendVerifiedSources(draft.content, sources);
    const publishedContent = markPublished(contentWithSources, reviewedAt, coverImage);
    if (existingPost?.content !== publishedContent) {
      await commitFile(`posts/${safeFile}`, publishedContent, `editorial: publicar ${safeFile}`);
    }

    drafts[index] = {
      ...draft,
      sourceUrls: sources,
      coverImage,
      status: "PUBLISHED",
      publishedAt,
      reviewedAt,
      history: [...(draft.history || []), { status: "APPROVED", at: reviewedAt }, { status: "PUBLISHED", at: publishedAt }],
    };
    await writeDrafts(drafts, `editorial: registrar publicação ${safeFile}`);
    await triggerVercelDeploy();

    return NextResponse.json({ ok: true, status: "PUBLISHED", url: `/blog/${draft.slug}` });
  } catch (error) {
    console.error("[admin/editorial-review][POST]", error);
    return NextResponse.json({ error: error.message || "Falha no fluxo de revisão editorial." }, { status: 500 });
  }
}
