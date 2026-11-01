import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import healthTopics from "../../../../../lib/health-topics";
import siteConfig from "../../../../../site.config";
import { isOfficialUrl } from "../../../../../lib/source-validation";

export async function GET(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get("url") || "";
  if (!isOfficialUrl(sourceUrl, siteConfig.officialSourceDomains)) {
    return NextResponse.json(
      { error: "Informe uma URL HTTPS de domínio oficial permitido." },
      { status: 400 }
    );
  }

  const doubts = Object.values(healthTopics).flat();
  return NextResponse.json({ doubts, total: doubts.length });
}
