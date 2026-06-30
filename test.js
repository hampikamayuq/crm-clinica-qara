import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWhatsAppMessagePayload, guardAgentReply, injectDoctorPresentation, parseAgentJson, polishAgentReply, previewOutboundText } from "./server.js";
import { faqReply } from "./src/server/services/agent-faq.service.js";
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

test("polishAgentReply remove aberturas roboticas", () => {
  assert.equal(polishAgentReply("Certo — o que você quer ver antes?"), "O que você quer ver antes?");
  assert.equal(polishAgentReply("Lembro sim — você veio da Doctoralia."), "Você veio da Doctoralia.");
});

test("polishAgentReply nao pergunta modalidade em resposta informativa", () => {
  const out = polishAgentReply(
    "O Dr. Miguel atende às segundas, terças e sextas. Você prefere atendimento presencial ou teleconsulta?",
    { inboundText: "que dias atende" },
  );
  assert.equal(out, "O Dr. Miguel atende às segundas, terças e sextas.");
});

test("polishAgentReply nao repete modalidade ja perguntada", () => {
  const out = polishAgentReply("Para unhas, o médico é o Dr. Miguel. Prefere presencial ou teleconsulta?", {
    conversation: { messages: [{ direction: "outbound", text: "Você prefere atendimento presencial ou teleconsulta?" }] },
  });
  assert.equal(out, "Para unhas, o médico é o Dr. Miguel.");
});

test("present_doctor injeta apresentacao curta, nao ficha completa", () => {
  const out = injectDoctorPresentation(
    "Prefere presencial ou teleconsulta?",
    [{ type: "present_doctor", value: "miguel" }],
    { agentState: {} },
  );
  assert.match(out, /Dr\. Miguel Ceccarelli/);
  assert.doesNotMatch(out, /Estacionamento|Valor da Consulta|Formas de Pagamento/);
});

