import { getAllPosts } from "../lib/posts";
import config from "../site.config";

function safeDate(date) {
  const d = new Date(date);
  return isNaN(d.getTime()) ? new Date() : d;
}

export default function sitemap() {
  const posts = getAllPosts();
  const siteUrl = config.url.replace(/\/$/, "");

  const staticPages = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/sobre`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/metodologia`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/privacidade`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/contato`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/fontes-oficiais`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/aviso-de-saude`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.6,
    },
  ];

  // 🔥 FILTRA POSTS INVÁLIDOS (ESSENCIAL)
  const validPosts = posts.filter((post) => {
    if (!post?.date) return false;
    if (post.noindex) return false; // artigos marcados noindex não vão ao sitemap
    const d = new Date(post.date);
    return !isNaN(d.getTime());
  });

  const postPages = validPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: safeDate(post.date),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...postPages];
}