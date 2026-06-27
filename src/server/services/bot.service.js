import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";

export function listBots() {
  return prisma.bot.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createBot(input) {
  if (!input?.name) throw badRequest("name e obrigatorio");
  return prisma.bot.create({
    data: {
      name: input.name,
      trigger: input.trigger || "Qualquer nova conversa",
      active: input.active ?? true,
      steps: Array.isArray(input.steps) ? input.steps : [],
    },
  });
}

export async function updateBot(id, input) {
  const before = await prisma.bot.findUnique({ where: { id } });
  if (!before) throw notFound("Bot nao encontrado");
  const data = {};
  for (const k of ["name", "trigger", "active", "steps"]) if (input[k] !== undefined) data[k] = input[k];
  return prisma.bot.update({ where: { id }, data });
}

export async function deleteBot(id) {
  await prisma.bot.delete({ where: { id } }).catch(() => {});
  return { id };
}
