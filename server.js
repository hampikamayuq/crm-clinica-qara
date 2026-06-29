import { createHmac, timingSafeEqual } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
loadEnv();

// Camada modular (Prisma) plugada de forma aditiva. Se o banco/Prisma nao estiver
// disponivel, o MVP continua funcionando com os endpoints legados.
let handleModularApi = null;
let mirrorMessageToDb = null;
let getInboxLegacyShape = null;
let deleteConversationDb = null;
let classifyInboundToDb = null;
let loginWithPassword = null;
let authorizeRequest = null;
try {
  ({ loginWithPassword, authorizeRequest } = await import("./src/server/services/auth.service.js"));
} catch (error) {
  console.warn("Auth de usuarios indisponivel:", error.message);
}
try {
  ({ handleModularApi, mirrorMessageToDb, getInboxLegacyShape, classifyInboundToDb, deleteConversationDb } = await import("./src/server/index.js"));
} catch (error) {
  console.warn("CRM modular API indisponivel (seguindo so com endpoints legados):", error.message);
}

const rootDir = resolve(__dirname);
const dataDir = join(rootDir, "data");
const storeFile = join(dataDir, "channel-conversations.json");
const port = Number(process.env.PORT || 3000);
const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";
const aiProvider = (process.env.AI_PROVIDER || "rules").toLowerCase();
const openAIModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const isProduction = process.env.NODE_ENV === "production";
const adminApiKey = process.env.ADMIN_API_KEY || "";
let storeOperationQueue = Promise.resolve();
const clinicConfig = {
  name: process.env.CLINIC_NAME || "Clinica Qara",
  unit: process.env.CLINIC_UNIT || "Copacabana - RJ",
  defaultConsultValue: Number(process.env.DEFAULT_CONSULT_VALUE || 550),
  currency: "BRL",
  specialties: "Dermatologia clinica, cirurgica e estetica",
  modalities: ["presencial", "teleconsulta"],
};

// Enderecos fixos da clinica (fonte: fluxo Kommo "Leads novos").
const locations = {
  copacabana: "Rua Santa Clara, No 50, sala 521 - Edificio Golden Point, Copacabana - RJ",
  barra: "Av. das Americas, No 2480, Bloco 2, sala 312 - Lead Americas Business, Barra da Tijuca - RJ",
  itaim: "R. Joaquim Floriano, 820 - 10o e 19o andar, Itaim Bibi - SP",
};

// Equipe medica + triagem por queixa. Valores, tags, locais e horarios usados pela agente Tawany.
const careTeam = [
  {
    id: "diego",
    name: "Dr. Diego Galvez",
    focus:
      "Cirurgia dermatologica: pintas/sinais, cistos, lipomas, biopsias, cancer de pele, retirada de lesoes, procedimentos cirurgicos.",
    tag: "cirurgia",
    values: { presencial: 450, teleconsulta: 450 },
    locations: [
      { local: locations.copacabana, horarios: "Segundas 14h-19h, Quartas 14h-19h, Quintas 10h-19h" },
    ],
    presentation: `*Dr. Diego Galvez*
Dermatologia, cirurgia dermatológica:
📍 *Localização:* Rua Santa Clara, Nº 50, sala 521 - Edifício Golden Point, Copacabana
🗓️ *Horários de Atendimento:* Segundas-feiras 14h às 19h, Quartas-feiras 14h às 19h e Quintas-feiras 10h às 19h
🅿️ *Estacionamento:* Vaga disponível para pacientes com autorização prévia (necessário informar placa e modelo do carro), exceto moto.
💰 *Valor da Consulta:* Presencial e ONLINE R$ 450,00
💳 *Formas de Pagamento:* Aceitamos dinheiro, PIX, débito e crédito (em até 6x sem juros).
🏥 *Convênios Médicos:* Apenas na modalidade reembolso com nota fiscal.`,
    doctoralia: "https://www.doctoralia.com.br/diego-galvez/dermatologista/rio-de-janeiro",
  },
  {
    id: "miguel",
    name: "Dr. Miguel Ceccarelli",
    focus:
      "Doencas das unhas: micose, unha encravada, inflamacoes, distrofias, duvidas sobre unhas.",
    tag: "unhas",
    values: { presencial_rj: 650, presencial_sp: 800, teleconsulta: 650 },
    locations: [
      { local: locations.copacabana, horarios: "Segundas 14h-20h, Tercas 10h-20h, Sextas 09h-13h" },
      { local: locations.barra, horarios: "Sextas 14h-18h (estacionamento rotativo)" },
      { local: locations.itaim, horarios: "Sextas 18h-21h, Sabados 08h-13h (estacionamento rotativo)" },
    ],
    // Regras especificas de SP: cartao ate 3x; agendamento confirmado com sinal de 30% via PIX/link.
    spRules: "Em SP a consulta e R$ 800 (cartao ate 3x). Agendamento confirmado mediante sinal de 30% via PIX ou link de pagamento.",
    presentation: `*Dr. Miguel Ceccarelli*, dermatologista especialista em doenças de unha:

📍 *Copacabana:* Rua Santa Clara Nº 50, sala 521 - Edifício Golden Point
🗓️ Segundas de 14h às 20h; Terças de 10h às 20h e Sextas de 09h às 13h.
🅿️ Vaga de garagem disponível para pacientes com autorização prévia (necessário informar placa e modelo do carro), exceto moto.

📍 *Barra da Tijuca:* Av. das Américas Nº 2480, Bloco 2, sala 312 - Lead Américas Business
🗓️ Sextas-feiras das 14h às 18h.
🅿️ Estacionamento rotativo

💰 O valor da consulta presencial e ONLINE é de R$ 650,00. Aceitamos dinheiro, PIX, débito e crédito em até 6x sem juros.
🏥 Convênio médico apenas na modalidade reembolso com nota fiscal.`,
    presentationSp: `*Dr. Miguel Ceccarelli*, dermatologista especialista em doenças de unha:

📍 *Itaim Bibi - SP:* R. Joaquim Floriano, 820 - 10º e 19º andar
🗓️ Sextas de 18h às 21h; Sábados de 8h às 13h.
🅿️ Estacionamento rotativo

💰 O valor da consulta presencial é de R$ 800,00. Aceitamos dinheiro, PIX, débito e crédito em até 3x sem juros.

⚠️ *ATENÇÃO:* Agendamentos são confirmados mediante sinal de 30% do valor da consulta, via PIX ou link de pagamento.

Direito a retorno em até 30 dias.
🏥 Convênio médico apenas na modalidade reembolso com nota fiscal.`,
    doctoralia: "https://www.doctoralia.com.br/miguel-ceccarelli/dermatologista/sao-paulo",
  },
  {
    id: "diana",
    name: "Dra. Diana Stohmann",
    focus:
      "Tricologia (cabelo): queda de cabelo, afinamento, alopecia, caspa, couro cabeludo. Tambem transplante capilar.",
    tag: "tricologia",
    values: { presencial: 550, teleconsulta: 550 },
    locations: [
      { local: locations.copacabana, horarios: "Tercas 10h-20h" },
    ],
    presentation: `*Dra. Diana Stohmann*
Médica Dermatologista especialista em Cabelos (Tricologia) e Transplante Capilar.
Pós-graduação em Dermatologia pelo Instituto Rubem David Azulay (Santa Casa RJ) e em Tricologia pela mesma instituição.
📍 *Localização:* Rua Santa Clara, Nº 50, sala 521 - Edifício Golden Point, Copacabana
🗓️ *Horários de Atendimento:* Terças-feiras 10h às 20h
🅿️ *Estacionamento:* Vaga disponível para pacientes com autorização prévia (necessário informar placa e modelo do carro), exceto moto.
💰 *Valor da Consulta:* Presencial e ONLINE R$ 550,00
💳 *Formas de Pagamento:* Aceitamos dinheiro, PIX, débito e crédito (em até 6x sem juros).
🏥 *Convênios Médicos:* Apenas na modalidade reembolso com nota fiscal.`,
    doctoralia: "https://www.doctoralia.com.br/diana-stohmann/dermatologista/rio-de-janeiro",
  },
  {
    id: "manuela",
    name: "Dra. Manuela Pedretti Cabral",
    focus:
      "Psoriase, dermatite atopica, hidradenite supurativa (hidrosadenite) e doencas autoinflamatorias/autoimunes da pele.",
    tag: "autoimune",
    values: { presencial: 550, teleconsulta: 550 },
    locations: [
      { local: locations.copacabana, horarios: "Quartas 14h-19h" },
    ],
    presentation: `*Dra. Manuela Pedretti Cabral*
Médica Dermatologista, especialista em Psoríase, Dermatite Atópica, Hidradenite supurativa e doenças autoinflamatórias.
Preceptora do serviço de Dermatologia do Hospital Universitário Pedro Ernesto (UERJ).
📍 *Localização:* Rua Santa Clara, Nº 50, sala 521 - Edifício Golden Point, Copacabana
🗓️ *Horários de Atendimento:* Quartas-feiras 14h às 19h
🅿️ *Estacionamento:* Vaga disponível para pacientes com autorização prévia (necessário informar placa e modelo do carro), exceto moto.
💰 *Valor da Consulta:* Presencial e ONLINE R$ 550,00
💳 *Formas de Pagamento:* Aceitamos dinheiro, PIX, débito e crédito (em até 6x sem juros).
🏥 *Convênios Médicos:* Apenas na modalidade reembolso com nota fiscal.`,
    doctoralia:
      "https://www.doctoralia.com.br/manuela-pedretti-cabral/dermatologista/rio-de-janeiro",
  },
  {
    id: "fabricio",
    name: "Dr. Fabricio de Andrade",
    focus:
      "Dermatopediatria: dermatologia infantil (formado em dermatologia e pediatria).",
    tag: "dermatopediatria",
    values: { presencial: 550, teleconsulta: 550 },
    locations: [
      { local: locations.copacabana, horarios: "Tercas 14h-20h, Quartas 10h-20h, Quintas 10h-14h" },
    ],
    presentation: `*Dr. Fabricio de Andrade*, dermatologista e pediatra (formado nas duas especialidades):
📍 *Copacabana:* Rua Santa Clara Nº 50, sala 521 - Edifício Golden Point
🗓️ Terças-feiras de 14h às 20h; Quartas de 10h às 20h e Quintas de 10h às 14h.
🅿️ Vaga de garagem disponível para pacientes com autorização prévia (necessário informar placa e modelo do carro), exceto moto.
💰 O valor da consulta presencial e ONLINE é de R$ 550,00. Aceitamos dinheiro, PIX, débito e crédito em até 6x sem juros.
🏥 Convênio médico apenas na modalidade reembolso com nota fiscal.`,
    doctoralia: null,
  },
];

