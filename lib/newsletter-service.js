/**
 * lib/newsletter-service.js
 *
 * Newsletter diária de novos posts, usando Resend Contacts + Segments +
 * Broadcasts.
 *
 * IMPORTANTE — histórico do bug corrigido aqui: a versão anterior deste
 * arquivo tinha um comentário dizendo que já usava a "New Contacts
 * Experience" (Contacts globais, sem audience_id), mas o CÓDIGO continuava
 * chamando o endpoint antigo `/audiences/{id}/contacts`. Ou seja, o
 * comentário documentava uma migração que nunca foi feita de fato — e
 * `addSubscriber` dependia de `getAudienceId()` encontrar uma Audience
 * clássica (`GET /audiences`), que em contas criadas/migradas depois de
 * nov/2025 pode simplesmente não existir (a Resend renomeou "Audiences"
 * para "Segments" e recomenda não usar mais o endpoint de Audiences).
 * Resultado: `getAudienceId()` lançava erro, `addSubscriber()` explodia,
 * e a inscrição na newsletter falhava sempre — mesmo com RESEND_API_KEY
 * válida.
 *
 * Modelo atual (confirmado na documentação oficial em jul/2026):
 *  - Contacts são entidades GLOBAIS na conta, identificadas pelo e-mail.
 *    Criados via `POST /contacts`, sem precisar de nenhum ID de
 *    audience/segment.
 *  - "Audiences" foi renomeado para "Segments". Um Contact só recebe um
 *    Broadcast enviado para um Segment se ele estiver EXPLICITAMENTE
 *    associado àquele Segment (`POST /contacts/{email}/segments/{id}`).
 *    Criar o Contact global sozinho NÃO é suficiente para ele receber a
 *    newsletter diária.
 *  - `POST /broadcasts` agora exige `segment_id` (não mais `audience_id`,
 *    que a Resend marca como deprecated).
 *
 * Por quê Resend Contacts e não um banco de dados próprio:
 * O filesystem da Vercel em produção é somente leitura (ver comentário em
 * lib/github-commit.js), então não dá pra guardar a lista de inscritos em
 * um arquivo local. O projeto já usa Resend para e-mail transacional
 * (lib/email-service.js), e o Resend guarda os Contacts pra você (grátis
 * até 1.000), com unsubscribe automático. Isso evita precisar de
 * Postgres/Supabase só para guardar e-mails.
 *
 * Fluxo:
 *  1. Visitante se inscreve no site → addSubscriber():
 *     a) cria o Contact global (POST /contacts)
 *     b) garante que existe um Segment "Newsletter" na conta (cria na
 *        primeira vez, se necessário) e associa o Contact a ele — é essa
 *        associação que faz o Contact receber os Broadcasts diários.
 *  2. Todo dia, um GitHub Action chama /api/newsletter/send-daily, que:
 *     a) verifica se algum post foi publicado nas últimas 24h
 *     b) se sim, chama sendDailyBroadcast() → cria e envia um Broadcast
 *        para o Segment (todos os Contacts associados, não descadastrados)
 *     c) se não, não faz nada (pula o dia)
 *
 * Variáveis de ambiente necessárias:
 *   RESEND_API_KEY      — já usada por lib/email-service.js
 *   RESEND_FROM_EMAIL   — já usada por lib/email-service.js
 *   NEWSLETTER_CRON_SECRET — segredo compartilhado com o GitHub Action,
 *                         pra evitar que qualquer pessoa dispare o envio
 *                         batendo na rota publicamente.
 *   RESEND_SEGMENT_ID (opcional) — ID do Segment a usar. Se não definida,
 *                         o código tenta (nessa ordem): 1) a variável
 *                         antiga RESEND_AUDIENCE_ID, caso ainda esteja
 *                         configurada — IDs de Audience antigos continuam
 *                         funcionando como segment_id após a migração da
 *                         Resend; 2) o primeiro Segment existente na
 *                         conta; 3) cria automaticamente um Segment novo
 *                         chamado "Newsletter <nome do site>" na primeira
 *                         inscrição.
 */

const RESEND_API = "https://api.resend.com";
const { getEditorialTitleIssue } = require("./article-title.cjs");

