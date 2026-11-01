import config from "../../site.config";

export const metadata = {
  title: `Fontes oficiais - ${config.name}`,
  description: "Links para consultar bulas e informações oficiais sobre medicamentos.",
};

const sources = [
  {
    name: "Consulta de bulas da Anvisa",
    url: "https://consultas.anvisa.gov.br/#/bulario/",
    description: "Consulte bulas de medicamentos registradas na Agência Nacional de Vigilância Sanitária.",
  },
  {
    name: "Bulas e rotulagem de medicamentos — Anvisa",
    url: "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/bulas-e-rotulos",
    description: "Orientações e informações regulatórias sobre bulas e rotulagem.",
  },
  {
    name: "Ministério da Saúde",
    url: "https://www.gov.br/saude/pt-br",
    description: "Informações e serviços oficiais do Ministério da Saúde.",
  },
  {
    name: "Biblioteca Virtual em Saúde",
    url: "https://bvsms.saude.gov.br/",
    description: "Publicações e materiais técnicos do Ministério da Saúde.",
  },
  {
    name: "Disque-Intoxicação — Anvisa",
    url: "https://www.gov.br/anvisa/pt-br/assuntos/agrotoxicos/disque-intoxicacao",
    description: `Orientação em caso de suspeita de intoxicação: ${config.emergency.poisonCenter}.`,
  },
];

export default function FontesOficiaisPage() {
  return (
    <main className="section section--light">
      <div className="container article-layout">
        <article className="prose">
          <header>
            <h1>Fontes oficiais</h1>
            <p className="article-excerpt">
              Para decisões sobre um medicamento, confira a bula vigente e procure um profissional de saúde.
            </p>
          </header>
          <hr className="article-divider" />
          <ul>
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.name}
                </a>
                {" — "}{source.description}
              </li>
            ))}
          </ul>
          <p>
            Links externos podem mudar. Se algum endereço não funcionar, navegue pelo site oficial
            do órgão e procure o serviço pelo nome.
          </p>
        </article>
      </div>
    </main>
  );
}
