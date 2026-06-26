import { test } from "node:test";
import assert from "node:assert/strict";
import { guardAgentReply, parseAgentJson } from "./server.js";

// Money path: a agente NUNCA pode mandar um valor que nao seja de careTeam.
test("guardAgentReply substitui valor alucinado quando nao ha medico identificavel", () => {
  const out = guardAgentReply("A consulta fica em R$ 999,00.", null);
  assert.ok(!out.includes("999"), "valor invalido deveria sumir");
});

test("guardAgentReply corrige para o valor do medico quando ha um unico medico no texto", () => {
  const out = guardAgentReply("Com o Dr. Diego a consulta fica R$ 999,00.", null);
  assert.ok(out.includes("450"), "deveria corrigir para o valor do Dr. Diego (450)");
  assert.ok(!out.includes("999"));
});

test("guardAgentReply preserva um valor valido de careTeam", () => {
  const out = guardAgentReply("O valor e R$ 550,00.", null);
  assert.equal(out, "O valor e R$ 550,00.");
});

test("guardAgentReply nao altera texto sem dinheiro", () => {
  const out = guardAgentReply("Oi! Como posso ajudar?", null);
  assert.equal(out, "Oi! Como posso ajudar?");
});

// parser tolerante: o modelo as vezes embrulha o JSON em texto.
test("parseAgentJson extrai JSON cercado por ruido", () => {
  const parsed = parseAgentJson('blá blá {"reply":"oi","confidence":0.9} fim');
  assert.equal(parsed.reply, "oi");
});
