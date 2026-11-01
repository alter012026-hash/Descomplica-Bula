import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { commitFile, getFile, triggerVercelDeploy } from "../../../../lib/github-commit";

const CONFIG_REPO_PATH = "site.config.js";

function parseAffiliates(raw) {
  // Extrai o bloco de affiliates do JS usando regex
  const match = raw.match(/affiliates\s*:\s*(\[[\s\S]*?\]),\s*\n\s*\/\//);
  if (!match) return [];
  try {
    // eslint-disable-next-line no-eval
    return eval(match[1]);
  } catch {
    return [];
  }
}

function serializeAffiliate(aff) {
  const keywords = (aff.keywords || []).map((k) => `"${k}"`).join(", ");
  return `    {\n      id: "${aff.id}",\n      name: "${aff.name}",\n      url: "${aff.url}",\n      keywords: [${keywords}],\n      cta: "${aff.cta}",\n    }`;
}

function updateAffiliatesInConfig(raw, affiliates) {
  const newBlock = `affiliates: [\n${affiliates.map(serializeAffiliate).join(",\n")},\n  ],`;
  return raw.replace(/affiliates\s*:\s*\[[\s\S]*?\],(\s*\n\s*\/\/)/, `${newBlock}$1`);
}

// ── Leitura e escrita: GitHub Contents API ──────────────────────────────
// Igual ao app/api/admin/quality/route.js: o filesystem da Vercel é
// somente leitura em produção, então qualquer fs.writeFileSync em
// site.config.js se perderia no próximo cold start / deploy e nunca
// chegaria ao Git. Em vez disso, lemos e comitamos direto no repositório
// via API do GitHub, e o push aciona o build normal da Vercel.

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const file = await getFile(CONFIG_REPO_PATH);
    if (!file) {
      return NextResponse.json({ error: "site.config.js não encontrado no repositório" }, { status: 404 });
    }
    const affiliates = parseAffiliates(file.content);
    return NextResponse.json({ affiliates });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { affiliates } = await request.json();
    if (!Array.isArray(affiliates)) {
      return NextResponse.json({ error: "affiliates precisa ser uma lista" }, { status: 400 });
    }

    for (const aff of affiliates) {
      if (!aff.id || !aff.name || !aff.url) {
        return NextResponse.json({ error: "Cada afiliado precisa de id, name e url" }, { status: 400 });
      }
    }

    const file = await getFile(CONFIG_REPO_PATH);
    if (!file) {
      return NextResponse.json({ error: "site.config.js não encontrado no repositório" }, { status: 404 });
    }

    const updated = updateAffiliatesInConfig(file.content, affiliates);

    // Sanity check: se o regex não encontrou o bloco, updated === file.content
    // e comitaríamos sem mudança nenhuma — melhor avisar do que fingir sucesso.
    if (updated === file.content) {
      return NextResponse.json(
        { error: "Não foi possível localizar o bloco affiliates em site.config.js para atualizar" },
        { status: 500 }
      );
    }

    await commitFile(
      CONFIG_REPO_PATH,
      updated,
      `chore: atualizar afiliados (${affiliates.length} cadastrado${affiliates.length !== 1 ? "s" : ""})`
    );

    const deploy = await triggerVercelDeploy();

    return NextResponse.json({
      ok: true,
      deployTriggered: deploy.triggered,
      note: "Commit enviado ao GitHub. Os afiliados serão atualizados no site após o próximo deploy da Vercel.",
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
