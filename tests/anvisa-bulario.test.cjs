const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AnvisaBularioError,
  fetchOfficialLeaflet,
  OFFICIAL_LEAFLET_URL,
} = require("../lib/anvisa-bulario");

const product = {
  nomeProduto: "PARACETAMOL",
  idBulaPacienteProtegido: 12345,
  razaoSocial: "Fabricante de teste",
  numeroRegistro: "123456789",
};

function createFetch({ products = [product], pdf = Buffer.from("%PDF-test"), searchStatus = 200, pdfStatus = 200 } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/consulta/bulario?")) {
      return Response.json({ content: products }, { status: searchStatus });
    }
    return new Response(pdf, {
      status: pdfStatus,
      headers: { "Content-Type": "application/pdf" },
    });
  };
  return { fetchImpl, requests };
}

test("consulta a bula do paciente na Anvisa e extrai o PDF oficial", async () => {
  const { fetchImpl, requests } = createFetch();
  const leaflet = await fetchOfficialLeaflet({
    medicineName: "Paracetamol",
    strength: "500 mg",
    fetchImpl,
    extractPdfTextImpl: async (buffer) => {
      assert.equal(buffer.toString("ascii", 0, 5), "%PDF-");
      return "Texto oficial da bula, concentração 500 mg. ".repeat(20);
    },
  });

  assert.equal(leaflet.medicineName, "PARACETAMOL");
  assert.equal(leaflet.manufacturer, "Fabricante de teste");
  assert.equal(leaflet.registration, "123456789");
  assert.equal(leaflet.text, "Texto oficial da bula, concentração 500 mg. ".repeat(20).trim());
  assert.equal(leaflet.officialLeafletUrl, OFFICIAL_LEAFLET_URL);
  assert.match(requests[0].url, /filter%5BnomeProduto%5D=Paracetamol/);
  assert.match(requests[1].url, /\/arquivo\/bula\/parecer\/12345\//);
  assert.equal(requests[1].options.headers.Accept, "application/pdf");
});

test("não usa um produto sem correspondência exata", async () => {
  const { fetchImpl, requests } = createFetch({
    products: [{ ...product, nomeProduto: "PARACETAMOL + CAFEÍNA" }],
  });

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "Paracetamol",
      fetchImpl,
      extractPdfTextImpl: async () => assert.fail("não deve baixar bula"),
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_NOT_FOUND"
  );
  assert.equal(requests.length, 1);
});

test("recusa resultados ambíguos sem identificação segura", async () => {
  const { fetchImpl, requests } = createFetch({
    products: [product, { ...product, idBulaPacienteProtegido: 54321, razaoSocial: "Outro fabricante" }],
  });

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "PARACETAMOL",
      fetchImpl,
      extractPdfTextImpl: async () => assert.fail("não deve baixar bula"),
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_AMBIGUOUS"
  );
  assert.equal(requests.length, 1);
});

test("retorna fallback explícito quando a consulta da Anvisa bloqueia a busca", async () => {
  const { fetchImpl } = createFetch({ searchStatus: 403 });

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "PARACETAMOL",
      fetchImpl,
      extractPdfTextImpl: async () => assert.fail("não deve baixar bula"),
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_UNAVAILABLE"
  );
});

test("não aceita resposta que não seja um PDF legível", async () => {
  const { fetchImpl } = createFetch({ pdf: Buffer.from("página de bloqueio") });

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "PARACETAMOL",
      fetchImpl,
      extractPdfTextImpl: async () => assert.fail("não deve interpretar HTML como PDF"),
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_INVALID_PDF"
  );
});

test("não resume PDF sem texto extraído suficiente", async () => {
  const { fetchImpl } = createFetch();

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "PARACETAMOL",
      fetchImpl,
      extractPdfTextImpl: async () => "texto curto",
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_PDF_UNREADABLE"
  );
});

test("recusa uma concentração não encontrada no texto da bula", async () => {
  const { fetchImpl } = createFetch();

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "PARACETAMOL",
      strength: "750 mg",
      fetchImpl,
      extractPdfTextImpl: async () => "Texto oficial da bula, concentração 500 mg. ".repeat(20),
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_STRENGTH_MISMATCH"
  );
});

test("falha fechada se a Anvisa não disponibilizar o PDF", async () => {
  const { fetchImpl } = createFetch({ pdfStatus: 403 });

  await assert.rejects(
    fetchOfficialLeaflet({
      medicineName: "PARACETAMOL",
      fetchImpl,
      extractPdfTextImpl: async () => assert.fail("não deve interpretar PDF indisponível"),
    }),
    (error) => error instanceof AnvisaBularioError && error.code === "ANVISA_UNAVAILABLE"
  );
});
