import { authorizeRequest } from "../services/auth.service.js";

export function authorize(req) {
  const auth = authorizeRequest(req);
  if (auth.ok) return auth;
  return { ok: false, error: auth.error || "Credencial invalida", code: auth.code || "unauthorized" };
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
