// MCP server (stdio) do CliniQara. Expoe o CRM para um agente (Claude Desktop/Code).
// Escopo: leitura + escritas seguras (criar tarefa, nota, mover etapa, rascunhar resposta).
// Sem deletar, sem pagamento, sem enviar mensagem ao paciente.
//
// Uso no cliente MCP (ex.: .mcp.json / claude_desktop_config.json):
//   { "command": "node", "args": ["/CAMINHO/crm-clinica-qara/mcp-server.js"] }
// O .env do projeto e carregado automaticamente (precisa de DATABASE_URL).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Carrega .env do diretorio do script ANTES de importar os services (que instanciam Prisma).
const envPath = fileURLToPath(new URL("./.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

// Imports dinamicos: garantem que DATABASE_URL ja existe quando o Prisma e instanciado.
const leads = await import("./src/server/services/lead.service.js");
const patients = await import("./src/server/services/patient.service.js");
const conversations = await import("./src/server/services/conversation.service.js");
const tasks = await import("./src/server/services/task.service.js");
const quickReplies = await import("./src/server/services/quickreply.service.js");
const { substituteVars } = await import("./markdown.js");

const LEAD_STAGES = [
  "NEW", "CONTACTED", "WAITING_PATIENT", "APPOINTMENT_SCHEDULED", "ATTENDED",
  "BUDGET_SENT", "PROCEDURE_SCHEDULED", "LOST", "REACTIVATE",
];

// Serializa resposta: Decimal/BigInt do Prisma viram string legivel.
function ok(data) {
  const text = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return { content: [{ type: "text", text }] };
}

// Envolve o handler: erros viram CallToolResult com isError (o agente le a mensagem).
function tool(handler) {
  return async (args) => {
    try {
      return ok(await handler(args || {}));
    } catch (err) {
      return { content: [{ type: "text", text: `Erro: ${err?.message || err}` }], isError: true };
    }
  };
}

const READ = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };

const server = new McpServer({ name: "cliniqara-crm", version: "0.1.0" });

// ---- Leitura ----
server.registerTool("list_leads", {
  description: "Lista leads do funil. Filtra por etapa (LeadStage) e limite.",
  inputSchema: { stage: z.enum(LEAD_STAGES).optional(), limit: z.number().int().positive().max(500).optional() },
  annotations: READ,
}, tool(({ stage, limit }) => leads.listLeads({ stage, limit })));

server.registerTool("lead_timeline", {
  description: "Timeline de atividades de um lead pelo id.",
  inputSchema: { leadId: z.string() },
  annotations: READ,
}, tool(({ leadId }) => leads.leadTimeline(leadId)));

server.registerTool("list_patients", {
  description: "Lista/busca pacientes por nome ou telefone (parametro search).",
  inputSchema: { search: z.string().optional(), limit: z.number().int().positive().max(500).optional() },
  annotations: READ,
}, tool(({ search, limit }) => patients.listPatients({ search, limit })));

server.registerTool("patient_timeline", {
  description: "Timeline administrativa de um paciente pelo id.",
  inputSchema: { patientId: z.string() },
  annotations: READ,
}, tool(({ patientId }) => patients.patientTimeline(patientId)));

server.registerTool("list_conversations", {
  description: "Lista conversas do inbox. Filtra por status, canal, responsavel.",
  inputSchema: {
    status: z.string().optional(),
    channel: z.string().optional(),
    assignedToId: z.string().optional(),
    limit: z.number().int().positive().max(1000).optional(),
  },
  annotations: READ,
}, tool((f) => conversations.listConversations(f)));

server.registerTool("conversation_messages", {
  description: "Mensagens de uma conversa pelo id.",
  inputSchema: { conversationId: z.string(), limit: z.number().int().positive().max(500).optional() },
  annotations: READ,
}, tool(({ conversationId, limit }) => conversations.getMessages(conversationId, limit)));

server.registerTool("list_tasks", {
  description: "Lista tarefas/follow-ups. Filtra por status, responsavel, atrasadas.",
  inputSchema: {
    status: z.string().optional(),
    assignedToId: z.string().optional(),
    overdue: z.boolean().optional(),
    limit: z.number().int().positive().max(500).optional(),
  },
  annotations: READ,
}, tool((f) => tasks.listTasks(f)));

server.registerTool("list_quick_replies", {
  description: "Lista respostas rapidas cadastradas (atalho, titulo, conteudo).",
  inputSchema: {},
  annotations: READ,
}, tool(() => quickReplies.listQuickReplies({ active: "true" })));

// ---- Escritas seguras ----
server.registerTool("create_task", {
  description: "Cria uma tarefa/follow-up. Requer title; demais campos opcionais.",
  inputSchema: {
    title: z.string(),
    description: z.string().optional(),
    dueAt: z.string().optional(),
    leadId: z.string().optional(),
    patientId: z.string().optional(),
    assignedToId: z.string().optional(),
  },
  annotations: WRITE,
}, tool((input) => tasks.createTask(input)));

server.registerTool("add_note", {
  description: "Adiciona nota interna a uma conversa (suporta markdown).",
  inputSchema: { conversationId: z.string(), text: z.string() },
  annotations: WRITE,
}, tool(({ conversationId, text }) => conversations.addNote(conversationId, text)));

server.registerTool("move_lead_stage", {
  description: "Move um lead para outra etapa (LeadStage). Para LOST, informe lostReason.",
  inputSchema: { leadId: z.string(), stage: z.enum(LEAD_STAGES), lostReason: z.string().optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, tool(({ leadId, stage, lostReason }) => leads.updateLead(leadId, { stage, ...(lostReason ? { lostReason } : {}) })));

server.registerTool("draft_reply", {
  description: "Rascunha (sem enviar) o texto de uma resposta rapida pelo atalho, trocando {{nome}}/{{primeiro_nome}}.",
  inputSchema: { shortcut: z.string(), name: z.string().optional() },
  annotations: READ,
}, tool(async ({ shortcut, name }) => {
  const all = await quickReplies.listQuickReplies({ active: "true" });
  const qr = all.find((r) => (r.shortcut || "").replace(/^\/+/, "") === shortcut.replace(/^\/+/, ""));
  if (!qr) throw new Error(`Resposta rapida '${shortcut}' nao encontrada.`);
  return { shortcut: qr.shortcut, draft: substituteVars(qr.content, name || "") };
}));

await server.connect(new StdioServerTransport());
console.error("[cliniqara-mcp] stdio pronto");
