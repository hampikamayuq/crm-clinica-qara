# Inbox completo — design (v2 Operação, slice 1)

## Contexto

O backend modular (`src/server/index.js` + `src/server/services/*`) já expõe CRUD
completo para conversas. O frontend (`app.js`) usa apenas parte disso: o inbox lê
conversas e mensagens do banco (`/api/inbox`, `/api/conversations/:id/messages`),
mas o painel lateral mostra somente a classificação e um botão "Resolver".

Esta fatia liga o que já existe: atribuição, status, tags e notas/timeline da conversa.
É trabalho quase 100% frontend. Nenhum endpoint novo é necessário.

## Escopo

Enriquecer o painel direito do inbox (`renderDbConversationSide(c)` em `app.js`) com
quatro blocos abaixo da classificação atual, mais os handlers de ação.

### 1. Atribuir (assign)
- `<select>` com a lista de usuários de `GET /api/users` (buscada uma vez, cache em `ui.users`).
- Mostra o responsável atual via `conversation.assignedTo.name`.
- Ao mudar → `POST /api/conversations/:id/assign { assignedToId }`.

### 2. Status
- `<select>`: Aberta (`OPEN`) / Aguardando paciente (`WAITING_PATIENT`) /
  Com atendente (`WAITING_TEAM`) / Resolvida (`RESOLVED`).
- Ao mudar → `PATCH /api/conversations/:id { status }`.
- Substitui o botão isolado "Resolver".

### 3. Tags
- Chips a partir de `conversation.tags[].tag.name`.
- Input de texto + botão para adicionar → `POST /api/conversations/:id/tags { name }`.
- Apenas adição. Remoção fica adiada (não há endpoint).

### 4. Notas internas + timeline
- Lista de `GET /api/activities?conversationId=:id` (ordenado desc).
- Entradas `NOTE` aparecem como notas; demais tipos como timeline leve da conversa.
- Textarea + botão → `POST /api/conversations/:id/notes { text }`.

### 5. Filtros na lista de conversas
- Acima da lista, além da busca por texto já existente: selects de **status**,
  **canal** e **responsável**.
- Aplicados client-side sobre `ui.inbox.list` (a lista já vem completa de `/api/inbox`
  com `assignedTo`, `status`, `channel`), estendendo `filteredDbInbox()`.
- Estado: `ui.inboxFilters = { status: "", channel: "", assignedToId: "" }`.

### 6. Respostas rápidas (quick replies)
- Carregadas uma vez de `GET /api/quick-replies?active=true` (cache em `ui.quickReplies`).
- No compositor de resposta: um `<select>`/menu que, ao escolher, insere
  `quickReply.content` no `#inbox-reply-input` (rótulo = `title`/`shortcut`).
- Apenas inserção de texto; o envio segue pelo fluxo atual (`sendInboxReply`).

### 7. Criar tarefa / follow-up
- Botão no painel lateral → abre modal simples (reusa o padrão de modal existente):
  título, data (`<input type="date">` nativo), responsável (reusa `ui.users`).
- `POST /api/tasks { title, dueAt, assignedToId, leadId }`, onde `leadId = conversation.lead?.id`.
- Task não tem `conversationId`; o vínculo é via `leadId` (ou `patientId` quando houver).

### 8. Painel do lead
- Quando a conversa tem `lead`, mostrar bloco com dados do lead (`/api/leads/:id` se
  precisar de detalhe; a lista já traz `lead.name/phone/stage`).
- Ações: **abrir timeline** (`GET /api/leads/:id/timeline`, exibida no mesmo painel
  de atividades) e **converter em paciente** (`POST /api/leads/:id/convert-to-patient`).

## Dados / estado

- `selectInboxConversation(id)` passa a carregar também `ui.inbox.activities`
  (de `/api/activities?conversationId=id`).
- Novo estado: `ui.inbox.activities = []`, `ui.users = null`, `ui.quickReplies = null`,
  `ui.inboxFilters = { status: "", channel: "", assignedToId: "" }`.
- Usuários e quick replies carregados sob demanda na primeira renderização do painel.
- "Abrir timeline do lead" reusa `ui.inbox.activities` (troca a fonte para
  `/api/leads/:id/timeline`).

## Padrões a seguir

- Reusar `apiFetch` / `dbWrite` existentes.
- Delegação por `data-action` em `handleClick`; `<select>` via `handleChange`.
- Novas ações: `inbox-assign`, `inbox-set-status`, `inbox-add-tag`, `inbox-add-note`,
  `inbox-filter-*`, `inbox-quick-reply`, `inbox-new-task`, `inbox-lead-timeline`,
  `inbox-convert-patient`.
- Reusar CSS existente: `side-block`, `side-label`, `chip`, `secondary-button`.
- Após cada escrita: recarregar o dado afetado e re-renderizar o painel.

## Contratos usados (já existentes)

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/users` | popular select de atribuição |
| POST | `/api/conversations/:id/assign` | atribuir responsável |
| PATCH | `/api/conversations/:id` | mudar status |
| POST | `/api/conversations/:id/tags` | adicionar tag |
| GET | `/api/activities?conversationId=:id` | listar notas/timeline |
| POST | `/api/conversations/:id/notes` | adicionar nota interna |
| GET | `/api/quick-replies?active=true` | respostas rápidas no compositor |
| POST | `/api/tasks` | criar tarefa/follow-up vinculada ao lead |
| GET | `/api/leads/:id/timeline` | timeline do lead no painel |
| POST | `/api/leads/:id/convert-to-patient` | converter lead em paciente |

`listConversations` (`/api/inbox`) já inclui `assignedTo`, `tags` e os escalares
(incluindo `classification`), então o item de conversa carregado tem tudo que o
painel precisa sem fetch extra além das atividades.

## Fora de escopo (adiado)

- Endpoint de remoção de tag.
- Atualização em tempo real.
- Views de pacientes, tarefas e kanban com filtros (outras fatias da v2).

## Verificação

Estender `test.js` (node:test, sem framework):
- `addNote(convId, texto)` cria uma Activity `type: "NOTE"` ligada ao `conversationId`.
- `getConversation(id)` retorna `assignedTo` e `tags`.
- `createTask({ title, leadId })` cria a task vinculada ao lead.
- `listQuickReplies({ active: "true" })` retorna só as ativas.
