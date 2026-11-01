const stateRows = [
  ["AC", "Acre", "Norte", "Rio Branco"],
  ["AL", "Alagoas", "Nordeste", "Maceió"],
  ["AP", "Amapá", "Norte", "Macapá"],
  ["AM", "Amazonas", "Norte", "Manaus"],
  ["BA", "Bahia", "Nordeste", "Salvador"],
  ["CE", "Ceará", "Nordeste", "Fortaleza"],
  ["DF", "Distrito Federal", "Centro-Oeste", "Brasília"],
  ["ES", "Espírito Santo", "Sudeste", "Vitória"],
  ["GO", "Goiás", "Centro-Oeste", "Goiânia"],
  ["MA", "Maranhão", "Nordeste", "São Luís"],
  ["MT", "Mato Grosso", "Centro-Oeste", "Cuiabá"],
  ["MS", "Mato Grosso do Sul", "Centro-Oeste", "Campo Grande"],
  ["MG", "Minas Gerais", "Sudeste", "Belo Horizonte"],
  ["PA", "Pará", "Norte", "Belém"],
  ["PB", "Paraíba", "Nordeste", "João Pessoa"],
  ["PR", "Paraná", "Sul", "Curitiba"],
  ["PE", "Pernambuco", "Nordeste", "Recife"],
  ["PI", "Piauí", "Nordeste", "Teresina"],
  ["RJ", "Rio de Janeiro", "Sudeste", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte", "Nordeste", "Natal"],
  ["RS", "Rio Grande do Sul", "Sul", "Porto Alegre"],
  ["RO", "Rondônia", "Norte", "Porto Velho"],
  ["RR", "Roraima", "Norte", "Boa Vista"],
  ["SC", "Santa Catarina", "Sul", "Florianópolis"],
  ["SP", "São Paulo", "Sudeste", "São Paulo"],
  ["SE", "Sergipe", "Nordeste", "Aracaju"],
  ["TO", "Tocantins", "Norte", "Palmas"],
];

export const brazilStates = stateRows.map(([code, name, region, capital]) => ({
  code,
  name,
  region,
  capital,
}));

export function getBrazilState(code) {
  return brazilStates.find((state) => state.code === String(code || "").toUpperCase()) || null;
}