const clinicKnowledge = {
  // Menu de triagem por area (fluxo Kommo). Use para mapear a queixa do paciente.
  areaMenu: [
    "1 Pele",
    "2 Unhas",
    "3 Cabelo",
    "4 Estetica",
    "5 Dermatologia infantil",
    "6 Cirurgia dermatologica",
    "7 Psoriase / Dermatite atopica / Hidradenite supurativa",
    "8 Outras",
  ],
  cities: ["Rio de Janeiro (RJ)", "Sao Paulo (SP)", "Teleconsulta"],
  locations,
  consultInfo:
    "Consulta particular de 1 hora, com avaliacao por dermatoscopia para diagnostico, tratamento e conduta. Direito a retorno em ate 30 dias.",
  parking:
    "RJ Copacabana: vaga para pacientes com autorizacao previa (informar placa e modelo do carro), exceto moto. Barra e SP: estacionamento rotativo.",
  convenios: "Nao atende convenio direto. Apenas modalidade reembolso com nota fiscal.",
  payment: {
    teleconsulta: "PIX ou cartao em ate 6x sem juros. So orientar pagamento depois de o paciente escolher um horario disponivel.",
    presencial: "Dinheiro, PIX, debito ou credito ate 6x sem juros, na clinica (salvo orientacao interna). SP: credito ate 3x e sinal de 30% para confirmar.",
  },
  welcomeMessage:
    "Ola! Seja bem-vindo(a) a Clinica Qara! Conte conosco para cuidar da sua saude. Qualquer duvida ou agendamento, estamos a disposicao.",
  kommoStages: [
    "Novo Lead",
    "Aguardando Horarios",
    "Aguardando Pagamento",
    "Pago",
    "Consulta Confirmada",
  ],
  scheduling: {
    teleconsulta: [
      "Confirmar medico + tipo (teleconsulta)",
      "Perguntar melhor periodo",
      "Verificar agenda (Doctoralia / interna; se sem acesso, pedir ao operador humano)",
      "Oferecer 2-4 horarios disponiveis",
      "Paciente escolhe",
      "Confirmar resumo e informar envio de link PIX/cartao",
      "Apos confirmacao do pagamento, confirmar a consulta",
    ],
    presencial: [
      "Confirmar medico + tipo (presencial)",
      "Perguntar melhor periodo",
      "Verificar agenda",
      "Oferecer 2-4 horarios",
      "Confirmar a consulta",
      "Se necessario, enviar endereco/orientacao essencial (curto)",
    ],
  },
  handoffTriggers: [
    "Caso sensivel/urgente (dor intensa, sangramento importante, suspeita grave, paciente muito ansioso, reclamacao seria)",
    "Paciente exige diagnostico/prescricao",
    "Conflito de informacao (valor, agenda, local) que a agente nao consegue validar",
  ],
};

// Conjunto de valores validos (qualquer membro da equipe) para o guard anti-alucinacao.
const allowedConsultValues = new Set(
  careTeam.flatMap((member) => Object.values(member.values)).map(String)
);

