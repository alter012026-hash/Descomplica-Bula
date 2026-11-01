import { ImageResponse } from "next/og";
import config from "../../../site.config";

// Esta rota precisa ficar no Edge Runtime para funcionar com next/og.
// Por isso ela NUNCA importa lib/posts.js (que usa fs/path do Node) —
// os dados do post chegam via query string, passados por quem gera o link.
export const runtime = "edge";

// Paleta de cores por categoria
const CATEGORY_COLORS = {
  "Uso seguro": { bg: "#176B4D", accent: "#E8A72E" },
  "Entenda a bula": { bg: "#176B4D", accent: "#E8A72E" },
  "Efeitos e reações": { bg: "#6F4A13", accent: "#F2C36B" },
  "Interações": { bg: "#244D5A", accent: "#87C7D1" },
  "Alertas da Anvisa": { bg: "#683E20", accent: "#F2B75C" },
};

const DEFAULT_COLORS = { bg: "#176B4D", accent: "#E8A72E" };

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Dados do post chegam via query string (?title=...&category=...&excerpt=...&readingTime=...)
  // Fallback genérico caso algum parâmetro não seja enviado
  const title       = searchParams.get("title")       ?? config.name;
  const category    = searchParams.get("category")    ?? "Medicamentos";
  const excerpt     = searchParams.get("excerpt")     ?? config.description;
  const readingTime = searchParams.get("readingTime") ?? "";

  const { bg, accent } = CATEGORY_COLORS[category] ?? DEFAULT_COLORS;

  // Trunca título e excerpt para não explodir o card
  const shortTitle   = title.length   > 72 ? title.slice(0, 69)   + "…" : title;
  const shortExcerpt = excerpt.length > 110 ? excerpt.slice(0, 107) + "…" : excerpt;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bg,
          padding: "64px 72px",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Detalhe decorativo — círculo de fundo */}
        <div
          style={{
            position: "absolute",
            right: "-80px",
            top: "-80px",
            width: "420px",
            height: "420px",
            borderRadius: "50%",
            background: accent,
            opacity: 0.08,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "60px",
            bottom: "-120px",
            width: "320px",
            height: "320px",
            borderRadius: "50%",
            background: accent,
            opacity: 0.06,
          }}
        />

        {/* Topo: logo + categoria */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              color: "white",
              fontSize: "22px",
              fontWeight: "700",
              letterSpacing: "-0.5px",
              opacity: 0.9,
            }}
          >
            {config.name}
          </span>

          <span
            style={{
              background: accent,
              color: bg,
              fontSize: "14px",
              fontWeight: "700",
              padding: "6px 18px",
              borderRadius: "20px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {category}
          </span>
        </div>

        {/* Título principal */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1, justifyContent: "center" }}>
          <div
            style={{
              width: "56px",
              height: "5px",
              background: accent,
              borderRadius: "3px",
            }}
          />
          <p
            style={{
              color: "white",
              fontSize: shortTitle.length > 50 ? "40px" : "48px",
              fontWeight: "800",
              lineHeight: 1.15,
              margin: 0,
              letterSpacing: "-1px",
              maxWidth: "900px",
            }}
          >
            {shortTitle}
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: "20px",
              lineHeight: 1.5,
              margin: 0,
              maxWidth: "820px",
            }}
          >
            {shortExcerpt}
          </p>
        </div>

        {/* Rodapé */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid rgba(255,255,255,0.12)`,
            paddingTop: "24px",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "16px" }}>
            {config.url?.replace("https://", "") ?? "descomplicabula.com.br"}
          </span>
          {readingTime && (
            <span style={{ color: accent, fontSize: "16px", fontWeight: "600" }}>
              {readingTime} de leitura
            </span>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
