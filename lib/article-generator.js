/**
 * lib/article-generator.js
 *
 * Núcleo de geração de artigos, extraído de scripts/generate-article.js.
 *
 * Por quê esse arquivo existe:
 *  - scripts/generate-article.js é um CLI (lê argv, chama process.exit, escreve
 *    direto em posts/*.md no disco). Isso funciona em VPS/local/GitHub Actions,
 *    mas NÃO funciona dentro de uma function serverless da Vercel:
 *      1. child_process.exec("node scripts/...") não acha o arquivo em /var/task
 *      2. mesmo chamando a função direto (sem exec), o filesystem da Vercel é
 *         read-only em produção — fs.writeFileSync falharia ou, na melhor das
 *         hipóteses, escreveria em /tmp e se perderia no próximo cold start.
 *
 * Este módulo contém SÓ a parte que não depende de disco: montar o prompt,
 * chamar os providers de IA com fallback, e validar a qualidade do resultado.
 * Quem decide ONDE persistir o resultado é o caller:
 *   - scripts/generate-article.js (CLI)        → grava em posts/*.md localmente
 *   - app/api/admin/quality/route.js (serverless) → commita via GitHub API
 */

const qe = require("./quality-engine.js");
const { getEditorialTitleIssue } = require("./article-title.cjs");
const { isOfficialUrl } = require("./source-validation.js");
const { containsNumericDose, normalizeText } = require("./medical-safety.js");

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 80);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeForYaml(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ─── Prompt ───────────────────────────────────────────────────────────
function buildPrompt({ topic, generation, previousContent, newsFact }, retryHint) {
  const { tone, audienceLevel, minWords } = generation || {};
  const referenceDate = todayISO();

  // Quando o tópico nasceu de uma notícia real (ver lib/news-scraper.js),
  // isso é o que garante autenticidade: o modelo recebe o fato concreto
  // (fonte, data, título original) e é instruído a construir o artigo em
  // cima dele, em vez de um pano de fundo genérico.
  const newsFactBlock = newsFact
    ? newsFact.consolidated
      ? `
FATOS REAIS PARA BASEAR O ARTIGO (obrigatório consolidar em UM único artigo coeso):
Nos últimos dias, várias notícias sobre o MESMO assunto/órgão foram publicadas,
cada uma cobrindo um ângulo diferente do mesmo caso em desenvolvimento. NÃO
escreva sobre cada uma isoladamente — sintetize tudo num único artigo, como um
raio-x da situação: o que já aconteceu, o que mudou, o que ainda falta definir.

${newsFact.items
  .map((it, i) => {
    // fullText (matéria original extraída — ver lib/article-extractor.js) dá
    // muito mais substância que o snippet do RSS, que às vezes é vazio
    // (caso do GDELT) ou só repete o título. Usa o que tiver disponível,
    // com o corpo completo quando existir.
    const body = it.fullText
      ? `Trecho da matéria original: ${it.fullText.slice(0, 1500)}`
      : `Resumo: ${(it.snippet || "").slice(0, 300)}`;
    return `${i + 1}. Manchete: "${it.title}" — Fonte: ${it.source || "veículo de notícias"} (${it.pubDate || "recente"}). ${body}`;
  })
  .join("\n\n")}

INSTRUÇÕES SOBRE ESTES FATOS:
- Trate apenas como informação publicada pelo órgão oficial e confirme se o comunicado continua vigente.
- NÃO invente princípio ativo, lote, risco, contraindicação, efeito, dose ou orientação que não conste da fonte oficial.
- Resuma o que o comunicado informa e o que o leitor deve conferir na página oficial, sem extrapolar.
- Ao final, inclua "## Fontes oficiais" com os links oficiais fornecidos abaixo:
${newsFact.items.map((it) => `  - [${it.source || "veículo de notícias"}](${it.link || ""})`).join("\n")}
`
      : `
FATO REAL PARA BASEAR O ARTIGO (obrigatório usar como núcleo do texto):
- Manchete original: "${newsFact.title}"
- Fonte: ${newsFact.source || "veículo de notícias"}
- Data da notícia: ${newsFact.pubDate || "recente"}
${
  newsFact.fullText
    ? `- Trecho da matéria original (use como base principal do artigo): ${newsFact.fullText.slice(0, 2500)}`
    : `- Resumo: ${(newsFact.snippet || "").slice(0, 500)}`
}

INSTRUÇÕES SOBRE ESTE FATO:
- Trate como um comunicado oficial que pode ter sido atualizado; não extrapole o que está escrito.
- NÃO invente lote, princípio ativo, risco, contraindicação, efeito, dose ou recomendação.
- Inclua o link HTTPS oficial abaixo na seção "## Fontes oficiais".
- Use informação complementar somente se também vier de uma fonte oficial permitida.
`
    : "";

  // Quando é uma REGENERAÇÃO (post já existe, foi marcado como raso/genérico),
  // o tópico sozinho não basta como instrução: enviar o mesmo "topic" de antes
  // pro modelo, sem mais contexto, tende a produzir um texto quase idêntico ao
  // anterior — o modelo não tem como saber que precisa ser diferente do que já
  // existe. Por isso, quando há previousContent, ele entra no prompt como
  // referência explícita do que JÁ FOI publicado e NÃO deve ser repetido.
  const antiRepeticaoBlock = previousContent
    ? `
ATENÇÃO — ISTO É UMA REGENERAÇÃO, NÃO UM ARTIGO NOVO:
O texto abaixo já foi publicado sobre este mesmo tema e foi marcado como
raso/genérico/repetitivo. Sua tarefa é escrever uma versão SUBSTANCIALMENTE
DIFERENTE — não apenas reescrever as mesmas frases com outras palavras.

VERSÃO ANTERIOR (NÃO REPITA esta estrutura, estes exemplos, nem este ângulo):
"""
${previousContent.slice(0, 3000)}
"""

Para ser de fato diferente:
- Escolha um ÂNGULO distinto (ex.: se a versão anterior era um guia geral,
  foque em uma dúvida específica, uma comparação ou um erro comum)
- Use exemplos verificáveis e fontes oficiais diferentes quando apropriado
- Reorganize a estrutura das seções — não siga a mesma ordem de tópicos
`
    : "";

  return `
Você é redator de conteúdo informativo sobre medicamentos para o site Descomplica Bula.

Data de referência: ${referenceDate}
Tema: "${topic}"
${antiRepeticaoBlock}
${newsFactBlock}

SEGURANÇA E PRECISÃO (obrigatório):
- Escreva em linguagem simples, sem diagnosticar, prescrever ou recomendar tratamento individual.
- Não forneça doses numéricas, quantidades, horários, duração de tratamento ou instruções de ajuste/suspensão.
- Não prometa cura, não incentive automedicação e não promova marcas ou compra de medicamentos.
- Não invente efeitos, contraindicações, interações, recomendações ou estatísticas. Se não houver fonte oficial que sustente uma afirmação, omita-a.
- Diferencie informação geral de orientação profissional. Avise que a bula oficial vigente e o profissional de saúde prevalecem.
- Inclua uma seção "## Quando procurar ajuda" com orientação de urgência, SAMU 192 e Disque-Intoxicação 0800 722 6001; mencione CVV 188 se houver contexto de sofrimento emocional.
- Termine com aviso claro de que o conteúdo é informativo e não substitui orientação profissional.
- Inclua "## Fontes oficiais" com link HTTPS para https://consultas.anvisa.gov.br/#/bulario/ e/ou para o órgão oficial pertinente. Nunca invente URLs.
- Se não souber localizar uma fonte oficial específica, deixe explícito que a informação precisa ser confirmada; não use sites comerciais como fonte.

QUALIDADE E FORMATO:
- Mínimo de ${minWords || 900} palavras apenas quando houver informação verificável suficiente; não aumente o texto com conteúdo especulativo.
- Tom: ${tone || "claro, acolhedor, preciso e cauteloso"}.
- Público: ${audienceLevel || "público geral"}.
- Markdown válido, título claro na primeira linha começando com "#", introdução e subtítulos úteis.
- Evite jargões ou explique-os. Não use clickbait, medo ou promessas.
- PROIBIDO frases de preenchimento como "é importante destacar que", "vale ressaltar que",
  "nos dias atuais" ou "podemos concluir que".

${retryHint ? `\nATENÇÃO: a versão anterior foi reprovada por: ${retryHint}. Corrija todas as falhas sem inventar informação.\n` : ""}

RETORNE APENAS O CONTEÚDO EM MARKDOWN.
`;
}

// ─── Prompt da curiosidade (card "💡 Curiosidade") ─────────────────────
// Por quê isso existe: a imagem hero era gerada via Picsum com seed do slug,
// ou seja, uma foto aleatória sem nenhuma relação com o artigo. Sem orçamento
// para Pexels/Unsplash/Pixabay API, e sem um banco de imagens viável que
// escale para qualquer tema gerado automaticamente, a curiosidade textual
// (gerada 1x no momento da criação/regeneração, não em runtime) é a forma
// mais confiável de agregar valor no espaço onde a imagem estava.
function buildCuriosityPrompt(body) {
  const excerptOfBody = (body || "").slice(0, 12000);

  return `Você vai ler um artigo informativo sobre medicamentos. Sua tarefa é escrever APENAS UMA nota "Você sabia?" que ajude o leitor a entender melhor o tema central do artigo.

REGRAS DE VERACIDADE (mais importantes que qualquer outra):
- Use somente fatos que estejam no próprio artigo ou apoiados por fonte oficial citada.
- NÃO cite anos, datas históricas, porcentagens, estatísticas, nomes de pessoas ou "pioneirismos" que não estejam no artigo. Na dúvida, não cite.
- Não invente curiosidades, números ou recomendações médicas; se não houver fato seguro, responda exatamente: NENHUMA.
- Se não houver nada seguro para dizer, responda exatamente: NENHUMA

FORMATO: entre 40 e 80 palavras, português brasileiro, tom educativo, um único parágrafo corrido, sem markdown, listas, aspas ou títulos. Retorne apenas o texto, nada mais.

Artigo:
"""
${excerptOfBody}
"""`;
}

// Trava anti-alucinação: toda data/ano/porcentagem da curiosidade precisa
// aparecer no corpo do artigo. Se a IA "trouxe" um número de fora, descarta.
function curiosityIsGrounded(curiosity, body = "") {
  const nums = String(curiosity).match(/\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?%?/g) || [];
  const haystack = String(body);
  return nums.every((n) => haystack.includes(n));
}

// Limpeza defensiva da resposta da IA: remove markdown residual, aspas,
// quebras de linha extras e qualquer preâmbulo tipo "Curiosidade:" que o
// modelo às vezes insere mesmo sendo instruído a não fazer isso.
function cleanCuriosityText(text = "") {
  return qe
    .stripReasoningLeakage(text)
    .replace(/^(curiosidade|você sabia)[:\-—]?\s*/i, "")
    .replace(/[*_#`]/g, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Gera a curiosidade de um artigo já validado. Roda 1x por criação/
 * regeneração (nunca em runtime/por visita), usando a mesma cadeia de
 * fallback (Groq → OpenRouter → Gemini) já usada para o artigo.
 *
 * Falha de forma "silenciosa": se nenhum provider responder ou o texto
 * vier fora do esperado, retorna null em vez de derrubar a geração do
 * artigo inteiro — o card de curiosidade simplesmente não aparece nesse
 * post.
 *
 * @param {string} body - corpo (markdown) do artigo já gerado
 * @returns {Promise<string|null>}
 */
async function generateCuriosity(body) {
  if (!body || body.trim().length < 50) return null;

  try {
    const prompt = buildCuriosityPrompt(body);
    const { text } = await generateWithFallback(prompt);
    const clean = cleanCuriosityText(text);

    const wordCount = qe.countWords(clean);
    if (!clean || wordCount < 15) return null; // resposta vazia ou inútil (inclui "NENHUMA")
    if (!curiosityIsGrounded(clean, body)) return null; // números/anos que não estão no artigo

    if (wordCount <= 90) return clean;

    // Resposta passou do limite: corta na última frase completa que ainda
    // cabe, em vez de truncar no meio de uma palavra/frase.
    const sentences = clean.split(/(?<=[.!?])\s+/);
    let acc = "";
    for (const s of sentences) {
      const candidate = (acc ? acc + " " : "") + s;
      if (qe.countWords(candidate) > 85) break;
      acc = candidate;
    }
    return acc || clean.split(/\s+/).slice(0, 80).join(" ") + "...";
  } catch {
    return null; // mesma filosofia: curiosidade é um extra, nunca bloqueia o post
  }
}

// ─── Prompt do "spoiler" do artigo (o que o leitor vai encontrar) ──────
// Por quê isso existe: quem chega no artigo (via busca ou rede social)
// precisa decidir em segundos se vale a pena ler até o fim. Em vez de só
// confiar no excerpt (1 frase genérica), este bloco lista de forma objetiva
// o que a pessoa vai LEVAR do texto — funciona como um "resumo prévio" que
// ajuda a filtrar quem não é o público daquele conteúdo específico, em vez
// de fazer a pessoa rolar o artigo inteiro pra descobrir que não era o que
// procurava.
function buildTakeawaysPrompt(body) {
  const excerptOfBody = (body || "").slice(0, 12000);

  return `Você vai ler um artigo informativo sobre medicamentos. Sua tarefa é listar exatamente 4 tópicos curtos e concretos do que o leitor vai encontrar neste artigo.

REGRAS:
- Exatamente 4 linhas, cada uma começando com "- "
- Cada linha com no máximo 12 palavras
- Específico ao conteúdo real do artigo abaixo (cite o dado, o nome, o passo concreto — não escreva algo genérico que serviria pra qualquer artigo do nicho)
- Sem numeração, sem markdown além do traço inicial, sem repetir a mesma ideia em duas linhas
- Português brasileiro, tom direto

Artigo:
"""
${excerptOfBody}
"""

Retorne APENAS as 4 linhas, nada mais.`;
}

// Faz o parsing defensivo da resposta: aceita variações de bullet (-, *, •,
// números) e descarta linhas vazias/curtas demais pra serem um tópico real.
function parseTakeaways(text = "") {
  const clean = qe.stripReasoningLeakage(text);

  return clean
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^[\s\-*•\d.)]+/, "")
        .replace(/[*_`]/g, "")
        .trim()
    )
    .filter((line) => line.length >= 8)
    .slice(0, 4);
}

/**
 * Gera os 4 tópicos do "spoiler" do artigo (o que o leitor vai encontrar).
 * Mesma filosofia de degradação da curiosidade: roda 1x na criação/
 * regeneração, nunca em runtime, e falha silenciosamente (retorna [])
 * em vez de bloquear o post — o card simplesmente não aparece.
 *
 * @param {string} body - corpo (markdown) do artigo já gerado
 * @returns {Promise<string[]>}
 */
async function generateTakeaways(body) {
  if (!body || body.trim().length < 50) return [];

  try {
    const prompt = buildTakeawaysPrompt(body);
    const { text } = await generateWithFallback(prompt);
    const items = parseTakeaways(text);
    return items.length >= 2 ? items : []; // menos de 2 não vale a pena mostrar
  } catch {
    return [];
  }
}


async function callGrokModel(prompt, model) {
  const key = process.env.GROK_API_KEY?.trim();
  if (!key) throw new Error("GROK_API_KEY ausente");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`Grok(${model}) HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Grok(${model}) retornou vazio`);
  return content;
}

async function callGrok(prompt) {
  const models = ["grok-4-0709", "grok-3-mini-fast", "grok-3-fast-beta"];
  let lastErr;
  for (const model of models) {
    try {
      return await callGrokModel(prompt, model);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Modelos com suas respectivas configs — cada modelo na Groq aceita um
// conjunto de parâmetros ligeiramente diferente:
//  - openai/gpt-oss-120b: usa `max_completion_tokens` (não `max_tokens`) e
//    aceita `reasoning_effort` (low/medium/high) pra controlar o quanto o
//    modelo "pensa" antes de responder — "medium" é um bom equilíbrio
//    entre qualidade e velocidade/custo pra gerar artigo inteiro.
//  - llama-3.3-70b-versatile: modelo mais simples, sem reasoning_effort,
//    usa o `max_tokens` tradicional. Fica como fallback se o gpt-oss-120b
//    falhar ou estourar rate limit.
const GROQ_MODELS = [
  {
    model: "openai/gpt-oss-120b",
    params: {
      temperature: 1,
      max_completion_tokens: 8192,
      top_p: 1,
      reasoning_effort: "medium",
    },
  },
  {
    model: "llama-3.3-70b-versatile",
    params: {
      temperature: 0.7,
      max_tokens: 4096,
    },
  },
];

async function callGroqModel(prompt, model, extraParams = {}) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY ausente");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...extraParams,
    }),
  });

  if (!res.ok) throw new Error(`Groq(${model}) HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Groq(${model}) retornou vazio`);
  return content;
}

async function callGroq(prompt) {
  let lastErr;
  for (const { model, params } of GROQ_MODELS) {
    try {
      return await callGroqModel(prompt, model, params);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Cerebras: tier gratuito com 1 milhão de tokens/dia (de longe o maior limite
// diário entre os fallbacks gratuitos), API compatível com o formato OpenAI.
// Contexto do tier gratuito é limitado (~8K tokens), mas um artigo de
// 900-1200 palavras + prompt fica bem dentro disso. Lista de modelos com
// fallback interno, igual ao padrão usado em callGroq — o catálogo gratuito
// da Cerebras muda de tempos em tempos, então se um modelo for descontinuado
// os outros da lista seguram a geração sem precisar mexer no código.
async function callCerebrasModel(prompt, model) {
  const key = process.env.CEREBRAS_API_KEY?.trim();
  if (!key) throw new Error("CEREBRAS_API_KEY ausente");

  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`Cerebras(${model}) HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Cerebras(${model}) retornou vazio`);
  return content;
}

async function callCerebras(prompt) {
  const models = ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-32b"];
  let lastErr;
  for (const model of models) {
    try {
      return await callCerebrasModel(prompt, model);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY ausente");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost",
      "X-Title": "generator",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY ausente");

  // Lista atualizada em jul/2026: gemini-2.0-flash foi desligado em 1º/jun/2026,
  // e toda a linha 1.5 já estava desligada antes disso — usar esses IDs antigos
  // faz TODAS as tentativas falharem com 404. Ordem atual: modelo GA mais novo
  // primeiro, com fallback pra opções mais estáveis/baratas.
  const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

  const errors = [];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          }),
        }
      );
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      errors.push(`${model}: resposta vazia`);
    } catch (err) {
      errors.push(`${model}: ${err.message}`);
    }
  }
  throw new Error(`Gemini falhou em todos os modelos (${errors.join(" | ")})`);
}

// Mapa de todos os providers disponíveis. A ORDEM padrão (Cerebras primeiro)
// é a usada pela geração de artigos e também pelo editor manual do admin —
// Cerebras tem o maior limite diário gratuito (1M tokens/dia), então resolve
// a maioria das gerações sozinho antes de precisar cair pros outros.
//
// Quem chama com necessidades diferentes pode passar um `providerOrder`
// próprio — ver 2º parâmetro abaixo. Grok nem precisa estar na lista: omitir
// o nome equivale a nunca chamá-lo.
const ALL_PROVIDERS = {
  Grok: callGrok,
  Groq: callGroq,
  Cerebras: callCerebras,
  OpenRouter: callOpenRouter,
  Gemini: callGemini,
};

async function generateWithFallback(prompt, providerOrder = ["Cerebras", "Grok", "Groq", "OpenRouter", "Gemini"]) {
  const providers = providerOrder
    .filter((name) => typeof ALL_PROVIDERS[name] === "function")
    .map((name) => ({ name, fn: ALL_PROVIDERS[name] }));

  const errors = [];
  for (const p of providers) {
    try {
      const text = await p.fn(prompt);
      return { text, provider: p.name };
    } catch (err) {
      errors.push(`${p.name}: ${err.message}`);
    }
  }
  throw new Error(`Todos os provedores falharam — ${errors.join(" | ")}`);
}

// ─── Markdown ─────────────────────────────────────────────────────────
function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Detecta artigo cortado no final (o modelo bateu no limite de tokens e a
 * resposta parou no meio de uma frase, ex.: "...costumam cair em armadil").
 * Aceita como final válido: parágrafo terminado em pontuação, linha de
 * tabela fechada com "|" ou item de lista curto. Título/subtítulo como última
 * linha também conta como corte (o corpo da seção não veio).
 */
function looksTruncated(body = "") {
  const lines = String(body).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  const last = lines[lines.length - 1];

  if (/^#{1,6}\s/.test(last)) return true;            // terminou num subtítulo
  if (last.startsWith("|")) return !last.endsWith("|"); // linha de tabela incompleta
  if (/^([-*+]|\d+[.)])\s/.test(last)) return false;   // item de lista
  return !/[.!?…"”’)\]*]$/.test(last);                 // parágrafo sem pontuação final
}

function validateTitle(title, topic) {
  const issues = [];
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const editorialTitleIssue = getEditorialTitleIssue(title);

  if (editorialTitleIssue) issues.push(editorialTitleIssue);

  if (words.length < 4 || words.length > 16 || String(title || "").length > 110) {
    issues.push("o título está curto demais ou longo/vago demais");
  }

  const stopWords = new Set([
    "para", "como", "sobre", "entre", "quando", "onde", "qual", "quais",
    "mais", "muito", "muitos", "muitas", "pouco", "poucos", "poucas",
    "este", "esta", "esse", "essa", "seus", "suas", "seu", "sua",
    "com", "sem", "uma", "umas", "uns", "dos", "das", "que", "por",
    "nas", "nos", "pela", "pelo", "pelas", "pelos", "depois", "antes",
    "guia", "completo", "completa", "entenda", "saiba", "veja",
  ]);
  const keywords = (value) => [...new Set(
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]+/g) || []
  )].filter((word) => word.length > 2 && !stopWords.has(word));

  // Quando o tema é só o rótulo-molde gerado pelo agrupamento de notícias,
  // exigir sobreposição de palavras com ele empurraria o modelo de volta ao molde.
  const isTemplateTopic = /o que mudou (nesta|na|esta) semana/i.test(String(topic || ""));

  const topicKeywords = keywords(topic);
  const titleKeywords = new Set(keywords(title));
  const overlap = topicKeywords.filter((word) => titleKeywords.has(word)).length;
  const requiredOverlap = Math.min(3, Math.max(1, Math.ceil(topicKeywords.length * 0.4)));
  if (
    topicKeywords.length > 0 &&
    !isTemplateTopic &&
    overlap < requiredOverlap &&
    !getEditorialTitleIssue(topic)
  ) {
    issues.push("o título não preserva as palavras-chave centrais do tema");
  }

  return issues;
}

function cleanMarkdown(text = "") {
  const noReasoning = qe.stripReasoningLeakage(text);
  return noReasoning
    .replace(/^[=\-]{3,}$/gm, "")
    .replace(/^#\s+.+\n?/gm, "")
    .trim();
}

function validateHealthArticle(body = "") {
  const issues = [];
  const text = normalizeText(body);
  const digitsOnly = text.replace(/\D/g, "");
  const officialLinks = [...String(body).matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map((match) => match[1]);

  if (containsNumericDose(body)) issues.push("o texto contém uma dose numérica ou instrução quantitativa de uso");
  if (!/##\s*quando procurar ajuda/i.test(body)) {
    issues.push('falta a seção "Quando procurar ajuda"');
  }
  if (!digitsOnly.includes("192") || !digitsOnly.includes("08007226001")) {
    issues.push("faltam os contatos de urgência SAMU 192 e Disque-Intoxicação 0800 722 6001");
  }
  if (!text.includes("bula oficial")) {
    issues.push("falta a referência à bula oficial vigente");
  }
  if (!officialLinks.some((url) => isOfficialUrl(url))) {
    issues.push("falta ao menos um link HTTPS para uma fonte oficial permitida");
  }
  if (!text.includes("nao substitui")) {
    issues.push("falta o aviso de que o conteúdo não substitui orientação profissional");
  }
  return issues;
}

/**
 * Gera e valida um artigo (com retries por qualidade), inteiramente em memória.
 *
 * @param {object} params
 * @param {string} params.topic
 * @param {string} params.category
 * @param {object} params.generation - bloco siteConfig.generation (tone, minWords, etc)
 * @param {string[]} params.existingSignatures - assinaturas (arrays de palavras) de posts já publicados, para checar similaridade
 * @param {string} [params.previousContent] - conteúdo do post ATUAL, quando esta chamada é uma
 *   regeneração (não um post novo). Entra no prompt como referência do que NÃO repetir, e também
 *   é comparado diretamente por similaridade — sem isso, regenerar tende a produzir um texto quase
 *   idêntico ao original, já que o "topic" enviado é o mesmo título de antes.
 * @param {number} [params.maxRetries=2]
 * @returns {Promise<{title, body, provider, wordCount, fillerCount, maxSim, mostSimilarSlug, issues}>}
 */
async function generateValidatedArticle({ topic, category, generation, existingSignatures = [], previousContent = null, maxRetries = 2, newsFact = null }) {
  let retryHint = null;
  let lastAttempt = null;

  // previousContent vem como o .md completo (frontmatter + corpo). Extrai só o
  // corpo: a assinatura de similaridade e o trecho mostrado no prompt devem
  // refletir o CONTEÚDO do artigo, não o YAML (title/date/category/excerpt).
  const previousBody = previousContent ? (qe.splitFrontmatterAndBody(previousContent)?.body || previousContent) : null;
  const previousSignature = previousBody ? qe.getSignature(previousBody) : null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = buildPrompt({ topic, generation, previousContent: previousBody, newsFact }, retryHint);
    const { text, provider } = await generateWithFallback(prompt);

    const extractedTitle = extractTitle(text);
    const title = extractedTitle || topic;
    const body = cleanMarkdown(text);

    const minWords = generation?.minWords || 1200;
    const wordCount = qe.countWords(body);
    const fillerCount = qe.countFillerPhrases(body);

    const newSig = qe.getSignature(body);
    let maxSim = 0;
    let mostSimilarSlug = null;
    for (const entry of existingSignatures) {
      const sim = qe.jaccardSimilarity(newSig, entry.words);
      if (sim > maxSim) {
        maxSim = sim;
        mostSimilarSlug = entry.slug;
      }
    }

    // Checagem específica contra a versão anterior deste mesmo post (regeneração).
    // Limiar mais estrito (0.45) que o usado entre posts diferentes (0.55), porque
    // aqui o objetivo explícito é ser diferente do que já existe, não só evitar
    // duplicar outro artigo do site.
    let simVsPrevious = 0;
    if (previousSignature) {
      simVsPrevious = qe.jaccardSimilarity(newSig, previousSignature);
      if (simVsPrevious > maxSim) {
        maxSim = simVsPrevious;
        mostSimilarSlug = "a versão anterior deste post";
      }
    }

    const issues = [];
    if (!extractedTitle) issues.push("a resposta não trouxe um título na primeira linha");
    issues.push(...validateTitle(title, topic));
    if (wordCount < minWords * 0.8) issues.push(`abaixo do mínimo de palavras (${wordCount}/${minWords})`);
    if (looksTruncated(body)) {
      issues.push("o texto foi cortado no final (limite de tamanho): escreva um artigo mais enxuto, com no máximo cerca de 1.600 palavras, e termine com uma conclusão completa");
    }
    if (fillerCount >= 3) issues.push(`muitas frases genéricas (${fillerCount})`);
    issues.push(...validateHealthArticle(body));
    if (previousSignature && simVsPrevious > 0.45) {
      issues.push(`ficou muito parecido com a versão anterior (${(simVsPrevious * 100).toFixed(0)}% similar) — mude o ângulo e os exemplos`);
    } else if (maxSim > 0.55) {
      issues.push(`muito parecido com "${mostSimilarSlug}" (${(maxSim * 100).toFixed(0)}%)`);
    }

    lastAttempt = { title, body, provider, wordCount, fillerCount, maxSim, mostSimilarSlug, issues, signature: newSig };

    if (issues.length === 0) return lastAttempt;

    retryHint = issues.join("; ");
  }

  const titleIssues = validateTitle(lastAttempt.title, topic);
  if (
    titleIssues.length > 0 ||
    lastAttempt.issues.includes("a resposta não trouxe um título na primeira linha")
  ) {
    const fallbackTitle = qe.toTitleCase(topic);
    const fallbackIssues = validateTitle(fallbackTitle, topic);
    if (fallbackIssues.some((issue) => getEditorialTitleIssue(fallbackTitle) === issue)) {
      throw new Error(
        "A geração não encontrou um título editorialmente claro. Revise o tema ou as manchetes de origem antes de publicar."
      );
    }
    lastAttempt.title = fallbackTitle;
    lastAttempt.issues = lastAttempt.issues.filter(
      (issue) => !titleIssues.includes(issue) && issue !== "a resposta não trouxe um título na primeira linha"
    );
    lastAttempt.issues.push("título do modelo rejeitado; usado o tema original como título");
  }

  if (lastAttempt.issues.length > 0) {
    const error = new Error(`VALIDATION_FAILED: ${lastAttempt.issues.join("; ")}`);
    error.code = "VALIDATION_FAILED";
    error.issues = lastAttempt.issues;
    throw error;
  }

  return lastAttempt;
}

/**
 * Monta o markdown final (frontmatter + corpo) pronto para salvar/commitar.
 */
function buildArticleFile({ title, body, topic, category, forceFile, existingFrontmatter, curiosity, takeaways, existingSlugs }) {
  const normalizedTitle = qe.toTitleCase(title || topic);
  const excerpt = qe.buildSafeExcerpt(body);

  let file, date, slug, finalCategory;

  if (forceFile) {
    file = forceFile;
    date = existingFrontmatter?.date || todayISO();
    finalCategory = existingFrontmatter?.category || category;
    slug = qe.slugFromFileName(forceFile);
  } else {
    date = todayISO();
    slug = slugify(normalizedTitle);
    // Evita URL repetida: se já existe post com o mesmo slug, acrescenta a data.
    if (existingSlugs && existingSlugs.has(slug)) {
      slug = `${slug}-${date}`.substring(0, 90);
    }
    file = `${date}-${slug}.md`;
    finalCategory = category;
  }

  // Se a geração da curiosidade falhou nesta chamada (ex.: regeneração em
  // que todos os providers ficaram indisponíveis), preserva a curiosidade
  // anterior do post em vez de simplesmente apagar o card no site.
  const finalCuriosity = curiosity || existingFrontmatter?.curiosity || null;

  // Mesma filosofia de fallback: se a geração dos tópicos falhar nesta
  // chamada, preserva os tópicos anteriores em vez de apagar o card.
  const finalTakeaways =
    takeaways && takeaways.length > 0 ? takeaways : existingFrontmatter?.takeaways || [];

  const takeawaysYaml =
    finalTakeaways.length > 0
      ? `\ntakeaways:\n${finalTakeaways.map((t) => `  - "${escapeForYaml(t)}"`).join("\n")}`
      : "";

  const frontmatter = `---
title: "${escapeForYaml(normalizedTitle)}"
date: "${date}"
category: "${escapeForYaml(finalCategory)}"
excerpt: "${escapeForYaml(excerpt)}"${finalCuriosity ? `\ncuriosity: "${escapeForYaml(finalCuriosity)}"` : ""}${takeawaysYaml}
---

`;

  return { file, slug, date, category: finalCategory, content: frontmatter + body, normalizedTitle };
}

module.exports = {
  randomItem,
  slugify,
  todayISO,
  buildPrompt,
  validateHealthArticle,
  buildCuriosityPrompt,
  generateCuriosity,
  curiosityIsGrounded,
  generateTakeaways,
  generateWithFallback,
  generateValidatedArticle,
  buildArticleFile,
  extractTitle,
  validateTitle,
  looksTruncated,
  cleanMarkdown,
};
