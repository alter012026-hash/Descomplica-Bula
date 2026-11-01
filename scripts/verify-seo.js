#!/usr/bin/env node
const siteUrl = (process.argv[2] || process.env.SITE_URL || "").replace(/\/$/, "");

if (!siteUrl) {
  console.error("Informe a URL do site com SITE_URL ou como argumento.");
  process.exit(1);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  return { response, body: await response.text() };
}

async function verifyPage(url) {
  const { response, body } = await fetchText(url);
  const failures = [];
  if (response.status !== 200) failures.push(`HTTP ${response.status}`);

  const title = body.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = body.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1];
  const canonical = body.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)?.[1];
  const h1 = body.match(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/i)?.[0];

  if (!title) failures.push("title ausente");
  if (!description) failures.push("meta description ausente");
  if (!h1) failures.push("H1 ausente");
  if (!canonical) failures.push("canonical ausente");
  else if (new URL(canonical, url).href.replace(/\/$/, "") !== url.replace(/\/$/, "")) {
    failures.push(`canonical divergente: ${canonical}`);
  }

  return failures.map((failure) => `${url}: ${failure}`);
}

async function main() {
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const { response, body } = await fetchText(sitemapUrl);
  if (!response.ok) throw new Error(`Sitemap respondeu HTTP ${response.status}: ${sitemapUrl}`);
  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  if (!urls.length) throw new Error(`Nenhuma URL encontrada no sitemap: ${sitemapUrl}`);

  const failures = [];
  for (let index = 0; index < urls.length; index += 5) {
    const batch = await Promise.all(urls.slice(index, index + 5).map(verifyPage));
    failures.push(...batch.flat());
  }
  if (failures.length) {
    console.error(`SEO smoke test: ${failures.length} falha(s) em ${urls.length} URL(s).`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log(`SEO smoke test passou: ${urls.length} URLs retornaram 200 com title, description, H1 e canonical válido.`);
}

main().catch((error) => {
  console.error(`SEO smoke test falhou: ${error.message}`);
  process.exitCode = 1;
});
