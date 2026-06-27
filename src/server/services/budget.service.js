import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createActivity } from "./activity.service.js";
import { logUpdate } from "./audit.service.js";
import { emit } from "./workflow.service.js";

export function listBudgets(filters = {}) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.leadId) where.leadId = filters.leadId;
  if (filters.patientId) where.patientId = filters.patientId;
  return prisma.budget.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 200, 1000),
    include: { service: { select: { id: true, name: true } }, payments: true },
  });
}

export async function getBudget(id) {
  const budget = await prisma.budget.findUnique({ where: { id }, include: { payments: true, service: true } });
  if (!budget) throw notFound("Orcamento nao encontrado");
  return withBalance(budget);
}

function withBalance(budget) {
  const paid = (budget.payments || [])
    .filter((p) => p.status === "PAID" || p.status === "PARTIALLY_PAID")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const amount = Number(budget.amount);
  return { ...budget, totalPaid: paid, balance: Math.max(amount - paid, 0) };
}

export async function createBudget(input) {
  if (!input?.title || input?.amount === undefined) throw badRequest("title e amount sao obrigatorios");
  return prisma.budget.create({
    data: {
      title: input.title,
      description: input.description || null,
      amount: input.amount,
      entryAmount: input.entryAmount ?? null,
      installments: input.installments ?? 1,
      status: input.status || "DRAFT",
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      leadId: input.leadId || null,
      patientId: input.patientId || null,
      serviceId: input.serviceId || null,
    },
  });
}

async function transition(id, status, activityType) {
  const before = await prisma.budget.findUnique({ where: { id } });
  if (!before) throw notFound("Orcamento nao encontrado");
  const budget = await prisma.budget.update({ where: { id }, data: { status } });
  await logUpdate("Budget", id, before, budget);
  if (activityType) {
    await createActivity({
      type: activityType,
      title: activityType === "BUDGET_ACCEPTED" ? "Orcamento aceito" : "Orcamento enviado",
      leadId: budget.leadId,
      patientId: budget.patientId,
      metadata: { budgetId: id },
    });
  }
  return budget;
}

export async function updateBudget(id, input) {
  const before = await prisma.budget.findUnique({ where: { id } });
  if (!before) throw notFound("Orcamento nao encontrado");
  const data = {};
  for (const k of ["title", "description", "amount", "entryAmount", "installments", "status", "serviceId"]) if (input[k] !== undefined) data[k] = input[k];
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  const budget = await prisma.budget.update({ where: { id }, data });
  await logUpdate("Budget", id, before, budget);
  return budget;
}

export const sendBudget = async (id) => {
  const budget = await transition(id, "SENT", "BUDGET_SENT");
  emit("budget.sent", budget);
  return budget;
};
export const acceptBudget = (id) => transition(id, "ACCEPTED", "BUDGET_ACCEPTED");
export const rejectBudget = (id) => transition(id, "REJECTED", null);
