const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMedicationSummaryPrompt,
  hasDoseInstruction,
  parseMedicationSummary,
} = require("../lib/medication-summary");

test("summary prompt includes product identity and forbids dosage guidance", () => {
  const prompt = buildMedicationSummaryPrompt({
    medicineName: "Medicamento X",
    strength: "comprimido",
    uploadedLeaflet: { text: "A bula informa a finalidade do medicamento." },
  });

  assert.match(prompt, /Medicamento X/);
  assert.match(prompt, /A bula informa a finalidade/);
  assert.match(prompt, /somente fatos que estejam claramente sustentados/);
  assert.match(prompt, /Não afirme que o arquivo é autêntico, oficial ou vigente/);
  assert.match(prompt, /Não indique doses/);
  assert.match(prompt, /JSON válido/);
});

test("summary parser validates fields and limits list length", () => {
  const result = parseMedicationSummary(JSON.stringify({
    identified: true,
    medicineName: "Medicamento X",
    activeIngredient: "princípio ativo",
    purpose: "Informação geral.",
    contraindications: ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"],
    sideEffects: [],
    interactions: [],
    precautions: [],
    seekHelp: [],
  }));

  assert.equal(result.identified, true);
  assert.equal(result.contraindications.length, 4);
  assert.equal(result.medicineName, "Medicamento X");
});

test("summary parser refuses dosage instructions", () => {
  assert.throws(() => parseMedicationSummary(JSON.stringify({
    identified: true,
    medicineName: "Medicamento X",
    activeIngredient: "",
    purpose: "Tomar 1 comprimido ao dia.",
    contraindications: [],
    sideEffects: [],
    interactions: [],
    precautions: [],
    seekHelp: [],
  })), /instruções de uso/);
  assert.equal(hasDoseInstruction("usar 20 mg"), true);
});

test("summary parser returns no result when the product cannot be identified", () => {
  assert.deepEqual(parseMedicationSummary('{"identified":false}'), { identified: false });
});
