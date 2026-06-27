import prisma from "../db.js";
import { categorizedFollowups } from "./followup.service.js";

export async function financialSummary() {
  const [payments, budgets] = await Promise.all([
    prisma.payment.findMany({ select: { amount: true, status: true } }),
    prisma.budget.findMany({ select: { amount: true, status: true } }),
  ]);
  const paid = payments.filter((p) => p.status === "PAID" || p.status === "PARTIALLY_PAID").reduce((s, p) => s + Number(p.amount), 0);
  const pending = payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + Number(p.amount), 0);
  const accepted = budgets.filter((b) => b.status === "ACCEPTED" || b.status === "CONVERTED");
  return {
    receitaPaga: round(paid),
    pendente: round(pending),
    orcamentosEnviados: budgets.filter((b) => b.status === "SENT").length,
    orcamentosAceitos: accepted.length,
    ticketMedio: accepted.length ? round(accepted.reduce((s, b) => s + Number(b.amount), 0) / accepted.length) : 0,
  };
}

export async function conversionSummary() {
  const [bySource, byStage, appointments, budgets] = await Promise.all([
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
    prisma.appointment.count({ where: { status: { in: ["SCHEDULED", "CONFIRMED", "ATTENDED"] } } }),
    prisma.budget.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const budgetStatus = Object.fromEntries(budgets.map((b) => [b.status, b._count._all]));
  return {
    leadsPorOrigem: bySource.map((s) => ({ source: s.source || "desconhecida", total: s._count._all })),
    leadsPorEtapa: byStage.map((s) => ({ stage: s.stage, total: s._count._all })),
    consultasMarcadas: appointments,
    orcamentosEnviados: budgetStatus.SENT || 0,
    orcamentosAceitos: (budgetStatus.ACCEPTED || 0) + (budgetStatus.CONVERTED || 0),
  };
}

export async function dailyBriefing() {
  const start = startOfToday();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [followups, hotLeads, appointmentsToday, sentBudgets, recentLeads] = await Promise.all([
    categorizedFollowups({ limit: 300 }),
    prisma.lead.findMany({
      where: { OR: [{ score: { gte: 70 } }, { temperature: "HOT" }] },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }),
    prisma.appointment.findMany({
      where: { startAt: { gte: start, lt: end }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      include: { lead: true, patient: true, professional: true },
      orderBy: { startAt: "asc" },
      take: 50,
    }),
    prisma.budget.findMany({
      where: { status: "SENT", createdAt: { gte: start, lt: end } },
      include: { lead: true, patient: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.lead.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);

  const p1Leads = recentLeads.filter((lead) => lead.classification?.crm?.prioridade === "P1").slice(0, 10);
  const priorities = [
    ...followups.overdue.slice(0, 5).map((task) => ({ type: "followup_atrasado", title: task.title, lead: task.lead, dueAt: task.dueAt })),
    ...p1Leads.slice(0, 5).map((lead) => ({ type: "p1", title: lead.name, lead: compactLead(lead) })),
    ...hotLeads.slice(0, 5).map((lead) => ({ type: "lead_quente", title: lead.name, lead: compactLead(lead) })),
  ].slice(0, 10);

  return {
    date: start.toISOString().slice(0, 10),
    followups: followups.counts,
    hotLeads: hotLeads.map(compactLead),
    p1Leads: p1Leads.map(compactLead),
    appointmentsToday: appointmentsToday.map((appointment) => ({
      id: appointment.id,
      startAt: appointment.startAt,
      professional: appointment.professional?.name || null,
      lead: appointment.lead ? compactLead(appointment.lead) : null,
      patient: appointment.patient ? { id: appointment.patient.id, name: appointment.patient.name, phone: appointment.patient.phone } : null,
    })),
    sentBudgetsToday: sentBudgets.map((budget) => ({
      id: budget.id,
      title: budget.title,
      amount: Number(budget.amount),
      lead: budget.lead ? compactLead(budget.lead) : null,
      patient: budget.patient ? { id: budget.patient.id, name: budget.patient.name } : null,
    })),
    priorities,
  };
}

export async function pipelineAnalysis() {
  const now = new Date();
  const staleDate = new Date(now);
  staleDate.setDate(staleDate.getDate() - 14);

  const [stages, staleLeads, highScoreWithoutAppointment] = await Promise.all([
    prisma.lead.groupBy({ by: ["stage"], _count: { _all: true }, _sum: { estimatedValue: true }, _avg: { estimatedValue: true } }),
    prisma.lead.findMany({
      where: {
        stage: { notIn: ["LOST", "ATTENDED", "PROCEDURE_SCHEDULED"] },
        OR: [{ nextActionAt: { lt: now } }, { nextActionAt: null, updatedAt: { lt: staleDate } }],
      },
      orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
      take: 30,
    }),
    prisma.lead.findMany({
      where: {
        score: { gte: 70 },
        stage: { notIn: ["LOST", "PROCEDURE_SCHEDULED"] },
        appointments: { none: { status: { in: ["SCHEDULED", "CONFIRMED"] } } },
      },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      take: 30,
    }),
  ]);

  const totalLeads = stages.reduce((sum, row) => sum + row._count._all, 0);
  const totalValue = stages.reduce((sum, row) => sum + Number(row._sum.estimatedValue || 0), 0);
  const recommendations = [];
  if (staleLeads.length) recommendations.push("Reativar leads sem proxima acao ou com follow-up vencido.");
  if (highScoreWithoutAppointment.length) recommendations.push("Priorizar leads score 70+ sem consulta marcada.");
  if (!recommendations.length) recommendations.push("Funil sem gargalo critico pelos criterios atuais.");

  return {
    totalLeads,
    totalEstimatedValue: round(totalValue),
    averageEstimatedValue: totalLeads ? round(totalValue / totalLeads) : 0,
    stages: stages.map((row) => ({
      stage: row.stage,
      total: row._count._all,
      estimatedValue: round(Number(row._sum.estimatedValue || 0)),
      averageValue: round(Number(row._avg.estimatedValue || 0)),
    })),
    staleLeads: staleLeads.map(compactLead),
    highScoreWithoutAppointment: highScoreWithoutAppointment.map(compactLead),
    recommendations,
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function compactLead(lead) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    source: lead.source,
    interest: lead.interest,
    stage: lead.stage,
    temperature: lead.temperature,
    score: lead.score,
    nextAction: lead.nextAction,
    nextActionAt: lead.nextActionAt,
  };
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
