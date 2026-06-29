# CliniQara CRM

CRM medico-operacional para clinicas com leads, inbox, agenda e financeiro administrativo, sem prontuario.

## O que esta incluido

- Leads com funil por etapas.
- Score automatico de leads.
- Inbox estilo WhatsApp com respostas rapidas.
- Agenda com verificacao de conflito por profissional, data e horario.
- Follow-ups categorizados por atraso, hoje, proximos e sem data.
- Lancamentos financeiros e baixa de recebimentos.
- Webhook universal para receber leads de formularios externos.
- Bots automaticos importados de fluxo JSON, incluindo o fluxo `Leads novos`.
- Agente OpenAI opcional para interpretar mensagens livres e acionar o funil.
- Login multiusuario por usuario/email e senha.
- Persistencia em PostgreSQL via Prisma.
- Exportacao/importacao em CSV e exportacao local em JSON.
- Layout responsivo para desktop e mobile.

## Como rodar local

1. Crie o arquivo `.env` a partir de `.env.example`.
2. Preencha `DATABASE_URL` com a URL externa do Postgres.
3. Defina `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD` para criar o primeiro admin.
4. Rode:

```bash
npm install
npm run prisma:generate
npm run db:push
npm run prisma:seed
npm start
```

5. Abra `http://localhost:3000` e entre com o usuario bootstrap.

## Como rodar com WhatsApp API e Instagram

