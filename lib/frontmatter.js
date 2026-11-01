import { load } from "js-yaml";

export default function parseFrontmatter(source) {
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (!input.startsWith("---") || input.charAt(3) === "-") {
    return { data: {}, content: input };
  }

  const contentStart = input.slice(3);
  const closeIndex = contentStart.indexOf("\n---");
  const block = contentStart.slice(0, closeIndex === -1 ? contentStart.length : closeIndex);
  const data = load(block) ?? {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("O frontmatter do artigo deve ser um objeto YAML.");
  }

  if (closeIndex === -1) return { data, content: "" };

  let content = contentStart.slice(closeIndex + 4);
  if (content[0] === "\r") content = content.slice(1);
  if (content[0] === "\n") content = content.slice(1);
  return { data, content };
}
