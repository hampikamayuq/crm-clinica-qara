// Knowledge/config do classificador QARA (esquema novo, IDs de pipeline).
// Espelha src/agent/qara-classification-rules.ts (canonico tipado) em JS para o runtime.
// ponytail: 2 arquivos so porque .ts nao roda em node puro; manter em sincronia.

export const PIPELINES = [
  "1-unhas", "2-cirurgia", "3-tricologia", "4-inflamatorias",
  "5-dermatopediatria", "6-dermatologia-clinica", "7-podologia", "8-administrativo", "9-reativacao",
];

export const PIPELINE_LABELS = {
  "1-unhas": "Unhas / Onicologia",
  "2-cirurgia": "Cirurgia Dermatológica",
  "3-tricologia": "Tricologia / Cabelos",
  "4-inflamatorias": "Inflamatórias Crônicas",
  "5-dermatopediatria": "Dermatopediatria",
  "6-dermatologia-clinica": "Dermatologia Clínica",
  "7-podologia": "Podologia",
  "8-administrativo": "Administrativo",
  "9-reativacao": "Alta / Reativação",
};

export const ETAPAS = [
  "novo-lead", "qualificado", "horario-oferecido", "agendado",
  "confirmado", "atendido", "reagendado", "perdido", "alta-manutencao",
];

export const PRIORIDADES = ["P1", "P2", "P3", "P4"];
export const TEMPERATURAS = ["Quente", "Morno", "Frio"];

// Ordem = prioridade de match (especifico -> geral; dermatologia clinica por ultimo).
export const PIPELINE_RULES = [
  { id: "1-unhas", medico: "Dr. Miguel Ceccarelli", tags: ["pipeline:unhas", "medico:miguel"],
    keywords: ["unha", "unhas", "micose de unha", "unha encravada", "onicomicose", "melanoniquia", "mancha escura na unha", "inflamacao na unha", "granuloma", "paroniquia", "distrofia ungueal"] },
  { id: "2-cirurgia", medico: "Dr. Diego Galvez", tags: ["pipeline:cirurgia", "medico:diego"],
    keywords: ["pinta", "sinal ", "nevo", "cisto", "lipoma", "biopsia", "cancer de pele", "cbc", "cec", "melanoma", "ferida que nao cicatriza", "retirar lesao", "retirada de lesao", "cirurgia dermatologica", "verruga para tirar", "blefaroplastia", "tirar um cisto", "tiram cisto"] },
  { id: "3-tricologia", medico: "Dra. Diana Stohmann", tags: ["pipeline:tricologia", "medico:diana"],
    keywords: ["queda de cabelo", "cabelo caindo", "cabelo esta caindo", "queda", "calvicie", "alopecia", "afinamento", "falhas no cabelo", "couro cabeludo", "caspa", "tricologia"] },
  { id: "4-inflamatorias", medico: "Dra. Manuela Pedretti Cabral", tags: ["pipeline:inflamatorias", "medico:manuela"],
    keywords: ["psoriase", "dermatite atopica", "hidradenite", "hidrosadenite", "imunobiologico", "autoimune", "doenca inflamatoria"] },
  { id: "5-dermatopediatria", medico: "Dr. Fabrício de Andrade", tags: ["pipeline:dermatopediatria", "medico:fabricio", "alerta:crianca"],
    keywords: ["filho", "filha", "crianca", "bebe", "adolescente", "dermatopediatria", "dermatologia infantil", "assadura", "molusco", "verruga infantil", "minha menina", "meu menino"] },
  { id: "6-dermatologia-clinica", medico: "Dr. Diego Galvez", tags: ["pipeline:dermatologia-clinica"],
    keywords: ["acne", "espinha", "mancha", "manchas", "melasma", "rosacea", "alergia", "coceira", "coca", "micose", "verruga", "herpes", "dermatite de contato", "bolinhas"] },
  { id: "7-podologia", medico: "Regina", tags: ["pipeline:podologia", "prof:regina"],
    keywords: ["podologia", "podologa", "calo", "calos", "sessao de podologia"] },
];

export const P1_KEYWORDS = [
  "sangrando muito", "sangrando bastante", "sangrando", "sangrou", "sangramento importante", "sangramento",
  "dor intensa", "febre", "secrecao", "abriu os pontos", "abertura de pontos",
  "pinta cresceu", "pinta mudou", "pinta sangrou", "cresceu e sangrou", "cresceu e comecou a sangrar",
  "ferida que nao cicatriza", "melanoma", "cancer de pele",
];

// Suspeita oncologica (gera tag e P1 quando combinado com alarme/lesao).
export const ONCO_KEYWORDS = ["pinta", "nevo", "melanoma", "cancer de pele", "cbc", "cec", "lesao que cresce", "cresceu", "mudou", "sangrou", "nao cicatriza"];

