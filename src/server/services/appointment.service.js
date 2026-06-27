import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createAppointmentActivity } from "./activity.service.js";
import { emit } from "./workflow.service.js";

const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED", "ATTENDED", "RESCHEDULED"];

export function getConflicts({ professionalId, startAt, endAt, excludeId = null }) {
  if (!professionalId || !startAt || !endAt) throw badRequest("professionalId, startAt e endAt sao obrigatorios");
  const start = new Date(startAt);
  const end = new Date(endAt);
  return prisma.appointment.findMany({
    where: {
      professionalId,
      status: { in: ACTIVE_STATUSES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { lt: end },
      endAt: { gt: start },
    },
    orderBy: { startAt: "asc" },
  });
}

export function listAppointments(filters = {}) {
  const where = {};
  if (filters.professionalId) where.professionalId = filters.professionalId;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.startAt = {};
    if (filters.from) where.startAt.gte = new Date(filters.from);
    if (filters.to) where.startAt.lte = new Date(filters.to);
  }
  return prisma.appointment.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: Math.min(Number(filters.limit) || 200, 1000),
    include: {
      professional: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
      appointmentType: { select: { id: true, name: true, durationMinutes: true } },
      lead: { select: { id: true, name: true } },
      patient: { select: { id: true, name: true } },
    },
  });
}

async function resolveEndAt(input) {
  if (input.endAt) return new Date(input.endAt);
  const start = new Date(input.startAt);
  let minutes = 60;
  if (input.appointmentTypeId) {
    const type = await prisma.appointmentType.findUnique({ where: { id: input.appointmentTypeId } });
    if (type?.durationMinutes) minutes = type.durationMinutes;
  }
  return new Date(start.getTime() + minutes * 60000);
}

export async function createAppointment(input) {
  if (!input?.professionalId || !input?.startAt) throw badRequest("professionalId e startAt sao obrigatorios");
  const startAt = new Date(input.startAt);
  const endAt = await resolveEndAt(input);
  const found = await getConflicts({ professionalId: input.professionalId, startAt, endAt });
  if (found.length) {
    const err = badRequest("Conflito de horario para o profissional");
    err.code = "appointment_conflict";
    err.conflicts = found.map((c) => ({ id: c.id, startAt: c.startAt, endAt: c.endAt }));
    throw err;
  }

  const appointment = await prisma.appointment.create({
    data: {
      professionalId: input.professionalId,
      leadId: input.leadId || null,
      patientId: input.patientId || null,
      unitId: input.unitId || null,
      appointmentTypeId: input.appointmentTypeId || null,
      startAt,
      endAt,
      status: input.status || "SCHEDULED",
      value: input.value ?? null,
      notesAdministrative: input.notesAdministrative || null,
    },
  });
  await createAppointmentActivity({ appointmentId: appointment.id, leadId: appointment.leadId, patientId: appointment.patientId });
  emit("appointment.created", appointment);
  return appointment;
}

export async function updateAppointment(id, input) {
  const before = await prisma.appointment.findUnique({ where: { id } });
  if (!before) throw notFound("Agendamento nao encontrado");

  const data = {};
  for (const k of ["status", "value", "notesAdministrative", "unitId", "appointmentTypeId", "leadId", "patientId"]) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (input.startAt) {
    data.startAt = new Date(input.startAt);
    if (input.endAt === undefined) {
      const durationMs = new Date(before.endAt).getTime() - new Date(before.startAt).getTime();
      data.endAt = new Date(data.startAt.getTime() + durationMs);
    }
  }
  if (input.endAt) data.endAt = new Date(input.endAt);

  if (data.startAt || data.endAt) {
    const found = await getConflicts({ professionalId: before.professionalId, startAt: data.startAt || before.startAt, endAt: data.endAt || before.endAt, excludeId: id });
    if (found.length) {
      const err = badRequest("Conflito de horario para o profissional");
      err.code = "appointment_conflict";
      throw err;
    }
  }

  const appointment = await prisma.appointment.update({ where: { id }, data });
  if (data.status && data.status !== before.status) {
    const map = { CONFIRMED: "APPOINTMENT_CONFIRMED", CANCELED: "APPOINTMENT_CANCELED" };
    if (map[data.status]) await createAppointmentActivity({ appointmentId: id, leadId: appointment.leadId, patientId: appointment.patientId, type: map[data.status] });
    if (data.status === "NO_SHOW") emit("appointment.no_show", appointment);
  }
  return appointment;
}

export function cancelAppointment(id) {
  return updateAppointment(id, { status: "CANCELED" });
}
