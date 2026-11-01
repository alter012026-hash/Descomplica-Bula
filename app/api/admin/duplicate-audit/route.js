import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { commitFile, getFile } from "../../../../lib/github-commit";

const REPORT_PATH = ".topic-overlap.json";

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id, decision, reason } = await request.json();
    if (!id || !["false_positive", "pending"].includes(decision)) {
      return NextResponse.json({ error: "Decisão ou identificador inválido." }, { status: 400 });
    }
    if (decision === "false_positive" && !String(reason || "").trim()) {
      return NextResponse.json({ error: "Informe o motivo da decisão." }, { status: 400 });
    }

    const file = await getFile(REPORT_PATH);
    if (!file) return NextResponse.json({ error: "Relatório de auditoria ainda não foi gerado." }, { status: 404 });
    const report = JSON.parse(file.content || "{}");
    const pair = (report.pairs || []).find((item) => item.id === id);
    if (!pair) return NextResponse.json({ error: "Par candidato não encontrado." }, { status: 404 });

    pair.decision = decision;
    pair.reviewReason = decision === "false_positive" ? String(reason).trim().slice(0, 500) : "";
    pair.reviewedAt = new Date().toISOString();
    report.pendingCount = report.pairs.filter((item) => item.decision === "pending").length;
    report.dismissedCount = report.pairs.filter((item) => item.decision === "false_positive").length;

    await commitFile(
      REPORT_PATH,
      `${JSON.stringify(report, null, 2)}\n`,
      `audit: ${decision === "false_positive" ? "liberar falso positivo" : "reabrir candidato"} ${id}`
    );
    return NextResponse.json({ ok: true, decision: pair.decision });
  } catch (error) {
    console.error("[admin/duplicate-audit]", error);
    return NextResponse.json({ error: error.message || "Falha ao registrar revisão." }, { status: 500 });
  }
}
