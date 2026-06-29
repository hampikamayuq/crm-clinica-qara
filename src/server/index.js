import { sendData, sendError, readBody } from "./lib/respond.js";
import { notFound, badRequest } from "./lib/errors.js";
import { authorize } from "./middleware/auth.middleware.js";
import prisma from "./db.js";
import { backfillConversationLeads, ensureLeadForConversation, recordMessage, getInboxLegacyShape } from "./services/conversation.service.js";
import * as appointments from "./services/appointment.service.js";
import * as budgets from "./services/budget.service.js";
import * as conversations from "./services/conversation.service.js";
import * as csv from "./services/csv.service.js";
import * as followups from "./services/followup.service.js";
import * as leads from "./services/lead.service.js";
import * as leadScore from "./services/lead-score.service.js";
import * as patients from "./services/patient.service.js";
import * as payments from "./services/payment.service.js";
import * as professionals from "./services/professional.service.js";
import * as quickReplies from "./services/quickreply.service.js";
import * as reports from "./services/report.service.js";
import * as services from "./services/service.service.js";
import * as tasks from "./services/task.service.js";
import * as users from "./services/user.service.js";
import * as webhooks from "./services/webhook.service.js";
import * as bots from "./services/bot.service.js";
import { classify } from "./services/classifier.service.js";
import { emit } from "./services/workflow.service.js";

