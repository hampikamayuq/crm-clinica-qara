import prisma from "../db.js";

export async function categorizedFollowups(filters = {}) {
  const limit = Math.min(Number(filters.limit) || 500, 1000);
  const tasks = await prisma.task.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    include: { lead: true, patient: true, assignedTo: { select: { id: true, name: true } } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: limit,
  });

  const todayStart = startOfToday();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const buckets = { overdue: [], today: [], upcoming: [], unscheduled: [] };

  for (const task of tasks) {
    const item = formatTask(task);
    if (!task.dueAt) buckets.unscheduled.push(item);
    else if (task.dueAt < todayStart) buckets.overdue.push(item);
    else if (task.dueAt < tomorrowStart) buckets.today.push(item);
    else buckets.upcoming.push(item);
  }

  return {
    date: todayStart.toISOString().slice(0, 10),
    counts: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length])),
    ...buckets,
  };
}

function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    dueAt: task.dueAt,
    assignedTo: task.assignedTo ? { id: task.assignedTo.id, name: task.assignedTo.name } : null,
    lead: task.lead ? { id: task.lead.id, name: task.lead.name, phone: task.lead.phone, score: task.lead.score } : null,
    patient: task.patient ? { id: task.patient.id, name: task.patient.name, phone: task.patient.phone } : null,
  };
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
