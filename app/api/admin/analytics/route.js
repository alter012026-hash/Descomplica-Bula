import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { getAllPosts } from "../../../../lib/posts";
import { isVisitStoreConfigured, readLive, readStats } from "../../../../lib/visit-store";

export const dynamic = "force-dynamic";

const RANGES = new Set([7, 30, 90, 365]);

export async function GET(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isVisitStoreConfigured()) {
    return NextResponse.json({ configured: false });
  }

  // Consulta leve só do "online agora" (1 comando) — usada no polling do painel.
  if (new URL(request.url).searchParams.get("live") === "1") {
    try {
      return NextResponse.json({ live: await readLive() }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const requested = Number(new URL(request.url).searchParams.get("range"));
  const range = RANGES.has(requested) ? requested : 30;

  try {
    const titleBySlug = {};
    for (const post of getAllPosts()) titleBySlug[post.slug] = post.title;
    const stats = await readStats(range, { titleBySlug });
    return NextResponse.json({ configured: true, ...stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error.message }, { status: 500 });
  }
}
