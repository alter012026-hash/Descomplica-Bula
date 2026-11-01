import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { getAllPosts } from "../../../../lib/posts";
import { isVisitStoreConfigured } from "../../../../lib/visit-store";
import { getSessionDetail, isUuid, listSessions, readVisitorStats } from "../../../../lib/visitor-store";

export const dynamic = "force-dynamic";

const RANGES = new Set([7, 30, 90]);
const NO_STORE = { "Cache-Control": "no-store" };

function titles() {
  const map = {};
  for (const post of getAllPosts()) map[post.slug] = post.title;
  return map;
}

/**
 * GET /api/admin/visitors?range=30           → gráficos agregados
 * GET /api/admin/visitors?list=1&offset=0    → visitas recentes
 * GET /api/admin/visitors?sid=<uuid>         → uma visita em detalhe
 */
export async function GET(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isVisitStoreConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const params = new URL(request.url).searchParams;

  try {
    const sid = params.get("sid");
    if (sid) {
      if (!isUuid(sid)) return NextResponse.json({ error: "Visita inválida." }, { status: 400 });
      const detail = await getSessionDetail(sid);
      if (!detail) return NextResponse.json({ error: "Visita não encontrada (pode ter expirado)." }, { status: 404 });
      return NextResponse.json({ configured: true, titles: titles(), ...detail }, { headers: NO_STORE });
    }

    if (params.get("list") === "1") {
      const offset = Math.max(0, Number(params.get("offset")) || 0);
      const requestedLimit = Number(params.get("limit")) || 30;
      const limit = Math.max(1, Math.min(50, Math.floor(requestedLimit)));
      const data = await listSessions({ offset, limit });
      return NextResponse.json({ configured: true, titles: titles(), ...data }, { headers: NO_STORE });
    }

    const requested = Number(params.get("range"));
    const range = RANGES.has(requested) ? requested : 30;
    const stats = await readVisitorStats(range, { titleBySlug: titles() });
    return NextResponse.json({ configured: true, ...stats }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error.message }, { status: 500 });
  }
}
