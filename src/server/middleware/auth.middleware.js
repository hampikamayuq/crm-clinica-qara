// ADMIN_API_KEY global hoje; roles reais entram quando houver login.

const ADMIN_KEY = process.env.ADMIN_API_KEY || "";

function isLocalRequest(req) {
  const host = (req.headers.host || "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

// Verifica a chave administrativa (x-admin-api-key ou Authorization: Bearer).
// Em localhost sem chave configurada, libera para desenvolvimento. Retorna { ok, error }.
export function authorize(req) {
  if (!ADMIN_KEY) {
    if (isLocalRequest(req)) return { ok: true };
    return { ok: false, error: "ADMIN_API_KEY nao configurada", code: "auth_not_configured" };
  }
  const provided = req.headers["x-admin-api-key"] || "";
  const auth = String(req.headers.authorization || "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if ((provided && safeEqual(provided, ADMIN_KEY)) || (bearer && safeEqual(bearer, ADMIN_KEY))) return { ok: true };
  return { ok: false, error: "Credencial invalida", code: "unauthorized" };
}

export function requireRole(roles = []) {
  return (req) => {
    const base = authorize(req);
    if (!base.ok) return base;
    const role = req.user?.role;
    if (!role) return { ok: true };
    if (roles.length === 0 || roles.includes(role)) return { ok: true };
    return { ok: false, error: "Permissao insuficiente", code: "forbidden" };
  };
}

function safeEqual(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i += 1) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}
