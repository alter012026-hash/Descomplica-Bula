import config from "../site.config";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/og"],
    },
    sitemap: `${config.url}/sitemap.xml`,
    host: config.url,
  };
}
