import { NextResponse } from "next/server";
import { dump } from "js-yaml";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { getFile, commitFile } from "../../../../lib/github-commit";
import matter from "../../../../lib/frontmatter";
import siteConfig from "../../../../site.config";
import { fetchOfficialSources } from "../../../../lib/official-source-fetcher";
import { generateArticleUpdate } from "../../../../lib/article-generator";

const DRAFTS_PATH = ".editorial-drafts.json";
const ARTICLE_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/i;

function buildExcerpt(markdown) {
  const plainText = String(markdown || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plainText.length <= 160) return plainText;
  const excerpt = plainText.slice(0, 157);
  const lastSpace = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, lastSpace > 0 ? lastSpace : 157).trimEnd()}…`;
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { file, sources } = await request.json();
    const safeFile = String(file || "");
    if (!ARTICLE_FILE_PATTERN.test(safeFile)) {
      return NextResponse.json({ error: "Arquivo de artigo inválido." }, { status: 400 });
    }
    if (!Array.isArray(sources) || sources.length === 0 || sources.length > 3) {
      return NextResponse.json({ error: "Informe de uma a três fontes oficiais." }, { status: 400 });
    }

    const existing = await getFile(`posts/${safeFile}`);
    if (!existing) {
      return NextResponse.json({ error: "O artigo publicado não foi encontrado no repositório." }, { status: 404 });
    }
    const parsed = matter(existing.content);
    const categories = siteConfig.generation.categories;
    if (!categories.includes(parsed.data.category)) {
      return NextResponse.json({ error: "O artigo tem uma categoria que não está mais configurada." }, { status: 409 });
    }

    let checked;
    try {
      checked = await fetchOfficialSources(sources, siteConfig.officialSourceDomains);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const result = await generateArticleUpdate({
      title: parsed.data.title || safeFile,
      category: parsed.data.category,
      previousBody: parsed.content,
      sources: checked.verified,
    });

    if (!existing.content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/)) {
      return NextResponse.json({ error: "O artigo publicado não tem frontmatter válido." }, { status: 409 });
    }
    const updatedFrontmatter = dump({
      ...parsed.data,
      excerpt: buildExcerpt(result.body),
    }, { lineWidth: -1 }).trimEnd();
    const content = `---\n${updatedFrontmatter}\n---\n\n${result.body.trim()}\n`;
    const draftsFile = await getFile(DRAFTS_PATH);
    const drafts = draftsFile ? JSON.parse(draftsFile.content || "[]") : [];
    if (!Array.isArray(drafts)) throw new Error(`${DRAFTS_PATH} precisa conter um array.`);

    const generatedAt = new Date().toISOString();
    const draft = {
      id: `source-update-${safeFile}`,
      file: safeFile,
      targetFile: safeFile,
      targetSha: existing.sha,
      title: parsed.data.title || safeFile,
      slug: safeFile.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
      category: parsed.data.category,
      topic: parsed.data.title || safeFile,
      content,
      sourceUrls: checked.verified.map((source) => source.url),
      sourceChecked: true,
      sourceCheckedAt: generatedAt,
      verifiedSources: checked.verified.map(({ url, host, fetchedAt, characterCount }) => ({
        url,
        host,
        fetchedAt,
        characterCount,
      })),
      sourceCheckFailures: checked.failures,
      provider: result.provider,
      validationIssues: [],
      status: "NEEDS_REVIEW",
      generatedAt,
      history: [
        { status: "DRAFT_GENERATED", at: generatedAt },
        { status: "NEEDS_REVIEW", at: generatedAt },
      ],
    };
    const existingIndex = drafts.findIndex((item) => item.id === draft.id);
    if (existingIndex >= 0) drafts[existingIndex] = draft;
    else drafts.unshift(draft);

    await commitFile(
      DRAFTS_PATH,
      `${JSON.stringify(drafts.slice(0, 400), null, 2)}\n`,
      `editorial: propor atualização com fontes oficiais (${safeFile})`
    );

    return NextResponse.json({
      ok: true,
      title: draft.title,
      verifiedSources: draft.verifiedSources,
      failedSources: draft.sourceCheckFailures,
      note: "Atualização enviada à revisão editorial; o artigo publicado permanece intacto até a aprovação.",
    });
  } catch (error) {
    console.error("[admin/article-updates][POST]", error);
    return NextResponse.json({ error: error.message || "Não foi possível gerar a atualização." }, { status: 500 });
  }
}
