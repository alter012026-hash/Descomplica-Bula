// -----------------------------------------------------------------------
// Extrai perguntas e respostas REAIS de uma seção "## FAQ" ou
// "## Perguntas Frequentes" no markdown do post, no formato:
//
//   ## FAQ
//   * **Pergunta aqui?**: Resposta real aqui.
//   * **Outra pergunta?**: Outra resposta real.
//
// Gera um schema.org FAQPage com o texto de verdade (nunca um placeholder
// genérico) — importante porque o Google exige que o conteúdo do
// structured data corresponda ao conteúdo visível da página; um FAQPage
// com respostas falsas/genéricas pode simplesmente não ser usado como rich
// result, ou na pior hipótese ser tratado como spam de structured data.
// -----------------------------------------------------------------------

function extractFAQs(content) {
  if (!content) return [];

  // Isola o bloco que começa em "## FAQ" ou "## Perguntas Frequentes" até o
  // próximo heading de nível 2 (##) ou o fim do documento.
  const blockMatch = content.match(/##\s*(FAQ|Perguntas Frequentes)\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!blockMatch) return [];

  const block = blockMatch[2];

  // Cada item: "* **Pergunta...?**: Resposta..." (aceita * ou - como bullet,
  // e permite a resposta continuar até a próxima bullet ou o fim do bloco).
  const itemRegex = /^[*-]\s*\*\*(.+?)\*\*:?\s*(.+?)(?=\n[*-]\s*\*\*|$)/gms;

  const faqs = [];
  let match;
  while ((match = itemRegex.exec(block)) !== null) {
    const question = match[1].trim().replace(/\*\*/g, "");
    const answer = match[2].trim().replace(/\n+/g, " ");
    if (question && answer) {
      faqs.push({ question, answer });
    }
  }

  return faqs.slice(0, 8); // limite razoável por página
}

function generateFAQSchema(faqs) {
  if (!faqs || !faqs.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export { extractFAQs, generateFAQSchema };
