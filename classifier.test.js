import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./src/server/services/classifier.service.js";
import { EXAMPLES } from "./src/server/config/qara-knowledge.js";

// Fixtures do classificador. Campos do crm exatos; tags por conteúdo.
for (const { message, crm } of EXAMPLES) {
  test(`classify: ${message}`, () => {
    const out = classify(message, {}).crm;
    for (const [key, value] of Object.entries(crm)) {
      if (key === "tags") {
        for (const tag of value) assert.ok(out.tags.includes(tag), `tag ausente: ${tag} em [${out.tags}]`);
      } else {
        assert.equal(out[key], value, `${key}: ${out[key]} != ${value}`);
      }
    }
  });
}

// Invariantes.
test("P1 implica precisa_humano_agora", () => {
  const out = classify("Tenho uma pinta que cresceu e sangrou.").crm;
  if (out.prioridade === "P1") assert.equal(out.precisa_humano_agora, true);
});

test("saida tem formato aninhado crm + acoes_internas", () => {
  const out = classify("Qual o endereço?");
  assert.ok(out.crm && Array.isArray(out.acoes_internas));
  assert.equal(typeof out.crm.pipeline_funil, "string");
});
