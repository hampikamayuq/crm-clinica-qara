import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";

export function listQuickReplies({ active } = {}) {
  const where = {};
  if (active === "true") where.active = true;
  return prisma.quickReply.findMany({ where, orderBy: { shortcut: "asc" } });
}

export async function createQuickReply(input) {
  if (!input?.shortcut || !input?.content) throw badRequest("shortcut e content sao obrigatorios");
  return prisma.quickReply.create({
    data: { shortcut: input.shortcut, title: input.title || input.shortcut, content: input.content, active: input.active ?? true },
  });
}

export async function updateQuickReply(id, input) {
  const before = await prisma.quickReply.findUnique({ where: { id } });
  if (!before) throw notFound("Quick reply nao encontrada");
  const data = {};
  for (const k of ["shortcut", "title", "content", "active"]) if (input[k] !== undefined) data[k] = input[k];
  return prisma.quickReply.update({ where: { id }, data });
}
