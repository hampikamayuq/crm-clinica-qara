import { timingSafeEqual } from "node:crypto";
import { badRequest } from "../lib/errors.js";
import { createActivity } from "./activity.service.js";
import { classify } from "./classifier.service.js";
import { extractLeadFields } from "./field-map.service.js";
import { createLead } from "./lead.service.js";

export async function createLeadFromWebhook(body, req) {
  validateLeadWebhookSecret(req);

  const payload = body && typeof body === "object" ? body : {};
  const extracted = extractLeadFields(payload);
  const message = String(extracted.notes || extracted.interest || "").trim();
  const classification = message ? classify(message, { nome: extracted.name, origem: extracted.source || "webhook" }) : null;

  const name = extracted.name || (extracted.phone ? `Lead ${extracted.phone}` : extracted.email?.split("@")[0]);
  if (!name) throw badRequest("nome, telefone ou email e obrigatorio para criar lead por webhook");

  const lead = await createLead({
    name,
    phone: extracted.phone || null,
    email: extracted.email || null,
    source: extracted.source || "webhook",
    interest: extracted.interest || message || null,
    stage: normalizeStage(extracted.stage) || undefined,
    temperature: normalizeTemperature(extracted.temperature || classification?.crm?.temperatura),
    nextAction: extracted.nextAction || classification?.crm?.proxima_acao || null,
    nextActionAt: extracted.nextActionAt || null,
    estimatedValue: extracted.estimatedValue,
    classification,
  });

  if (message) {
    await createActivity({
      type: "NOTE",
      title: "Lead recebido por webhook",
      description: message,
      leadId: lead.id,
      metadata: { source: extracted.source || "webhook" },
    });
  }

  return { lead, extracted, classification };
}

export function validateLeadWebhookSecret(req) {
  const secret = process.env.LEAD_WEBHOOK_SECRET || "";
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw httpError("LEAD_WEBHOOK_SECRET e obrigatorio em producao", "webhook_secret_required", 503);
    }
    return;
  }

  const auth = String(req.headers.authorization || "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const header = String(req.headers["x-webhook-secret"] || req.headers["x-lead-webhook-secret"] || "");
  if (!safeEqual(secret, header) && !safeEqual(secret, bearer)) {
    throw httpError("Segredo do webhook invalido", "webhook_secret_invalid", 401);
  }
}

function normalizeTemperature(value) {
  const text = String(value || "").toLowerCase();
  if (["hot", "quente"].includes(text)) return "HOT";
  if (["cold", "frio", "fria"].includes(text)) return "COLD";
  if (["warm", "morno", "morna"].includes(text)) return "WARM";
  return undefined;
}

function normalizeStage(value) {
  const text = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const allowed = new Set([
    "NEW",
    "CONTACTED",
    "WAITING_PATIENT",
    "APPOINTMENT_SCHEDULED",
    "ATTENDED",
    "BUDGET_SENT",
    "PROCEDURE_SCHEDULED",
    "LOST",
    "REACTIVATE",
  ]);
  return allowed.has(text) ? text : null;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function httpError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