// Valores-placeholder que NAO devem ser gravados em coletado via set_field.
const PLACEHOLDER_FIELD_VALUES = new Set([
  "faltando",
  "aguardando",
  "a definir",
  "a confirmar",
  "pendente",
  "nao informado",
  "nao informada",
  "indefinido",
  "indefinida",
  "n/a",
  "na",
  "-",
  "?",
]);

// Prompt comportamental vem do .md editavel (src/agent). O codigo so adiciona o
// CONTRATO DE RUNTIME (acoes, present_doctor, validacao de horario, formato JSON).
function loadAgentPrompt() {
  try {
    return readFileSync(join(__dirname, "src", "agent", "agent-system-prompt-tawany.md"), "utf8").trim();
  } catch {
    return "Voce e Tawany, assistente virtual da Clinica QARA. Acolha, qualifique, direcione ao medico e conduza ao agendamento. Nao diagnostique nem prescreva.";
  }
}

const RUNTIME_CONTRACT = [
  "## Contrato de execução (runtime)",
  "",
  "Você recebe um JSON de contexto (context) com careTeam, knowledge, isFirstMessage, coletado, faltando. Use SOMENTE esses dados — nunca invente valor, horario ou endereco.",
  "",
  "APRESENTACAO DO MEDICO: nao escreva a apresentacao. Emita a action present_doctor com o id do medico (context.careTeam[].id: 'diego','miguel','diana','manuela','fabricio'; 'miguel-sp' para SP) assim que identificar o medico; o sistema insere o texto oficial (endereco, horarios, valor) uma unica vez por conversa, antes da sua mensagem. Na reply escreva so a continuacao. Nao repita para medico ja em agentState.presentedDoctors.",
  "",
  "VALOR: quando perguntarem o valor e o medico ja foi identificado, responda direto (todos exceto Dr. Miguel tem o mesmo valor presencial/online). So o Dr. Miguel varia por cidade (RJ R$650 / SP R$800) — nesse caso pergunte a cidade antes.",
  "",
  "AGENDAMENTO: voce NAO tem acesso a agenda — nunca invente horarios nem diga que ja consultou/registrou. Cada medico atende SOMENTE nos dias/horarios de context.careTeam[].locations[].horarios; valide o dia/hora pedido e nunca ofereca dia em que o medico nao atende. Quando o paciente informar periodo/dia valido, anote (set_field periodo=...) e diga que vai checar disponibilidade com a equipe (set_stage 'Aguardando Horarios'). Dr. Miguel em SP: avise o sinal de 30%.",
  "",
  "RESUMO DE CONFIRMACAO (obrigatorio quando tiver nome + modalidade + medico + dia/periodo validos; excecao a regra de 1 emoji):",
  "'Perfeito, {nome}! Confirmando seu agendamento:",
  "👩‍⚕️ Profissional: {medico}",
  "📍 Modalidade: {Teleconsulta | Presencial em <unidade>}",
  "📅 Dia e horario: {dia + periodo (horario exato a confirmar)}",
  "💰 Valor: R$ {valor}",
  "💳 Pagamento: {formas}'",
  "Depois, em 1 frase: teleconsulta -> link de pagamento para confirmar (set_stage 'Aguardando Pagamento'); presencial -> pagamento na clinica; SP -> sinal 30%. Nao afirme que a consulta ja esta marcada.",
  "",
  "ESTADO: use isFirstMessage (saudar so quando true), coletado (nao re-perguntar) e faltando (peca so o proximo item). Registre dados com set_field 'campo=valor' apenas quando o paciente informar de fato (nunca placeholder).",
  "ETAPAS (set_stage): " + clinicKnowledge.kommoStages.join(" | ") + ".",
  "",
  "FORMATO: retorne APENAS JSON valido: {\"reply\":\"texto pronto para WhatsApp\", \"actions\":[{\"type\":\"set_stage|set_tag|set_field|present_doctor|handoff_human|save_memory\",\"value\":\"...\"}], \"confidence\":0.0}",
].join("\n");

const SYSTEM_PROMPT = `${loadAgentPrompt()}\n\n---\n\n${RUNTIME_CONTRACT}`;

