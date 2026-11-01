// components/TakeawaysCard.jsx
//
// Card "O que você vai encontrar neste artigo" — um resumo prévio (spoiler)
// gerado 1x junto com o artigo (lib/article-generator.js → generateTakeaways)
// e persistido no frontmatter, nunca em runtime. A ideia é a mesma de um
// abstract de paper ou de um "TL;DR": ajudar quem chegou pela busca a decidir
// em segundos se aquele conteúdo específico é útil pra ele, sem precisar
// rolar o artigo inteiro.
//
// Se não houver
// tópicos (post antigo ainda não migrado, ou falha pontual na geração), o
// componente não renderiza nada.
function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4.5 6h.01" />
      <path d="M4.5 12h.01" />
      <path d="M4.5 18h.01" />
    </svg>
  );
}

export default function TakeawaysCard({ takeaways }) {
  if (!Array.isArray(takeaways) || takeaways.length < 2) return null;

  return (
    <aside className="takeaways-card" aria-label="O que você vai encontrar neste artigo">
      <div className="takeaways-card-header">
        <span className="takeaways-card-icon">
          <ListIcon />
        </span>
        <p className="takeaways-card-title">O que você vai encontrar neste artigo</p>
      </div>
      <ul className="takeaways-card-list">
        {takeaways.map((item, i) => (
          <li key={i} className="takeaways-card-item">
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}
