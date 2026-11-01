import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { commitFile, getFile, triggerVercelDeploy } from "../../../../lib/github-commit";
import { getAllPosts } from "../../../../lib/posts";

const STATE_PATH = "data/weekly-featured.json";
const EMPTY_STATE = { slug: null, startsAt: null, expiresAt: null };

async function readState() {
  const file = await getFile(STATE_PATH);
  if (!file) return EMPTY_STATE;
  const state = JSON.parse(file.content || "{}");
  return {
    slug: typeof state.slug === "string" ? state.slug : null,
    startsAt: state.startsAt || null,
    expiresAt: state.expiresAt || null,
  };
}

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const [state, posts] = await Promise.all([readState(), Promise.resolve(getAllPosts())]);
    const expiresAt = Date.parse(state.expiresAt || "");
    const active = state.slug && Number.isFinite(expiresAt) && expiresAt > Date.now()
      ? { ...state }
      : null;

    return NextResponse.json({
      featured: active,
      posts: posts.map(({ slug, title, category, date, coverImage }) => ({
        slug,
        title,
        category,
        date,
        coverImage,
      })),
    });
  } catch (error) {
    console.error("[admin/weekly-featured][GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar os destaques semanais." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    let state = EMPTY_STATE;

    if (payload?.action === "feature") {
      const slug = String(payload.slug || "").trim();
      if (!slug) {
        return NextResponse.json({ error: "Escolha um artigo para destacar." }, { status: 400 });
      }
      if (!getAllPosts().some((post) => post.slug === slug)) {
        return NextResponse.json({ error: "O artigo selecionado não está publicado." }, { status: 404 });
      }

      const startsAt = new Date();
      state = {
        slug,
        startsAt: startsAt.toISOString(),
        expiresAt: new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    } else if (payload?.action !== "end") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    await commitFile(
      STATE_PATH,
      `${JSON.stringify(state, null, 2)}\n`,
      state.slug ? `⭐ Destaque semanal: ${state.slug}` : "⭐ Encerrar destaque semanal"
    );
    await triggerVercelDeploy();

    return NextResponse.json({ ok: true, featured: state.slug ? state : null });
  } catch (error) {
    console.error("[admin/weekly-featured][POST]", error);
    return NextResponse.json({ error: error.message || "Não foi possível atualizar o destaque semanal." }, { status: 500 });
  }
}
