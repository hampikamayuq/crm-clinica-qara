// Classificador estruturado QARA (esquema novo). Determinístico, dirigido pela
// knowledge (qara-knowledge.js). Saída no formato CrmClassifierOutput (crm-classifier.schema.ts).

import {
  PIPELINE_RULES, ADMIN_RULES, P1_KEYWORDS, ONCO_KEYWORDS, CONVENIO_KEYWORDS,
  RECLAMACAO_KEYWORDS, BOOKING_KEYWORDS, PRICE_KEYWORDS, NPS_RULES,
} from "../config/qara-knowledge.js";

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const has = (text, kw) => kw.some((k) => text.includes(k));
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function npsScore(text) {
  const m = text.match(/\bnota\s*(\d{1,2})\b/) || text.match(/\b(\d{1,2})\s*(?:\/\s*10|para o atendimento)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 10 ? n : null;
}

function detectUnidade(text) {
  if (/\bsp\b|sao paulo|itaim/.test(text)) return "sp-itaim";
  if (/barra/.test(text)) return "barra";
  if (/copacabana|copa\b/.test(text)) return "copacabana";
  if (/teleconsulta|online|tele/.test(text)) return "teleconsulta";
  return "a-definir";
}

function camposFaltantes(context) {
  const out = [];
  if (!context.nome) out.push("nome");
  if (!context.modalidade) out.push("modalidade");
  if (!context.periodo) out.push("periodo");
  return out;
}

function wrap(crm, acoes = [], message = "") {
  return {
    mensagem_paciente: message,
    crm: {
      pipeline_funil: "8-administrativo",
      etapa_funil: "novo-lead",
      especialidade_original: null,
      subespecialidade_queixa: null,
      medico_indicado: "A definir",
      unidade: "a-definir",
      tags: [],
      prioridade: "P4",
      temperatura: "Morno",
      origem: "nao-identificada",
      paciente_novo_ou_antigo: "indeterminado",
      precisa_humano_agora: false,
      motivo_alerta: null,
      proxima_acao: "",
      campos_faltantes: [],
      nota_resumida: "",
      ...crm,
    },
    acoes_internas: acoes,
  };
}

export function classify(message, context = {}) {
  const text = norm(message);
  const unidade = detectUnidade(text);
  const origem = context.origem || "nao-identificada";
  const paciente = context.pacienteAntigo ? "antigo-retorno" : context.pacienteAntigo === false ? "novo" : "indeterminado";
  const faltam = camposFaltantes(context);

  // 1) NPS (nota explicita) -> reativacao.
  const nps = npsScore(text);
  if (nps !== null) {
    const band = nps >= NPS_RULES.positivo.min ? NPS_RULES.positivo : nps >= NPS_RULES.neutro.min ? NPS_RULES.neutro : NPS_RULES.negativo;
    return wrap(
      {
        pipeline_funil: "9-reativacao", etapa_funil: "alta-manutencao",
        tags: uniq([...band.tags, "temp:morno"]),
        prioridade: band.humano ? "P2" : "P3", temperatura: "Morno",
        origem, paciente_novo_ou_antigo: paciente,
        precisa_humano_agora: band.humano,
        motivo_alerta: band.humano ? "Paciente insatisfeito após NPS" : null,
        proxima_acao: band.proximaAcao, campos_faltantes: faltam,
        nota_resumida: `NPS ${nps}`,
      },
      band.humano ? ["acionar-secretaria"] : band.googleAcao ? [band.googleAcao] : [],
      message,
    );
  }

  const isReclamacao = has(text, RECLAMACAO_KEYWORDS);
  const isConvenio = has(text, CONVENIO_KEYWORDS);
  const clinical = PIPELINE_RULES.find((r) => has(text, r.keywords));
  const admin = ADMIN_RULES.find((r) => has(text, r.kw));
  const isPrice = has(text, PRICE_KEYWORDS);
  const isBooking = has(text, BOOKING_KEYWORDS);
  const isP1 = has(text, P1_KEYWORDS);

  // 2) Reclamacao -> administrativo P2 + humano.
  if (isReclamacao) {
    return wrap(
      {
        pipeline_funil: "8-administrativo", etapa_funil: "novo-lead",
        subespecialidade_queixa: "Reclamação",
        tags: ["alerta:reclamacao", "alerta:precisa-humano", "temp:morno"],
        prioridade: "P2", temperatura: "Morno", origem, paciente_novo_ou_antigo: paciente,
        precisa_humano_agora: true, motivo_alerta: "Reclamação",
        proxima_acao: "Acionar secretária/gestão", campos_faltantes: faltam,
        nota_resumida: "Reclamação de atendimento",
      },
      ["acionar-secretaria"], message,
    );
  }

  // 3) Convenio (sem queixa clinica dominante) -> administrativo.
  if (isConvenio && !clinical) {
    return wrap(
      {
        pipeline_funil: "8-administrativo", etapa_funil: "novo-lead",
        subespecialidade_queixa: "Convênio",
        tags: ["alerta:plano-nao-aceito", "temp:morno"],
        prioridade: "P4", temperatura: "Morno", origem, paciente_novo_ou_antigo: paciente,
        proxima_acao: "Informar valores e qualificar queixa", campos_faltantes: faltam,
        nota_resumida: "Pergunta sobre convênio",
      },
      [], message,
    );
  }

  // 4) Pipeline clinico.
  if (clinical) {
    const sub = clinical.keywords.find((k) => text.includes(k)) || null;
    const isOnco = clinical.id === "2-cirurgia" && has(text, ONCO_KEYWORDS) && has(text, ["cresceu", "sangrou", "sangrar", "mudou", "nao cicatriza"]);
    const prioridade = isP1 ? "P1" : "P3";
    const temperatura = isPrice ? "Morno" : "Quente"; // queixa clinica = quente, salvo pergunta de preco
    const tags = uniq([
      ...clinical.tags,
      `temp:${temperatura.toLowerCase()}`,
      isOnco ? "alerta:suspeita-oncologica" : null,
      prioridade === "P1" ? "alerta:precisa-humano" : null,
      context.temFoto ? "alerta:foto-recebida" : null,
    ]);
    return wrap(
      {
        pipeline_funil: clinical.id, etapa_funil: "qualificado",
        especialidade_original: clinical.id, subespecialidade_queixa: sub,
        medico_indicado: clinical.medico, unidade, tags, prioridade, temperatura,
        origem, paciente_novo_ou_antigo: paciente,
        precisa_humano_agora: prioridade === "P1",
        motivo_alerta: prioridade === "P1" ? (isOnco ? "Suspeita oncológica" : "Sinal de alerta clínico") : null,
        proxima_acao: prioridade === "P1" ? "Acionar secretária imediatamente" : isBooking ? "Coletar modalidade e período" : "Oferecer consulta",
        campos_faltantes: faltam,
        nota_resumida: sub ? `Queixa: ${sub}` : "Queixa clínica",
      },
      prioridade === "P1" ? ["acionar-secretaria"] : [],
      message,
    );
  }

  // 5) Administrativo (endereco/horario/etc.).
  if (admin) {
    const frio = !isPrice && !isConvenio;
    return wrap(
      {
        pipeline_funil: "8-administrativo", etapa_funil: "novo-lead",
        subespecialidade_queixa: admin.sub,
        tags: uniq(["pipeline:administrativo", `temp:${frio ? "frio" : "morno"}`]),
        prioridade: "P4", temperatura: frio ? "Frio" : "Morno",
        origem, paciente_novo_ou_antigo: paciente,
        proxima_acao: `Responder ${admin.sub.toLowerCase()} e perguntar se deseja agendar`,
        campos_faltantes: faltam, nota_resumida: `Administrativo: ${admin.sub}`,
      },
      [], message,
    );
  }

  // 6) Fallback: sem queixa identificavel.
  return wrap(
    {
      pipeline_funil: "8-administrativo", etapa_funil: "novo-lead",
      tags: ["temp:morno"], temperatura: "Morno", origem, paciente_novo_ou_antigo: paciente,
      proxima_acao: "Perguntar a principal queixa", campos_faltantes: faltam,
      nota_resumida: "Contato inicial sem queixa clara",
    },
    [], message,
  );
}

export default classify;
