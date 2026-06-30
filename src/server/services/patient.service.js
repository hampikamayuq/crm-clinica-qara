import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getTimelineForPatient } from "./activity.service.js";
import { logCreate, logUpdate } from "./audit.service.js";

const WRITABLE = ["name", "phone", "email", "cpf", "birthDate", "preferredChannel", "lgpdConsent", "notesAdministrative"];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function listPatients(filters = {}) {
  const where = {};
  if (filters.phone) where.phone = { contains: filters.phone };
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search } },
    ];
  }
  return prisma.patient.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Number(filters.limit) || 100, 500) });
}

export async function getPatient(id) {
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw notFound("Paciente nao encontrado");
  return patient;
}

export async function createPatient(input, userId = null) {
  if (!input?.name) throw badRequest("name e obrigatorio");
  const data = pick(input, WRITABLE);
  if (data.birthDate) data.birthDate = new Date(data.birthDate);
  const patient = await prisma.patient.create({ data: { ...data, name: input.name } });
  await logCreate("Patient", patient.id, patient, userId);
  return patient;
}

export async function updatePatient(id, input, userId = null) {
  const before = await prisma.patient.findUnique({ where: { id } });
  if (!before) throw notFound("Paciente nao encontrado");
  const data = pick(input, WRITABLE);
  if (data.birthDate) data.birthDate = new Date(data.birthDate);
  const patient = await prisma.patient.update({ where: { id }, data });
  await logUpdate("Patient", id, before, patient, userId);
  return patient;
}

export function patientTimeline(id) {
  return getTimelineForPatient(id);
}
