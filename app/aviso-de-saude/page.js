import config from "../../site.config";

export const metadata = {
  title: `Aviso de saúde - ${config.name}`,
  description: "Limites e orientações de segurança para o conteúdo deste site.",
};

export default function AvisoDeSaudePage() {
  return (
    <main className="section section--light">
      <div className="container article-layout">
        <article className="prose">
          <header>
            <h1>Aviso importante de saúde</h1>
            <p className="article-excerpt">
              O conteúdo deste site é educativo e não substitui atendimento ou orientação individual.
            </p>
          </header>
          <hr className="article-divider" />
          <h2>Não é consulta nem prescrição</h2>
          <p>
            O {config.name} não diagnostica, prescreve, recomenda tratamentos nem define doses.
            Não comece, interrompa, combine ou altere medicamentos com base apenas no que leu aqui.
            Confira a bula oficial e converse com médico, farmacêutico ou outro profissional habilitado.
          </p>
          <h2>Emergências e intoxicações</h2>
          <p>
            Em uma emergência, ligue para o SAMU pelo <strong>{config.emergency.samu}</strong> ou
            procure um serviço de urgência. Em caso de suspeita de intoxicação, ligue para o
            Disque-Intoxicação pelo <strong>{config.emergency.poisonCenter}</strong>.
          </p>
          <p>
            Se houver risco imediato de suicídio, procure um serviço de emergência; o CVV atende
            pelo <strong>{config.emergency.cvv}</strong>.
          </p>
          <h2>Atualizações</h2>
          <p>
            Informações e bulas podem mudar. A referência válida é sempre a fonte oficial mais
            recente e a orientação do profissional que conhece o seu caso.
          </p>
        </article>
      </div>
    </main>
  );
}
