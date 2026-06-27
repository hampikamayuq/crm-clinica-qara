import prisma from "../db.js";
import { badRequest } from "../lib/errors.js";
import { createActivity } from "./activity.service.js";

export function listPayments(filters = {}) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.budgetId) where.budgetId = filters.budgetId;
  return prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Number(filters.limit) || 200, 1000) });
}

export async function createPayment(input) {
  if (input?.amount === undefined) throw badRequest("amount e obrigatorio");
  const payment = await prisma.payment.create({
    data: {
      budgetId: input.budgetId || null,
      amount: input.amount,
      method: input.method || "PIX",
      installments: input.installments ?? 1,
      cardFee: input.cardFee ?? null,
      status: input.status || "PAID",
      paidAt: input.paidAt ? new Date(input.paidAt) : input.status === "PENDING" ? null : new Date(),
    },
  });

  if (payment.status === "PAID" || payment.status === "PARTIALLY_PAID") {
    const budget = payment.budgetId ? await prisma.budget.findUnique({ where: { id: payment.budgetId }, select: { leadId: true, patientId: true } }) : null;
    await createActivity({
      type: "PAYMENT_RECEIVED",
      title: `Pagamento recebido (${payment.method})`,
      leadId: budget?.leadId || null,
      patientId: budget?.patientId || null,
      metadata: { paymentId: payment.id, amount: String(payment.amount) },
    });
  }
  return payment;
}

export async function updatePayment(id, input) {
  const data = {};
  for (const k of ["status", "method", "installments", "cardFee", "amount"]) if (input[k] !== undefined) data[k] = input[k];
  if (input.paidAt !== undefined) data.paidAt = input.paidAt ? new Date(input.paidAt) : null;
  return prisma.payment.update({ where: { id }, data });
}
