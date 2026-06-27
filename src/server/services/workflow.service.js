import prisma from "../db.js";
import { createTask } from "./task.service.js";
import { createActivity } from "./activity.service.js";

const DAY = 24 * 60 * 60 * 1000;

const handlers = {
  "lead.created": (lead) =>
    createTask({
      title: "Responder lead",
      description: `Novo lead via ${lead.source || "canal"}${lead.interest ? ` - interesse: ${lead.interest}` : ""}.`,
      leadId: lead.id,
      assignedToId: lead.assignedToId || null,
      dueAt: new Date(Date.now() + DAY),
    }),

  "budget.sent": async (budget) => {
    for (const days of [1, 3, 7]) {
      await createTask({
        title: `Follow-up orcamento (D+${days})`,
        description: `Acompanhar orcamento "${budget.title}".`,
        leadId: budget.leadId || null,
        patientId: budget.patientId || null,
        dueAt: new Date(Date.now() + days * DAY),
      });
    }
  },

  "appointment.created": (appointment) =>
    createTask({
      title: "Confirmar consulta",
      description: "Confirmar a consulta com o paciente.",
      leadId: appointment.leadId || null,
      patientId: appointment.patientId || null,
      dueAt: new Date(Math.max(Date.now(), new Date(appointment.startAt).getTime() - DAY)),
    }),

  "appointment.no_show": async (appointment) => {
    await createTask({ title: "Tentar remarcar (falta)", description: "Paciente faltou. Tentar remarcar.", leadId: appointment.leadId || null, patientId: appointment.patientId || null, dueAt: new Date(Date.now() + DAY) });
    if (appointment.leadId) {
      await prisma.lead.update({ where: { id: appointment.leadId }, data: { stage: "WAITING_PATIENT" } });
      await createActivity({ type: "STATUS_CHANGED", title: "Lead -> WAITING_PATIENT (falta)", leadId: appointment.leadId, metadata: { reason: "no_show" } });
    }
  },

  "conversation.handoff": async ({ conversationId, leadId = null, reason = null, assignedToId = null }) => {
    await createTask({ title: "Atendimento humano necessario", description: reason || "Handoff do agente IA para atendente.", leadId, assignedToId });
    if (conversationId) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "WAITING_TEAM", ...(assignedToId ? { assignedToId } : {}) } });
      await createActivity({ type: "HANDOFF", title: "Handoff IA -> humano", conversationId, leadId, metadata: { reason } });
    }
  },
};

export function emit(event, payload) {
  const handler = handlers[event];
  if (!handler) return Promise.resolve();
  return Promise.resolve().then(() => handler(payload)).catch((error) => console.warn(`workflow_error[${event}]:`, error.message));
}
