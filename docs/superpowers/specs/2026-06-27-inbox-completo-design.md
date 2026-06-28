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

## Dados / estado

- `selectInboxConversation(id)` passa a carregar também `ui.inbox.activities`
  (de `/api/activities?conversationId=id`).
- Novo estado: `ui.inbox.activities = []`, `ui.users = null`.
- Usuários carregados sob demanda na primeira renderização do painel.

## Padrões a seguir

- Reusar `apiFetch` / `dbWrite` existentes.
- Delegação por `data-action` em `handleClick`; `<select>` via `handleChange`.
- Novas ações: `inbox-assign`, `inbox-set-status`, `inbox-add-tag`, `inbox-add-note`.
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