const routes = [
  ["POST", "/api/webhook", ({ body, req }) => webhooks.createLeadFromWebhook(body, req)],
  ["POST", "/api/leads/webhook", ({ body, req }) => webhooks.createLeadFromWebhook(body, req)],

  ["POST", "/api/classify", ({ body }) => {
    if (!body?.message) throw badRequest("message e obrigatorio");
    return classify(body.message, body.context || {});
  }],

  ["GET", "/api/export", async ({ res, query }) => {
    const out = await csv.exportCsv(query.type || "leads");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
    });
    res.end(`\ufeff${out.csv}`);
  }],
  ["POST", "/api/import/leads", ({ body, userId }) => csv.importLeads(body, userId), true],
  ["GET", "/api/followups", ({ query }) => followups.categorizedFollowups(query)],

  ["GET", "/api/users", ({ query }) => query.all
    ? users.listAllUsers()
    : prisma.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, username: true, email: true, role: true, active: true },
      })],
  ["POST", "/api/users", ({ body, req }) => users.createUser(body, req.user), true],
  ["PATCH", "/api/users/:id", ({ params, body, req }) => users.updateUser(params.id, body, req.user), true],
  ["GET", "/api/units", () => prisma.clinicUnit.findMany({ where: { active: true }, orderBy: { name: "asc" } })],
  ["GET", "/api/appointment-types", () => prisma.appointmentType.findMany({ where: { active: true }, orderBy: { name: "asc" } })],

  ["GET", "/api/leads", ({ query }) => leads.listLeads(query)],
  ["POST", "/api/leads", ({ body, userId }) => leads.createLead(body, userId), true],
  ["POST", "/api/leads/score-all", () => leadScore.scoreAllLeads(), true],
  ["GET", "/api/leads/:id", async ({ params }) => {
    const lead = await leads.getLead(params.id);
    if (!lead) throw notFound("Lead nao encontrado");
    return lead;
  }],
  ["PATCH", "/api/leads/:id", ({ params, body, userId }) => leads.updateLead(params.id, body, userId), true],
  ["POST", "/api/leads/:id/score", ({ params }) => leadScore.scoreLead(params.id), true],
  ["POST", "/api/leads/:id/convert-to-patient", ({ params, userId }) => leads.convertToPatient(params.id, userId), true],
  ["GET", "/api/leads/:id/timeline", ({ params }) => leads.leadTimeline(params.id)],

  ["GET", "/api/patients", ({ query }) => patients.listPatients(query)],
  ["POST", "/api/patients", ({ body, userId }) => patients.createPatient(body, userId), true],
  ["GET", "/api/patients/:id", ({ params }) => patients.getPatient(params.id)],
  ["PATCH", "/api/patients/:id", ({ params, body, userId }) => patients.updatePatient(params.id, body, userId), true],
  ["GET", "/api/patients/:id/timeline", ({ params }) => patients.patientTimeline(params.id)],

  ["GET", "/api/inbox", ({ query }) => conversations.listConversations(query)],
  ["GET", "/api/conversations/:id", ({ params }) => conversations.getConversation(params.id)],
  ["POST", "/api/conversations/backfill-leads", ({ body }) => backfillConversationLeads(body?.limit || 500), true],
  ["PATCH", "/api/conversations/:id", ({ params, body }) => conversations.updateConversation(params.id, body), true],
  ["POST", "/api/conversations/:id/assign", ({ params, body }) => conversations.assignConversation(params.id, body.assignedToId || null), true],
  ["POST", "/api/conversations/:id/resolve", ({ params }) => conversations.resolveConversation(params.id), true],
  ["POST", "/api/conversations/:id/tags", ({ params, body }) => conversations.addTag(params.id, body.name), true],
  ["POST", "/api/conversations/:id/notes", ({ params, body, userId }) => conversations.addNote(params.id, body.text, userId), true],
  ["GET", "/api/conversations/:id/messages", ({ params, query }) => conversations.getMessages(params.id, query.limit)],
  ["POST", "/api/conversations/:id/messages", ({ params, body }) => conversations.postOutboundMessage(params.id, body.text, body.metadata || null), true],

  ["GET", "/api/appointments", ({ query }) => appointments.listAppointments(query)],
  ["GET", "/api/appointments/conflicts", ({ query }) => appointments.getConflicts(query)],
  ["POST", "/api/appointments", ({ body }) => appointments.createAppointment(body), true],
  ["PATCH", "/api/appointments/:id", ({ params, body }) => appointments.updateAppointment(params.id, body), true],
  ["DELETE", "/api/appointments/:id", ({ params }) => appointments.cancelAppointment(params.id), true],

  ["GET", "/api/professionals", ({ query }) => professionals.listProfessionals(query)],
  ["POST", "/api/professionals", ({ body }) => professionals.createProfessional(body), true],
  ["PATCH", "/api/professionals/:id", ({ params, body }) => professionals.updateProfessional(params.id, body), true],
  ["GET", "/api/professionals/:id/availability", ({ params }) => professionals.getAvailability(params.id)],
  ["PUT", "/api/professionals/:id/availability", ({ params, body }) => professionals.setAvailability(params.id, body.slots || body), true],

  ["GET", "/api/services", ({ query }) => services.listServices(query)],
  ["POST", "/api/services", ({ body }) => services.createService(body), true],
  ["PATCH", "/api/services/:id", ({ params, body }) => services.updateService(params.id, body), true],

  ["GET", "/api/quick-replies", ({ query }) => quickReplies.listQuickReplies(query)],
  ["POST", "/api/quick-replies", ({ body }) => quickReplies.createQuickReply(body), true],
  ["PATCH", "/api/quick-replies/:id", ({ params, body }) => quickReplies.updateQuickReply(params.id, body), true],

  ["GET", "/api/budgets", ({ query }) => budgets.listBudgets(query)],
  ["POST", "/api/budgets", ({ body }) => budgets.createBudget(body), true],
  ["GET", "/api/budgets/:id", ({ params }) => budgets.getBudget(params.id)],
  ["PATCH", "/api/budgets/:id", ({ params, body }) => budgets.updateBudget(params.id, body), true],
  ["POST", "/api/budgets/:id/send", ({ params }) => budgets.sendBudget(params.id), true],
  ["POST", "/api/budgets/:id/accept", ({ params }) => budgets.acceptBudget(params.id), true],
  ["POST", "/api/budgets/:id/reject", ({ params }) => budgets.rejectBudget(params.id), true],

  ["GET", "/api/payments", ({ query }) => payments.listPayments(query)],
  ["POST", "/api/payments", ({ body }) => payments.createPayment(body), true],
  ["PATCH", "/api/payments/:id", ({ params, body }) => payments.updatePayment(params.id, body), true],

  ["GET", "/api/tasks", ({ query }) => tasks.listTasks(query)],
  ["POST", "/api/tasks", ({ body }) => tasks.createTask(body), true],
  ["PATCH", "/api/tasks/:id", ({ params, body }) => tasks.updateTask(params.id, body), true],
  ["POST", "/api/tasks/:id/complete", ({ params }) => tasks.completeTask(params.id), true],

  ["GET", "/api/bots", () => bots.listBots()],
  ["POST", "/api/bots", ({ body }) => bots.createBot(body), true],
  ["PATCH", "/api/bots/:id", ({ params, body }) => bots.updateBot(params.id, body), true],
  ["DELETE", "/api/bots/:id", ({ params }) => bots.deleteBot(params.id), true],

  ["GET", "/api/activities", ({ query }) => listActivities(query)],
  ["POST", "/api/activities", ({ body }) => prisma.activity.create({ data: body }), true],

  ["GET", "/api/reports/financial-summary", () => reports.financialSummary()],
  ["GET", "/api/reports/conversion-summary", () => reports.conversionSummary()],
  ["GET", "/api/reports/daily-briefing", () => reports.dailyBriefing()],
  ["GET", "/api/reports/pipeline-analysis", () => reports.pipelineAnalysis()],
];

