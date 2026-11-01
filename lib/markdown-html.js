import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

marked.setOptions({ gfm: true, breaks: false });

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndown.use(gfm);

/**
 * Markdown (como salvo no arquivo .md) → HTML (como o TipTap precisa
 * receber para exibir o conteúdo já formatado no editor visual).
 */
export function markdownToHtml(md) {
  if (!md || !md.trim()) return "";
  return marked.parse(md);
}

/**
 * HTML do editor visual → Markdown (formato salvo no arquivo .md, o
 * mesmo formato que a geração automática por IA já produz).
 */
export function htmlToMarkdown(html) {
  if (!html || !html.trim()) return "";
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
