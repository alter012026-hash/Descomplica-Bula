const DEFAULT_OFFICIAL_DOMAINS = [
  "gov.br",
  "anvisa.gov.br",
  "bvsms.saude.gov.br",
  "fiocruz.br",
  "cff.org.br",
  "who.int",
  "medlineplus.gov",
  "nhs.uk",
];

function isOfficialUrl(value, domains = DEFAULT_OFFICIAL_DOMAINS) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return domains.some((domain) => {
    const allowed = String(domain).toLowerCase().replace(/^www\./, "");
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });
}

function normalizeOfficialSources(sources, domains = DEFAULT_OFFICIAL_DOMAINS) {
  if (!Array.isArray(sources)) return [];
  return [...new Set(sources.map((source) => String(source).trim()).filter(Boolean))]
    .map((source) => {
      if (!isOfficialUrl(source, domains)) {
        throw new Error("Use apenas links HTTPS de fontes oficiais permitidas.");
      }
      return new URL(source).toString();
    });
}

module.exports = { DEFAULT_OFFICIAL_DOMAINS, isOfficialUrl, normalizeOfficialSources };
