// PrismaClient singleton para o CRM QARA.
// Reaproveita a instancia em dev (evita esgotar conexoes no hot-reload).
//
// Requer `npm install` (prisma + @prisma/client) e `npm run prisma:generate`.
// Enquanto o banco nao estiver configurado, importar este modulo nao quebra o
// MVP atual (server.js so usa o Prisma quando as rotas de banco forem ativadas).

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__qaraPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__qaraPrisma = prisma;
}

export default prisma;
