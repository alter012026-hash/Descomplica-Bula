import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "site.config.js");

function readConfigRaw() {
  return fs.readFileSync(CONFIG_PATH, "utf8");
}

// Extrai o valor de uma chave string no JS: key: "valor"
function extract(raw, key) {
  // Escapa caracteres especiais de regex no nome da chave
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = raw.match(new RegExp(`(?:^|[,{\\n])\\s*${escaped}\\s*:\\s*"([^"]*)"`, "m"));
  return m ? m[1] : "";
}

// Extrai boolean: key: true|false
function extractBool(raw, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = raw.match(new RegExp(`(?:^|[,{\\n])\\s*${escaped}\\s*:\\s*(true|false)`, "m"));
  return m ? m[1] === "true" : false;
}

// Substitui o valor de uma chave string (primeira ocorrência)
function patchString(raw, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const val = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return raw.replace(
    new RegExp(`((?:^|[,{\\n])\\s*${escaped}\\s*:\\s*)"[^"]*"`, "m"),
    `$1"${val}"`
  );
}

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const raw = readConfigRaw();

    // Extrai o bloco author separadamente para pegar o name dentro dele
    const authorBlock = raw.match(/author\s*:\s*\{([^}]+)\}/s)?.[1] || "";
    const authorName = authorBlock.match(/name\s*:\s*"([^"]*)"/)?.[1] || "";
    const authorBio  = authorBlock.match(/bio\s*:\s*"([^"]*)"/)?.[1] || "";

    // Extrai o bloco adsense separadamente
    const adsenseBlock = raw.match(/adsense\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s)?.[1] || "";
    const slotsBlock   = adsenseBlock.match(/slots\s*:\s*\{([^}]+)\}/s)?.[1] || "";

    return NextResponse.json({
      // Identidade
      name:                  extract(raw, "name"),
      tagline:               extract(raw, "tagline"),
      description:           extract(raw, "description"),
      url:                   extract(raw, "url"),
      // SEO
      twitterHandle:         extract(raw, "twitterHandle"),
      googleSiteVerification: extract(raw, "googleSiteVerification"),
      // Autor
      authorName,
      authorBio,
      // AdSense
      adsenseEnabled:        extractBool(adsenseBlock, "enabled"),
      adsensePublisherId:    extract(adsenseBlock, "publisherId"),
      adsenseSlotHeader:     extract(slotsBlock, "header"),
      adsenseSlotInArticle:  extract(slotsBlock, "inArticle"),
      adsenseSlotSidebar:    extract(slotsBlock, "sidebar"),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const data = await request.json();
    let raw = readConfigRaw();

    // Campos de string simples no nível raiz
    for (const key of ["tagline", "description", "url", "twitterHandle", "googleSiteVerification"]) {
      if (data[key] !== undefined) raw = patchString(raw, key, data[key]);
    }

    // name: existe no root E dentro de author — patcheia só a primeira (root)
    if (data.name !== undefined) {
      const val = String(data.name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      raw = raw.replace(/(^\s*name\s*:\s*)"[^"]*"/m, `$1"${val}"`);
    }

    // author.name e author.bio — substitui dentro do bloco author
    if (data.authorName !== undefined || data.authorBio !== undefined) {
      raw = raw.replace(
        /(author\s*:\s*\{[^}]*name\s*:\s*)"[^"]*"/s,
        (m) => data.authorName !== undefined
          ? m.replace(/(name\s*:\s*)"[^"]*"/, `$1"${data.authorName.replace(/"/g, '\\"')}"`)
          : m
      );
      raw = raw.replace(
        /(author\s*:\s*\{[^}]*bio\s*:\s*)"[^"]*"/s,
        (m) => data.authorBio !== undefined
          ? m.replace(/(bio\s*:\s*)"[^"]*"/, `$1"${data.authorBio.replace(/"/g, '\\"')}"`)
          : m
      );
    }

    // publisherId dentro do bloco adsense
    if (data.adsensePublisherId !== undefined) {
      const val = data.adsensePublisherId.replace(/"/g, '\\"');
      raw = raw.replace(/(publisherId\s*:\s*)"[^"]*"/, `$1"${val}"`);
    }

    // slots
    if (data.adsenseSlotHeader !== undefined) {
      raw = raw.replace(/(slots[\s\S]*?header\s*:\s*)"[^"]*"/, `$1"${data.adsenseSlotHeader}"`);
    }
    if (data.adsenseSlotInArticle !== undefined) {
      raw = raw.replace(/(inArticle\s*:\s*)"[^"]*"/, `$1"${data.adsenseSlotInArticle}"`);
    }
    if (data.adsenseSlotSidebar !== undefined) {
      raw = raw.replace(/(slots[\s\S]*?sidebar\s*:\s*)"[^"]*"/, `$1"${data.adsenseSlotSidebar}"`);
    }

    // enabled (boolean)
    if (data.adsenseEnabled !== undefined) {
      raw = raw.replace(
        /(adsense[\s\S]*?enabled\s*:\s*)(true|false)/,
        `$1${data.adsenseEnabled ? "true" : "false"}`
      );
    }

    fs.writeFileSync(CONFIG_PATH, raw, "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
