import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createActivity, createMessageActivity } from "./activity.service.js";
import { classify } from "./classifier.service.js";
import { createLead } from "./lead.service.js";
import { scoreLead } from "./lead-score.service.js";
import { emit } from "./workflow.service.js";

const DIRECTIONS = new Set(["INBOUND", "OUTBOUND", "SYSTEM"]);

// Auto-assign: recepcionista (SECRETARY) ativo menos carregado entre conversas abertas.
// ponytail: 1 query + N counts por inbound novo; ok p/ clinica. Vira contador round-robin se o volume explodir.
async function pickAutoAssignee() {
  const candidates = await prisma.user.findMany({ where: { active: true, role: "SECRETARY" }, select: { id: true } });
  if (!candidates.length) return null;
  const loads = await Promise.all(candidates.map(async (u) => ({
    id: u.id,
    n: await prisma.conversation.count({ where: { assignedToId: u.id, status: { notIn: ["RESOLVED", "ARCHIVED"] } } }),
  })));
  loads.sort((a, b) => a.n - b.n);
  return loads[0].id;
}

function normalizeDirection(direction) {
  const d = String(direction || "").toUpperCase();
  return DIRECTIONS.has(d) ? d : "SYSTEM";
}

export async function recordMessage({ channel, externalId, text, direction, providerMessageId = null, metadata = null, createdAt = null }) {
  if (!channel || !externalId) return null;
  const when = createdAt ? new Date(createdAt) : new Date();
  const conversation = await prisma.conversation.upsert({
    where: { channel_externalId: { channel, externalId } },
    update: { lastMessageAt: when },
    create: { channel, externalId, status: "OPEN", lastMessageAt: when },
  });

  if (providerMessageId) {
    const existing = await prisma.message.findFirst({ where: { conversationId: conversation.id, providerMessageId } });
    if (existing) return { conversation, message: existing, created: false };
  }

  const dir = normalizeDirection(direction);
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, direction: dir, text: text || "", providerMessageId, metadata, ...(createdAt ? { createdAt: when } : {}) },
  });

  if (dir === "INBOUND" || dir === "OUTBOUND") {
    await createMessageActivity({
      conversationId: conversation.id,
      leadId: conversation.leadId,
      patientId: conversation.patientId,
      direction: dir,
      metadata: { providerMessageId },
    });
  }
  if (dir === "INBOUND") {
    if (!conversation.assignedToId) {
      const assignee = await pickAutoAssignee();
      if (assignee) {
        await prisma.conversation.update({ where: { id: conversation.id }, data: { assignedToId: assignee } });
        conversation.assignedToId = assignee;
        await createActivity({ conversationId: conversation.id, type: "HANDOFF", title: "Atribuido automaticamente", description: null });
      }
    }
    emit("message.received", { conversation, message });
  }
  return { conversation, message, created: true };
}

export function extractAdministrativeData({ text = "", name = "", channel = "", externalId = "" } = {}) {
  const data = {};
  const fallbackName = cleanContactName(name, channel, externalId);
  const textName = extractName(text);
  if (textName || fallbackName) data.name = textName || fallbackName;
  const phone = channel === "whatsapp" ? digitsOnly(externalId) : extractPhone(text);
  if (phone) data.phone = phone;
  const cpf = extractCpf(text);
  if (cpf) data.cpf = cpf;
  const birthDate = extractBirthDate(text);
  if (birthDate) data.birthDate = birthDate;
  return data;
}

export async function getInboxLegacyShape(limit = 200) {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: Math.min(Number(limit) || 200, 1000),
    include: {
      lead: { select: { name: true, phone: true } },
      patient: { select: { name: true, phone: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return {
    conversations: conversations.map((c) => ({
      id: `${c.channel}:${c.externalId}`,
      channel: c.channel,
      externalId: c.externalId,
      name: c.lead?.name || c.patient?.name || `${c.channel} ${c.externalId}`,
      phone: c.lead?.phone || c.patient?.phone || (c.channel === "whatsapp" ? c.externalId : ""),
      createdAt: c.createdAt.getTime(),
      lastAt: c.lastMessageAt ? c.lastMessageAt.getTime() : c.createdAt.getTime(),
      agentState: {},
      messages: c.messages.map((m) => ({
        id: m.providerMessageId || m.id,
        direction: String(m.direction).toLowerCase(),
        text: m.text,
        timestamp: m.createdAt.getTime(),
        metadata: m.metadata || {},
      })),
    })),
  };
}

export function listConversations(filters = {}) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.channel) where.channel = filters.channel;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  return prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 500),
    include: {
      lead: { select: { id: true, name: true, phone: true, stage: true, patientId: true } },
      patient: { select: { id: true, name: true, phone: true } },
      assignedTo: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, direction: true, createdAt: true } },
    },
  });
}

