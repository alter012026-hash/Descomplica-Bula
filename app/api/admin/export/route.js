import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { getAllPosts } from "../../../../lib/posts";
import { dayKey, isVisitStoreConfigured, readStats } from "../../../../lib/visit-store";
import { readVisitorStats } from "../../../../lib/visitor-store";
import { buildTrafficReport, reportFileName } from "../../../../lib/traffic-report";
import { buildCsv, buildXlsx } from "../../../../lib/xlsx-lite";
import siteConfig from "../../../../site.config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // usa zlib e Buffer

const RANGES = new Set([7, 30, 90, 365]);
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/admin/export?range=30&format=xlsx   → relatório completo (várias abas)
 * GET /api/admin/export?range=30&format=csv    → só a série diária, CSV para Excel em português
 *
 * Só agregados: nenhum dado individual de visitante é exportado.
 */
export async function GET(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isVisitStoreConfigured()) {
    return NextResponse.json({ error: "O rastreio de visitas não está configurado (Redis)." }, { status: 400 });
  }

  const params = new URL(request.url).searchParams;
  const requested = Number(params.get("range"));
  const range = RANGES.has(requested) ? requested : 30;
  const format = params.get("format") === "csv" ? "csv" : "xlsx";

  try {
    const posts = getAllPosts();
    const titleBySlug = Object.fromEntries(posts.map((p) => [p.slug, p.title]));
    const generatedAt = new Date();

    // A parte "com cookies" guarda no máximo 90 dias; se falhar, o relatório sai sem ela.
    const [stats, visitors] = await Promise.all([
      readStats(range, { titleBySlug, full: true }),
      readVisitorStats(Math.min(range, 90), { titleBySlug, full: true }).catch(() => null),
    ]);

    const report = buildTrafficReport({
      stats, visitors, posts, range, generatedAt,
      siteName: siteConfig.name,
    });

    const today = dayKey(generatedAt);
    const headers = { "Cache-Control": "no-store" };

    if (format === "csv") {
      const body = buildCsv(report.dailyRows);
      return new Response(body, {
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${reportFileName("diario", range, today, "csv")}"` },
      });
    }

    const file = buildXlsx(report.sheets, { when: generatedAt, creator: siteConfig.name });
    return new Response(file, {
      headers: { ...headers, "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${reportFileName("trafego", range, today, "xlsx")}"` },
    });
  } catch (error) {
    return NextResponse.json({ error: `Não foi possível gerar o relatório: ${error.message}` }, { status: 500 });
  }
}
