import prisma from "../db.js";
import { hashPassword } from "./auth.service.js";
import { badRequest, notFound, forbidden, conflict } from "../lib/errors.js";

const ROLES = ["ADMIN", "DOCTOR", "SECRETARY", "FINANCE"];
const SELECT = { id: true, name: true, username: true, email: true, role: true, active: true, createdAt: true };

function assertAdmin(actor) {
  if (!actor || actor.role !== "ADMIN") throw forbidden("Apenas ADMIN pode gerenciar usuarios");
}

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

export function listAllUsers() {
  return prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: SELECT });
}

export async function createUser(body, actor) {
  assertAdmin(actor);
  const name = String(body.name || "").trim();
  const email = norm(body.email);
  const username = norm(body.username) || (email.includes("@") ? email.split("@")[0] : email);
  const role = ROLES.includes(body.role) ? body.role : "SECRETARY";
  const password = String(body.password || "");
  if (!name) throw badRequest("Nome e obrigatorio");
  if (!email) throw badRequest("Email e obrigatorio");
  if (password.length < 6) throw badRequest("Senha precisa de ao menos 6 caracteres");
  if (await prisma.user.findUnique({ where: { email } })) throw conflict("Ja existe usuario com esse email");
  return prisma.user.create({
    data: { name, email, username, role, active: body.active !== false && body.active !== "false", passwordHash: await hashPassword(password) },
    select: SELECT,
  });
}

export async function updateUser(id, body, actor) {
  assertAdmin(actor);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("Usuario nao encontrado");

  const data = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (body.username != null) data.username = norm(body.username) || null;
  if (body.role && ROLES.includes(body.role)) data.role = body.role;
  if (body.active != null) data.active = body.active !== false && body.active !== "false";
  if (body.email != null) {
    const email = norm(body.email);
    if (email && email !== user.email) {
      if (await prisma.user.findUnique({ where: { email } })) throw conflict("Email ja usado por outro usuario");
      data.email = email;
    }
  }
  if (body.password) {
    if (String(body.password).length < 6) throw badRequest("Senha precisa de ao menos 6 caracteres");
    data.passwordHash = await hashPassword(String(body.password));
  }
  // Evita lockout: ADMIN nao pode se auto-desativar.
  if (actor.id && actor.id === id && data.active === false) throw badRequest("Nao desative o proprio usuario");

  return prisma.user.update({ where: { id }, data, select: SELECT });
}
