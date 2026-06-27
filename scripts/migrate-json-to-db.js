// Migra data/channel-conversations.json -> PostgreSQL (Conversation + Message + Lead).
//
// - Faz BACKUP do JSON antes (nao apaga o original).
// - Idempotente: conversa por (channel, externalId); mensagem por providerMessageId.
// - Cria um Lead por conversa quando ha nome/telefone util e a conversa ainda nao tem lead.
//
// Rodar: node scripts/migrate-json-to-db.js

import { existsSync, readFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile?.();
} catch {
  /* .env ausente: assume env ja populado */
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const jsonPath = join(root, "data", "channel-conversations.json");

const { default: prisma } = await import(join(root, "src", "server", "db.js"));
const { recordMessage } = await import(join(root, "src", "server", "services", "conversation.service.js"));

function looksLikeRealName(name, channel) {
  if (!name) return false;
  return !name.startsWith(`${channel} `) && !name.startsWith("whatsapp ") && !name.startsWith("instagram ");
}

async function ensureLeadForConversation(convo, channel, externalId) {
  const existing = await prisma.conversation.findUnique({
    where: { channel_externalId: { channel, externalId } },
    select: { id: true, leadId: true },
  });
  if (!existing || existing.leadId) return existing?.leadId || null;

  const name = looksLikeRealName(convo.name, channel) ? convo.name : null;
  const phone = convo.phone || (channel === "whatsapp" ? externalId : null);
  if (!name && !phone) return null;

  const lead = await prisma.lead.create({
    data: { name: name || `Contato ${externalId}`, phone: phone || null, source: channel, stage: "NEW" },
  });
  await prisma.conversation.update({ where: { id: existing.id }, data: { leadId: lead.id } });
  await prisma.activity.create({
    data: { type: "LEAD_CREATED", title: "Lead criado (migracao)", leadId: lead.id, metadata: { migrated: true } },
  });
  return lead.id;
}

async function main() {
  if (!existsSync(jsonPath)) {
    console.log("Nada a migrar: data/channel-conversations.json nao existe.");
    return;
  }

  const backupPath = `${jsonPath}.backup-${Date.now()}.json`;
  copyFileSync(jsonPath, backupPath);
  console.log("Backup criado:", backupPath);

  const store = JSON.parse(readFileSync(jsonPath, "utf8") || "{}");
  const conversations = store.conversations || {};

  let convCount = 0;
  let msgCount = 0;
  let msgNew = 0;

  for (const convo of Object.values(conversations)) {
    const channel = convo.channel;
    const externalId = convo.externalId;
    if (!channel || !externalId) continue;
    convCount += 1;

    const messages = [...(convo.messages || [])].sort(
      (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0),
    );
    for (const m of messages) {
      const result = await recordMessage({
        channel,
        externalId,
        text: m.text,
        direction: m.direction, // "inbound"/"outbound"/"system"
        providerMessageId: m.id || null,
        metadata: m.metadata || null,
        createdAt: m.timestamp ? Number(m.timestamp) : null,
      });
      if (result) {
        msgCount += 1;
        if (result.created) msgNew += 1;
      }
    }

    await ensureLeadForConversation(convo, channel, externalId);
  }

  console.log(`Migracao concluida: ${convCount} conversas, ${msgCount} mensagens (${msgNew} novas).`);
}

main()
  .catch((error) => {
    console.error("Migracao falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
