import { BOOKING_KEYWORDS } from "../config/qara-knowledge.js";

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function has(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

const DOCTOR_IDS = {
  "dr. diego galvez": "diego",
  "dr diego galvez": "diego",
  "dr. miguel ceccarelli": "miguel",
  "dr miguel ceccarelli": "miguel",
  "dra. diana stohmann": "diana",
  "dra diana stohmann": "diana",
  "dra. manuela pedretti cabral": "manuela",
  "dra manuela pedretti cabral": "manuela",
  "dr. fabricio de andrade": "fabricio",
  "dr fabricio de andrade": "fabricio",
  "dr. fabrício de andrade": "fabricio",
};

export function medicoIdFromIndicado(medicoIndicado) {
  const key = norm(medicoIndicado);
  return DOCTOR_IDS[key] || null;
}

// FAQ so para pergunta administrativa pura; nao intercepta triagem nem agendamento.
export function shouldUseFaq(text, agentState = {}, classification = null) {
  if (classification?.crm?.precisa_humano_agora) return false;

  const t = norm(text);
  const collected = agentState.collected || {};
  const pipeline = classification?.crm?.pipeline_funil || "";
  const isClinical = pipeline && !pipeline.startsWith("8-") && pipeline !== "9-reativacao";
  const inBookingFlow = Boolean(collected.queixa || collected.periodo || agentState.stage);

  if (isClinical) return false;
  if (has(t, BOOKING_KEYWORDS)) return false;
  if (inBookingFlow && has(t, ["quero", "pode ser", "prefiro", "amanha", "amanhã", "semana", "horario", "horário"])) {
    return false;
  }

  return true;
}

export function computeAgentMissing(collected = {}, classification = null) {
  const missing = [];
  const crm = classification?.crm || {};
  const hasQueixa = collected.queixa || (crm.especialidade_original && crm.medico_indicado !== "A definir");

  if (!collected.nome) missing.push("nome");
  if (!hasQueixa) missing.push("queixa");
  if (!collected.periodo) missing.push("periodo");
  return missing;
}

export function buildHandoffReply(classification) {
  const crm = classification?.crm || {};
  const motivo = norm(crm.motivo_alerta || crm.subespecialidade_queixa || "");

  if (crm.prioridade === "P1" || motivo.includes("oncolog") || motivo.includes("alerta")) {
    return "Esse tipo de alteração merece avaliação dermatológica prioritária. Vou acionar nossa equipe para te ajudar diretamente e verificar o primeiro horário disponível.";
  }
  if (motivo.includes("reclam")) {
    return "Sinto muito por isso. Entendo a sua frustração, e essa não é a experiência que queremos oferecer. Vou acionar nossa equipe agora para verificar o que aconteceu e te dar um retorno adequado.";
  }
  return "Vou acionar nossa equipe para te ajudar diretamente.";
}

export function mergeClassificationState(conversation, classification) {
  if (!classification?.crm) return;
  const state = conversation.agentState || {};
  const crm = classification.crm;
  const tags = new Set([...(state.tags || []), ...(crm.tags || [])]);

  state.tags = [...tags].slice(-12);
  state.classification = {
    pipeline: crm.pipeline_funil,
    prioridade: crm.prioridade,
    medico: crm.medico_indicado,
    proximaAcao: crm.proxima_acao,
    updatedAt: Date.now(),
  };

  if (crm.precisa_humano_agora) {
    state.handoff = { reason: crm.motivo_alerta || "precisa_humano", at: Date.now() };
  }

  const medicoId = medicoIdFromIndicado(crm.medico_indicado);
  if (medicoId && !state.collected?.medico) {
    state.collected = { ...(state.collected || {}), medico: medicoId };
  }
  if (crm.subespecialidade_queixa && crm.especialidade_original && !state.collected?.queixa) {
    state.collected = {
      ...(state.collected || {}),
      queixa: crm.subespecialidade_queixa,
    };
  }

  conversation.agentState = state;
}
