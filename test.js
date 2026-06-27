import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWhatsAppMessagePayload, guardAgentReply, parseAgentJson, previewOutboundText } from "./server.js";
import { calculateLeadScore, temperatureFromScore } from "./src/server/services/lead-score.service.js";

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

test("schema Prisma mantem o escopo CRM completo", () => {
  const schema = readFileSync(new URL("./prisma/schema.prisma", import.meta.url), "utf8");
  for (const model of [
    "User",
    "ClinicUnit",
    "Professional",
    "Lead",
    "Patient",
    "Conversation",
    "Message",
    "Appointment",
    "AppointmentType",
    "ProfessionalAvailability",
    "Service",
    "Budget",
    "Payment",
    "Activity",
    "Task",
    "AuditLog",
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\b`));
  }
  assert.match(schema, /\bscore\s+Int\s+@default\(0\)/);
});

test("roteador modular expoe os endpoints CRM centrais", () => {
  const router = readFileSync(new URL("./src/server/index.js", import.meta.url), "utf8");
  for (const endpoint of [
    "/api/webhook",
    "/api/export",
    "/api/import/leads",
    "/api/followups",
    "/api/conversations/backfill-leads",
    "/api/leads/:id/score",
    "/api/leads/score-all",
    "/api/leads/:id/convert-to-patient",
    "/api/patients/:id/timeline",
    "/api/conversations/:id/tags",
    "/api/professionals/:id/availability",
    "/api/budgets/:id/send",
    "/api/tasks/:id/complete",
    "/api/reports/financial-summary",
    "/api/reports/daily-briefing",
    "/api/reports/pipeline-analysis",
  ]) {
    assert.ok(router.includes(endpoint), `${endpoint} deveria existir no roteador`);
  }
});

test("score automatico classifica lead quente quando ha alta intencao", () => {
  const score = calculateLeadScore({
    phone: "+5521999999999",
    email: "paciente@email.com",
    source: "site",
    interest: "melasma",
    estimatedValue: 2500,
    classification: { crm: { prioridade: "P2", temperatura: "Quente", proxima_acao: "Oferecer consulta" } },
    activityCount: 2,
  });
  assert.ok(score >= 70);
  assert.equal(temperatureFromScore(score), "HOT");
});

test("WhatsApp interativo monta payload de botoes", () => {
  const payload = buildWhatsAppMessagePayload("5521999999999", "Escolha uma opcao", {
    messageType: "buttons",
    whatsapp: { buttons: [{ id: "agendar", title: "Agendar" }, { id: "valores", title: "Valores" }] },
  });
  assert.equal(payload.type, "interactive");
  assert.equal(payload.interactive.type, "button");
  assert.equal(payload.interactive.action.buttons.length, 2);
});

test("WhatsApp lista monta secoes e linhas", () => {
  const payload = buildWhatsAppMessagePayload("5521999999999", "Como quer seguir?", {
    messageType: "list",
    whatsapp: {
      buttonText: "Ver opcoes",
      sections: [{ title: "Atendimento", rows: [{ id: "consulta", title: "Consulta", description: "Agendar consulta" }] }],
    },
  });
  assert.equal(payload.type, "interactive");
  assert.equal(payload.interactive.type, "list");
  assert.equal(payload.interactive.action.sections[0].rows[0].id, "consulta");
});

test("WhatsApp template monta modelo aprovado", () => {
  const payload = buildWhatsAppMessagePayload("5521999999999", "", {
    messageType: "template",
    whatsapp: { templateName: "consulta_confirmacao", languageCode: "pt_BR", bodyParams: ["Maria", "10:00"] },
  });
  assert.equal(payload.type, "template");
  assert.equal(payload.template.name, "consulta_confirmacao");
  assert.equal(payload.template.components[0].parameters.length, 2);
  assert.equal(previewOutboundText({}, { messageType: "template", whatsapp: { templateName: "consulta_confirmacao" } }), "[Modelo WhatsApp: consulta_confirmacao]");
});
