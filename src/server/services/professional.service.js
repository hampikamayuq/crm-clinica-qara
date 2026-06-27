import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";

export function listProfessionals({ active } = {}) {
  const where = {};
  if (active === "true") where.active = true;
  return prisma.professional.findMany({ where, orderBy: { name: "asc" }, include: { defaultUnit: { select: { id: true, name: true } } } });
}

export async function createProfessional(input) {
  if (!input?.name) throw badRequest("name e obrigatorio");
  return prisma.professional.create({
    data: {
      name: input.name,
      specialty: input.specialty || null,
      active: input.active ?? true,
      defaultUnitId: input.defaultUnitId || null,
      userId: input.userId || null,
    },
  });
}

export async function updateProfessional(id, input) {
  const before = await prisma.professional.findUnique({ where: { id } });
  if (!before) throw notFound("Profissional nao encontrado");
  const data = {};
  for (const k of ["name", "specialty", "active", "defaultUnitId", "userId"]) if (input[k] !== undefined) data[k] = input[k];
  return prisma.professional.update({ where: { id }, data });
}

export function getAvailability(professionalId) {
  return prisma.professionalAvailability.findMany({
    where: { professionalId, active: true },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
}

export async function setAvailability(professionalId, slots = []) {
  const pro = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!pro) throw notFound("Profissional nao encontrado");
  if (!Array.isArray(slots)) throw badRequest("slots deve ser uma lista");
  return prisma.$transaction(async (tx) => {
    await tx.professionalAvailability.deleteMany({ where: { professionalId } });
    if (slots.length) {
      await tx.professionalAvailability.createMany({
        data: slots.map((s) => ({
          professionalId,
          unitId: s.unitId || null,
          weekday: Number(s.weekday),
          startTime: String(s.startTime),
          endTime: String(s.endTime),
          active: s.active ?? true,
        })),
      });
    }
    return tx.professionalAvailability.findMany({ where: { professionalId }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] });
  });
}
