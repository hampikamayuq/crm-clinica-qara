import prisma from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createActivity, createMessageActivity } from "./activity.service.js";
import { classify } from "./classifier.service.js";
import { createLead } from "./lead.service.js";
import { scoreLead } from "./lead-score.service.js";
import { emit } from "./workflow.service.js";

const DIRECTIONS = new Set(["INBOUND", "OUTBOUND", "SYSTEM"]);

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
  if (dir === "INBOUND") emit("message.received", { conversation, message });
  return { conversation, message, created: true };
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
      lead: { select: { id: true, name: true, phone: true, stage: true } },
      patient: { select: { id: true, name: true, phone: true } },
      assignedTo: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
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
    include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } },
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
    const lead = await prisma.lead.update({
      where: { id: conversation.leadId },
      data: { classification, nextAction: classification?.crm?.proxima_acao || undefined },
    });
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
  const phone = conversation.channel === "whatsapp" ? conversation.externalId : null;
  return {
    name: cleanLeadName(fallback.name, conversation.channel, conversation.externalId),
    phone,
    source: crm.origem && crm.origem !== "nao-identificada" ? crm.origem : conversation.channel,
    interest: crm.subespecialidade_queixa || crm.nota_resumida || fallback.text || "Atendimento",
    stage: stageFromCrm(crm.etapa_funil),
    temperature: temperatureFromCrm(crm.temperatura),
    nextAction: crm.proxima_acao || "Responder conversa",
    classification,
  };
}

function cleanLeadName(name, channel, externalId) {
  const value = String(name || "").trim();
  if (value && !value.toLowerCase().startsWith(`${channel} `)) return value;
  if (channel === "whatsapp") return `WhatsApp ${externalId}`;
  return `${channel || "Contato"} ${externalId || ""}`.trim();
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
