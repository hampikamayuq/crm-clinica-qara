import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createTaskActivity } from "./activity.service.js";

export function listTasks(filters = {}) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.leadId) where.leadId = filters.leadId;
  if (filters.patientId) where.patientId = filters.patientId;
  if (filters.overdue === "true") {
    where.dueAt = { lt: new Date() };
    where.status = { in: ["OPEN", "IN_PROGRESS"] };
  }
  return prisma.task.findMany({
    where,
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: Math.min(Number(filters.limit) || 200, 1000),
    include: {
      assignedTo: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, phone: true, patientId: true } },
      patient: { select: { id: true, name: true, phone: true } },
    },
  });
}

export async function createTask(input) {
  if (!input?.title) throw badRequest("title e obrigatorio");
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description || null,
      status: input.status || "OPEN",
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      assignedToId: input.assignedToId || null,
      leadId: input.leadId || null,
      patientId: input.patientId || null,
    },
  });
  await createTaskActivity({ taskId: task.id, leadId: task.leadId, patientId: task.patientId });
  return task;
}

export async function updateTask(id, input) {
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) throw notFound("Tarefa nao encontrada");
  const data = {};
  for (const k of ["title", "description", "status", "assignedToId"]) if (input[k] !== undefined) data[k] = input[k];
  if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  return prisma.task.update({ where: { id }, data });
}

export async function completeTask(id) {
  const task = await prisma.task.update({ where: { id }, data: { status: "DONE" } });
  await createTaskActivity({ taskId: id, leadId: task.leadId, patientId: task.patientId, completed: true });
  return task;
}