// Espelhamento ao vivo: o webhook (server.js) chama isto best-effort para gravar
// cada mensagem tambem no banco, sem bloquear nem quebrar o fluxo JSON.
// Classifica cada mensagem de paciente (inbound) e grava na conversa + lead linkado.
// P1 (precisa_humano_agora) dispara o handoff que ja existe. Best-effort.
export async function classifyInboundToDb({ channel, externalId, text, name }) {
  if (!channel || !externalId || !text) return null;
  try {
    const result = classify(text, { telefone: channel === "whatsapp" ? externalId : null, nome: name });
    const convo = await prisma.conversation.upsert({
      where: { channel_externalId: { channel, externalId } },
      update: { classification: result },
      create: { channel, externalId, status: "OPEN", classification: result, lastMessageAt: new Date() },
      select: { id: true, leadId: true, status: true },
    });
    const lead = await ensureLeadForConversation(convo.id, { name, text, classification: result });
    if (result.crm?.precisa_humano_agora && convo.status !== "WAITING_TEAM") {
      await emit("conversation.handoff", {
        conversationId: convo.id,
        leadId: lead?.id || convo.leadId,
        reason: result.crm.motivo_alerta || "Caso prioritario (classificador)",
      });
    }
    return result;
  } catch (error) {
    console.warn("classify_inbound_skip:", error.message);
    return null;
  }
}

export async function mirrorMessageToDb(flat) {
  try {
    await recordMessage({
      channel: flat.channel,
      externalId: flat.externalId,
      text: flat.text,
      direction: flat.direction, // "inbound"/"outbound" -> normalizado no service
      providerMessageId: flat.id || flat.providerMessageId || null,
      metadata: flat.metadata || null,
      createdAt: flat.timestamp ? Number(flat.timestamp) : null,
    });
  } catch (error) {
    console.warn("mirror_db_skip:", error.message);
  }
}

function matchPath(pattern, pathname) {
  const pp = pattern.split("/").filter(Boolean);
  const ap = pathname.split("/").filter(Boolean);
  if (pp.length !== ap.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i += 1) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
    else if (pp[i] !== ap[i]) return null;
  }
  return params;
}

export async function handleModularApi(req, res, url) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/")) return false;

  for (const route of routes) {
    const [method, path, handler, write] = route;
    if (method !== req.method) continue;
    const params = matchPath(path, pathname);
    if (!params) continue;

    try {
      if (write) {
        const auth = authorize(req);
        if (!auth.ok) {
          sendError(res, auth.error, auth.code, auth.code === "unauthorized" ? 401 : 403);
          return true;
        }
      }
      const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams.entries());
      const data = await handler({ req, res, params, body, query, userId: req.user?.id || req.headers["x-user-id"] || null });
      if (!res.writableEnded) sendData(res, serializeDecimals(data));
    } catch (err) {
      const status = err.statusCode || 500;
      const code = err.code || "internal_error";
      if (status >= 500) console.error("api_error", err.message);
      sendError(res, err.message || "Erro interno", code, status);
    }
    return true;
  }
  return false;
}

// Prisma retorna Decimal (decimal.js); garante serializacao como string numerica.
function serializeDecimals(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && typeof v.toFixed === "function" && v.constructor?.name === "Decimal"
        ? v.toString()
        : v,
    ),
  );
}

function listActivities(filters = {}) {
  const where = {};
  if (filters.leadId) where.leadId = filters.leadId;
  if (filters.patientId) where.patientId = filters.patientId;
  if (filters.conversationId) where.conversationId = filters.conversationId;
  if (filters.type) where.type = filters.type;
  return prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 200, 1000),
  });
}

export { getInboxLegacyShape };
export const deleteConversationDb = (args) => conversations.deleteConversation(args);
export default handleModularApi;
