import { NextResponse } from "next/server";
import { getMedicationSummaryEnabled } from "../../../../lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const enabled = await getMedicationSummaryEnabled();
    return NextResponse.json(
      { enabled },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[medication-summary/status][GET]", error.message);
    return NextResponse.json({ error: "Resumo da bula indisponível no momento." }, { status: 503 });
  }
}