export async function getConversation(id) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { lead: true, patient: true, assignedTo: { select: { id: true, name: true } }, tags: { include: { tag: true } } },
  });
  if (!conversation) throw notFound("Conversa nao encontrada");
  return conversation;
}

export function getMessages(id, limit = 200) {
  return prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, take: Math.min(Number(limit) || 200, 1000) });
}

export async function updateConversation(id, input = {}) {
  const data = {};
  for (const k of ["status", "assignedToId", "leadId", "patientId"]) if (input[k] !== undefined) data[k] = input[k];
  return prisma.conversation.update({ where: { id }, data });
}

export function assignConversation(id, assignedToId) {
  return prisma.conversation.update({ where: { id }, data: { assignedToId } });
}

export function resolveConversation(id) {
  return prisma.conversation.update({ where: { id }, data: { status: "RESOLVED" } });
}

// A conversa e identificada por channel+externalId (o id exposto ao cliente e
// `${channel}:${externalId}`, nao o cuid). deleteMany evita erro quando nao existe no banco.
// Mensagens e tags caem em cascata (onDelete: Cascade); atividades viram conversationId null.
export async function deleteConversation({ channel, externalId }) {
  if (!channel || !externalId) return { deleted: 0 };
  const result = await prisma.conversation.deleteMany({ where: { channel, externalId } });
  return { deleted: result.count };
}

export async function addTag(id, tagName) {
  if (!tagName) throw badRequest("name e obrigatorio");
  const tag = await prisma.tag.upsert({ where: { name: tagName }, update: {}, create: { name: tagName } });
  await prisma.conversationTag.upsert({
    where: { conversationId_tagId: { conversationId: id, tagId: tag.id } },
    update: {},
    create: { conversationId: id, tagId: tag.id },
  });
  return tag;
}

export async function addNote(id, text, userId = null) {
  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) throw notFound("Conversa nao encontrada");
  return createActivity({
    type: "NOTE",
    title: "Nota interna",
    description: text,
    conversationId: id,
    leadId: conversation.leadId,
    patientId: conversation.patientId,
    userId,
  });
}

export async function postOutboundMessage(id, text, metadata = null) {
  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) throw notFound("Conversa nao encontrada");
  const result = await recordMessage({ channel: conversation.channel, externalId: conversation.externalId, text, direction: "OUTBOUND", metadata });
  return result?.message;
}

export async function ensureLeadForConversation(conversationId, fallback = {}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: true, messages: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!conversation) throw notFound("Conversa nao encontrada");

  let classification = fallback.classification || conversation.classification || null;
  const lastInbound = conversation.messages.find((message) => message.direction === "INBOUND");
  const text = fallback.text || lastInbound?.text || "";
  if (!classification && text) {
    classification = classify(text, {
      telefone: conversation.channel === "whatsapp" ? conversation.externalId : null,
      nome: fallback.name || null,
    });
  }

  if (conversation.leadId) {
    const contact = extractAdministrativeData({ text, name: fallback.name, channel: conversation.channel, externalId: conversation.externalId });
    const lead = await prisma.lead.update({
      where: { id: conversation.leadId },
      data: {
        classification,
        nextAction: classification?.crm?.proxima_acao || undefined,
        ...leadContactPatch(conversation.lead || {}, contact),
      },
    });
    await syncPatientFromContact({ conversationId: conversation.id, lead, contact });
    await scoreLead(lead.id);
    if (classification && !conversation.classification) {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { classification } });
    }
    return lead;
  }

  const phone = conversation.channel === "whatsapp" ? conversation.externalId : null;
  const existing = phone ? await prisma.lead.findFirst({ where: { phone } }) : null;
  const leadInput = leadInputFromConversation(conversation, classification, fallback);
  let lead = existing;
  if (lead) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        classification,
        ...leadContactPatch(lead, leadInput),
        interest: lead.interest || leadInput.interest,
        source: lead.source || leadInput.source,
        nextAction: lead.nextAction || leadInput.nextAction,
      },
    });
    await scoreLead(lead.id);
  } else {
    lead = await createLead(leadInput);
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { leadId: lead.id, classification },
  });
  await syncPatientFromContact({ conversationId: conversation.id, lead, contact: extractAdministrativeData({ text, name: fallback.name, channel: conversation.channel, externalId: conversation.externalId }) });
  return lead;
}

export async function backfillConversationLeads(limit = 500) {
  const conversations = await prisma.conversation.findMany({
    where: { leadId: null },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Number(limit) || 500, 1000),
  });

  let linked = 0;
  const errors = [];
  for (const conversation of conversations) {
    try {
      await ensureLeadForConversation(conversation.id);
      linked += 1;
    } catch (error) {
      errors.push({ conversationId: conversation.id, message: error.message });
    }
  }
  return { scanned: conversations.length, linked, failed: errors.length, errors };
}