// Exemplos few-shot: ensinam tom, formato e regras (recusa de diagnostico, sem saudacao repetida).
const FEW_SHOT_EXAMPLES = [
  {
    role: "user",
    content: JSON.stringify({
      example: true,
      isFirstMessage: true,
      coletado: {},
      faltando: ["nome", "queixa", "modalidade", "periodo"],
      lastMessage: "oi, queria marcar uma consulta pra umas manchas no rosto",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "Ola! Sou a Tawany, da Clinica Qara. Me conta seu nome e se voce prefere atendimento presencial ou teleconsulta?",
      actions: [
        { type: "set_stage", value: "Novo Lead" },
        { type: "set_field", value: "queixa=manchas no rosto" },
      ],
      confidence: 0.7,
    }),
  },
  {
    role: "user",
    content: JSON.stringify({
      example: true,
      isFirstMessage: false,
      coletado: { nome: "Marina", queixa: "queda de cabelo" },
      faltando: ["modalidade", "periodo"],
      lastMessage: "é queda de cabelo mesmo. pode ser teleconsulta",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "Teleconsulta funciona bem pra tricologia, sim. Vou ja te mostrar a Dra. Diana Stohmann, nossa especialista em cabelos. Qual turno fica melhor pra voce — manha, tarde ou noite?",
      actions: [
        { type: "set_tag", value: "tricologia" },
        { type: "set_field", value: "modalidade=teleconsulta" },
        { type: "present_doctor", value: "diana" },
        { type: "set_stage", value: "Aguardando Horarios" },
      ],
      confidence: 0.85,
    }),
  },
  {
    role: "user",
    content: JSON.stringify({
      example: true,
      isFirstMessage: false,
      coletado: { nome: "Carlos" },
      faltando: ["modalidade", "periodo"],
      lastMessage: "isso aqui na minha unha é micose? que remedio eu tomo?",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "Pra saber o que e e indicar o tratamento certo, precisa de uma avaliacao com o dermatologista — nao tem como dizer por aqui. O Dr. Miguel Ceccarelli e o nosso especialista em unhas. Prefere presencial ou teleconsulta, Carlos?",
      actions: [{ type: "set_tag", value: "unhas" }],
      confidence: 0.8,
    }),
  },
  {
    role: "user",
    content: JSON.stringify({
      example: true,
      isFirstMessage: false,
      coletado: { nome: "Ana", queixa: "psoriase", modalidade: "presencial" },
      faltando: ["periodo"],
      lastMessage: "pode ser qualquer dia, prefiro de tarde",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "Tarde anotado. Deixa eu checar os horarios da Dra. Manuela e ja te mando as opcoes.",
      actions: [
        { type: "set_field", value: "periodo=tarde" },
        { type: "set_stage", value: "Aguardando Horarios" },
      ],
      confidence: 0.9,
    }),
  },
  {
    role: "user",
    content: JSON.stringify({
      example: true,
      isFirstMessage: false,
      coletado: { queixa: "unha", modalidade: "presencial", periodo: "sabado manha" },
      faltando: [],
      lastMessage: "prefiro sabado la tem estacionamento? fica perto de onde",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "Em SP a unidade e no Itaim Bibi (R. Joaquim Floriano, 820). Estacionamento rotativo nas redondezas — sem vaga propria. Sabado manha certo, vou checar disponibilidade com a equipe.",
      actions: [
        { type: "set_field", value: "periodo=sabado manha" },
        { type: "set_stage", value: "Aguardando Horarios" },
      ],
      confidence: 0.92,
    }),
  },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", publicBaseUrl(req));

    if (url.pathname === "/webhooks/meta" && req.method === "GET") {
      return verifyWebhook(url, res);
    }

    if (url.pathname === "/webhooks/meta" && req.method === "POST") {
      return receiveWebhook(req, res);
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      return login(req, res);
    }

    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/health" && !isLeadWebhookRequest(url, req)) {
      const auth = authorizeApiRequest(req);
      if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });
    }

    // Rotas novas (Prisma) tem prioridade; se nenhuma casar, segue para os endpoints legados.
    if (handleModularApi && (await handleModularApi(req, res, url))) return;

    if (url.pathname === "/api/integrations/status" && req.method === "GET") {
      return json(res, 200, integrationStatus(req));
    }

    if (url.pathname === "/api/conversations" && req.method === "GET") {
      // Cutover: le do banco (formato legado). Cai no JSON se o banco estiver indisponivel
      // ou ainda vazio, mantendo a migracao aditiva.
      if (getInboxLegacyShape) {
        try {
          const dbInbox = await getInboxLegacyShape();
          if (dbInbox?.conversations?.length) return json(res, 200, dbInbox);
        } catch (error) {
          console.warn("inbox_db_fallback:", error.message);
        }
      }
      const store = readStore();
      return json(res, 200, { conversations: Object.values(store.conversations).sort(sortByLastAt) });
    }

    if (url.pathname === "/api/messages/send" && req.method === "POST") {
      const body = await readJson(req);
      const result = await sendAndStoreMessage(body);
      return json(res, result.ok ? 200 : 400, result);
    }

    // Simulador interno de mensagem recebida (staff logado). Reusa o mesmo pipeline do
    // webhook, mas sem assinatura Meta: ja passou pela auth de /api/* (linha ~394).
    if (url.pathname === "/api/inbox/simulate" && req.method === "POST") {
      const body = await readJson(req);
      const result = await processIncomingPayload(body);
      return json(res, result.received ? 200 : 400, { ...result, ok: Boolean(result.received) });
    }

    // Exclui conversa do inbox. O id exposto e `${channel}:${externalId}` (mesma chave no
    // store JSON e no banco), entao remove dos dois para nao reaparecer pelo fallback.
    if (url.pathname.startsWith("/api/conversations/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.slice("/api/conversations/".length));
      const sep = id.indexOf(":");
      const channel = sep >= 0 ? id.slice(0, sep) : "";
      const externalId = sep >= 0 ? id.slice(sep + 1) : "";
      let removedFromStore = false;
      await withStoreLock(async () => {
        const store = readStore();
        if (store.conversations[id]) {
          delete store.conversations[id];
          writeStore(store);
          removedFromStore = true;
        }
      });
      let dbDeleted = 0;
      if (deleteConversationDb && channel && externalId) {
        try { ({ deleted: dbDeleted } = await deleteConversationDb({ channel, externalId })); } catch (e) { console.warn("delete_convo_db:", e.message); }
      }
      return json(res, 200, { ok: true, removed: removedFromStore || dbDeleted > 0, dbDeleted });
    }

    if (url.pathname === "/api/agent/test" && req.method === "POST") {
      const body = await readJson(req);
      const result = await testAgentReply(body);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return json(res, 200, { ok: true });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return json(res, 500, { ok: false, error: "internal_error" });
  }
});

// So sobe a porta quando executado direto (node server.js); importavel em testes sem bind.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, () => {
    console.log(`CliniQara CRM rodando em http://localhost:${port}`);
    console.log(`Webhook Meta: http://localhost:${port}/webhooks/meta`);
  });
}

export { guardAgentReply, resolveDoctorValue, parseAgentJson, buildWhatsAppMessagePayload, previewOutboundText };

async function login(req, res) {
  if (!loginWithPassword) return json(res, 503, { ok: false, error: "login_unavailable" });
  try {
    const body = await readJson(req);
    const result = await loginWithPassword(body.username, String(body.password || ""), {
      allowDevBootstrap: process.env.ALLOW_DEV_BOOTSTRAP === "true" && isLocalRequest(req),
    });
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    return json(res, error.status || 401, { ok: false, error: error.code || "invalid_credentials" });
  }
}

function verifyWebhook(url, res) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(challenge || "");
    return;
  }

  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Forbidden");
}

async function receiveWebhook(req, res) {
  const rawBody = await readRaw(req);

  if (!isValidSignature(req, rawBody)) {
    return json(res, 403, { ok: false, error: "invalid_signature" });
  }

  const payload = JSON.parse(rawBody || "{}");
  const result = await processIncomingPayload(payload);
  return json(res, 200, { ok: true, ...result });
}

// Processa um payload (formato webhook Meta) de mensagens recebidas: grava na store,
// roda automacoes/agente e espelha no banco. Compartilhado entre o webhook publico
// (com assinatura) e o simulador interno autenticado (/api/inbox/simulate).
async function processIncomingPayload(payload) {
  const incoming = extractIncomingMessages(payload);
  return withStoreLock(async () => {
    const store = readStore();
    const automationResults = [];

    // Grava todas as mensagens primeiro para que o agente tenha contexto completo.
    for (const message of incoming) {
      upsertConversationMessage(store, message);
    }

    // Por conversa, dispara automações apenas para a última mensagem do batch.
    // Evita respostas duplicadas quando o paciente envia várias mensagens rapidamente.
    const lastPerConv = new Map();
    for (const message of incoming) {
      lastPerConv.set(`${message.channel}:${message.externalId}`, message);
    }

    for (const message of lastPerConv.values()) {
      const replies = await runAutomations(message, store);
      automationResults.push(...replies);
    }

    if (incoming.length) writeStore(store);
    return { received: incoming.length, automated: automationResults.length };
  });
}