test("faqReply responde horarios por medico sem chamar IA", () => {
  const out = faqReply("que dias o Dr. Miguel atende?", {}, {
    locations: {},
    careTeam: [{
      id: "miguel",
      name: "Dr. Miguel Ceccarelli",
      locations: [{ local: "Copacabana, RJ", horarios: "Segundas 14h-20h" }],
      values: { presencial_rj: 650, teleconsulta: 650 },
    }],
  });
  assert.match(out, /Dr\. Miguel Ceccarelli/);
  assert.match(out, /Segundas 14h-20h/);
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
  assert.match(schema, /\busername\s+String\?/);
  assert.match(schema, /@@index\(\[username\]\)/);
  assert.match(schema, /\bpasswordHash\s+String\?/);
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

test("inbox completo: app.js liga as acoes e endpoints do painel", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  // acoes registradas no handleClick/handleChange/handleSubmit
  for (const action of [
    "inbox-add-tag",
    "inbox-add-note",
    "inbox-new-task",
    "inbox-lead-timeline",
    "inbox-convert-patient",
    "inbox-assign-select",
    "inbox-status-select",
    "inbox-quick-reply",
    "inbox-task",
  ]) {
    assert.ok(app.includes(action), `app.js deveria tratar a acao ${action}`);
  }
  // endpoints consumidos pelo painel
  for (const endpoint of [
    "/assign",
    "/tags",
    "/notes",
    "/api/quick-replies?active=true",
    "/api/tasks",
    "/timeline",
    "/convert-to-patient",
    "/api/users",
  ]) {
    assert.ok(app.includes(endpoint), `app.js deveria chamar ${endpoint}`);
  }
});

test("novo lead com WhatsApp entra no inbox", () => {
  const leadService = readFileSync(new URL("./src/server/services/lead.service.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.ok(leadService.includes("ensureLeadInboxConversation(lead)"), "createLead deve criar/vincular conversa");
  assert.ok(leadService.includes('channel: "whatsapp"'), "conversa do lead manual deve ir para o canal WhatsApp");
  assert.ok(leadService.includes("whatsappExternalId"), "telefone deve ser normalizado antes de virar externalId");
  assert.ok(app.includes("ui.inbox.list = null"), "frontend deve invalidar cache do Inbox apos criar lead");
});

test("login bloqueia a UI antes de carregar o CRM", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const server = readFileSync(new URL("./server.js", import.meta.url), "utf8");
  const router = readFileSync(new URL("./src/server/index.js", import.meta.url), "utf8");
  assert.ok(html.includes('body class="auth-locked"'), "HTML deve iniciar bloqueado");
  assert.ok(app.includes("renderLogin") && app.includes("loginWithPassword"), "app.js deve renderizar e enviar login");
  assert.ok(app.includes("AUTH_TOKEN_STORAGE"), "token autenticado deve ficar separado da chave antiga");
  assert.ok(app.includes("Authorization") && app.includes("Bearer"), "frontend deve usar token de sessao");
  assert.ok(server.includes('/api/auth/login') && server.includes("invalid_credentials"), "server.js deve expor login por usuario/senha");
  assert.ok(router.includes("passwordHash") === false, "rotas publicas nao devem selecionar passwordHash");
  assert.doesNotMatch(app, /window\.prompt\("Digite a ADMIN_API_KEY/, "UI nao deve pedir chave tecnica");
});

test("automacao tenta agente antes do bot de regras", () => {
  const server = readFileSync(new URL("./server.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const serverAgent = server.indexOf("const agentResults = await runAgentAutomation(inboundMessage, store);");
  const serverBot = server.indexOf("return runBotAutomation(inboundMessage, store);");
  const appAgent = app.indexOf("const agentResult = await runServerAgentForLead(lead, text);");
  const appBot = app.indexOf("const result = agentResult || processBots(lead, text);");
  assert.ok(serverAgent >= 0 && serverAgent < serverBot, "servidor deve tentar IA antes do bot");
  assert.ok(appAgent >= 0 && appAgent < appBot, "simulador deve tentar IA antes do bot");
});

test("prompt da Tawany nao promete acesso direto a agenda", () => {
  const prompt = readFileSync(new URL("./src/agent/agent-system-prompt-tawany.md", import.meta.url), "utf8");
  assert.match(prompt, /não tem acesso direto à agenda real/);
  assert.doesNotMatch(prompt, /com acesso ao CRM, à agenda,/);
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

test("pacientes: view DB-native liga acoes, endpoints e nav", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const action of ["select-patient", "new-patient", "patient-edit", "patient-search", 'data-form="patient"']) {
    assert.ok(app.includes(action), `app.js deveria tratar ${action}`);
  }
  for (const piece of ["renderPatients", "/api/patients?limit=200", "/api/patients/", "/timeline"]) {
    assert.ok(app.includes(piece), `app.js deveria conter ${piece}`);
  }
  assert.ok(app.includes('"PATCH"') && app.includes('dbWrite("/api/patients"'), "app.js deveria criar e editar paciente");
  assert.ok(html.includes('data-view="pacientes"'), "index.html deveria ter o nav de pacientes");
});

test("kanban DB-native: funil le e grava LeadStage real do banco", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  for (const piece of [
    "renderFunnelKanban",
    "moveFunnelLead",
    "data-funnel-column",
    "data-funnel-select",
    "funnel-filter-assigned",
    "funnel-filter-temp",
  ]) {
    assert.ok(app.includes(piece), `app.js deveria conter ${piece}`);
  }
  for (const stage of ["NEW", "CONTACTED", "BUDGET_SENT", "PROCEDURE_SCHEDULED", "REACTIVATE"]) {
    assert.ok(app.includes(stage), `LEAD_STAGES deveria conter ${stage}`);
  }
  assert.ok(/dbWrite\(`\/api\/leads\/\$\{id\}`, "PATCH", \{ stage \}\)/.test(app), "moveFunnelLead deveria gravar { stage } no banco");
  assert.ok(app.includes("/api/leads?") || app.includes("apiFetch(`/api/leads?"), "loadFunnel deveria ler /api/leads com query");
});

test("tarefas: view DB-native lista, conclui e edita via /api/tasks", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const piece of [
    "renderTasks",
    "loadTasks",
    "new-task",
    "task-edit",
    "task-complete",
    "task-filter-status",
    "task-filter-assigned",
    "task-filter-overdue",
    'data-form="task"',
  ]) {
    assert.ok(app.includes(piece), `app.js deveria conter ${piece}`);
  }
  assert.ok(app.includes("/api/tasks?"), "loadTasks deveria ler /api/tasks com filtros");
  assert.ok(app.includes("/complete"), "deveria concluir via /api/tasks/:id/complete");
  assert.ok(app.includes('dbWrite("/api/tasks"') && app.includes('"PATCH"'), "deveria criar e editar tarefa");
  assert.ok(html.includes('data-view="tarefas"'), "index.html deveria ter o nav de tarefas");
});
