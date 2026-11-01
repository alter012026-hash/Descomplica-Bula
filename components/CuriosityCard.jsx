// components/CuriosityCard.jsx
//
// Substitui a antiga imagem hero (Picsum, sem relação com o conteúdo) pelo
// card "💡 Curiosidade". O texto é gerado uma única vez, no momento da
// criação/regeneração do artigo (lib/article-generator.js → generateCuriosity),
// e persistido no frontmatter do post — nunca em runtime.
//
// Se não houver curiosidade
// (post antigo ainda não migrado, ou falha pontual na geração), o componente
// não renderiza nada em vez de mostrar um espaço vazio ou quebrado.
function LightbulbIcon() {
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
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Z" />
    </svg>
  );
}

export default function CuriosityCard({ curiosity }) {
  if (!curiosity) return null;

  return (
    <aside className="curiosity-card" aria-label="Curiosidade sobre o tema do artigo">
      <div className="curiosity-card-icon">
        <LightbulbIcon />
      </div>
      <div className="curiosity-card-body">
        <span className="curiosity-card-tag">💡 Curiosidade</span>
        <p className="curiosity-card-title">Você sabia?</p>
        <p className="curiosity-card-text">{curiosity}</p>
      </div>
    </aside>
  );
}
