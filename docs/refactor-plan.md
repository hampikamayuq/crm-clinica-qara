# Plano de Refatoracao

## Estado Atual

MVP estatico com `app.js`, `server.js`, JSON em `data/channel-conversations.json`, localStorage para funil/agenda/financeiro, bots por regras e agente opcional.

## Problemas

- Persistencia dividida entre JSON/localStorage.
- Pouca separacao entre entidades CRM.
- Falta multiusuario, auditoria, workflow e permissoes reais.
- Front ainda monolitico.

## Mudancas

1. PostgreSQL + Prisma.
2. Backend modular em `src/server`.
3. Timeline e auditoria.
4. Inbox completo.
5. Leads/pacientes, agenda, orcamentos e pagamentos.
6. Workflows e permissoes.
7. Front modular quando os contratos estiverem estaveis.

## Riscos

- Migracao de dados locais: usar backup e script idempotente.
- Dados sensiveis em mensagens: nao duplicar em logs/auditoria.
- Escopo grande: entregar por fatias testaveis.
