import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import fs from "node:fs";
import path from "node:path";
import config from "../../../../site.config";
import postSlugs from "../../../../lib/post-slugs.cjs";

const postsDir = path.join(process.cwd(), "posts");

function getUrls(mode) {
  if (!fs.existsSync(postsDir)) return [];
  const now = Date.now();
  const files = fs.readdirSync(postsDir).filter((file) => file.endsWith(".md"));
  const slugByFile = new Map(postSlugs.buildSlugEntries(files).map((e) => [e.fileName, e.slug]));
  return files
    .filter((file) => {
      if (mode !== "new") return true;
      const date = file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      return date && now - new Date(date).getTime() < 24 * 60 * 60 * 1000;
    })
    .map((file) => `${config.url.replace(/\/$/, "")}/blog/${slugByFile.get(file)}`);
}

async function notifyIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return "INDEXNOW_KEY não configurada; IndexNow não foi executado.";

  const body = JSON.stringify({
    host: new URL(config.url).hostname,
    key,
    keyLocation: `${config.url.replace(/\/$/, "")}/${key}.txt`,
    urlList: urls,
  });
  const endpoints = ["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow"];

  const results = await Promise.all(endpoints.map(async (endpoint) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`${endpoint} respondeu HTTP ${response.status}.`);
    }
    return `${endpoint}: HTTP ${response.status}`;
  }));
  return results.join("\n");
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const mode = new URL(request.url).searchParams.get("mode") || "new";
  const urls = getUrls(mode);
  const sitemap = `${config.url.replace(/\/$/, "")}/sitemap.xml`;

  if (!urls.length) {
    return NextResponse.json({
      output: `Nenhum artigo publicado encontrado.\nGoogle: envie ou confira o sitemap no Search Console: ${sitemap}`,
    });
  }

  try {
    const indexNow = await notifyIndexNow(urls);
    return NextResponse.json({
      output: `URLs notificadas: ${urls.length}\n${indexNow}\nGoogle: artigos editoriais são descobertos pelo sitemap e links internos; a Google Indexing API não foi chamada.\nSitemap: ${sitemap}`,
    });
  } catch (error) {
    console.error("[admin/indexing]", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
