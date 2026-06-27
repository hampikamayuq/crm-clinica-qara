# CliniQara CRM

MVP estatico para clinicas que precisam de CRM comercial, inbox, agenda e financeiro simples, sem prontuario.

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
- Persistencia em `localStorage`.
- Exportacao/importacao em JSON.
- Layout responsivo para desktop e mobile.

## Como rodar sem integracoes

Abra `index.html` no navegador.

Para publicar apenas como app estatico, envie estes arquivos para qualquer hospedagem estatica:

- `index.html`
- `styles.css`
- `app.js`
- `flows/leads-novos.bot.js`

## Como rodar com WhatsApp API e Instagram

1. Crie o arquivo `.env` a partir de `.env.example`.
2. Preencha `META_VERIFY_TOKEN`.
3. Para WhatsApp Cloud API, preencha `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
4. Para Instagram DM, preencha `INSTAGRAM_PAGE_ACCESS_TOKEN`.
5. Para agente OpenAI, preencha `AI_PROVIDER=openai`, `OPENAI_API_KEY` e, se quiser, `OPENAI_MODEL`.
6. Para publicar em URL publica, preencha tambem `ADMIN_API_KEY`, `META_APP_SECRET` e `LEAD_WEBHOOK_SECRET`.
7. Rode:

```bash
npm start
```

8. Abra `http://localhost:3000`.
9. Na aba Canais, copie a URL `/webhooks/meta`.
10. No painel da Meta, use essa URL como Callback URL e o mesmo `META_VERIFY_TOKEN`.

Para receber webhooks reais, a URL precisa estar publica em HTTPS. Em desenvolvimento, use ngrok, Cloudflare Tunnel ou equivalente apontando para `localhost:3000`. O endpoint `POST /webhooks/meta` valida `X-Hub-Signature-256` quando `META_APP_SECRET` esta configurado; sem esse segredo, webhooks sem assinatura so passam em localhost ou com `ALLOW_UNSIGNED_WEBHOOKS=true`.

Endpoints criados:

- `GET /webhooks/meta`: verificacao da Meta com `hub.challenge`.
- `POST /webhooks/meta`: recebe mensagens de WhatsApp e Instagram.
- `GET /api/integrations/status`: status da configuracao.
- `GET /api/conversations`: conversas recebidas por webhook.
- `POST /api/messages/send`: envio pelo canal original. WhatsApp aceita texto, botoes, lista e modelo aprovado.
- `POST /api/agent/test`: teste do agente OpenAI pela aba Bots.

As rotas `/api/*` usam `ADMIN_API_KEY` em URL publica. A UI envia essa chave pelo header `x-admin-api-key` depois que voce informa a chave no prompt do navegador. Em localhost, a chave pode ficar vazia para facilitar o desenvolvimento.

Endpoints Prisma principais:

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
curl -X POST http://localhost:3000/api/import/leads \
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

## Banco de dados (PostgreSQL + Prisma) - v1 em andamento

O CRM esta evoluindo de `localStorage`/JSON para **PostgreSQL via Prisma** como fonte da verdade. Esta fundacao e **aditiva**: o MVP atual continua funcionando enquanto o banco e adotado de forma incremental.

Setup:

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL
npm run prisma:generate     # gera o Prisma Client
npm run db:push             # cria as tabelas no banco (ou prisma:migrate)
npm run prisma:seed         # popula unidades, profissionais, tipos, servicos, quick replies e tags
npm run dev                 # sobe o servidor (= npm start)
```

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

## Proximo passo para producao

Substituir `localStorage` e `data/channel-conversations.json` por banco de dados com backup e politica de retencao. O arquivo JSON atual ja usa escrita atomica, permissao restrita e fila simples de escrita para reduzir perda de mensagens no MVP. A migracao dos dados locais sera feita por `scripts/migrate-json-to-db.js` (sem apagar os arquivos antigos).

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

A persona, as regras e a base de conhecimento ficam em `server.js`:

- `SYSTEM_PROMPT`: persona, tom, regras rigidas, triagem, agendamento e formato de saida.
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
