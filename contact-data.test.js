import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAdministrativeData } from "./src/server/services/conversation.service.js";

test("extrai dados administrativos de mensagem do WhatsApp", () => {
  const data = extractAdministrativeData({
    channel: "whatsapp",
    externalId: "5521999998888",
    name: "Maria Silva",
    text: "Meu nome é Maria Silva. CPF 123.456.789-09. Nascimento 05/04/1990.",
  });
  assert.deepEqual(
    { name: data.name, phone: data.phone, cpf: data.cpf, birth: data.birthDate.toISOString().slice(0, 10) },
    { name: "Maria Silva", phone: "5521999998888", cpf: "12345678909", birth: "1990-04-05" },
  );
});

test("nao confunde telefone simples com CPF", () => {
  const data = extractAdministrativeData({ text: "meu telefone 5521999998888" });
  assert.equal(data.phone, "5521999998888");
  assert.equal(data.cpf, undefined);
});
