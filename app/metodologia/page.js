import Link from "next/link";
import config from "../../site.config";

export const metadata = {
  title: `Metodologia - ${config.name}`,
  description: `Como o ${config.name} produz, revisa e corrige conteúdo de saúde.`,
};

export default function MetodologiaPage() {
  return (
    <main className="section section--light">
      <div className="container article-layout">
        <article className="prose">
          <header>
            <h1>Como produzimos nosso conteúdo</h1>
            <p className="article-excerpt">{config.methodology.summary}</p>
          </header>
          <hr className="article-divider" />
          <h2>Fontes e produção</h2>
          <p>
            A equipe consulta primeiro documentos oficiais, como bulas aprovadas e materiais da
            Anvisa e do Ministério da Saúde. Ferramentas de inteligência artificial podem apoiar
            a redação, mas não são fonte de verdade nem substituem a checagem.
          </p>
          <h2>Revisão antes da publicação</h2>
          <p>
            Todo conteúdo passa por revisão humana obrigatória. A equipe confere afirmações,
            links, avisos de segurança e a presença de referências oficiais. Artigos com
            validações pendentes não podem ser publicados.
          </p>
          <h2>Limites e correções</h2>
          <p>
            Bulas e alertas podem mudar. Consulte sempre a versão vigente na fonte oficial e
            converse com um profissional de saúde antes de tomar decisões. Se encontrar erro ou
            informação desatualizada, avise pela página de <Link href="/contato">contato</Link>.
          </p>
          <p>
            Conheça nossas <Link href="/fontes-oficiais">fontes oficiais</Link> e o{" "}
            <Link href="/aviso-de-saude">aviso de saúde</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
