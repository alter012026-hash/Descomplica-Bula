import config from "../site.config";

// Byline honesto: usa "Publicado por", não "Escrito por" — a alegação real é
// curadoria + revisão editorial, não autoria manual linha a linha.
export default function ArticleByline() {
  return (
    <div className="article-byline">
      <div className="article-byline-badge" aria-hidden="true">
        {config.author.name.charAt(0)}
      </div>
      <div className="article-byline-text">
        <span className="article-byline-name">
          Publicado por <strong>{config.author.name}</strong>
        </span>
        <span className="article-byline-note">
          {config.methodology.summary}{" "}
          <a href="/metodologia">Saiba como produzimos nosso conteúdo →</a>
        </span>
      </div>
    </div>
  );
}
