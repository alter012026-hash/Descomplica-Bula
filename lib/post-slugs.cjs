/**
 * lib/post-slugs.cjs
 *
 * Fonte única de verdade para transformar nomes de arquivo de posts/*.md
 * em slugs de URL. Usado pelo site (lib/posts.js) e pelos scripts de
 * indexação, para que todos enxerguem as mesmas URLs.
 *
 * Regra: o slug é o nome do arquivo sem a data e sem ".md". Se dois ou mais
 * arquivos geram o mesmo slug (ex.: série "Alertas de medicamentos: o que mudou nesta
 * semana"), o MAIS ANTIGO mantém o slug original (preserva a URL já
 * indexada) e os demais recebem o sufixo "-AAAA-MM-DD" (e "-2", "-3"… se
 * ainda colidir na mesma data). Assim cada post tem uma URL própria.
 */

function baseSlug(fileName) {
  return String(fileName)
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/\.md$/, "");
}

function fileDate(fileName) {
  return String(fileName).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
}

/**
 * @param {string[]} fileNames nomes de arquivo (com .md)
 * @returns {Array<{fileName:string, slug:string, baseSlug:string, renamed:boolean}>}
 *          na mesma ordem em que os arquivos foram recebidos
 */
function buildSlugEntries(fileNames) {
  const sorted = [...fileNames].sort();
  const used = new Set();
  const bySource = new Map();

  // 1ª passada: reserva o slug original para o arquivo mais antigo de cada grupo
  for (const fileName of sorted) {
    const base = baseSlug(fileName);
    if (!used.has(base)) {
      used.add(base);
      bySource.set(fileName, { fileName, slug: base, baseSlug: base, renamed: false });
    }
  }

  // 2ª passada: os repetidos ganham sufixo de data (e contador, se preciso)
  for (const fileName of sorted) {
    if (bySource.has(fileName)) continue;
    const base = baseSlug(fileName);
    const date = fileDate(fileName);
    let candidate = date ? `${base}-${date}` : `${base}-2`;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${date || "dup"}-${n++}`;
    }
    used.add(candidate);
    bySource.set(fileName, { fileName, slug: candidate, baseSlug: base, renamed: true });
  }

  return fileNames.map((f) => bySource.get(f));
}

module.exports = { baseSlug, buildSlugEntries };
