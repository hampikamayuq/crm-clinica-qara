# Plano de Refatoracao

## Estado Atual

App Node com `server.js`, SPA em `app.js`, PostgreSQL/Prisma como fonte da verdade para CRM, login multiusuario, bots por regras e agente opcional. Ainda existem fallbacks legados em `localStorage` e `data/channel-conversations.json`.

## Problemas

- Front ainda monolitico.
- Permissoes por role ainda pouco aplicadas na UI.
- Fallbacks legados ainda existem para compatibilidade.

## Mudancas

1. PostgreSQL + Prisma. Concluido.
2. Backend modular em `src/server`. Concluido.
3. Timeline, auditoria e login multiusuario. Em andamento.
4. Inbox completo e lead manual aparecendo no Inbox. Concluido.
5. Leads/pacientes, agenda, orcamentos e pagamentos. Em andamento.
6. Workflows e permissoes por role. Proximo.
7. Front modular quando os contratos estiverem estaveis.

## Riscos

- Migracao de dados locais: usar backup e script idempotente.
- Dados sensiveis em mensagens: nao duplicar em logs/auditoria.
- Escopo grande: entregar por fatias testaveis.
