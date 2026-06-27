const FIELD_ALIASES = {
  name: ["name", "nome", "nombre", "full_name", "fullname", "nome_completo", "nombre_completo", "cliente", "paciente"],
  firstName: ["first_name", "firstname", "primeiro_nome", "nome_primeiro"],
  lastName: ["last_name", "lastname", "sobrenome", "apellido"],
  phone: ["phone", "telefone", "telefono", "phone_number", "cel", "celular", "whatsapp", "mobile", "movil"],
  email: ["email", "e_mail", "mail", "correo"],
  source: ["source", "origem", "fonte", "canal", "utm_source", "midia"],
  interest: ["interest", "interesse", "queixa", "procedimento", "service", "servico", "tratamento", "treatment"],
  notes: ["message", "mensagem", "comentario", "comments", "observacao", "observacoes", "notes", "nota", "descricao"],
  estimatedValue: ["estimated_value", "valor_estimado", "valor", "preco", "price", "amount", "orcamento"],
  stage: ["stage", "etapa", "funil", "pipeline"],
  temperature: ["temperature", "temperatura"],
  nextAction: ["next_action", "proxima_acao", "acao"],
  nextActionAt: ["next_action_at", "data_proxima_acao", "followup", "follow_up", "retorno"],
};

const KEY_TO_FIELD = new Map(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) => aliases.map((alias) => [normalizeKey(alias), field])),
);

export function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function flattenPayload(input, prefix = "", out = {}, depth = 0) {
  if (input == null || depth > 5) return out;

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      if (item && typeof item === "object") {
        const label = item.field?.ref || item.field?.title || item.label || item.name || index;
        const value =
          item.text ??
          item.email ??
          item.phone_number ??
          item.number ??
          item.date ??
          item.url ??
          item.choice?.label ??
          item.value;
        if (value !== undefined) out[joinKey(prefix, label)] = value;
      }
      flattenPayload(item, joinKey(prefix, index), out, depth + 1);
    });
    return out;
  }

  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const path = joinKey(prefix, key);
      if (value && typeof value === "object") flattenPayload(value, path, out, depth + 1);
      else out[path] = value;
    }
    return out;
  }

  if (prefix) out[prefix] = input;
  return out;
}

export function extractLeadFields(payload = {}) {
  const flat = flattenPayload(payload);
  const fields = {};

  for (const [rawKey, rawValue] of Object.entries(flat)) {
    if (rawValue == null || rawValue === "") continue;
    const parts = rawKey.split(".");
    const key = normalizeKey(parts[parts.length - 1]);
    const fullKey = normalizeKey(rawKey);
    const field = KEY_TO_FIELD.get(key) || KEY_TO_FIELD.get(fullKey);
    if (!field || fields[field] !== undefined) continue;
    fields[field] = cleanValue(rawValue);
  }

  if (!fields.name && (fields.firstName || fields.lastName)) {
    fields.name = [fields.firstName, fields.lastName].filter(Boolean).join(" ").trim();
  }
  if (!fields.interest && fields.notes) fields.interest = String(fields.notes).slice(0, 180);
  if (fields.estimatedValue !== undefined) fields.estimatedValue = parseMoney(fields.estimatedValue);

  return fields;
}

export function parseMoney(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

function cleanValue(value) {
  if (typeof value === "string") return value.trim();
  return value;
}

function joinKey(prefix, key) {
  return prefix ? `${prefix}.${key}` : String(key);
}
