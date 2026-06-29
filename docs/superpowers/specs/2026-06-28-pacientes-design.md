# Pacientes — design (v2 Operação, slice 2)

## Contexto

O backend já expõe CRUD completo de pacientes (`patient.service.js`,
`/api/patients*`) e a conversão lead→paciente (`POST /api/leads/:id/convert-to-patient`,
já chamada pelo inbox na slice 1). O frontend **não tem nenhuma view de pacientes**:
não existe `renderPatients`, item de nav, nem fetch a `/api/patients`. Pacientes
criados pela conversão hoje ficam invisíveis na UI.

Esta fatia adiciona a view "Pacientes": lista com busca, detalhe lateral com dados
administrativos e timeline. Trabalho quase 100% frontend; nenhum endpoint novo.

## Escopo

Nova view DB-native (não usa o espelho local `state.leads`), no mesmo padrão das
outras views de `renderView()`.

### 1. Registrar a view
- Entrada em `pageTitles`: `pacientes: ["Pacientes", "Cadastro e histórico administrativo"]`
  (o gate da linha ~80 exige isso para a view ser válida).
- Botão de nav com `data-view="pacientes"` ao lado dos existentes.
- Linha de dispatch em `renderView()`: `if (ui.view === "pacientes") renderPatients();`.

### 2. Lista de pacientes
- `GET /api/patients?limit=200` na primeira renderização (cache em `ui.patients.list`).
- Busca por nome/telefone: input no `toolbar`. Telefone pode ir ao servidor
  (`?phone=`); nome filtra client-side sobre a lista (a lista já é pequena).
- Tabela (`data-table`): Nome, Telefone, E-mail, CPF, Consentimento LGPD, Criado em.
- Cada linha → `data-action="select-patient" data-id` abre o detalhe.

### 3. Detalhe do paciente (painel lateral)
- `GET /api/patients/:id` ao selecionar (cache em `ui.patients.selected`).
- Blocos `side-block`: dados de contato, `notesAdministrative`, `preferredChannel`,
  `birthDate`, flag LGPD.
- Botão **Editar** → modal (reusa o padrão de modal do `inbox-new-task`) com os campos
  graváveis → `PATCH /api/patients/:id`. Após gravar: recarrega o detalhe e a lista.

### 4. Timeline do paciente
- `GET /api/patients/:id/timeline` → reusa `renderActivityItem` (já existe, slice 1).
- Exibida no mesmo painel, abaixo dos dados. Estado `ui.patients.timeline = []`.

### 5. Novo paciente
- Botão no `toolbar` → mesmo modal do bloco 3, vazio → `POST /api/patients { name, ... }`.
- `name` é obrigatório (o service rejeita sem ele).

## Dados / estado

- Novo estado:
  `ui.patients = { list: null, selectedId: null, selected: null, timeline: [], search: "", loading: false }`.
- Lista carregada sob demanda na primeira renderização; detalhe e timeline ao selecionar.
- Sem `assignedTo` no modelo Patient — não há filtro de responsável aqui.

## Padrões a seguir

- Reusar `apiFetch` / `dbWrite`, `renderActivityItem`, `emptyState`, `escapeHtml`,
  `formatDate`, classes `data-table`, `side-block`, `chip`, `toolbar`, `secondary-button`.
- Delegação por `data-action` em `handleClick`; busca via `handleChange`/input.
- Novas ações: `select-patient`, `patient-edit`, `patient-save`, `new-patient`.
- Após cada escrita: recarregar o dado afetado e re-renderizar.

## Contratos usados (já existentes)

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/patients` | lista (aceita `?phone=`, `?limit=`) |
| GET | `/api/patients/:id` | detalhe |
| PATCH | `/api/patients/:id` | editar |
| POST | `/api/patients` | criar (`name` obrigatório) |
| GET | `/api/patients/:id/timeline` | histórico no painel |

`listPatients` retorna só escalares (ordenado por `createdAt desc`), suficiente para a tabela.

## Fora de escopo (adiado)

- Vínculo visual paciente↔conversas/agendamentos/orçamentos (outras fatias).
- Exclusão de paciente (não há endpoint).
- Mesclar pacientes duplicados.

## Verificação

Estender `test.js` (node:test, sem framework):
- `createPatient({ name })` cria e `getPatient(id)` retorna o registro.
- `createPatient({})` sem `name` rejeita (`badRequest`).
- `listPatients({ phone })` filtra por telefone (contains).
- `patientTimeline(id)` retorna atividades do paciente.
