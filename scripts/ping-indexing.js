#!/usr/bin/env node
/**
 * Notifica via IndexNow as URLs publicadas. Artigos editoriais comuns são
 * descobertos pelo sitemap e por links internos, não pela Google Indexing API.
 */
require("dotenv").config({ path: ".env.local", override: false });

const fs = require("fs");
const path = require("path");
const postSlugs = require("../lib/post-slugs.cjs");
const configModule = require("../site.config.js");
const config = configModule?.default || configModule || {};
const SITE_URL = (config.url || "").replace(/\/$/, "");
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";

if (!SITE_URL) {
  console.error("site.config.js não tem 'url' definida.");
  process.exit(1);
}

const args = process.argv.slice(2);
const onlyNew = args.includes("--new");
const singleUrl = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;

function getPostUrls() {
  const postsDir = path.resolve(__dirname, "../posts");
  if (!fs.existsSync(postsDir)) return [];

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(postsDir).filter((file) => file.endsWith(".md"));
  const slugByFile = new Map(postSlugs.buildSlugEntries(files).map((e) => [e.fileName, e.slug]));
  return files
    .filter((file) => {
      if (!onlyNew) return true;
      const match = file.match(/^(\d{4}-\d{2}-\d{2})/);
      return match && now - new Date(match[1]).getTime() < oneDayMs;
    })
    .map((file) => `${SITE_URL}/blog/${slugByFile.get(file)}`);
}

async function pingIndexNow(urls) {
  if (!INDEXNOW_KEY) {
    console.log("INDEXNOW_KEY não definida; IndexNow ignorado.");
    return;
  }

  const body = JSON.stringify({
    host: new URL(SITE_URL).hostname,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  });

  for (const endpoint of ["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow"]) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });
    if (response.status !== 200 && response.status !== 202) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`IndexNow ${endpoint} respondeu ${response.status}: ${detail}`);
    }
    console.log(`IndexNow ${endpoint}: ${response.status}`);
  }
}

async function main() {
  const urls = singleUrl
    ? [`${SITE_URL}${singleUrl.startsWith("/") ? singleUrl : `/${singleUrl}`}`]
    : getPostUrls();

  console.log(`URLs publicadas: ${urls.length}`);
  if (!urls.length) return;
  console.log(`Sitemap para descoberta Google: ${SITE_URL}/sitemap.xml`);
  await pingIndexNow(urls);
}

main().catch((error) => {
  console.error("Falha ao notificar buscadores:", error.message);
  process.exitCode = 1;
});