function leadInputFromConversation(conversation, classification, fallback = {}) {
  const crm = classification?.crm || {};
  const contact = extractAdministrativeData({ text: fallback.text, name: fallback.name, channel: conversation.channel, externalId: conversation.externalId });
  return {
    name: contact.name || cleanLeadName(fallback.name, conversation.channel, conversation.externalId),
    phone: contact.phone || null,
    source: crm.origem && crm.origem !== "nao-identificada" ? crm.origem : conversation.channel,
    interest: crm.subespecialidade_queixa || crm.nota_resumida || fallback.text || "Atendimento",
    stage: stageFromCrm(crm.etapa_funil),
    temperature: temperatureFromCrm(crm.temperatura),
    nextAction: crm.proxima_acao || "Responder conversa",
    classification,
  };
}

function leadContactPatch(current, contact) {
  const data = {};
  if (contact.phone && !current.phone) data.phone = contact.phone;
  if (contact.name && shouldReplaceName(current.name, contact.name)) data.name = contact.name;
  return data;
}

async function syncPatientFromContact({ conversationId, lead, contact }) {
  if (!contact?.cpf && !contact?.birthDate && !lead?.patientId) return null;
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { patientId: true } });
  let patientId = conversation?.patientId || lead?.patientId || null;
  if (!patientId) {
    const matches = [
      ...(contact.cpf ? [{ cpf: contact.cpf }] : []),
      ...(contact.phone ? [{ phone: contact.phone }] : []),
    ];
    const existing = matches.length ? await prisma.patient.findFirst({ where: { OR: matches }, select: { id: true } }) : null;
    patientId = existing?.id || null;
  }

  const data = {
    ...(contact.phone ? { phone: contact.phone } : {}),
    ...(contact.cpf ? { cpf: contact.cpf } : {}),
    ...(contact.birthDate ? { birthDate: contact.birthDate } : {}),
    preferredChannel: "whatsapp",
  };

  const currentPatient = patientId ? await prisma.patient.findUnique({ where: { id: patientId } }) : null;
  if (contact.name && shouldReplaceName(currentPatient?.name, contact.name)) data.name = contact.name;
  const patient = currentPatient
    ? await prisma.patient.update({ where: { id: currentPatient.id }, data })
    : await prisma.patient.create({ data: { name: contact.name || lead.name, phone: contact.phone || lead.phone, ...data } });

  await prisma.lead.update({ where: { id: lead.id }, data: { patientId: patient.id } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { patientId: patient.id } });
  return patient;
}

function cleanLeadName(name, channel, externalId) {
  const value = String(name || "").trim();
  if (value && !value.toLowerCase().startsWith(`${channel} `)) return value;
  if (channel === "whatsapp") return `WhatsApp ${externalId}`;
  return `${channel || "Contato"} ${externalId || ""}`.trim();
}

function cleanContactName(name, channel, externalId) {
  const value = String(name || "").trim();
  if (!value || value === externalId) return "";
  if (value.toLowerCase().startsWith(`${channel} `)) return "";
  return value;
}

function shouldReplaceName(current, next) {
  const value = String(current || "").trim().toLowerCase();
  return Boolean(next) && (!value || value.startsWith("whatsapp ") || value.startsWith("lead ") || /^\d+$/.test(value));
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function extractCpf(text) {
  const value = String(text || "");
  const match = value.match(/\bcpf[:\s]*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/i) || value.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  const digits = digitsOnly(match?.[1]);
  return digits.length === 11 ? digits : "";
}

function extractPhone(text) {
  const match = String(text || "").match(/\b(?:whats(?:app)?|telefone|tel|celular|cel)[:\s]*(\+?\d[\d\s().-]{7,}\d)/i);
  const digits = digitsOnly(match?.[1]);
  return digits.length >= 8 ? digits : "";
}

function extractBirthDate(text) {
  const match = String(text || "").match(/\b(?:data de nascimento|nascimento|nasc(?:i)?|dn)[:\s]*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year <= Number(String(new Date().getFullYear()).slice(-2)) ? 2000 : 1900;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function extractName(text) {
  const match = String(text || "").match(/\b(?:meu nome (?:e|é)|nome)[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,80})/i);
  return match ? match[1].split(/\b(?:cpf|nasc|data de nascimento|telefone|tel|whats(?:app)?|celular|cel)\b/i)[0].trim().replace(/[.,;:]+$/, "") : "";
}

function stageFromCrm(value) {
  if (value === "qualificado") return "CONTACTED";
  if (value === "horario-oferecido") return "BUDGET_SENT";
  if (value === "agendado" || value === "confirmado") return "APPOINTMENT_SCHEDULED";
  if (value === "atendido") return "ATTENDED";
  if (value === "alta-manutencao") return "REACTIVATE";
  return "NEW";
}

function temperatureFromCrm(value) {
  if (value === "Quente") return "HOT";
  if (value === "Frio") return "COLD";
  return "WARM";
}
