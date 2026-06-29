# Tarefas — design (v2 Operação, slice 3)

## Contexto

O backend já tem CRUD de tarefas (`task.service.js`, `/api/tasks*`). O frontend só
**cria** tarefas (via `inbox-new-task`, slice 1). Não existe view para listá-las,
concluí-las ou editá-las. A tabela de follow-ups da view "Operação" lê
`/api/followups` (categorização de leads), **não** `/api/tasks` — são coisas
diferentes. Tarefas criadas pelo inbox hoje somem da UI.

Esta fatia adiciona a view "Tarefas": lista filtrável com ação de concluir e editar.
Trabalho 100% frontend; nenhum endpoint novo.

## Escopo

Nova view DB-native no padrão de `renderView()`.

### 1. Registrar a view
- `pageTitles`: `tarefas: ["Tarefas", "Follow-ups e pendências da equipe"]`.
- Botão de nav `data-view="tarefas"`.
- Dispatch: `if (ui.view === "tarefas") renderTasks();`.

### 2. Filtros
- Acima da lista: selects de **status** (`OPEN`/`IN_PROGRESS`/`DONE`/`CANCELED`),
  **responsável** (de `ui.users`, já cacheado) e um toggle **Atrasadas** (`overdue=true`).
- Aplicados no servidor via query (`listTasks` aceita `status`, `assignedToId`, `overdue`).
- Estado: `ui.taskFilters = { status: "OPEN", assignedToId: "", overdue: false }`.
  (padrão `OPEN` para abrir já no que importa).

### 3. Lista de tarefas
- `GET /api/tasks?status=&assignedToId=&overdue=` na renderização (recarrega ao filtrar).
- Tabela (`data-table`): Título, Responsável (resolvido via `ui.users`), Vínculo
  (lead/paciente, se houver), Vencimento (`dueAt`, com destaque vermelho se atrasada),
  Status (chip).
- `listTasks` já ordena por `dueAt asc, createdAt desc`.

### 4. Concluir
- Botão por linha (em tarefas não-`DONE`) → `POST /api/tasks/:id/complete`.
- Após: recarrega a lista com os filtros atuais.

### 5. Editar
- Botão por linha → modal (reusa o padrão de modal do `inbox-new-task`):
  título, descrição, `dueAt` (`<input type="date">` nativo), responsável (`ui.users`),
  status → `PATCH /api/tasks/:id`.

### 6. Nova tarefa
- Botão no `toolbar` → mesmo modal vazio → `POST /api/tasks { title, ... }`.
  `title` é obrigatório. Sem vínculo a lead aqui (vínculo nasce no inbox).

## Dados / estado

- Novo estado:
  `ui.tasks = { list: null, loading: false }`,
  `ui.taskFilters = { status: "OPEN", assignedToId: "", overdue: false }`.
- `ui.users` carregado sob demanda na primeira renderização (mesma cache da slice 1).
- Responsável e vínculo exibidos resolvendo IDs contra `ui.users` (lista não inclui `assignedTo`).

## Padrões a seguir

- Reusar `apiFetch` / `dbWrite`, `emptyState`, `escapeHtml`, `formatDate`,
  classes `data-table`, `toolbar`, `chip`, `secondary-button`.
- Delegação por `data-action` em `handleClick`; selects via `handleChange`.
- Novas ações: `task-complete`, `task-edit`, `task-save`, `new-task` (genérica, sem lead),
  `task-filter-*`.
- Após cada escrita: recarregar a lista e re-renderizar.

## Contratos usados (já existentes)

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/tasks` | lista (aceita `status`, `assignedToId`, `overdue`, `leadId`, `patientId`) |
| POST | `/api/tasks` | criar (`title` obrigatório) |
| PATCH | `/api/tasks/:id` | editar |
| POST | `/api/tasks/:id/complete` | marcar `DONE` |
| GET | `/api/users` | popular selects de responsável |

## Fora de escopo (adiado)

- Subtarefas, recorrência, lembretes/notificações.
- Vincular tarefa a paciente pela UI (só o inbox vincula a lead hoje).
- Exclusão de tarefa (não há endpoint; usar status `CANCELED`).

## Verificação

Estender `test.js` (node:test, sem framework):
- `createTask({ title })` cria com status `OPEN`; sem `title` rejeita.
- `listTasks({ status: "OPEN" })` filtra por status.
- `listTasks({ overdue: "true" })` retorna só `dueAt < agora` em `OPEN`/`IN_PROGRESS`.
- `completeTask(id)` muda status para `DONE`.
