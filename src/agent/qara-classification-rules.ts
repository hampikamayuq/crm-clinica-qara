// Classification Rules — Clínica QARA

export const PIPELINE_RULES = {
  unhas: {
    pipeline: "1-unhas",
    medico: "Dr. Miguel Ceccarelli",
    keywords: [
      "unha", "unhas", "micose de unha", "unha encravada", "onicomicose",
      "melanoníquia", "mancha escura na unha", "inflamação na unha", "granuloma",
      "paroníquia", "distrofia ungueal",
    ],
    tags: ["pipeline:unhas", "medico:miguel"],
  },
  cirurgia: {
    pipeline: "2-cirurgia",
    medico: "Dr. Diego Galvez",
    keywords: [
      "pinta", "sinal", "nevo", "cisto", "lipoma", "biópsia", "biopsia",
      "câncer de pele", "cancer de pele", "cbc", "cec", "melanoma",
      "ferida que não cicatriza", "retirar lesão", "retirada de lesão",
      "cirurgia dermatológica", "verruga para tirar", "blefaroplastia",
    ],
    tags: ["pipeline:cirurgia", "medico:diego"],
  },
  tricologia: {
    pipeline: "3-tricologia",
    medico: "Dra. Diana Stohmann",
    keywords: [
      "queda de cabelo", "cabelo caindo", "calvície", "calvicie", "alopecia",
      "afinamento", "falhas no cabelo", "couro cabeludo", "caspa", "tricologia",
    ],
    tags: ["pipeline:tricologia", "medico:diana"],
  },
  inflamatorias: {
    pipeline: "4-inflamatorias",
    medico: "Dra. Manuela Pedretti Cabral",
    keywords: [
      "psoríase", "psoriase", "dermatite atópica", "dermatite atopica",
      "hidradenite", "hidrosadenite", "imunobiológico", "imunobiologico",
      "autoimune", "doença inflamatória", "doenca inflamatoria",
    ],
    tags: ["pipeline:inflamatorias", "medico:manuela"],
  },
  dermatopediatria: {
    pipeline: "5-dermatopediatria",
    medico: "Dr. Fabrício de Andrade",
    keywords: [
      "filho", "filha", "criança", "crianca", "bebê", "bebe", "adolescente",
      "dermatopediatria", "dermatologia infantil", "assadura", "molusco", "verruga infantil",
    ],
    tags: ["pipeline:dermatopediatria", "medico:fabricio", "alerta:crianca"],
  },
  dermatologiaClinica: {
    pipeline: "6-dermatologia-clinica",
    medico: "Dr. Diego Galvez",
    keywords: [
      "acne", "mancha", "manchas", "melasma", "rosácea", "rosacea",
      "alergia", "coceira", "micose", "verruga", "herpes", "pele", "dermatite de contato",
    ],
    tags: ["pipeline:dermatologia-clinica"],
  },
} as const;

export const P1_KEYWORDS = [
  "sangrando muito", "sangramento importante", "dor intensa", "febre", "secreção",
  "secrecao", "abriu os pontos", "abertura de pontos", "pinta cresceu",
  "pinta mudou", "pinta sangrou", "ferida que não cicatriza",
  "ferida que nao cicatriza", "melanoma", "câncer de pele", "cancer de pele",
];

export const ADMIN_KEYWORDS = [
  "endereço", "endereco", "valor", "preço", "preco", "convênio", "convenio",
  "reembolso", "nota fiscal", "horário de funcionamento", "horario de funcionamento",
  "cancelar", "remarcar", "comprovante", "metrô", "metro", "estacionamento",
  "vaga de garagem", "garagem",
];

export const REQUIRED_RULES = [
  "Se P1, precisa_humano_agora = true.",
  "Se for apenas administrativo, pipeline = 8-administrativo.",
  "Se criança/adolescente, perguntar idade se ainda não souber.",
  "Se foto recebida, não analisar imagem; aplicar alerta:foto-recebida.",
  "Se teleconsulta, confirmar somente após pagamento.",
  "Se valor de procedimento, informar que orçamento final depende de avaliação.",
  "Se retorno/pós-operatório, manter pipeline da especialidade original quando possível.",
] as const;