function buildNewsletterSubject(posts, { test = false } = {}) {
  if (!posts?.length) throw new Error("Não é possível criar um assunto sem artigos.");

  const invalidPost = posts.find((post) => getEditorialTitleIssue(post.title));
  if (invalidPost) {
    throw new Error(
      `Envio cancelado: o artigo "${invalidPost.title}" precisa de um título claro antes de entrar na newsletter.`
    );
  }

  const firstTitle = String(posts[0].title).trim();
  const prefix = test ? "[TESTE] " : "";
  const lead = posts.length === 1 ? "📬 " : `📬 ${posts.length} novidades: `;
  const maxLength = 72;
  const words = `${lead}${firstTitle}`.split(/\s+/);
  let subject = "";

  for (const word of words) {
    const next = subject ? `${subject} ${word}` : word;
    if (Array.from(`${prefix}${next}`).length > maxLength) break;
    subject = next;
  }

  if (!subject) {
    subject = `${Array.from(`${lead}${firstTitle}`).slice(0, maxLength - 1).join("").trimEnd()}…`;
  } else if (`${prefix}${subject}` !== `${prefix}${lead}${firstTitle}`) {
    subject = `${subject}…`;
  }

  return `${prefix}${subject}`;
}


/**
 * Decide quais posts entram no próximo envio da newsletter.
 *
 * Regras (corrigem o travamento de out/2026, em que o state ficou parado em
 * 27/07 e o envio passou a tentar avisar dezenas de posts de uma vez):
 *  1. Só entram posts AINDA NÃO avisados (mais novos que `lastNotifiedSlug`).
 *  2. E somente os publicados dentro da janela de tolerância (48h por padrão),
 *     para nunca disparar um e-mail gigante com posts antigos.
 *  3. Limite de `maxPosts` por e-mail.
 *  4. Posts com título editorialmente inválido são
 *     PULADOS — antes, um único título ruim derrubava o envio inteiro (HTTP
 *     500 todo dia) e o state nunca avançava.
 *
 * `posts` deve estar ordenado do mais recente para o mais antigo.
 * Retorna { toSend, skipped, latestSlug } — `latestSlug` é o slug que deve ser
 * gravado no state (o mais recente já "resolvido", enviado ou pulado).
 */
function selectPostsToNotify({
  posts,
  lastNotifiedSlug = null,
  now = Date.now(),
  windowMs = 48 * 60 * 60 * 1000,
  maxPosts = 5,
} = {}) {
  const list = Array.isArray(posts) ? posts : [];
  const lastIndex = lastNotifiedSlug ? list.findIndex((p) => p.slug === lastNotifiedSlug) : -1;
  const unseen = lastIndex === -1 ? list : list.slice(0, lastIndex);

  const inWindow = unseen.filter((p) => {
    const d = p.date ? new Date(p.date).getTime() : 0;
    return d && d <= now && now - d < windowMs;
  });

  const skipped = [];
  const valid = [];
  for (const post of inWindow) {
    const issue = getEditorialTitleIssue(post.title);
    if (issue) skipped.push({ slug: post.slug, title: post.title, issue });
    else valid.push(post);
  }

  return {
    toSend: valid.slice(0, maxPosts),
    skipped,
    // Tudo o que é mais novo que o state já foi avaliado (enviado, pulado por
    // título ou fora da janela), então o state avança para o post mais recente.
    latestSlug: unseen.length ? unseen[0].slug : lastNotifiedSlug,
  };
}

function getApiKey() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY ausente — configure essa variável de ambiente (veja .env.example)."
    );

  }
  return apiKey;
}

function getFrom() {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Descomplica Bula <onboarding@resend.dev>"
  );
}

