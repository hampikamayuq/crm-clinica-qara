import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createActivity, createStatusChangeActivity, getTimelineForLead } from "./activity.service.js";
import { logCreate, logUpdate } from "./audit.service.js";
import { scoreLead, scoreLeadRecord } from "./lead-score.service.js";
import { emit } from "./workflow.service.js";

const LEAD_WRITABLE = [
  "name",
  "phone",
  "email",
  "source",
  "interest",
  "stage",
  "temperature",
  "assignedToId",
  "nextAction",
  "nextActionAt",
  "lostReason",
  "estimatedValue",
  "classification",
  "score",
];

const SCORE_FIELDS = new Set([
  "phone",
  "email",
  "source",
  "interest",
  "stage",
  "temperature",
  "nextAction",
  "nextActionAt",
  "estimatedValue",
  "classification",
]);

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function listLeads(filters = {}) {
  const where = {};
  if (filters.stage) where.stage = filters.stage;
  if (filters.source) where.source = filters.source;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.temperature) where.temperature = filters.temperature;
  if (filters.interest) where.interest = { contains: filters.interest, mode: "insensitive" };
  if (filters.overdue === "true") where.nextActionAt = { lt: new Date() };

  return prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 500),
  });
}

export function getLead(id) {
  return prisma.lead.findUnique({ where: { id } });
}

export async function createLead(input, userId = null) {
  if (!input?.name) throw badRequest("name e obrigatorio");
  const data = pick(input, LEAD_WRITABLE);
  if (data.nextActionAt) data.nextActionAt = new Date(data.nextActionAt);
  const scored = scoreLeadRecord({ ...data, name: input.name });
  if (data.score === undefined) data.score = scored.score;
  if (!data.temperature) data.temperature = scored.temperature;

  const lead = await prisma.lead.create({ data: { ...data, name: input.name } });
  await createActivity({
    type: "LEAD_CREATED",
    title: "Lead criado",
    leadId: lead.id,
    userId,
    metadata: { source: lead.source || null, interest: lead.interest || null },
  });
  await logCreate("Lead", lead.id, lead, userId);
  emit("lead.created", lead);
  return lead;
}

export async function updateLead(id, input, userId = null) {
  const before = await prisma.lead.findUnique({ where: { id } });
  if (!before) throw notFound("Lead nao encontrado");

  const data = pick(input, LEAD_WRITABLE);
  if (data.nextActionAt) data.nextActionAt = new Date(data.nextActionAt);
  if (data.stage === "LOST" && !data.lostReason && !before.lostReason) {
    throw badRequest("lostReason e obrigatorio ao mover o lead para LOST");
  }

  let lead = await prisma.lead.update({ where: { id }, data });
  if (input.score === undefined && affectsScore(data)) {
    lead = await scoreLead(id);
  }
  if (data.stage && data.stage !== before.stage) {
    await createStatusChangeActivity({ leadId: id, from: before.stage, to: data.stage, userId });
    emit("lead.stage_changed", { before, lead });
  }
  await logUpdate("Lead", id, before, lead, userId);
  return lead;
}

function affectsScore(data) {
  return Object.keys(data).some((key) => SCORE_FIELDS.has(key));
}

export async function convertToPatient(id, userId = null) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw notFound("Lead nao encontrado");
  if (lead.patientId) return prisma.patient.findUnique({ where: { id: lead.patientId } });

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.create({
      data: { name: lead.name, phone: lead.phone, email: lead.email },
    });
    await tx.lead.update({ where: { id }, data: { patientId: patient.id } });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        title: "Lead convertido em paciente",
        leadId: id,
        patientId: patient.id,
        userId,
        metadata: { patientId: patient.id },
      },
    });
    return patient;
  });
}

export function leadTimeline(id) {
  return getTimelineForLead(id);
}
