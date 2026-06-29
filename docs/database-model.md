# Modelo de Dados

Fonte da verdade: `prisma/schema.prisma` (PostgreSQL). Valores financeiros usam `Decimal`; datas usam `DateTime`.

## Entidades

- `User`: usuario do sistema, login por `username`/`email`, senha com hash, `role` (`ADMIN`, `DOCTOR`, `SECRETARY`, `FINANCE`, `MARKETING`) e vinculo opcional com `Professional`.
- `ClinicUnit`: unidades fisicas da QARA.
- `Professional`: medicos/profissionais usados por agenda e disponibilidade.
- `Lead`: oportunidade comercial, etapa, temperatura, origem, interesse, responsavel, proxima acao e valor estimado.
- `Patient`: cadastro administrativo sem prontuario; consentimento LGPD e notas administrativas.
- `Conversation` + `Message`: inbox omnichannel por `channel` + `externalId`.
- `Tag`, `ConversationTag`, `QuickReply`: recursos de inbox estilo Chatwoot.
- `Appointment`, `AppointmentType`, `ProfessionalAvailability`: agenda com conflito, duracao e disponibilidade.
- `Service`, `Budget`, `Payment`: catalogo, propostas/orcamentos e recebimentos.
- `Activity`: timeline central para lead, paciente e conversa.
- `Task`: follow-up operacional.
- `AuditLog`: trilha de auditoria sem duplicar texto sensivel de mensagens.

## Relacionamentos Principais

```text
User 1-0..1 Professional
User 1-N Lead/Conversation/Task (assigned)
ClinicUnit 1-N Professional/Appointment/Availability
Lead 0..1-1 Patient
Lead/Patient 1-N Conversation/Appointment/Budget/Activity/Task
Conversation 1-N Message, N-N Tag, 1-N Activity
Professional 1-N Appointment/Availability
Service 1-N Budget 1-N Payment
```

## Indices

Incluidos para telefone, etapa/status, responsavel, datas de criacao, agenda por profissional/data e `Conversation(channel, externalId)` unico.
