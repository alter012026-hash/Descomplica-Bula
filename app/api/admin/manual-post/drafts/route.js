import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import { getFile, commitFile } from "../../../../../lib/github-commit";

const DRAFTS_PATH = ".manual-drafts.json";

function normalizeDraft(draft) {
  const title = String(draft?.title || "").trim();
  const body = String(draft?.body || "").trim();
  const updatedAt = draft?.updatedAt || new Date().toISOString();

  return {
    id: draft?.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    slug: String(draft?.slug || "").trim(),
    category: String(draft?.category || "Geral").trim(),
    excerpt: String(draft?.excerpt || "").trim(),
    body,
    coverImage: String(draft?.coverImage || "").trim(),
    file: String(draft?.file || "").trim(),
    updatedAt,
  };
}

async function readDrafts() {
  const file = await getFile(DRAFTS_PATH);
  if (!file?.content) return [];

  try {
    const parsed = JSON.parse(file.content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeDrafts(items) {
  await commitFile(
    DRAFTS_PATH,
    `${JSON.stringify(items, null, 2)}\n`,
    `🗂️ Atualizar rascunhos do editor manual: ${DRAFTS_PATH}`
  );
}

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const drafts = await readDrafts();
    const sorted = drafts
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    return NextResponse.json({ ok: true, items: sorted });
  } catch (err) {
    console.error("[admin/manual-post/drafts][GET]", err);
    return NextResponse.json({ error: err.message || "Erro ao carregar rascunhos." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { draft } = await request.json();
    if (!draft || (!draft.title && !draft.body)) {
      return NextResponse.json({ error: "Rascunho vazio." }, { status: 400 });
    }

    const drafts = await readDrafts();
    const nextDraft = normalizeDraft(draft);
    const existsIndex = drafts.findIndex((item) => item.id === nextDraft.id);

    if (existsIndex >= 0) {
      drafts[existsIndex] = nextDraft;
    } else {
      drafts.unshift(nextDraft);
    }

    await writeDrafts(drafts);

    return NextResponse.json({ ok: true, draftId: nextDraft.id });
  } catch (err) {
    console.error("[admin/manual-post/drafts][POST]", err);
    return NextResponse.json({ error: err.message || "Erro ao salvar rascunho." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { draftId } = await request.json();
    if (!draftId) {
      return NextResponse.json({ error: "Identificador do rascunho ausente." }, { status: 400 });
    }

    const drafts = await readDrafts();
    const filtered = drafts.filter((item) => item.id !== draftId);
    await writeDrafts(filtered);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/manual-post/drafts][DELETE]", err);
    return NextResponse.json({ error: err.message || "Erro ao remover rascunho." }, { status: 500 });
  }
}
