const CATEGORY_META = {
  "Entenda a bula": {
    hue: 145, code: "EB",
    description: "Aprenda a localizar e interpretar as informações da bula oficial.",
  },
  "Uso seguro": {
    hue: 160, code: "US",
    description: "Cuidados gerais para conversar com profissionais e usar medicamentos com segurança.",
  },
  "Efeitos e reações": {
    hue: 38, code: "ER",
    description: "Informações sobre efeitos indesejáveis e quando buscar orientação.",
  },
  "Interações": {
    hue: 25, code: "IN",
    description: "Entenda interações entre medicamentos, alimentos e suplementos.",
  },
  "Grupos especiais": {
    hue: 280, code: "GE",
    description: "Cuidados e fontes para gestação, amamentação, crianças e pessoas idosas.",
  },
  "Formas e apresentações": {
    hue: 205, code: "FA",
    description: "Diferenças entre formas farmacêuticas e apresentações.",
  },
  "Genéricos e similares": {
    hue: 190, code: "GS",
    description: "Entenda as categorias de medicamentos e a regulação da Anvisa.",
  },
  "Armazenamento e descarte": {
    hue: 120, code: "AD",
    description: "Orientações para conservar e descartar medicamentos corretamente.",
  },
  "Alertas da Anvisa": {
    hue: 8, code: "AA",
    description: "Alertas sanitários, recolhimentos e comunicados oficiais.",
  },
  "Saúde e prevenção": {
    hue: 220, code: "SP",
    description: "Informação geral de saúde com referências de órgãos oficiais.",
  },
  "Geral": {
    hue: 145, code: "GE",
    description: "Outros conteúdos informativos sobre medicamentos e saúde.",
  },
};

function codeFromName(name) {
  const letters = name.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").filter(Boolean);
  if (letters.length === 0) return "GE";
  if (letters.length === 1) return letters[0].slice(0, 2).toUpperCase();
  return (letters[0][0] + letters[1][0]).toUpperCase();
}

function hueFromName(name) {
  let hue = 0;
  for (const char of name) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return hue;
}

function withLegacyColors(meta) {
  const hue = meta.hue;
  return {
    ...meta,
    bg: `hsla(${hue}, 80%, 50%, 0.12)`,
    color: `hsl(${hue}, 70%, 32%)`,
    border: `hsla(${hue}, 80%, 50%, 0.28)`,
  };
}

function getCategoryMeta(name) {
  const key = name || "Geral";
  if (CATEGORY_META[key]) return withLegacyColors(CATEGORY_META[key]);
  return withLegacyColors({
    hue: hueFromName(key),
    code: codeFromName(key),
    description: CATEGORY_META.Geral.description,
  });
}

module.exports = { CATEGORY_META, getCategoryMeta };
