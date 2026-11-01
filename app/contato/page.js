import Link from "next/link";
import config from "../../site.config";

export const metadata = {
  title: `Contato - ${config.name}`,
  description: `Fale com a equipe do ${config.name} — dúvidas, sugestões de pauta ou solicitações sobre seus dados.`,
};

export default function ContatoPage() {

  return (
    <>
      <main className="section section--light">
      <div className="container article-layout">

        <article className="prose">

          {/* HERO DA PÁGINA */}
          <header className="reveal">
            <h1>Contato</h1>
            <p className="article-excerpt">
              Encontrou um erro, precisa solicitar uma correção ou quer sugerir um tema? Fale
              com a equipe editorial.
            </p>
          </header>

          <hr className="article-divider" />

          {/* BLOCO 1 — E-MAIL */}
          <div className="reveal">
            <h2>E-mail</h2>
            <p>
              A forma mais rápida de falar com a gente é por e-mail:{" "}
              <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
            </p>
            <p>Costumamos responder em até 2 dias úteis.</p>
          </div>

          {/* BLOCO 2 — O QUE VOCÊ PODE NOS ENVIAR */}
          <div className="reveal">
            <h2>Sobre o que você pode nos escrever</h2>
            <ul className="reveal-stagger">
              <li>Erros ou informações desatualizadas em algum artigo;</li>
              <li>Sugestões de temas sobre medicamentos e saúde que gostaria de ver por aqui;</li>
              <li>
                Solicitações sobre seus dados pessoais (acesso, correção ou exclusão) — veja
                também nossa <Link href="/privacidade">Política de Privacidade</Link>;
              </li>
              <li>Parcerias e outras oportunidades.</li>
            </ul>
          </div>

          {/* BLOCO 3 — NEWSLETTER */}
          <div className="reveal">
            <h2>Quer cancelar a newsletter?</h2>
            <p>
              Não precisa nos escrever para isso — todo e-mail que enviamos tem um link de
              cancelamento (unsubscribe) no rodapé, que remove seu e-mail imediatamente da
              lista.
            </p>
          </div>

          {/* CTA FINAL */}
          <div className="related-posts reveal">
            <h3>Quer ler mais enquanto isso?</h3>
            <Link href="/blog" className="hero-cta">
              Ver todos os artigos →
            </Link>
          </div>

        </article>

      </div>
      </main>
    </>
  );
}
