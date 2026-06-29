import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import prisma from "../db.js";

const scrypt = promisify(scryptCallback);
const sessions = globalThis.__qaraSessions || new Map();
globalThis.__qaraSessions = sessions;

const SESSION_TTL_MS = Math.max(Number(process.env.SESSION_TTL_HOURS || 12), 1) * 60 * 60 * 1000;

export async function loginWithPassword(username, password, { allowDevBootstrap = false } = {}) {
  const login = normalizeLogin(username);
  if (!login || !password) throw authError("invalid_credentials", 401);

  const user = await findLoginUser(login) || await bootstrapUser(login, password, allowDevBootstrap);
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw authError("invalid_credentials", 401);
  }
  if (!user.active) throw authError("user_inactive", 403);

  return createSession(user);
}

export function authorizeRequest(req) {
  const admin = adminKeyAuth(req);
  if (admin.ok) {
    req.user = admin.user;
    return admin;
  }

  const token = bearerToken(req) || clean(req.headers["x-session-token"]);
  const session = token ? sessions.get(token) : null;
  if (session && session.expiresAt > Date.now()) {
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    req.headers["x-user-id"] = session.user.id;
    return { ok: true, user: session.user };
  }
  if (session) sessions.delete(token);

  if (process.env.ALLOW_UNAUTHENTICATED_API === "true") {
    req.user = { id: null, name: "Dev", role: "ADMIN" };
    return { ok: true, user: req.user };
  }

  return { ok: false, status: 401, code: "unauthorized", error: "Sessao invalida" };
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${Buffer.from(hash).toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, encoded] = String(stored || "").split("$");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  const actual = await scrypt(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function findLoginUser(login) {
  return prisma.user.findFirst({
    where: {
      OR: [{ username: login }, { email: login }],
    },
  });
}

async function bootstrapUser(login, password, allowDevBootstrap) {
  const username = normalizeLogin(process.env.BOOTSTRAP_USERNAME || process.env.ADMIN_USERNAME || "admin");
  const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || (allowDevBootstrap ? "admin" : "");
  if (!username || !bootstrapPassword || login !== username || password !== bootstrapPassword) return null;

  const email = normalizeLogin(process.env.BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL || (username.includes("@") ? username : `${username}@cliniqara.local`));
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  const passwordHash = await hashPassword(bootstrapPassword);
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { username: existing.username || username, passwordHash: existing.passwordHash || passwordHash, active: true },
    });
  }
  return prisma.user.create({
    data: {
      name: process.env.BOOTSTRAP_NAME || process.env.ADMIN_NAME || username,
      username,
      email,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });
}

function createSession(user) {
  pruneSessions();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const publicUser = publicUserData(user);
  sessions.set(token, { user: publicUser, expiresAt });
  return { token, user: publicUser, expiresAt: new Date(expiresAt).toISOString() };
}

function publicUserData(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

function pruneSessions() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function adminKeyAuth(req) {
  const adminKey = process.env.ADMIN_API_KEY || "";
  if (!adminKey) return { ok: false };
  const provided = clean(req.headers["x-admin-api-key"]);
  const bearer = bearerToken(req);
  if (safeEqual(provided, adminKey) || safeEqual(bearer, adminKey)) {
    const user = { id: null, name: "Admin API", role: "ADMIN" };
    req.headers["x-user-id"] = req.headers["x-user-id"] || "";
    return { ok: true, user };
  }
  return { ok: false };
}

function bearerToken(req) {
  const auth = clean(req.headers.authorization);
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function authError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeLogin(value) {
  return clean(value).toLowerCase();
}

function clean(value) {
  return String(value || "").trim();
}

function safeEqual(a, b) {
  const sa = String(a || "");
  const sb = String(b || "");
  if (!sa || !sb || sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i += 1) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}
