import prisma from "../db.js";

export function createActivity({
  type,
  title,
  description = null,
  leadId = null,
  patientId = null,
  conversationId = null,
  userId = null,
  metadata = null,
}) {
  return prisma.activity.create({
    data: { type, title, description, leadId, patientId, conversationId, userId, metadata },
  });
}

export function createStatusChangeActivity({ leadId, from, to, userId = null }) {
  return createActivity({
    type: "STATUS_CHANGED",
    title: `Etapa alterada: ${from} -> ${to}`,
    leadId,
    userId,
    metadata: { from, to },
  });
}

export function createMessageActivity({ conversationId, leadId = null, patientId = null, direction, metadata = null }) {
  const type = direction === "INBOUND" ? "MESSAGE_RECEIVED" : "MESSAGE_SENT";
  const title = direction === "INBOUND" ? "Mensagem recebida" : "Mensagem enviada";
  return createActivity({ type, title, conversationId, leadId, patientId, metadata });
}

export function createAppointmentActivity({ appointmentId, leadId = null, patientId = null, type = "APPOINTMENT_CREATED" }) {
  const titles = {
    APPOINTMENT_CREATED: "Consulta criada",
    APPOINTMENT_CONFIRMED: "Consulta confirmada",
    APPOINTMENT_CANCELED: "Consulta cancelada",
  };
  return createActivity({ type, title: titles[type] || "Consulta", leadId, patientId, metadata: { appointmentId } });
}

export function createTaskActivity({ taskId, leadId = null, patientId = null, completed = false }) {
  return createActivity({
    type: completed ? "TASK_COMPLETED" : "TASK_CREATED",
    title: completed ? "Tarefa concluida" : "Tarefa criada",
    leadId,
    patientId,
    metadata: { taskId },
  });
}

export function getTimelineForLead(leadId, limit = 100) {
  return prisma.activity.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: limit });
}

export function getTimelineForPatient(patientId, limit = 100) {
  return prisma.activity.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: limit });
}
