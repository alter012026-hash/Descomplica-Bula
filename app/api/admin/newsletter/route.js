import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { listSubscribers } from "../../../../lib/newsletter-service";
import { getFile } from "../../../../lib/github-commit";

const STATE_PATH = "data/newsletter-state.json";

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const subscribers = await listSubscribers();

    let state = { lastNotifiedSlug: null, lastNotifiedDate: null };
    try {
      const file = await getFile(STATE_PATH);
      if (file) state = JSON.parse(file.content);
    } catch {
      // Sem state ainda (nenhum envio disparado) — segue com o default.
    }

    return NextResponse.json({
      total: subscribers.total,
      active: subscribers.active,
      unsubscribed: subscribers.unsubscribed,
      contacts: subscribers.contacts
        .map((c) => ({
          email: c.email,
          firstName: c.first_name || null,
          createdAt: c.created_at || null,
          unsubscribed: !!c.unsubscribed,
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
      lastNotifiedSlug: state.lastNotifiedSlug,
      lastNotifiedDate: state.lastNotifiedDate,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
