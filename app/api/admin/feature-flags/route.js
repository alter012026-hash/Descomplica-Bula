import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import {
  getMedicationSummaryEnabled,
  setMedicationSummaryEnabled,
} from "../../../../lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const medicationSummaryEnabled = await getMedicationSummaryEnabled();
    return NextResponse.json({ medicationSummaryEnabled });
  } catch (error) {
    console.error("[admin/feature-flags][GET]", error.message);
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "O corpo da solicitação não é JSON válido." }, { status: 400 });
  }
  if (!data || typeof data !== "object" || typeof data.medicationSummaryEnabled !== "boolean") {
    return NextResponse.json({ error: "Informe se o resumo da bula deve ficar ativado." }, { status: 400 });
  }

  try {
    const medicationSummaryEnabled = await setMedicationSummaryEnabled(data.medicationSummaryEnabled);
    return NextResponse.json({ ok: true, medicationSummaryEnabled });
  } catch (error) {
    console.error("[admin/feature-flags][POST]", error.message);
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
