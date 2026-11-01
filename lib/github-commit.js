/**
 * lib/github-commit.js
 *
 * Persiste arquivos no repositório via GitHub Contents API.
 *
 * Por quê isso é necessário:
 * O filesystem da Vercel em produção é somente leitura (exceto /tmp, que é
 * efêmero e não compartilhado entre invocações). Qualquer fs.writeFileSync
 * dentro de uma API route, em produção, ou falha, ou escreve algo que
 * desaparece no próximo cold start / deploy.
 *
 * A única forma de uma function serverless "salvar" um post de verdade é
 * fazer o que o .github/workflows/generate-articles.yml já faz manualmente:
 * comitar o arquivo no Git. Esse módulo faz isso via API HTTP do GitHub
 * (sem precisar do binário `git` nem de filesystem local), e depois a Vercel
 * rebuilda automaticamente a partir do novo commit (ou via deploy hook).
 *
 * Variáveis de ambiente necessárias:
 *   GITHUB_TOKEN        — Personal Access Token (classic ou fine-grained) com
 *                          permissão "contents: write" no repositório.
 *   GITHUB_REPO         — "usuario/repositorio"
 *   GITHUB_BRANCH       — branch a commitar (default: "main")
 *   VERCEL_DEPLOY_HOOK  — (opcional) mesma URL já usada pelo GitHub Action,
 *                          para disparar o rebuild sem esperar o webhook do Git.
 */

const GITHUB_API = "https://api.github.com";

function getConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  const branch = process.env.GITHUB_BRANCH?.trim() || "main";

  if (!token) throw new Error("GITHUB_TOKEN ausente nas variáveis de ambiente");
  if (!repo) throw new Error("GITHUB_REPO ausente (formato esperado: usuario/repositorio)");

  return { token, repo, branch };
}

async function githubRequest(url, options = {}) {
  const { token } = getConfig();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        "O GITHUB_TOKEN configurado na Vercel foi rejeitado pelo GitHub. Atualize-o com um token válido e ativo."
      );
    }
    if (res.status === 403) {
      throw new Error(
        "O GITHUB_TOKEN não tem permissão para acessar este repositório. Conceda acesso ao repositório e permissão Contents: Read and write."
      );
    }
    throw new Error(`GitHub API ${res.status} em ${url}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Busca o conteúdo + sha atual de um arquivo no repo (necessário pra "update").
 * Retorna null se o arquivo não existir.
 */
async function getFile(filePath) {
  const { repo, branch } = getConfig();
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;

  try {
    const data = await githubRequest(url);
    const content = Buffer.from(data.content, data.encoding || "base64").toString("utf8");
    return { sha: data.sha, content };
  } catch (err) {
    if (String(err.message).includes("404")) return null;
    throw err;
  }
}

/**
 * Cria ou atualiza um arquivo no repo com um único commit.
 *
 * @param {string} filePath - caminho relativo no repo, ex: "posts/2026-06-21-foo.md"
 * @param {string} content - conteúdo final do arquivo (utf8)
 * @param {string} message - mensagem de commit
 * @returns {Promise<{commitSha: string, htmlUrl: string}>}
 */
async function commitFile(filePath, content, message) {
  const { repo, branch } = getConfig();
  const existing = await getFile(filePath);

  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(filePath)}`;
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    ...(existing ? { sha: existing.sha } : {}),
    committer: { name: "ArticleBot", email: "bot@github.com" },
  };

  const data = await githubRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  return {
    commitSha: data.commit?.sha,
    htmlUrl: data.content?.html_url,
  };
}

/**
 * Cria ou atualiza um arquivo binário (ex.: imagem) no repo com um único commit.
 * O conteúdo deve vir em base64, já que o Contents API recebe bytes em base64.
 */
async function commitBinaryFile(filePath, base64Content, message) {
  const { repo, branch } = getConfig();
  const existing = await getFile(filePath);

  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(filePath)}`;
  const body = {
    message,
    content: base64Content,
    branch,
    ...(existing ? { sha: existing.sha } : {}),
    committer: { name: "ArticleBot", email: "bot@github.com" },
  };

  const data = await githubRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  return {
    commitSha: data.commit?.sha,
    htmlUrl: data.content?.html_url,
  };
}

/**
 * Remove um arquivo do repo com um único commit (usado pelo DELETE de posts).
 */
async function deleteFile(filePath, message) {
  const { repo, branch } = getConfig();
  const existing = await getFile(filePath);
  if (!existing) return null;

  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(filePath)}`;
  const data = await githubRequest(url, {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha: existing.sha,
      branch,
      committer: { name: "ArticleBot", email: "bot@github.com" },
    }),
  });

  return { commitSha: data.commit?.sha };
}

/**
 * Dispara o Vercel Deploy Hook (mesma URL usada pelo GitHub Action), se configurado.
 * Não lança erro se falhar — o push no Git já vai disparar o build padrão da Vercel
 * de qualquer forma; o hook só acelera o gatilho.
 */
async function triggerVercelDeploy() {
  const hook = process.env.VERCEL_DEPLOY_HOOK?.trim();
  if (!hook) return { triggered: false, reason: "VERCEL_DEPLOY_HOOK não configurado" };

  try {
    await fetch(hook, { method: "POST" });
    return { triggered: true };
  } catch (err) {
    return { triggered: false, reason: err.message };
  }
}

module.exports = {
  getFile,
  commitFile,
  commitBinaryFile,
  deleteFile,
  triggerVercelDeploy,
};
