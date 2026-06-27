import prisma from "../db.js";

export async function logAction({ userId = null, action, entity, entityId, before = null, after = null }) {
  try {
    return await prisma.auditLog.create({
      data: { userId, action, entity, entityId: String(entityId), before, after },
    });
  } catch (error) {
    console.error("audit_error", error.message);
    return null;
  }
}

export function logCreate(entity, entityId, after, userId = null) {
  return logAction({ userId, action: "create", entity, entityId, after });
}

export function logUpdate(entity, entityId, before, after, userId = null) {
  return logAction({ userId, action: "update", entity, entityId, before, after });
}

export function logDelete(entity, entityId, before, userId = null) {
  return logAction({ userId, action: "delete", entity, entityId, before });
}