async function resendRequest(path, options = {}) {
  const apiKey = getApiKey();
  const res = await fetch(`${RESEND_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.message || `HTTP ${res.status}`;
    const err = new Error(`Resend API error: ${message}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Adiciona um e-mail como Contact global na conta do Resend (POST
 * /contacts — não precisa de nenhum audience/segment_id) e o associa ao
 * Segment da newsletter, para que ele passe a receber os Broadcasts
 * diários.
 *
 * Idempotente: se o contato já existir, seguimos em frente e garantimos
 * a associação ao Segment mesmo assim (cobre o caso de alguém que já
 * era Contact por outro motivo, ou que se descadastrou e está se
 * inscrevendo de novo).
 */
async function addSubscriber({ email, firstName }) {
  if (!isValidEmail(email)) {
    const err = new Error("E-mail inválido.");
    err.status = 400;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1) Cria o Contact global. 409 / "already exists" não é erro — apenas
  //    segue para garantir a associação ao Segment abaixo.
  try {
    await resendRequest(`/contacts`, {
      method: "POST",
      body: JSON.stringify({
        email: normalizedEmail,
        first_name: firstName || undefined,
        unsubscribed: false,
      }),
    });
  } catch (err) {
    const alreadyExists = err.status === 409 || /already exists/i.test(err.body?.message || "");
    if (!alreadyExists) throw err;
  }

  // 2) Associa o Contact ao Segment da newsletter — é isso que faz ele
  //    receber os Broadcasts diários (Contact global sozinho não recebe
  //    nada). Se essa etapa falhar, NÃO derruba a inscrição do visitante
  //    (o Contact já foi criado com sucesso) — só loga para diagnóstico,
  //    já que sem isso a pessoa fica inscrita "pela metade" (existe como
  //    Contact, mas não vai receber e-mail).
  try {
    const segmentId = await getSegmentId();
    await resendRequest(
      `/contacts/${encodeURIComponent(normalizedEmail)}/segments/${segmentId}`,
      { method: "POST" }
    );
  } catch (err) {
    console.error(
      `[newsletter] Contact ${normalizedEmail} criado, mas falhou ao associar ao Segment:`,
      err.message
    );
  }

  return { ok: true };
}

/** Remove (descadastra) um contato — DELETE /contacts/{email} é global,
 *  remove o Contact da conta inteira (todos os Segments junto). */
async function removeSubscriber({ email }) {
  return resendRequest(`/contacts/${encodeURIComponent(email.trim().toLowerCase())}`, {
    method: "DELETE",
  });
}

/** Lista os Contacts do Segment da newsletter (usado pelo admin para
 *  mostrar o total). Escopado ao Segment — não a todos os Contacts da
 *  conta — para não misturar com Contacts criados por outro motivo. */
async function listSubscribers() {
  const segmentId = await getSegmentId();
  const data = await resendRequest(`/segments/${segmentId}/contacts`, { method: "GET" });
  const contacts = data?.data || [];
  const active = contacts.filter((c) => !c.unsubscribed);
  return {
    total: contacts.length,
    active: active.length,
    unsubscribed: contacts.length - active.length,
    contacts,
  };
}

/**
 * Monta o HTML do e-mail diário com os posts novos.
 * Estilo inline, igual ao padrão de lib/email-service.js, para renderizar
 * bem em clientes de e-mail (Gmail, Outlook etc.).
 */
function buildDailyEmailHtml({ posts, siteUrl, siteName }) {
  const postsHtml = posts
    .map(
      (post) => `
        <tr>
          <td style="padding:0 32px 20px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:12px;border:1px solid #E5E7EB;">
              <tr>
                <td style="padding:20px 22px;">
                  <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;color:#B4232C;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(post.category || "Medicamentos")}</p>
                  <p style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#111827;line-height:1.35;">${escapeHtml(post.title)}</p>
                  <p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;color:#4B5563;">${escapeHtml(post.excerpt || "")}</p>
                  <a href="${siteUrl}/blog/${post.slug}" style="display:inline-block;background:#1B3A6B;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 20px;border-radius:7px;">Ler artigo →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join("");

  const headline =
    posts.length === 1
      ? "Novo artigo no ar! 📬"
      : `${posts.length} novos artigos no ar! 📬`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1B3A6B,#2C5396);padding:32px 32px 28px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:rgba(255,255,255,0.75);font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(siteName)}</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#fff;">${headline}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 4px 32px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#4B5563;">
                Confira o que saiu de novo no blog ${escapeHtml(siteName)}:
              </p>
            </td>
          </tr>
          ${postsHtml}
          <tr>
            <td style="padding:8px 32px 32px 32px;text-align:center;">
              <a href="${siteUrl}/blog" style="color:#1B3A6B;text-decoration:none;font-weight:600;font-size:13px;">Ver todos os artigos →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                Você recebeu este e-mail porque se inscreveu na newsletter de ${escapeHtml(siteName)}.<br/>
                {{{RESEND_UNSUBSCRIBE_URL}}}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Busca (ou cria) o segment_id da newsletter. A API do Resend exige que
 * todo Broadcast e toda associação Contact↔Segment aponte para um
 * segment_id específico.
 *
 * Ordem de prioridade:
 *  1. RESEND_SEGMENT_ID (variável de ambiente explícita)
 *  2. RESEND_AUDIENCE_ID (variável antiga — IDs de Audience continuam
 *     funcionando como segment_id após a migração da Resend, então não
 *     obriga o Gabriel a reconfigurar nada se já tinha essa variável)
 *  3. O primeiro Segment já existente na conta (GET /segments)
 *  4. Cria um Segment novo chamado "Newsletter <nome do site>" na
 *     primeira inscrição — cobre contas novas, sem nenhum Segment ainda.
 */
let cachedSegmentId = null;

async function getSegmentId() {
  if (cachedSegmentId) return cachedSegmentId;

  const envId = process.env.RESEND_SEGMENT_ID?.trim() || process.env.RESEND_AUDIENCE_ID?.trim();
  if (envId) {
    // IMPORTANTE: não confiar cegamente no ID da env var. Se veio de uma
    // RESEND_AUDIENCE_ID antiga, o ID pode não existir mais na conta
    // (ex: foi apagado, ou a conta nunca teve uma Audience clássica) — e
    // aí toda chamada que usa esse ID (associar contato, enviar
    // broadcast) falha com "Audience not found". Por isso confirmamos
    // com um GET antes de cachear.
    try {
      await resendRequest(`/segments/${envId}`, { method: "GET" });
      cachedSegmentId = envId;
      return envId;
    } catch (err) {
      console.error(
        `[newsletter] RESEND_SEGMENT_ID/RESEND_AUDIENCE_ID (${envId}) não é um Segment válido ` +
        `(${err.message}) — ignorando e caindo para descoberta automática. Considere remover ` +
        `essa variável de ambiente ou atualizá-la com um ID de Segment válido.`
      );
    }
  }

  try {
    const data = await resendRequest("/segments", { method: "GET" });
    const segments = data?.data || [];
    if (segments.length > 0) {
      cachedSegmentId = segments[0].id;
      return cachedSegmentId;
    }
  } catch (err) {
    console.error("Erro ao buscar segments do Resend:", err.message);
  }

  // Nenhum Segment existe ainda — cria um automaticamente. Evita que a
  // primeira inscrição do site quebre só porque ninguém criou o Segment
  // manualmente no painel do Resend antes.
  const siteName = require("../site.config").name || "Descomplica Bula";
  const created = await resendRequest("/segments", {
    method: "POST",
    body: JSON.stringify({ name: `Newsletter ${siteName}` }),
  });
  cachedSegmentId = created.id;
  return cachedSegmentId;
}

/**
 * Cria e envia (send: true) um Broadcast para todos os Contacts ativos da
 * conta, avisando sobre os posts novos. Retorna o resultado da API do Resend.
 *
 * NOTA: A API do Resend exige segment_id no broadcast (audience_id foi
 * renomeado/deprecated). Configure RESEND_SEGMENT_ID no Vercel/GitHub
 * Actions com o ID do Segment (visível em Contacts → Segments no painel
 * do Resend), ou deixe em branco para usar o mesmo Segment criado
 * automaticamente por addSubscriber().
 */
async function sendDailyBroadcast({ posts, siteUrl, siteName }) {
  if (!posts?.length) {
    throw new Error("sendDailyBroadcast chamado sem posts.");
  }

  const from = getFrom();
  const subject = buildNewsletterSubject(posts);

  const html = buildDailyEmailHtml({ posts, siteUrl, siteName });

  const segmentId = await getSegmentId();

  const data = await resendRequest("/broadcasts", {
    method: "POST",
    body: JSON.stringify({
      from,
      subject,
      html,
      segment_id: segmentId,
      send: true,
    }),
  });

  return data;
}

module.exports = {
  addSubscriber,
  removeSubscriber,
  listSubscribers,
  sendDailyBroadcast,
  buildNewsletterSubject,
  buildDailyEmailHtml,
  selectPostsToNotify,
  isValidEmail,
};