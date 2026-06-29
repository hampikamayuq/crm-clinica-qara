# Kanban de leads — design (v2 Operação, slice 4)

## Contexto

A view "Funil" (`renderLeads`) já tem kanban, lista, pipelines clínicos e triagem —
**mas opera sobre o espelho local `state.leads`**, sincronizado do banco por
`mapDbLeadToUi` (≈ linha 3397+). As colunas usam um conjunto reduzido de 5 etapas de
UI (`stages`: entrada/qualificacao/proposta/agendado/fechado) e o arraste converte
para o enum real via `STAGE_UI_TO_DB` antes de `PATCH /api/leads/:id { stage }`
(≈ linha 3476). Ou seja: já escreve no banco, mas por uma camada de tradução que
esconde 4 das 9 etapas reais (`LeadStage`).

Esta fatia torna o **kanban comercial** DB-native: lê `/api/leads` direto, colunas =
`LeadStage` real, arraste grava o enum sem tradução, e adiciona filtro por responsável.
As outras visões da view (clínico/lista/triagem) ficam como estão nesta fatia.

## Escopo

Apenas o modo `funnelView === "kanban"` de `renderLeads`.

### 1. Fonte de dados DB-native
- Carregar `GET /api/leads?stage=&assignedToId=&temperature=` em `ui.funnel.list`
  (cache; recarrega ao filtrar ou após mover). Não passar mais por `state.leads`
  neste modo.
- `listLeads` retorna escalares incluindo `stage`, `assignedToId`, `score`,
  `temperature`, `estimatedValue`, `interest`, `source`, `nextAction`, `nextActionAt`.

### 2. Colunas = LeadStage real
- Uma coluna por valor de `LeadStage`:
  `NEW`, `CONTACTED`, `WAITING_PATIENT`, `APPOINTMENT_SCHEDULED`, `ATTENDED`,
  `BUDGET_SENT`, `PROCEDURE_SCHEDULED`, `LOST`, `REACTIVATE`.
- Rótulos PT em um mapa `LEAD_STAGE_LABEL` (novo). Aposenta `STAGE_UI_TO_DB`/
  `inferLeadEtapa` **para este modo** (continuam servindo as outras visões por ora).

### 3. Arraste grava o enum direto
- Drag-and-drop já existe (`data-stage-column`, `data-lead-card`, `data-stage-select`).
- Soltar/escolher etapa → `PATCH /api/leads/:id { stage: <LeadStage> }` (sem tradução).
- Após gravar: recarrega `ui.funnel.list` e re-renderiza. Atualização otimista opcional.

### 4. Filtros
- Acima do board: **responsável** (`ui.users`, resolvido client-side pois `listLeads`
  não inclui `assignedTo`) e **temperatura** (`COLD`/`WARM`/`HOT`).
- Aplicados no servidor via query. Busca por texto (interesse/origem) segue client-side
  sobre `ui.funnel.list`.
- Estado: `ui.funnelFilters = { assignedToId: "", temperature: "" }`.

### 5. Card do lead
- Reusar layout de `renderLeadCard` adaptado aos campos do DB: nome, `interest`,
  `source`, chip de `score`, chip de `estimatedValue` (via `formatMoney`),
  `nextAction`/`nextActionAt`. Ações existentes (Inbox/Agendar) preservadas por `data-id`.

## Dados / estado

- Novo estado: `ui.funnel = { list: null, loading: false }`,
  `ui.funnelFilters = { assignedToId: "", temperature: "" }`.
- `ui.users` reusado da slice 1 para resolver e filtrar responsável.
- `state.leads` permanece intocado — outras views/modos seguem usando o espelho.

## Padrões a seguir

- Reusar `apiFetch` / `dbWrite`, `escapeHtml`, `formatMoney`, `formatDate`, `initials`,
  `scoreTone`, classes `pipeline`, `stage-column`, `lead-card`, `chip`, `card-chips`.
- Delegação por `data-action`/`data-stage-*`; selects via `handleChange`.
- Novas ações: `funnel-filter-assigned`, `funnel-filter-temp`, `funnel-move`
  (ou reusar o handler de `data-stage-select` apontando para a lista DB).
- Após cada escrita: recarregar `ui.funnel.list` e re-renderizar só o board.

## Contratos usados (já existentes)

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/leads` | board (aceita `stage`, `source`, `assignedToId`, `temperature`, `interest`, `overdue`) |
| PATCH | `/api/leads/:id` | mover etapa (`{ stage }`) |
| GET | `/api/users` | filtro/resolução de responsável |

`updateLead` aceita `stage` e dispara workflow/auditoria; nenhuma mudança de backend.

## Fora de escopo (adiado)

- Migrar clínico/lista/triagem para DB-native (continuam sobre `state.leads`).
- Reordenar cards dentro da coluna / WIP limits.
- Edição inline de outros campos do lead pelo card (só `stage` muda aqui).
- Remover de vez `state.leads` e a camada `STAGE_UI_TO_DB` (depende de migrar as demais visões).

## Verificação

Estender `test.js` (node:test, sem framework):
- `listLeads({ stage: "NEW" })` filtra por etapa.
- `listLeads({ assignedToId })` e `{ temperature: "HOT" }` filtram corretamente.
- `updateLead(id, { stage: "PROCEDURE_SCHEDULED" })` persiste a etapa nova.
