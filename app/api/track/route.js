import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../lib/admin-auth";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import { getAllSlugs } from "../../../lib/posts";
import { CONSENT_COOKIE, parseConsent, parseCookieHeader } from "../../../lib/consent";
import {
  dayKey,
  isBot,
  isVisitStoreConfigured,
  normalizePath,
  normalizeReferrer,
  recordEngagement,
  recordVisit,
  visitorHash,
} from "../../../lib/visit-store";
import {
  cleanEvent,
  recordVisitorEngagement,
  recordVisitorEvent,
  recordVisitorPageview,
  resolveIds,
} from "../../../lib/visitor-store";
import { classifyChannel, cleanUtm, parseGeo, parseUserAgent } from "../../../lib/visit-meta";

export const dynamic = "force-dynamic";

// Sempre responde 204: o rastreio nunca deve gerar erro visível para o leitor.
// `cookies` só é preenchido para quem aceitou (renova a validade dos ids).
function done(cookies = []) {
  const res = new NextResponse(null, { status: 204 });
  for (const c of cookies) {
    res.cookies.set(c.name, c.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: c.maxAge,
    });
  }
  return res;
}

export async function POST(request) {
  try {
    if (!isVisitStoreConfigured()) return done();

    // Só aceita chamadas do próprio site.
    const host = request.headers.get("host") || "";
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== host) return done();
      } catch {
        return done();
      }
    }

    const userAgent = request.headers.get("user-agent") || "";
    if (isBot(userAgent)) return done();

    // Ignora pré-carregamentos do navegador.
    const purpose = `${request.headers.get("purpose") || ""}${request.headers.get("sec-purpose") || ""}`;
    if (/prefetch|prerender/i.test(purpose)) return done();

    // Suas próprias visitas (logado no /admin) não entram na conta.
    if (checkAdminAuth()) return done();

    const ip = getClientIp(request);
    if (!checkRateLimit(`track:${ip}`, { limit: 240, windowMs: 60_000 }).allowed) return done();

    const body = await request.json().catch(() => null);
    const slugs = new Set(getAllSlugs());
    const path = normalizePath(body?.path, slugs);
    if (!path) return done();

    // Camada com consentimento: só existe se o visitante aceitou os cookies.
    // O servidor confere o cookie em TODA chamada (não confia no navegador).
    const jar = parseCookieHeader(request.headers.get("cookie") || "");
    const consented = parseConsent(jar[CONSENT_COOKIE]) === "accepted";

    // Ação no site (cliques, busca e inscrição).
    if (body?.t === "ev") {
      const ids = consented ? resolveIds(jar, { mint: false }) : null;
      const event = ids ? cleanEvent(body.name, body.props, slugs) : null;
      if (ids && event) {
        await recordVisitorEvent({ sid: ids.sid, event, path });
        return done(ids.cookies);
      }
      return done();
    }

    const entry = body?.entry === true;
    const utm = entry ? cleanUtm(body?.utm) : null;
    const source = normalizeReferrer(body?.referrer, host);
    const channel = classifyChannel(source, utm || {});

    // Aceitou agora: abre a visita já com a página atual (não conta de novo
    // no painel anônimo, que já registrou essa visualização).
    if (body?.t === "c") {
      if (!consented) return done();
      const ids = resolveIds(jar);
      if (ids.newSession) {
        const { device, browser, os } = parseUserAgent(userAgent);
        await recordVisitorPageview({
          ...ids, path,
          meta: { device, browser, os, ...parseGeo(request.headers), referrer: entry ? source : "", channel: entry ? channel : "", utm },
        });
      }
      return done(ids.cookies);
    }

    // Tempo na página + rolagem + rejeição (enviado ao sair da página).
    if (body?.t === "e") {
      await recordEngagement({
        path,
        seconds: body.sec,
        scroll: body.scroll,
        first: body.first === true,
        bounce: body.first === true && Number(body.pages) === 1,
      });
      const ids = consented ? resolveIds(jar, { mint: false }) : null;
      if (ids) {
        await recordVisitorEngagement({ sid: ids.sid, path, seconds: body.sec, scroll: body.scroll });
        return done(ids.cookies);
      }
      return done();
    }

    const { device, browser, os } = parseUserAgent(userAgent);
    const geo = parseGeo(request.headers);

    // Estatística anônima (todos os visitantes, sem cookie).
    await recordVisit({
      path,
      referrer: source,
      visitor: visitorHash({ ip, userAgent, day: dayKey() }),
      device, browser, os,
      ...geo,
      channel,
      entry,
      utm,
    });

    // Visita individual (só quem aceitou).
    if (consented) {
      const ids = resolveIds(jar);
      await recordVisitorPageview({
        ...ids, path,
        meta: { device, browser, os, ...geo, referrer: entry ? source : "", channel: entry ? channel : "", utm },
      });
      return done(ids.cookies);
    }
  } catch (error) {
    console.error("[track]", error.message);
  }
  return done();
}
