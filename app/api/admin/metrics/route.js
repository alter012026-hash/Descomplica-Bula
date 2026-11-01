import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import fs from "fs";
import path from "path";
import matter from "../../../../lib/frontmatter";

const postsDir = path.join(process.cwd(), "posts");

export async function GET() {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    if (!fs.existsSync(postsDir)) {
      return NextResponse.json({ posts: 0, categories: {}, recent: [], byMonth: {} });
    }

    const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"));
    const now = Date.now();
    const oneDayMs = 86400000;
    const sevenDaysMs = 7 * oneDayMs;
    const thirtyDaysMs = 30 * oneDayMs;

    const categories = {};
    const byMonth = {};
    const recent = [];

    let postsLast24h = 0;
    let postsLast7d = 0;
    let postsLast30d = 0;

    for (const file of files) {
      const fullPath = path.join(postsDir, file);
      const raw = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(raw);

      const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
      const dateStr = data.date || file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
      const dateMs = dateStr ? new Date(dateStr).getTime() : 0;
      const diff = now - dateMs;

      // Categorias
      const cat = data.category || "Geral";
      categories[cat] = (categories[cat] || 0) + 1;

      // Por mês
      const monthKey = dateStr ? dateStr.slice(0, 7) : "desconhecido";
      byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;

      // Recência
      if (diff < oneDayMs) postsLast24h++;
      if (diff < sevenDaysMs) postsLast7d++;
      if (diff < thirtyDaysMs) postsLast30d++;

      // Recentes (últimos 10)
      if (recent.length < 10) {
        const words = content.split(/\s+/).length;
        recent.push({
          slug,
          title: data.title || slug,
          date: dateStr,
          category: cat,
          words,
          readingTime: Math.ceil(words / 200),
        });
      }
    }

    // Ordena recentes por data desc
    recent.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Ordena byMonth
    const byMonthSorted = Object.fromEntries(
      Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
    );

    return NextResponse.json({
      totalPosts: files.length,
      postsLast24h,
      postsLast7d,
      postsLast30d,
      categories,
      byMonth: byMonthSorted,
      recent,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