function extractIncomingMessages(payload) {
  const messages = [];

  if (payload.object === "whatsapp_business_account") {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contactsByWaId = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact]));
        for (const msg of value.messages || []) {
          const contact = contactsByWaId.get(msg.from) || {};
          messages.push({
            id: msg.id || uid("wa"),
            channel: "whatsapp",
            externalId: msg.from,
            phone: msg.from,
            name: contact.profile?.name || `WhatsApp ${msg.from}`,
            text: extractWhatsAppText(msg),
            direction: "inbound",
            timestamp: timestampFromMeta(msg.timestamp),
            rawType: msg.type || "message",
            metadata: {
              phoneNumberId: value.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
              displayPhoneNumber: value.metadata?.display_phone_number || "",
            },
          });
        }
      }
    }
  }

  if (payload.object === "instagram" || payload.object === "page") {
    for (const entry of payload.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;
        messages.push({
          id: event.message.mid || uid("ig"),
          channel: "instagram",
          externalId: event.sender?.id,
          phone: "",
          name: `Instagram ${event.sender?.id || "lead"}`,
          text: event.message.text || describeAttachments(event.message.attachments),
          direction: "inbound",
          timestamp: event.timestamp || Date.now(),
          rawType: "message",
          metadata: {
            recipientId: event.recipient?.id || "",
          },
        });
      }
    }
  }

  return messages.filter((message) => message.externalId && message.text);
}

function extractWhatsAppText(msg) {
  if (msg.text?.body) return msg.text.body;
  if (msg.button?.text) return msg.button.text;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.image?.caption) return msg.image.caption;
  if (msg.document?.caption) return msg.document.caption;
  return `[${msg.type || "mensagem"} recebida]`;
}

function describeAttachments(attachments = []) {
  if (!attachments.length) return "[mensagem recebida]";
  return attachments.map((attachment) => `[${attachment.type || "anexo"} recebido]`).join(" ");
}

// Fluxo hibrido: o bot (fluxo "Leads novos") faz a abertura (saudacao + menu);
// a partir da resposta do paciente, o agente Tawany assume a conversa.
async function runAutomations(inboundMessage, store) {
  // Classifica a mensagem do paciente (best-effort, nao bloqueia a resposta).
  if (classifyInboundToDb) classifyInboundToDb(inboundMessage).catch(() => {});

  const conversation = getConversation(store, inboundMessage.channel, inboundMessage.externalId);
  const agentState = conversation.agentState || {};
  const outboundCount = (conversation.messages || []).filter((message) => message.direction === "outbound").length;
  const isOpening = outboundCount === 0 && !agentState.botIntroDone;

  // 1) Abertura da conversa -> bot de regras faz a saudacao/menu inicial.
  if (isOpening) {
    const botResults = await runBotAutomation(inboundMessage, store);
    if (botResults.length) {
      conversation.agentState = {
        ...(conversation.agentState || {}),
        botIntroDone: true,
        botIntroAt: Date.now(),
      };
      return botResults;
    }
    // Sem regra de abertura correspondente: cai direto no agente.
  }

  // 2) Demais mensagens -> agente Tawany assume.
  const agentResults = await runAgentAutomation(inboundMessage, store);
  if (agentResults.length) return agentResults;

  // 3) Fallback: se o agente estiver indisponivel, tenta o bot de regras.
  return runBotAutomation(inboundMessage, store);
}

async function runAgentAutomation(inboundMessage, store) {
  const results = [];
  const agentResult = await runAgent(inboundMessage, store);
  if (!agentResult?.replies?.length) return results;

  for (const reply of agentResult.replies) {
    const result = await sendAndStoreMessage(
      {
        channel: inboundMessage.channel,
        externalId: inboundMessage.externalId,
        text: reply,
      },
      store,
      { automatedBy: agentResult.agentName, actions: agentResult.actions || [] },
    );
    results.push(result);
  }
  return results;
}

async function runBotAutomation(inboundMessage, store) {
  const results = [];
  const bots = loadBots().filter((bot) => bot.active !== false);
  for (const bot of bots) {
    const rule = findMatchingRule(bot, inboundMessage.text);
    if (!rule) continue;

    const responses = (rule.responses || []).filter(Boolean).slice(0, 4);
    for (const response of responses) {
      const outbound = {
        channel: inboundMessage.channel,
        externalId: inboundMessage.externalId,
        text: cleanBotText(response),
      };
      const result = await sendAndStoreMessage(outbound, store, { automatedBy: bot.name });
      results.push(result);
    }
    break;
  }
  return results;
}

async function testAgentReply(input) {
  const lead = input.lead || {};
  const text = clean(input.text);
  const externalId = clean(lead.id || input.externalId || uid("test"));
  if (!text) return { ok: false, error: "text_required" };

  const store = { conversations: {} };
  const key = `test:${externalId}`;
  const messages = Array.isArray(input.messages) ? input.messages : [];
  store.conversations[key] = {
    id: key,
    channel: "test",
    externalId,
    phone: "",
    // Vazio = sem nome ainda (exercita a coleta de nome). Nao injetar placeholder aqui.
    name: clean(lead.name) || "",
    createdAt: Date.now(),
    lastAt: Date.now(),
    agentState: lead.agentState || {},
    messages: messages.map((message, index) => ({
      id: `test-msg-${index}`,
      channel: "test",
      externalId,
      name: lead.name || "Lead teste",
      text: clean(message.text),
      direction: message.from === "patient" ? "inbound" : "outbound",
      timestamp: Date.now() - (messages.length - index) * 1000,
      rawType: "text",
      metadata: {},
    })),
  };

  const last = store.conversations[key].messages.at(-1);
  if (!last || last.text !== text || last.direction !== "inbound") {
    store.conversations[key].messages.push({
      id: uid("test-in"),
      channel: "test",
      externalId,
      name: lead.name || "Lead teste",
      text,
      direction: "inbound",
      timestamp: Date.now(),
      rawType: "text",
      metadata: {},
    });
  }

  const result = await runAgent(
    {
      id: uid("test"),
      channel: "test",
      externalId,
      name: lead.name || "Lead teste",
      text,
      direction: "inbound",
      timestamp: Date.now(),
      rawType: "text",
      metadata: {},
    },
    store,
  );

  if (!result?.replies?.length) return { ok: false, error: "agent_unavailable" };
  return {
    ok: true,
    replies: result.replies,
    actions: result.actions || [],
    agentName: result.agentName,
    agentState: store.conversations[key].agentState || {},
  };
}

