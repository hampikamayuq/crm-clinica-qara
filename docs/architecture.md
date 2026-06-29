# Arquitetura

CRM QARA e um CRM medico-operacional para dermatologia: leads, inbox, agenda, orcamentos, financeiro administrativo, follow-up e automacoes. Nao e prontuario.

## Camadas

- `server.js`: entrypoint legado, webhooks Meta, agente atual, arquivos estaticos e compatibilidade dos endpoints antigos.
- `src/server/index.js`: roteador modular novo para endpoints Prisma.
- `src/server/services/*`: regras de dominio.
- `prisma/schema.prisma`: modelo persistente PostgreSQL.
- `src/server/services/auth.service.js`: login por usuario/email e senha, sessoes em memoria e hash de senha.
- `app.js`: SPA atual; sera modularizada incrementalmente quando o backend estiver estavel.

## Referencias Aplicadas

- EspoCRM: entidades separadas, timeline, atividades, ACL e record hooks.
- Twenty: UI por modulos, lista/kanban/detalhe e metadata como direcao futura.
- Chatwoot: inbox com status, tags, notas, responsavel e quick replies.
- ERPNext: Budget separado de Payment.
- Cal.com: AppointmentType, disponibilidade e conflito por profissional.

## Principios

- Evolucao incremental sem quebrar o MVP.
- Sem dado clinico estruturado.
- Respostas API novas em `{ data, error }`.
- Login multiusuario ativo; permissoes por role ainda sao base preparatoria para endurecimento futuro.