export const ADMIN_RULES = [
  { sub: "Endereço", tag: "endereco", kw: ["endereco", "onde fica", "localizacao", "como chegar", "metro", "metrô"] },
  { sub: "Estacionamento", tag: "estacionamento", kw: ["estacionamento", "tem vaga", "vaga de garagem", "garagem"] },
  { sub: "Valor", tag: "valor", kw: ["valor", "preco", "quanto custa", "quanto e"] },
  { sub: "Horários", tag: "horarios", kw: ["horario de funcionamento", "que horas", "funciona ate"] },
  { sub: "Reembolso", tag: "reembolso", kw: ["reembolso"] },
  { sub: "Nota fiscal", tag: "nota-fiscal", kw: ["nota fiscal"] },
  { sub: "Remarcação", tag: "remarcacao", kw: ["remarcar", "remarcacao"] },
  { sub: "Cancelamento", tag: "cancelamento", kw: ["cancelar", "cancelamento"] },
  { sub: "Comprovante", tag: "comprovante", kw: ["comprovante"] },
];

export const CONVENIO_KEYWORDS = ["convenio", "plano de saude", "bradesco", "amil", "unimed", "sulamerica", "aceitam"];
export const RECLAMACAO_KEYWORDS = ["esperando", "ninguem me atendeu", "demorei", "reclamar", "reclamacao", "pessimo", "horrivel", "descaso", "fiquei esperando"];
export const BOOKING_KEYWORDS = ["marcar", "agendar", "agenda", "horario", "reservar", "quero consulta", "marcar uma consulta"];
export const PRICE_KEYWORDS = ["quanto custa", "qual o valor", "valor da consulta", "preco", "quanto e", "quanto fica"];

// Prioridade base por pipeline (clinico = P3; admin = P4). Escala a P1 com alarme.
export const BASE_PRIORITY = { "8-administrativo": "P4" };

export const NPS_RULES = {
  positivo: { min: 9, tags: ["nps:9-10"], humano: false, googleAcao: "solicitar-google", proximaAcao: "Solicitar avaliação no Google" },
  neutro: { min: 7, tags: ["nps:7-8"], humano: false, googleAcao: "", proximaAcao: "Perguntar ponto de melhoria" },
  negativo: { min: 0, tags: ["nps:0-6", "alerta:reclamacao"], humano: true, googleAcao: "", proximaAcao: "Encaminhar para gestão/secretária" },
  googleMinScore: 9,
};

// Fixtures do classificador. Esquema novo: tudo dentro de `crm`.
export const EXAMPLES = [
  { message: "Oi, quero marcar uma consulta, tenho problema nas unhas.", crm: { pipeline_funil: "1-unhas", etapa_funil: "qualificado", medico_indicado: "Dr. Miguel Ceccarelli", prioridade: "P3", temperatura: "Quente", precisa_humano_agora: false, tags: ["pipeline:unhas", "medico:miguel", "temp:quente"] } },
  { message: "Vocês aceitam Bradesco?", crm: { pipeline_funil: "8-administrativo", prioridade: "P4", temperatura: "Morno", precisa_humano_agora: false, tags: ["alerta:plano-nao-aceito", "temp:morno"] } },
  { message: "Tenho uma pinta que cresceu e começou a sangrar.", crm: { pipeline_funil: "2-cirurgia", etapa_funil: "qualificado", medico_indicado: "Dr. Diego Galvez", prioridade: "P1", temperatura: "Quente", precisa_humano_agora: true, tags: ["pipeline:cirurgia", "medico:diego", "alerta:suspeita-oncologica", "alerta:precisa-humano"] } },
  { message: "Estou com muita queda de cabelo.", crm: { pipeline_funil: "3-tricologia", medico_indicado: "Dra. Diana Stohmann", prioridade: "P3", temperatura: "Quente", precisa_humano_agora: false, tags: ["pipeline:tricologia", "medico:diana", "temp:quente"] } },
  { message: "Quanto custa tirar um cisto?", crm: { pipeline_funil: "2-cirurgia", medico_indicado: "Dr. Diego Galvez", prioridade: "P3", temperatura: "Morno", precisa_humano_agora: false, tags: ["pipeline:cirurgia", "medico:diego", "temp:morno"] } },
  { message: "Fiquei esperando 40 minutos e ninguém me atendeu.", crm: { pipeline_funil: "8-administrativo", prioridade: "P2", temperatura: "Morno", precisa_humano_agora: true, tags: ["alerta:reclamacao", "alerta:precisa-humano"] } },
  { message: "Minha filha de 5 anos está com manchas na pele.", crm: { pipeline_funil: "5-dermatopediatria", medico_indicado: "Dr. Fabrício de Andrade", prioridade: "P3", temperatura: "Quente", precisa_humano_agora: false, tags: ["pipeline:dermatopediatria", "medico:fabricio", "alerta:crianca"] } },
  { message: "Qual o endereço da clínica?", crm: { pipeline_funil: "8-administrativo", etapa_funil: "novo-lead", prioridade: "P4", temperatura: "Frio", precisa_humano_agora: false, tags: ["temp:frio"] } },
  { message: "Tem metrô perto?", crm: { pipeline_funil: "8-administrativo", etapa_funil: "novo-lead", subespecialidade_queixa: "Endereço", prioridade: "P4", temperatura: "Frio", precisa_humano_agora: false, tags: ["pipeline:administrativo", "temp:frio"] } },
];
