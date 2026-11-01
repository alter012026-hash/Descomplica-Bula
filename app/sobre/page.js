import Link from "next/link";
import config from "../../site.config";

export const metadata = {
  title: `Sobre - ${config.name}`,
  description: `Conheça o propósito e os limites do ${config.name}.`,
};

export default function SobrePage() {
  return (
    <main className="section section--light">
      <div className="container article-layout">
        <article className="prose">
          <header>
            <h1>Sobre o projeto</h1>
            <p className="article-excerpt">
              Informação sobre medicamentos em linguagem simples, com responsabilidade e transparência.
            </p>
          </header>
          <hr className="article-divider" />
          <h2>O que é o {config.name}?</h2>
          <p>
            Somos um projeto editorial independente que ajuda o público a compreender informações
            sobre medicamentos e a localizar fontes confiáveis. Nosso conteúdo é informativo e não
            oferece diagnóstico, prescrição ou recomendação individual de tratamento.
          </p>
          <h2>Como trabalhamos</h2>
          <p>
            Os textos podem ser produzidos com apoio de inteligência artificial, usam fontes
            oficiais e passam por revisão humana antes de serem publicados. Explicamos o processo
            na nossa <Link href="/metodologia">metodologia editorial</Link>.
          </p>
          <h2>Um limite importante</h2>
          <p>
            Cada pessoa e tratamento são diferentes. Não comece, interrompa nem altere um
            medicamento com base apenas em um artigo. Confira a bula aprovada pela Anvisa e
            converse com um profissional de saúde.
          </p>
          <p>
            <Link href="/fontes-oficiais">Consulte fontes oficiais</Link> ou leia nosso{" "}
            <Link href="/aviso-de-saude">aviso de saúde</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