async function runAgent(inboundMessage, store) {
  if (aiProvider !== "openai" || !process.env.OPENAI_API_KEY) return null;

  const conversation = getConversation(store, inboundMessage.channel, inboundMessage.externalId);
  const agentState = conversation.agentState || {};
  const messages = (conversation.messages || []).slice(-20).map((message) => ({
    role: message.direction === "inbound" ? "user" : "assistant",
    content: message.text,
  }));

  // Estado explicito: evita repetir saudacao e re-perguntar o que ja foi coletado.
  const collected = { ...(agentState.collected || {}) };
  if (conversation.name && !collected.nome) collected.nome = conversation.name;
  const requiredFields = ["nome", "queixa", "modalidade", "periodo"];
  const faltando = requiredFields.filter((field) => !collected[field]);
  const isFirstMessage =
    (conversation.messages || []).filter((message) => message.direction === "outbound").length === 0;

  // Contexto enxuto: remove os textos longos de apresentacao (injetados pelo servidor
  // via action present_doctor). Mantem dados estruturados que o agente usa para raciocinar.
  const careTeamLite = careTeam.map(({ presentation, presentationSp, ...rest }) => rest);

  const context = {
    channel: inboundMessage.channel,
    contactName: conversation.name,
    contactId: inboundMessage.externalId,
    clinic: clinicConfig,
    careTeam: careTeamLite,
    knowledge: clinicKnowledge,
    agentState,
    isFirstMessage,
    coletado: collected,
    faltando,
    lastMessage: inboundMessage.text,
    availableTools: [
      "set_stage",
      "set_next_step",
      "set_tag",
      "set_field",
      "present_doctor",
      "handoff_human",
      "save_memory",
    ],
  };

  const prompt = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...FEW_SHOT_EXAMPLES,
    {
      role: "user",
      content: JSON.stringify({
        task:
          "Analise a conversa e gere a mensagem da Tawany para o WhatsApp seguindo todas as regras de persona, triagem e agendamento. Se precisar, sugira acoes estruturadas. Formato obrigatorio: {\"reply\":\"texto pronto para copiar/colar\", \"actions\":[{\"type\":\"set_stage|set_next_step|set_tag|set_field|present_doctor|handoff_human|save_memory\", \"value\":\"...\"}], \"confidence\":0.0}",
        context,
        conversation: messages,
      }),
    },
  ];

  try {
    const completion = await callOpenAI(prompt);
    const parsed = parseAgentJson(completion);
    if (!parsed?.reply) return null;
    parsed.reply = guardAgentReply(parsed.reply, conversation);
    parsed.reply = injectDoctorPresentation(parsed.reply, parsed.actions || [], conversation);
    applyAgentActions(conversation, parsed.actions || []);
    conversation.agentState = {
      ...conversation.agentState,
      lastProvider: "openai",
      lastModel: openAIModel,
      lastConfidence: parsed.confidence ?? null,
      updatedAt: Date.now(),
    };
    return {
      agentName: `OpenAI:${openAIModel}`,
      replies: [parsed.reply],
      actions: parsed.actions || [],
    };
  } catch (error) {
    console.error("agent_error", error.message);
    return null;
  }
}

function guardAgentReply(reply, conversation = null) {
  const text = clean(reply);
  const moneyMatches = text.match(/R\$\s*\d+(?:[\.,]\d{2})?/g) || [];
  if (!moneyMatches.length) return text;

  const correctValue = resolveDoctorValue(text, conversation);
  let guarded = text;

  for (const match of moneyMatches) {
    const digits = (normalizeText(match).match(/\d+/g) || []).join("");
    const allowed = [...allowedConsultValues].some((value) => digits.includes(value));
    if (allowed) continue;
    // Corrige apenas o valor errado, preservando o resto da mensagem.
    const replacement = correctValue
      ? `R$ ${correctValue}`
      : "esse valor (confirmo certinho com a equipe)";
    guarded = guarded.replace(match, replacement);
  }

  return guarded;
}

// Descobre o valor correto da consulta quando ha UM medico identificavel (nome no texto
// ou tag no estado) e ele tem um unico valor. Caso ambiguo (ex.: Dr. Miguel RJ/SP), retorna null.
function resolveDoctorValue(text, conversation) {
  const norm = normalizeText(text);
  const titles = new Set(["dr", "dra", "dr.", "dra."]);
  let candidates = careTeam.filter((member) => {
    const tokens = normalizeText(member.name)
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !titles.has(token));
    return tokens.some((token) => norm.includes(token));
  });

  if (candidates.length !== 1) {
    const tags = conversation?.agentState?.tags || [];
    const byTag = careTeam.filter((member) => tags.includes(member.tag));
    if (byTag.length === 1) candidates = byTag;
  }

  if (candidates.length !== 1) return null;
  const distinct = [...new Set(Object.values(candidates[0].values).map(String))];
  return distinct.length === 1 ? distinct[0] : null;
}

// Injeta o texto OFICIAL de apresentacao do medico quando o agente emite a action
// present_doctor, uma unica vez por conversa. O texto nao trafega no contexto do modelo.
function injectDoctorPresentation(reply, actions, conversation) {
  const action = (actions || []).find((item) => clean(item.type) === "present_doctor");
  if (!action) return reply;

  const raw = normalizeText(clean(action.value));
  if (!raw) return reply;
  const wantsSp = /\bsp\b|sao paulo/.test(raw);
  const id = raw.replace(/[-:\s].*$/, "").trim();
  const member = careTeam.find((m) => m.id === id);
  if (!member) return reply;

  const useSp = member.id === "miguel" && wantsSp && member.presentationSp;
  const text = useSp ? member.presentationSp : member.presentation;
  if (!text) return reply;

  const state = conversation.agentState || {};
  const presented = new Set(state.presentedDoctors || []);
  const key = useSp ? "miguel-sp" : member.id;
  if (presented.has(key)) return reply; // ja apresentado nesta conversa

  presented.add(key);
  conversation.agentState = { ...state, presentedDoctors: [...presented] };

  return reply ? `${text}\n\n${reply}` : text;
}

// Modelos GPT-5 e o-series (reasoning) nao aceitam temperature customizada: usam reasoning_effort.
// gpt-4.1 e gpt-4o usam temperature normalmente.
const supportsCustomTemperature = !/^(gpt-5|o1|o3|o4)/i.test(openAIModel);
// Tarefa roteirizada nao precisa raciocinio profundo: "minimal" leva ~2s vs ~15s no padrao.
// ponytail: env tunavel; suba para "low"/"medium" se a triagem perder qualidade.
// "low" equivale a aproximadamente temperature 0.7 em modelos reasoning — mais natural que "minimal".
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "low";

