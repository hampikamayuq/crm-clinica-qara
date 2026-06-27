import prisma from "../db.js";
import { notFound } from "../lib/errors.js";

const TEMP_BASE = { COLD: 10, WARM: 25, HOT: 40 };
const STAGE_BONUS = {
  NEW: 0,
  CONTACTED: 6,
  WAITING_PATIENT: 3,
  APPOINTMENT_SCHEDULED: 16,
  ATTENDED: 8,
  BUDGET_SENT: 14,
  PROCEDURE_SCHEDULED: 20,
  REACTIVATE: 5,
  LOST: -30,
};

export function calculateLeadScore(input = {}) {
  const crm = input.classification?.crm || {};
  const temperature = normalizeTemperature(crm.temperatura || input.temperature);
  let score = TEMP_BASE[temperature] ?? 20;

  if (input.phone || input.hasPhone) score += 10;
  if (input.email || input.hasEmail) score += 8;
  if (input.source) score += 4;
  if (input.interest) score += 8;

  const value = Number(input.estimatedValue || 0);
  if (Number.isFinite(value) && value > 0) score += value >= 5000 ? 18 : value >= 1500 ? 14 : 10;

  score += STAGE_BONUS[input.stage] ?? 0;
  score += priorityBonus(crm.prioridade || input.priority);
  if (crm.precisa_humano_agora || input.needsHuman) score += 10;
  if (crm.proxima_acao || input.nextAction) score += 4;

  const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null;
  if (nextActionAt && !Number.isNaN(nextActionAt.getTime())) {
    const diffDays = (nextActionAt.getTime() - Date.now()) / 86_400_000;
    if (diffDays < 0) score += 12;
    else if (diffDays <= 2) score += 6;
  } else if (input.createdAt) {
    const createdAt = new Date(input.createdAt);
    const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > 30) score -= 10;
  }

  score += Math.min(Number(input.activityCount || 0) * 4, 20);
  score += Math.min(Number(input.budgetCount || 0) * 8, 16);
  score += Math.min(Number(input.appointmentCount || 0) * 12, 24);

  return clamp(Math.round(score), 0, 100);
}

export function scoreLeadRecord(lead = {}, extras = {}) {
  const count = lead._count || {};
  const score = calculateLeadScore({
    ...lead,
    activityCount: extras.activityCount ?? count.activities,
    budgetCount: extras.budgetCount ?? count.budgets,
    appointmentCount: extras.appointmentCount ?? count.appointments,
  });
  return { score, temperature: lead.stage === "LOST" ? "COLD" : temperatureFromScore(score) };
}

export function temperatureFromScore(score) {
  if (score >= 70) return "HOT";
  if (score >= 40) return "WARM";
  return "COLD";
}

export async function scoreLead(id) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { _count: { select: { activities: true, budgets: true, appointments: true } } },
  });
  if (!lead) throw notFound("Lead nao encontrado");
  return prisma.lead.update({ where: { id }, data: scoreLeadRecord(lead) });
}

export async function scoreAllLeads() {
  const leads = await prisma.lead.findMany({
    include: { _count: { select: { activities: true, budgets: true, appointments: true } } },
  });
  const updated = [];
  for (const lead of leads) {
    updated.push(await prisma.lead.update({ where: { id: lead.id }, data: scoreLeadRecord(lead) }));
  }
  return { updated: updated.length, leads: updated };
}

function normalizeTemperature(value) {
  const text = String(value || "").toLowerCase();
  if (["hot", "quente"].includes(text)) return "HOT";
  if (["cold", "frio", "fria"].includes(text)) return "COLD";
  return "WARM";
}

function priorityBonus(priority) {
  if (priority === "P1") return 20;
  if (priority === "P2") return 12;
  if (priority === "P3") return 5;
  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