1. Siga o setup local acima.
2. Preencha `META_VERIFY_TOKEN`.
3. Para WhatsApp Cloud API, preencha `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
4. Para Instagram DM, preencha `INSTAGRAM_PAGE_ACCESS_TOKEN`.
5. Para agente OpenAI, preencha `AI_PROVIDER=openai`, `OPENAI_API_KEY` e, se quiser, `OPENAI_MODEL`.
6. Para publicar em URL publica, preencha tambem `META_APP_SECRET` e `LEAD_WEBHOOK_SECRET`.
7. Na aba Canais, copie a URL `/webhooks/meta`.
8. No painel da Meta, use essa URL como Callback URL e o mesmo `META_VERIFY_TOKEN`.

Para receber webhooks reais, a URL precisa estar publica em HTTPS. Em desenvolvimento, use ngrok, Cloudflare Tunnel ou equivalente apontando para `localhost:3000`. O endpoint `POST /webhooks/meta` valida `X-Hub-Signature-256` quando `META_APP_SECRET` esta configurado; sem esse segredo, webhooks sem assinatura so passam em localhost ou com `ALLOW_UNSIGNED_WEBHOOKS=true`.

Endpoints criados:

- `GET /webhooks/meta`: verificacao da Meta com `hub.challenge`.
- `POST /webhooks/meta`: recebe mensagens de WhatsApp e Instagram.
- `GET /api/integrations/status`: status da configuracao.
- `GET /api/conversations`: conversas recebidas por webhook.
- `POST /api/messages/send`: envio pelo canal original. WhatsApp aceita texto, botoes, lista e modelo aprovado.
- `POST /api/agent/test`: teste do agente OpenAI pela aba Bots.

Em URL publica, o usuario entra com usuario ou email e senha cadastrados no banco. `BOOTSTRAP_USERNAME` e `BOOTSTRAP_PASSWORD` criam o primeiro admin no seed. Para varios usuarios no deploy, use `APP_USERS_JSON`:

```json
[
  { "username": "recepcao", "email": "recepcao@qara.local", "name": "Recepcao", "role": "SECRETARY", "password": "troque-esta-senha" },
  { "username": "financeiro", "email": "financeiro@qara.local", "name": "Financeiro", "role": "FINANCE", "password": "troque-esta-senha" }
]
```

No Render, use a `DATABASE_URL` interna do banco `qara-crm-db`. No `.env` local, use a URL externa.

Endpoints Prisma principais:

Exceto login e webhooks externos, as rotas `/api/*` exigem `Authorization: Bearer <token>` retornado por `POST /api/auth/login`.

- `GET/POST/PATCH /api/leads`, score automatico, `POST /api/leads/:id/score`, `POST /api/leads/score-all`, `POST /api/leads/:id/convert-to-patient`, timeline por lead.
- `GET/POST/PATCH /api/patients`, timeline por paciente.
- `GET /api/inbox` e `/api/conversations/*` para mensagens, tags, notas, atribuicao e resolucao.
- `GET/POST/PATCH /api/appointments`, conflito de agenda, profissionais e disponibilidade.
- `GET/POST/PATCH /api/services`, `/api/quick-replies`, `/api/budgets`, `/api/payments` e `/api/tasks`.
- `POST /api/webhook` ou `POST /api/leads/webhook`: cria lead por webhook universal.
- `GET /api/export?type=leads|budgets|payments|tasks|appointments`: exporta CSV.
- `POST /api/import/leads`: importa leads de CSV.
- `GET /api/followups`: follow-ups categorizados.
- `GET /api/reports/financial-summary`, `/api/reports/conversion-summary`, `/api/reports/daily-briefing` e `/api/reports/pipeline-analysis`.
- Apoio: `GET /api/users`, `/api/units`, `/api/appointment-types` e `/api/activities`.

Exemplo de lead externo:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $LEAD_WEBHOOK_SECRET" \
  -d '{"nome":"Maria Silva","whatsapp":"+5521999999999","origem":"site","mensagem":"Quero marcar consulta para melasma"}'
```

Exemplo de importacao CSV:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sua-senha"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -X POST http://localhost:3000/api/import/leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/csv" \
  --data-binary $'Nome;Telefone;Email;Origem;Interesse\nMaria Silva;+5521999999999;maria@email.com;site;Melasma'
```

### WhatsApp: botoes, listas e modelos

O Inbox usa `POST /api/messages/send` para enviar pelo WhatsApp Cloud API quando `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` estao configurados.

Tipos suportados no corpo JSON:

- `messageType: "text"`: texto simples.
- `messageType: "buttons"`: mensagem interativa com ate 3 botoes de resposta rapida.
- `messageType: "list"`: mensagem interativa com lista de opcoes.
- `messageType: "template"`: modelo aprovado no WhatsApp Manager, com `templateName`, `languageCode` e parametros de corpo.

Exemplo de botoes:

```json
{
  "channel": "whatsapp",
  "externalId": "5521999999999",
  "text": "Como voce prefere seguir?",
  "messageType": "buttons",
  "whatsapp": {
    "buttons": [
      { "id": "agendar", "title": "Agendar" },
      { "id": "valores", "title": "Valores" },
      { "id": "humano", "title": "Atendente" }
    ]
  }
}
```

Modelos precisam estar aprovados pela Meta antes do envio.

## Banco de dados (PostgreSQL + Prisma)

O CRM usa **PostgreSQL via Prisma** como fonte da verdade para usuarios, leads, inbox, pacientes, agenda, tarefas e financeiro administrativo. `localStorage` ainda existe para preferencias/dados locais legados da SPA.

Setup:

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL
npm run prisma:generate     # gera o Prisma Client
npm run db:push             # cria as tabelas no banco (ou prisma:migrate)
npm run prisma:seed         # popula usuarios bootstrap, unidades, profissionais, tipos, servicos, quick replies e tags
npm run dev                 # sobe o servidor (= npm start)
```

Use a URL externa do Postgres no `.env` local. No servico web do Render, configure `DATABASE_URL` com a URL interna do banco `qara-crm-db`. Sessoes ficam em memoria; reiniciar o servidor exige login novamente.

Scripts disponiveis:

| Script | Acao |
|---|---|
| `npm run dev` / `npm start` | Sobe o servidor (`server.js`) |
| `npm test` | Testes (`node --test`) |
| `npm run check` | Checagem de sintaxe |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Cria/aplica migracao de desenvolvimento |
| `npm run db:push` | Sincroniza o schema com o banco (sem migracao) |
| `npm run prisma:seed` | Roda `prisma/seed.js` |
| `npm run db:studio` | Abre o Prisma Studio |

- Schema: [`prisma/schema.prisma`](prisma/schema.prisma) (entidades CRM: User, Professional, ClinicUnit, Lead, Patient, Conversation, Message, Appointment, AppointmentType, ProfessionalAvailability, Service, Budget, Payment, Activity, Task, QuickReply, Tag, ConversationTag, AuditLog).
- Cliente Prisma singleton: [`src/server/db.js`](src/server/db.js).
- Seed da QARA: [`prisma/seed.js`](prisma/seed.js).

> **Não é prontuário médico.** O CRM é administrativo/comercial; campos de texto livre são administrativos e devem evitar dado clínico sensível.

## Documentacao tecnica

Em [`docs/`](docs/):

- [`database-model.md`](docs/database-model.md) - entidades mantidas no schema atual.
- [`architecture.md`](docs/architecture.md) - camadas e referencias aplicadas.
- [`crm-flows.md`](docs/crm-flows.md) - fluxos operacionais.
- [`integrations.md`](docs/integrations.md) - Meta, WhatsApp, Instagram, OpenAI e futuros.
- [`permissions.md`](docs/permissions.md) - roles e acesso.
- [`lgpd.md`](docs/lgpd.md) - dados permitidos/evitados e cuidados minimos.
- [`refactor-plan.md`](docs/refactor-plan.md) - plano incremental.
- [`roadmap.md`](docs/roadmap.md) - proximas versoes.

## Proximos passos para producao

- Configurar backups e politica de retencao no PostgreSQL.
- Criar tela administrativa para cadastrar/editar usuarios sem depender de `APP_USERS_JSON`.
- Remover gradualmente fallbacks legados de `localStorage` e `data/channel-conversations.json`.
- Rotacionar segredos vazados e manter credenciais apenas em variaveis de ambiente.

## Bots

O arquivo `flows/leads-novos.bot.js` foi gerado a partir de `/home/diegog/Downloads/Leads novos.json`.

Na aba Bots voce pode:

- ativar ou pausar fluxos;
- importar outro JSON no mesmo formato;
- testar uma mensagem recebida;
- ver a resposta automatica na Inbox.

## Agente OpenAI (Tawany)

Quando `AI_PROVIDER=openai` e `OPENAI_API_KEY` estao configurados, o webhook tenta usar o agente IA antes do fluxo de regras. Se a IA falhar ou nao retornar uma resposta valida, o servidor cai no fluxo `Leads novos`.

O agente atende como **Tawany**, secretaria virtual da Clinica Qara (Copacabana - RJ), com opcao de teleconsulta. Ele e limitado a atendimento administrativo/comercial: acolher, fazer triagem por queixa, direcionar ao medico correto e conduzir ao agendamento. Nao diagnostica, nao prescreve, nao promete resultado e nao substitui avaliacao medica.

A persona fica em [`src/agent/agent-system-prompt-tawany.md`](src/agent/agent-system-prompt-tawany.md). O contrato de runtime e parte da base operacional ficam em `server.js`:

- `loadAgentPrompt()`: carrega a persona editavel.
- `careTeam`: medicos, foco por queixa, tag Kommo e valores por modalidade.
  - Dr. Diego (cirurgia) R$ 450 | Dr. Miguel (unhas) RJ R$ 650 / SP R$ 800 / tele R$ 650 | Dra. Diana (tricologia) R$ 550 | Dra. Manuela (autoimune) R$ 550 | Dr. Fabricio (dermatopediatria) R$ 550.
- `clinicKnowledge`: pagamento, etapas Kommo, fluxo de agendamento e gatilhos de handoff humano.

O guard anti-alucinacao so deixa passar mensagens cujos valores em `R$` batam com algum valor cadastrado na `careTeam`; caso contrario, substitui por uma resposta que promete confirmar com a equipe.

Configure tambem os dados comerciais que a IA pode usar:

```env
CLINIC_NAME=Clinica Qara
CLINIC_UNIT=Copacabana - RJ
DEFAULT_CONSULT_VALUE=550
```

Se uma informacao nao estiver no contexto, o agente deve pedir confirmacao da equipe em vez de inventar.

## Classificador QARA (funis, prioridade, NPS)

Knowledge operacional como dados em [`src/server/config/qara-knowledge.js`](src/server/config/qara-knowledge.js) + classificador determinístico (`POST /api/classify`). Funis, etapas, tags, prioridade, temperatura, NPS e regras de segurança em [docs/qara-knowledge.md](docs/qara-knowledge.md). O prompt do agente fica curto; a estrutura vive na knowledge/config. Testes: `node --test classifier.test.js`.