async function callOpenAI(messages) {
  const body = {
    model: openAIModel,
    response_format: { type: "json_object" },
    messages,
  };
  if (supportsCustomTemperature) body.temperature = 0.7;
  else body.reasoning_effort = reasoningEffort;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `openai_http_${response.status}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

function parseAgentJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = String(content).match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function applyAgentActions(conversation, actions) {
  const state = conversation.agentState || {};
  for (const action of actions || []) {
    const type = clean(action.type);
    const value = clean(action.value);
    if (!type || !value) continue;
    if (type === "set_stage") state.stage = value;
    if (type === "set_next_step") state.nextStep = value;
    if (type === "set_tag") {
      const tags = new Set([...(state.tags || []), value]);
      state.tags = [...tags].slice(-12);
    }
    if (type === "set_field") {
      const separator = value.indexOf("=") >= 0 ? "=" : ":";
      const field = clean(value.slice(0, value.indexOf(separator))).toLowerCase();
      const fieldValue = clean(value.slice(value.indexOf(separator) + 1));
      // Ignora placeholders: o campo so deve ser gravado quando o paciente informou de fato.
      const normalized = normalizeText(fieldValue);
      const isPlaceholder =
        !field ||
        !fieldValue ||
        normalized === field ||
        PLACEHOLDER_FIELD_VALUES.has(normalized);
      if (!isPlaceholder) {
        state.collected = { ...(state.collected || {}), [field]: fieldValue };
      }
    }
    if (type === "handoff_human") state.handoff = { reason: value, at: Date.now() };
    if (type === "save_memory") {
      state.notes = [...(state.notes || []), { text: value, at: Date.now() }].slice(-12);
    }
  }
  conversation.agentState = state;
}

async function sendAndStoreMessage(input, existingStore = null, options = {}) {
  const channel = clean(input.channel);
  const externalId = clean(input.externalId);
  const messageOptions = { ...options, messageType: input.messageType || input.type || options.messageType || "text", whatsapp: input.whatsapp || options.whatsapp || null };
  const text = previewOutboundText(input, messageOptions);

  if (!channel || !externalId || !text) {
    return { ok: false, error: "channel_externalId_text_required" };
  }

  const outbound = {
    id: uid("out"),
    channel,
    externalId,
    phone: channel === "whatsapp" ? externalId : "",
    name: input.name || `${channel} ${externalId}`,
    text,
    direction: "outbound",
    timestamp: Date.now(),
    rawType: messageOptions.messageType || "text",
    delivery: "pending",
    metadata: messageOptions,
  };

  const sendResult = await sendChannelMessage(channel, externalId, text, messageOptions);
  outbound.delivery = sendResult.ok ? "sent" : "not_sent";
  outbound.metadata = { ...outbound.metadata, sendResult };

  if (existingStore) {
    upsertConversationMessage(existingStore, outbound, { mirror: false });
  } else {
    await withStoreLock(async () => {
      const store = readStore();
      upsertConversationMessage(store, outbound, { mirror: false });
      writeStore(store);
    });
  }
  if (mirrorMessageToDb) await mirrorMessageToDb(outbound).catch(() => {});

  return { ok: sendResult.ok, message: outbound, provider: sendResult };
}

async function sendChannelMessage(channel, externalId, text, options = {}) {
  if (channel === "whatsapp") return sendWhatsAppMessage(externalId, text, options);
  if (channel === "instagram") return sendInstagramMessage(externalId, text);
  return { ok: false, error: "unsupported_channel" };
}

async function sendWhatsAppMessage(to, text, options = {}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: "whatsapp_not_configured" };

  return graphPost(`/${phoneNumberId}/messages`, token, buildWhatsAppMessagePayload(to, text, options));
}

function buildWhatsAppMessagePayload(to, text, options = {}) {
  const type = clean(options.messageType || "text");
  const whatsapp = options.whatsapp || {};
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };

  if (type === "buttons") {
    const buttons = normalizeReplyButtons(whatsapp.buttons);
    if (buttons.length) {
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          ...(whatsapp.header ? { header: { type: "text", text: clean(whatsapp.header).slice(0, 60) } } : {}),
          body: { text: clean(whatsapp.body || text).slice(0, 1024) },
          ...(whatsapp.footer ? { footer: { text: clean(whatsapp.footer).slice(0, 60) } } : {}),
          action: { buttons },
        },
      };
    }
  }

  if (type === "list") {
    const sections = normalizeListSections(whatsapp.sections);
    if (sections.length) {
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          ...(whatsapp.header ? { header: { type: "text", text: clean(whatsapp.header).slice(0, 60) } } : {}),
          body: { text: clean(whatsapp.body || text).slice(0, 1024) },
          ...(whatsapp.footer ? { footer: { text: clean(whatsapp.footer).slice(0, 60) } } : {}),
          action: {
            button: clean(whatsapp.buttonText || "Ver opcoes").slice(0, 20),
            sections,
          },
        },
      };
    }
  }

  if (type === "template") {
    const name = clean(whatsapp.templateName || whatsapp.name);
    if (name) {
      const components = Array.isArray(whatsapp.components) ? whatsapp.components : buildTemplateComponents(whatsapp);
      return {
        ...base,
        type: "template",
        template: {
          name,
          language: { code: clean(whatsapp.languageCode || "pt_BR") },
          ...(components.length ? { components } : {}),
        },
      };
    }
  }

  return {
    ...base,
    type: "text",
    text: { preview_url: false, body: text },
  };
}

function previewOutboundText(input, options = {}) {
  const text = clean(input.text || options.whatsapp?.body || "");
  const type = clean(options.messageType || "text");
  if (type === "buttons") {
    const labels = normalizeReplyButtons(options.whatsapp?.buttons).map((button) => button.reply.title);
    return `${text}\n[Botões: ${labels.join(" / ")}]`.trim();
  }
  if (type === "list") {
    return `${text}\n[Lista: ${clean(options.whatsapp?.buttonText || "Ver opcoes")}]`.trim();
  }
  if (type === "template") {
    const name = clean(options.whatsapp?.templateName || options.whatsapp?.name);
    return name ? `[Modelo WhatsApp: ${name}]` : text;
  }
  return text;
}

function normalizeReplyButtons(buttons = []) {
  const input = Array.isArray(buttons) ? buttons : String(buttons || "").split("|");
  return input
    .map((button, index) => {
      const title = clean(typeof button === "string" ? button : button.title).slice(0, 20);
      const id = clean(typeof button === "string" ? "" : button.id) || `btn_${index + 1}`;
      return title ? { type: "reply", reply: { id: id.slice(0, 256), title } } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeListSections(sections = []) {
  const input = Array.isArray(sections) ? sections : [];
  return input
    .map((section, sectionIndex) => {
      const rows = (Array.isArray(section.rows) ? section.rows : [])
        .map((row, rowIndex) => {
          const title = clean(row.title).slice(0, 24);
          if (!title) return null;
          return {
            id: clean(row.id || `row_${sectionIndex + 1}_${rowIndex + 1}`).slice(0, 200),
            title,
            ...(row.description ? { description: clean(row.description).slice(0, 72) } : {}),
          };
        })
        .filter(Boolean)
        .slice(0, 10);
      return rows.length
        ? {
            title: clean(section.title || "Opcoes").slice(0, 24),
            rows,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 10);
}

function buildTemplateComponents(whatsapp = {}) {
  const params = Array.isArray(whatsapp.bodyParams) ? whatsapp.bodyParams.map(clean).filter(Boolean) : [];
  const components = [];
  if (params.length) {
    components.push({ type: "body", parameters: params.map((value) => ({ type: "text", text: value })) });
  }
  return components;
}

async function sendInstagramMessage(recipientId, text) {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const sendId = process.env.INSTAGRAM_SEND_ID || "me";
  if (!token) return { ok: false, error: "instagram_not_configured" };

  return graphPost(`/${sendId}/messages`, token, {
    recipient: { id: recipientId },
    message: { text },
  });
}

async function graphPost(path, token, body) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, data } : { ok: false, status: response.status, data };
}

function upsertConversationMessage(store, message, options = {}) {
  const key = `${message.channel}:${message.externalId}`;
  const current = store.conversations[key] || {
    id: key,
    channel: message.channel,
    externalId: message.externalId,
    phone: message.phone || "",
    name: message.name || `${message.channel} ${message.externalId}`,
    createdAt: Date.now(),
    lastAt: 0,
    messages: [],
  };

  current.phone = current.phone || message.phone || "";
  current.name = message.name && !message.name.startsWith(`${message.channel} `) ? message.name : current.name;
  current.lastAt = Math.max(current.lastAt || 0, Number(message.timestamp) || Date.now());

  const isNew = !current.messages.some((item) => item.id === message.id);
  if (isNew) {
    current.messages.push(message);
  }
  current.messages.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  store.conversations[key] = current;

  // Espelhamento best-effort para o banco (nao bloqueia, nunca lanca).
  if (isNew && options.mirror !== false && mirrorMessageToDb) {
    mirrorMessageToDb(message).catch(() => {});
  }
}

function getConversation(store, channel, externalId) {
  const key = `${channel}:${externalId}`;
  if (!store.conversations[key]) {
    store.conversations[key] = {
      id: key,
      channel,
      externalId,
      phone: channel === "whatsapp" ? externalId : "",
      name: `${channel} ${externalId}`,
      createdAt: Date.now(),
      lastAt: Date.now(),
      messages: [],
      agentState: {},
    };
  }
  return store.conversations[key];
}

function integrationStatus(req) {
  const store = readStore();
  return {
    ok: true,
    webhookUrl: `${publicBaseUrl(req)}/webhooks/meta`,
    configured: {
      verifyToken: Boolean(process.env.META_VERIFY_TOKEN),
      appSecret: Boolean(process.env.META_APP_SECRET),
      whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      instagram: Boolean(process.env.INSTAGRAM_PAGE_ACCESS_TOKEN),
      openai: Boolean(process.env.OPENAI_API_KEY),
      adminApi: Boolean(adminApiKey),
      userLogin: Boolean(loginWithPassword),
    },
    security: {
      apiAuth: loginWithPassword ? "session_login" : adminApiKey ? "admin_key" : "unavailable",
      webhookSignature: process.env.META_APP_SECRET
        ? "enabled"
        : isUnsignedWebhookAllowed(req)
          ? "local_dev_or_explicit"
          : "blocked_without_app_secret",
    },
    agent: {
      provider: aiProvider,
      model: aiProvider === "openai" ? openAIModel : null,
      enabled: aiProvider === "openai" && Boolean(process.env.OPENAI_API_KEY),
    },
    clinic: clinicConfig,
    graphVersion,
    conversations: Object.keys(store.conversations).length,
    messages: Object.values(store.conversations).reduce((sum, conversation) => sum + conversation.messages.length, 0),
  };
}

function authorizeApiRequest(req) {
  if (authorizeRequest) return authorizeRequest(req);
  if (process.env.ALLOW_UNAUTHENTICATED_API === "true") return { ok: true };
  return { ok: false, status: 503, error: "auth_unavailable" };
}

function isLeadWebhookRequest(url, req) {
  return req.method === "POST" && (url.pathname === "/api/webhook" || url.pathname === "/api/leads/webhook");
}

function isUnsignedWebhookAllowed(req) {
  return process.env.ALLOW_UNSIGNED_WEBHOOKS === "true" || (!isProduction && isLocalRequest(req));
}

function isLocalRequest(req) {
  const host = String(req.headers.host || "").toLowerCase();
  const remote = String(req.socket?.remoteAddress || "").toLowerCase();
  return (
    host.startsWith("localhost:") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1:") ||
    host === "127.0.0.1" ||
    host.startsWith("[::1]:") ||
    remote === "::1" ||
    remote === "127.0.0.1" ||
    remote === "::ffff:127.0.0.1"
  );
}

function safeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function withStoreLock(operation) {
  const run = storeOperationQueue.then(operation, operation);
  storeOperationQueue = run.catch(() => {});
  return run;
}

function ensureDataDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dataDir, 0o700);
  } catch {
    // Best effort: alguns hosts nao permitem alterar permissao de diretorio.
  }
}

function loadBots() {
  const file = join(rootDir, "flows", "leads-novos.bot.js");
  if (!existsSync(file)) return [];
  const content = readFileSync(file, "utf8");
  const match = content.match(/CLINI_QARA_BUNDLED_BOTS\s*=\s*(\[[\s\S]*\]);?\s*$/);
  if (!match) return [];
  return JSON.parse(match[1]);
}

function findMatchingRule(bot, text) {
  const incoming = normalizeText(text);
  return (bot.rules || []).find((rule) =>
    (rule.terms || []).some((term) => {
      const candidate = normalizeText(term);
      if (!candidate) return false;
      if (candidate.length <= 2) return incoming === candidate;
      return incoming === candidate || incoming.includes(candidate) || candidate.includes(incoming);
    }),
  );
}

function cleanBotText(text) {
  return clean(text)
    .replaceAll("*", "")
    .replace(/\n{3,}/g, "\n\n");
}

function readStore() {
  ensureDataDir();
  if (!existsSync(storeFile)) return { conversations: {} };
  try {
    const parsed = JSON.parse(readFileSync(storeFile, "utf8"));
    return parsed?.conversations ? parsed : { conversations: {} };
  } catch {
    return { conversations: {} };
  }
}

function writeStore(store) {
  ensureDataDir();
  const tmpFile = join(dataDir, `.channel-conversations.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmpFile, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpFile, storeFile);
  try {
    chmodSync(storeFile, 0o600);
  } catch {
    // Best effort: alguns filesystems gerenciados ignoram chmod.
  }
}

function isValidSignature(req, rawBody) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return isUnsignedWebhookAllowed(req);

  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signature.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(resolve(join(rootDir, requested)));
  const relativePath = relative(rootDir, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    // Dev: revalida sempre para evitar app.js/styles.css em cache antigo.
    "Cache-Control": "no-cache, must-revalidate",
  });
  createReadStream(filePath).pipe(res);
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const raw = await readRaw(req);
  return raw ? JSON.parse(raw) : {};
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        req.destroy();
        reject(new Error("body_too_large"));
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function publicBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`;
  return `${proto}://${host}`;
}

function timestampFromMeta(timestamp) {
  const numeric = Number(timestamp);
  if (!numeric) return Date.now();
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function sortByLastAt(a, b) {
  return Number(b.lastAt || 0) - Number(a.lastAt || 0);
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadEnv() {
  const envFile = join(__dirname, ".env");
  if (!existsSync(envFile)) return;

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
