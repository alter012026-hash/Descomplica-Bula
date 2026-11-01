const test = require("node:test");
const assert = require("node:assert/strict");

test("medication summary feature flag defaults to disabled and reads stored states", async () => {
  const { getMedicationSummaryEnabled } = await import("../lib/feature-flags.js");
  const options = {
    isConfigured: () => true,
    runPipeline: async () => [null],
  };

  assert.equal(await getMedicationSummaryEnabled(options), false);
  assert.equal(await getMedicationSummaryEnabled({
    ...options,
    runPipeline: async () => ["true"],
  }), true);
  assert.equal(await getMedicationSummaryEnabled({
    ...options,
    runPipeline: async () => ["false"],
  }), false);
});

test("medication summary feature flag fails closed for invalid or unavailable storage", async () => {
  const { getMedicationSummaryEnabled } = await import("../lib/feature-flags.js");

  await assert.rejects(
    getMedicationSummaryEnabled({ isConfigured: () => false }),
    /Configure o Upstash Redis/
  );
  await assert.rejects(
    getMedicationSummaryEnabled({
      isConfigured: () => true,
      runPipeline: async () => ["unexpected"],
    }),
    /estado salvo.*inválido/
  );
});

test("medication summary feature flag saves only boolean values", async () => {
  const { setMedicationSummaryEnabled } = await import("../lib/feature-flags.js");
  let command;
  const options = {
    isConfigured: () => true,
    runPipeline: async (commands) => { command = commands[0]; return ["OK"]; },
  };

  assert.equal(await setMedicationSummaryEnabled(true, options), true);
  assert.deepEqual(command, ["SET", "feature:medication-summary:enabled", "true"]);
  await assert.rejects(setMedicationSummaryEnabled("true", options), /deve ser booleano/);
});
