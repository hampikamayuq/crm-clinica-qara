import prisma from "../db.js";
import { badRequest } from "../lib/errors.js";
import { extractLeadFields } from "./field-map.service.js";
import { createLead } from "./lead.service.js";

export async function exportCsv(type = "leads") {
  if (type === "leads") return exportLeads();
  if (type === "budgets") return exportBudgets();
  if (type === "payments") return exportPayments();
  if (type === "tasks") return exportTasks();
  if (type === "appointments") return exportAppointments();
  throw badRequest("tipo de exportacao nao suportado");
}

export async function importLeads(input, userId = null) {
  const records = Array.isArray(input?.leads) ? input.leads : parseInput(input);
  const leads = [];
  const errors = [];

  for (let index = 0; index < records.length; index += 1) {
    try {
      const fields = extractLeadFields(records[index]);
      const name = fields.name || (fields.phone ? `Lead ${fields.phone}` : fields.email?.split("@")[0]);
      if (!name) throw badRequest("nome, telefone ou email ausente");
      leads.push(
        await createLead(
          {
            ...fields,
            name,
            source: fields.source || "csv",
          },
          userId,
        ),
      );
    } catch (error) {
      errors.push({ row: index + 1, message: error.message });
    }
  }

  return { imported: leads.length, failed: errors.length, errors, leads };
}

function parseInput(input) {
  const csv = typeof input === "string" ? input : input?.csv;
  if (!csv || typeof csv !== "string") throw badRequest("CSV vazio ou invalido");
  return parseCsv(csv);
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

export function buildCsv(rows, columns) {
  const header = columns.map((column) => escapeCsv(column.header)).join(";");
  const body = rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(";"));
  return [header, ...body].join("\n");
}

function exportLeads() {
  return prisma.lead
    .findMany({ orderBy: { createdAt: "desc" }, take: 5000 })
    .then((rows) => ({
      filename: "leads.csv",
      csv: buildCsv(rows, [
        col("Nome", (r) => r.name),
        col("Telefone", (r) => r.phone),
        col("Email", (r) => r.email),
        col("Origem", (r) => r.source),
        col("Interesse", (r) => r.interest),
        col("Etapa", (r) => r.stage),
        col("Temperatura", (r) => r.temperature),
        col("Score", (r) => r.score),
        col("ValorEstimado", (r) => r.estimatedValue),
        col("ProximaAcao", (r) => r.nextAction),
        col("CriadoEm", (r) => iso(r.createdAt)),
      ]),
    }));
}

function exportBudgets() {
  return prisma.budget
    .findMany({ include: { lead: true, patient: true, service: true }, orderBy: { createdAt: "desc" }, take: 5000 })
    .then((rows) => ({
      filename: "orcamentos.csv",
      csv: buildCsv(rows, [
        col("Titulo", (r) => r.title),
        col("Lead", (r) => r.lead?.name),
        col("Paciente", (r) => r.patient?.name),
        col("Servico", (r) => r.service?.name),
        col("Valor", (r) => r.amount),
        col("Status", (r) => r.status),
        col("CriadoEm", (r) => iso(r.createdAt)),
      ]),
    }));
}

function exportPayments() {
  return prisma.payment
    .findMany({ include: { budget: true }, orderBy: { createdAt: "desc" }, take: 5000 })
    .then((rows) => ({
      filename: "pagamentos.csv",
      csv: buildCsv(rows, [
        col("Orcamento", (r) => r.budget?.title),
        col("Valor", (r) => r.amount),
        col("Metodo", (r) => r.method),
        col("Parcelas", (r) => r.installments),
        col("Status", (r) => r.status),
        col("PagoEm", (r) => iso(r.paidAt)),
        col("CriadoEm", (r) => iso(r.createdAt)),
      ]),
    }));
}

function exportTasks() {
  return prisma.task
    .findMany({ include: { lead: true, patient: true, assignedTo: { select: { id: true, name: true } } }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 5000 })
    .then((rows) => ({
      filename: "tarefas.csv",
      csv: buildCsv(rows, [
        col("Titulo", (r) => r.title),
        col("Status", (r) => r.status),
        col("Vencimento", (r) => iso(r.dueAt)),
        col("Responsavel", (r) => r.assignedTo?.name),
        col("Lead", (r) => r.lead?.name),
        col("Paciente", (r) => r.patient?.name),
      ]),
    }));
}

function exportAppointments() {
  return prisma.appointment
    .findMany({ include: { lead: true, patient: true, professional: true, unit: true }, orderBy: { startAt: "desc" }, take: 5000 })
    .then((rows) => ({
      filename: "agenda.csv",
      csv: buildCsv(rows, [
        col("Inicio", (r) => iso(r.startAt)),
        col("Fim", (r) => iso(r.endAt)),
        col("Status", (r) => r.status),
        col("Profissional", (r) => r.professional?.name),
        col("Unidade", (r) => r.unit?.name),
        col("Lead", (r) => r.lead?.name),
        col("Paciente", (r) => r.patient?.name),
        col("Valor", (r) => r.value),
      ]),
    }));
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function col(header, value) {
  return { header, value };
}

function iso(value) {
  return value ? new Date(value).toISOString() : "";
}
