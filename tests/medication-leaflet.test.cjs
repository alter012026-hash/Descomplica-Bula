const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MedicationLeafletError,
  OFFICIAL_LEAFLET_URL,
  parseUploadedLeaflet,
} = require("../lib/medication-leaflet");

const pdfBuffer = Buffer.from("%PDF-test");
const validText = "Bula do paciente de Paracetamol 500 mg. ".repeat(12);

test("extracts a supplied PDF and confirms the typed medicine and strength", async () => {
  const leaflet = await parseUploadedLeaflet({
    medicineName: "Paracetamol",
    strength: "500 mg",
    pdfBuffer,
    extractPdfTextImpl: async (buffer) => {
      assert.equal(buffer, pdfBuffer);
      return validText;
    },
  });

  assert.equal(leaflet.medicineName, "Paracetamol");
  assert.equal(leaflet.strength, "500 mg");
  assert.equal(leaflet.text, validText.trim());
  assert.equal(leaflet.officialLeafletUrl, OFFICIAL_LEAFLET_URL);
  assert.equal(typeof leaflet.uploadedAt, "string");
});

test("rejects a PDF whose text does not contain the typed medicine", async () => {
  await assert.rejects(
    parseUploadedLeaflet({
      medicineName: "Dipirona",
      pdfBuffer,
      extractPdfTextImpl: async () => validText,
    }),
    (error) => error instanceof MedicationLeafletError && error.code === "MEDICINE_MISMATCH"
  );
});

test("rejects a concentration that does not appear in the PDF", async () => {
  await assert.rejects(
    parseUploadedLeaflet({
      medicineName: "Paracetamol",
      strength: "750 mg",
      pdfBuffer,
      extractPdfTextImpl: async () => validText,
    }),
    (error) => error instanceof MedicationLeafletError && error.code === "STRENGTH_MISMATCH"
  );
});

test("rejects a non-PDF upload without trying to extract text", async () => {
  await assert.rejects(
    parseUploadedLeaflet({
      medicineName: "Paracetamol",
      pdfBuffer: Buffer.from("<html>arquivo inválido</html>"),
      extractPdfTextImpl: async () => assert.fail("must not parse non-PDF"),
    }),
    (error) => error instanceof MedicationLeafletError && error.code === "INVALID_PDF"
  );
});

test("rejects PDFs without enough extractable text", async () => {
  await assert.rejects(
    parseUploadedLeaflet({
      medicineName: "Paracetamol",
      pdfBuffer,
      extractPdfTextImpl: async () => "texto curto",
    }),
    (error) => error instanceof MedicationLeafletError && error.code === "PDF_UNREADABLE"
  );
});

test("rejects an oversized PDF", async () => {
  const oversizedPdf = Buffer.alloc(4 * 1024 * 1024 + 1);
  oversizedPdf.write("%PDF-");

  await assert.rejects(
    parseUploadedLeaflet({
      medicineName: "Paracetamol",
      pdfBuffer: oversizedPdf,
      extractPdfTextImpl: async () => assert.fail("must reject before parsing"),
    }),
    (error) => error instanceof MedicationLeafletError && error.code === "PDF_TOO_LARGE"
  );
});
