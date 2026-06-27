import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";

export function listServices({ active, category } = {}) {
  const where = {};
  if (active === "true") where.active = true;
  if (category) where.category = category;
  return prisma.service.findMany({ where, orderBy: { name: "asc" } });
}

export async function createService(input) {
  if (!input?.name) throw badRequest("name e obrigatorio");
  return prisma.service.create({
    data: { name: input.name, category: input.category || null, basePrice: input.basePrice ?? 0, active: input.active ?? true },
  });
}

export async function updateService(id, input) {
  const before = await prisma.service.findUnique({ where: { id } });
  if (!before) throw notFound("Servico nao encontrado");
  const data = {};
  for (const k of ["name", "category", "basePrice", "active"]) if (input[k] !== undefined) data[k] = input[k];
  return prisma.service.update({ where: { id }, data });
}
