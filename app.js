const STORAGE_KEY = "cliniqara-crm-v4";
const AUTH_TOKEN_STORAGE = "cliniqara-auth-token-v1";
const AUTH_USER_STORAGE = "cliniqara-auth-user-v1";

const stages = [
  { id: "entrada", label: "Entrada", tone: "blue" },
  { id: "qualificacao", label: "Qualificacao", tone: "violet" },
  { id: "proposta", label: "Proposta", tone: "amber" },
  { id: "agendado", label: "Agendado", tone: "primary" },
  { id: "fechado", label: "Fechado", tone: "green" },
];

// Mapeamento de etapas UI <-> banco (LeadStage). Usado no cutover de Leads.
const STAGE_UI_TO_DB = {
  entrada: "NEW",
  qualificacao: "CONTACTED",
  proposta: "BUDGET_SENT",
  agendado: "APPOINTMENT_SCHEDULED",
  fechado: "ATTENDED",
};
const STAGE_DB_TO_UI = {
  NEW: "entrada",
  CONTACTED: "qualificacao",
  WAITING_PATIENT: "qualificacao",
  REACTIVATE: "qualificacao",
  BUDGET_SENT: "proposta",
  APPOINTMENT_SCHEDULED: "agendado",
  PROCEDURE_SCHEDULED: "agendado",
  ATTENDED: "fechado",
  LOST: "entrada",
};

// Kanban DB-native: colunas = LeadStage real do banco (sem traducao).
const LEAD_STAGES = ["NEW", "CONTACTED", "WAITING_PATIENT", "APPOINTMENT_SCHEDULED", "ATTENDED", "BUDGET_SENT", "PROCEDURE_SCHEDULED", "LOST", "REACTIVATE"];
const LEAD_STAGE_LABEL = {
  NEW: "Novo", CONTACTED: "Contatado", WAITING_PATIENT: "Aguardando paciente",
  APPOINTMENT_SCHEDULED: "Consulta agendada", ATTENDED: "Atendido", BUDGET_SENT: "Orcamento enviado",
  PROCEDURE_SCHEDULED: "Procedimento agendado", LOST: "Perdido", REACTIVATE: "Reativar",
};
const TEMP_DB_LABEL = { HOT: "Quente", WARM: "Morno", COLD: "Frio" };
const TASK_STATUS_LABEL = { OPEN: "Aberta", IN_PROGRESS: "Em andamento", DONE: "Concluida", CANCELED: "Cancelada" };
const TASK_STATUS_TONE = { OPEN: "blue", IN_PROGRESS: "amber", DONE: "green", CANCELED: "" };

const professionals = [
  "Dr. Diego Galvez",
  "Dr. Miguel Ceccarelli",
  "Dra. Diana Stohmann",
  "Dra. Manuela Pedretti Cabral",
  "Dr. Fabricio de Andrade",
];
// Mapa nome -> id do profissional no banco (preenchido por hydrateProfessionalsFromDb).
const professionalDbIdByName = {};
const times = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
const pageTitles = {
  dashboard: ["Hoje", "Operacao comercial da clinica"],
  inbox: ["Inbox", "Conversas, respostas e agendamentos"],
  leads: ["Funil", "Leads ate virarem consultas"],
  pacientes: ["Pacientes", "Cadastro e historico administrativo"],
  tarefas: ["Tarefas", "Follow-ups e pendencias da equipe"],
  operations: ["Operacao", "Briefing, follow-ups e importacao"],
  agenda: ["Agenda", "Horarios e confirmacoes"],
  financeiro: ["Financeiro", "Recebimentos sem prontuario"],
  channels: ["Canais", "WhatsApp API e Instagram"],
  bots: ["Bots", "Automacoes de atendimento"],
  config: ["Dados", "Exportacao e ajustes locais"],
};

lead.counter = 1;

let state = loadState();
let ui = {
  view: window.location.hash.replace("#", "") || "dashboard",
  selectedLeadId: state.leads[0]?.id || "",
  leadSearch: "",
  inboxSearch: "",
  inbox: { list: null, selectedId: null, messages: [], activities: [], loading: false },
  inboxFilters: { status: "", channel: "", assignedToId: "" },
  patients: { list: null, selectedId: null, selected: null, timeline: [], search: "", loading: false },
  funnel: { list: null, loading: false },
  funnelFilters: { assignedToId: "", temperature: "" },
  tasks: { list: null, loading: false },
  taskFilters: { status: "OPEN", assignedToId: "", overdue: false },
  users: null,
  team: { users: null, editId: "" },
  quickReplies: null,
  waMode: "text",
  selectedVisualBotId: "",
  funnelView: "kanban",
  triageRows: null,
  triageFilter: { pipeline: "", prioridade: "", temperatura: "" },
  clinicalPipeline: "1-unhas",
  ops: { briefing: null, pipeline: null, followups: null, loading: false, error: "" },
  agendaDate: todayISO(),
  financeFilter: "todos",
  integrationStatus: null,
  integrationError: "",
  agentTest: { name: "", draft: "", messages: [], agentState: {}, lastActions: [], confidence: null, busy: false },
};
let appStarted = false;

if (!pageTitles[ui.view]) ui.view = "dashboard";

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  if (sessionStorage.getItem(AUTH_TOKEN_STORAGE)) resumeSession();
  else renderLogin();
});

function bindEvents() {
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("submit", handleSubmit);
  document.body.addEventListener("change", handleChange);
  document.body.addEventListener("input", handleInput);
  document.body.addEventListener("dragstart", handleDragStart);
  document.body.addEventListener("dragend", handleDragEnd);
  document.body.addEventListener("dragover", handleDragOver);
  document.body.addEventListener("drop", handleDrop);
  window.addEventListener("hashchange", () => {
    const next = window.location.hash.replace("#", "");
    if (pageTitles[next]) {
      ui.view = next;
      closeMenu();
      render();
    }
  });
}

function startApp() {
  document.body.classList.remove("auth-locked");
  const root = document.querySelector("#login-root");
  if (root) root.innerHTML = "";
  if (appStarted) return render();
  appStarted = true;
  render();
  hydrateLeadsFromDb();
  hydrateProfessionalsFromDb().then(hydrateAppointmentsFromDb);
  hydrateBotsFromDb();
}

async function resumeSession() {
  try {
    const response = await apiFetch("/api/integrations/status", {}, false);
    if (response.ok) return startApp();
  } catch {
    /* volta para login */
  }
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE);
  sessionStorage.removeItem(AUTH_USER_STORAGE);
  renderLogin("Sessao expirada. Entre novamente.");
}

function renderLogin(message = "") {
  appStarted = false;
  document.body.classList.add("auth-locked");
  const root = document.querySelector("#login-root");
  if (!root) return;
  root.innerHTML = `
    <section class="login-panel" aria-label="Entrar no CliniQara">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">Q</div>
        <div>
          <div class="brand-name">CliniQara</div>
          <div class="brand-subtitle">CRM sem prontuario</div>
        </div>
      </div>
      <div>
        <h1>Entrar no sistema</h1>
        <p>Use o usuario e senha da clinica.</p>
      </div>
      <form class="login-form" data-form="login">
        <label class="login-field">
          <span>Usuario</span>
          <input class="search-input" name="username" type="text" autocomplete="username" required autofocus />
        </label>
        <label class="login-field">
          <span>Senha</span>
          <input class="search-input" name="password" type="password" autocomplete="current-password" required />
        </label>
        <div class="login-error" role="alert">${escapeHtml(message)}</div>
        <button class="primary-button" type="submit">Entrar</button>
      </form>
    </section>
  `;
  requestAnimationFrame(() => root.querySelector("input")?.focus());
}

async function loginWithPassword(form, data) {
  const button = form.querySelector("button[type='submit']");
  const error = form.querySelector(".login-error");
  if (button) button.disabled = true;
  if (error) error.textContent = "";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: data.username, password: data.password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(authErrorMessage(payload.error));
    sessionStorage.setItem(AUTH_TOKEN_STORAGE, payload.token);
    sessionStorage.setItem(AUTH_USER_STORAGE, JSON.stringify(payload.user || {}));
    startApp();
  } catch (err) {
    if (error) error.textContent = err.message || "Nao foi possivel entrar.";
  } finally {
    if (button) button.disabled = false;
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE);
  sessionStorage.removeItem(AUTH_USER_STORAGE);
  renderLogin();
}

function authErrorMessage(code) {
  if (code === "invalid_credentials") return "Usuario ou senha invalidos.";
  if (code === "user_inactive") return "Usuario inativo.";
  if (code === "login_unavailable") return "Login indisponivel. Verifique o banco de dados.";
  return "Nao foi possivel entrar.";
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    ui.view = viewButton.dataset.view;
    window.location.hash = ui.view;
    closeMenu();
    render();
    return;
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  if (action === "toggle-menu") return toggleMenu();
  if (action === "logout") return logout();
  if (action === "team-edit") { ui.team.editId = id; return renderConfig(); }
  if (action === "team-new") { ui.team.editId = ""; return renderConfig(); }
  if (action === "new-lead") return openLeadModal();
  if (action === "close-modal") return closeModal();
  if (action === "export-data") return exportData();
  if (action === "import-data") return document.querySelector("#import-file")?.click();
  if (action === "import-bot") return document.querySelector("#bot-import-file")?.click();
  if (action === "reset-data") return resetData();
  if (action === "select-lead") return selectLead(id);
  if (action === "select-patient") return selectPatient(id);
  if (action === "new-patient") return openPatientModal();
  if (action === "patient-edit") return openPatientModal(id);
  if (action === "new-task") return openTaskModal();
  if (action === "task-edit") return openTaskModal(id);
  if (action === "task-complete") return completeTaskById(id);
  if (action === "set-funnel-view") {
    ui.funnelView = actionEl.dataset.mode || "kanban";
    render();
    return;
  }
  if (action === "set-clinical-pipeline") {
    ui.clinicalPipeline = actionEl.dataset.id || "1-unhas";
    return render();
  }
  if (action === "ops-refresh") return loadOperations(true);
  if (action === "ops-export-csv") return downloadCsv(actionEl.dataset.type || "leads");
  if (action === "ops-import-csv") return document.querySelector("#ops-csv-file")?.click();
  if (action === "ops-recalculate-score") return recalculateLeadScores();
  if (action === "ops-copy-webhook") return copyText(`${window.location.origin}/api/webhook`, "Webhook copiado.");
  if (action === "open-search-result") return openSearchResult(id);
  if (action === "select-conversation") return selectInboxConversation(id);
  if (action === "inbox-reply") return sendInboxReply(id);
  if (action === "inbox-receive") return receiveInbox(id);
  if (action === "inbox-resolve") return resolveInboxConversation(id);
  if (action === "inbox-add-tag") return addInboxTag(id);
  if (action === "inbox-add-note") return addInboxNote(id);
  if (action === "inbox-new-task") return openInboxTaskModal(id);
  if (action === "inbox-lead-timeline") return openLeadTimeline(id);
  if (action === "inbox-convert-patient") return convertInboxLead(id);
  if (action === "inbox-refresh") { ui.inbox.list = null; return renderInbox(); }
  if (action === "set-wa-mode") {
    ui.waMode = actionEl.dataset.mode || "text";
    return renderInbox();
  }
  if (action === "open-conv-from-funnel") {
    ui.view = "inbox";
    window.location.hash = "inbox";
    ui.inbox.list = null;
    ui.inbox.selectedId = id;
    render();
    return loadInboxData().then(() => selectInboxConversation(id));
  }
  if (action === "next-stage") return moveLead(id, nextStageFor(id));
  if (action === "mark-won") return moveLead(id, "fechado");
  if (action === "open-appointment") return openAppointmentModal(id);
  if (action === "open-transaction") return openTransactionModal();
  if (action === "sync-channels") return syncExternalConversations();
  if (action === "copy-webhook") return copyWebhookUrl();
  if (action === "send-message") return sendComposedMessage();
  if (action === "receive-patient-message") return receivePatientMessage();
  if (action === "send-template") return sendTemplate(actionEl.dataset.template || "");
  if (action === "new-wa-template") return openWhatsAppTemplateModal();
  if (action === "edit-wa-template") return openWhatsAppTemplateModal(id);
  if (action === "delete-wa-template") return deleteWhatsAppTemplate(id);
  if (action === "select-template-for-inbox") return useTemplateInInbox(id);
  if (action === "new-visual-bot") return openVisualBotModal();
  if (action === "edit-visual-bot") return openVisualBotModal(id);
  if (action === "select-visual-bot") {
    ui.selectedVisualBotId = id;
    return renderBots();
  }
  if (action === "add-visual-step") return openVisualStepModal(id, "", actionEl.dataset.after || "");
  if (action === "edit-visual-step") return openVisualStepModal(actionEl.dataset.botId, id);
  if (action === "move-visual-step") return moveVisualStep(actionEl.dataset.botId, id, actionEl.dataset.dir);
  if (action === "delete-visual-step") return deleteVisualStep(actionEl.dataset.botId, id);
  if (action === "delete-visual-bot") return deleteVisualBot(id);
  if (action === "toggle-bot") return toggleBot(id);
  if (action === "test-bot") return testBot();
  if (action === "agent-test-send") return sendAgentTestMessage();
  if (action === "agent-test-reset") return resetAgentTest();
  if (action === "delete-bot") return deleteBot(id);
  if (action === "mark-paid") return markTransactionPaid(id);
  if (action === "cancel-appointment") return updateAppointmentStatus(id, "Cancelado");
  if (action === "confirm-appointment") return updateAppointmentStatus(id, "Confirmado");
  if (action === "delete-lead") return deleteLead(id);
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());

  if (form.dataset.form === "login") return loginWithPassword(form, data);
  if (form.dataset.form === "lead") createLead(data);
  if (form.dataset.form === "appointment") createAppointment(data);
  if (form.dataset.form === "transaction") createTransaction(data);
  if (form.dataset.form === "settings") saveSettings(data);
  if (form.dataset.form === "team-user") saveTeamUser(data);
  if (form.dataset.form === "inbox-task") createInboxTask(data);
  if (form.dataset.form === "patient") savePatient(data);
  if (form.dataset.form === "task") saveTask(data);
  if (form.dataset.form === "wa-template") saveWhatsAppTemplate(data);
  if (form.dataset.form === "visual-bot") saveVisualBot(data);
  if (form.dataset.form === "visual-step") saveVisualStep(data);
}

function handleChange(event) {
  const target = event.target;
  if (target.matches("[data-stage-select]")) {
    moveLead(target.dataset.id, target.value);
  }
  if (target.matches("[data-auto-mode]")) {
    const lead = getLead(target.dataset.id);
    if (lead) {
      lead.autoMode = target.checked;
      saveAndRender("Modo de atendimento atualizado.");
    }
  }
  if (target.matches("#agenda-date")) {
    ui.agendaDate = target.value || todayISO();
    render();
  }
  if (target.matches("#finance-filter")) {
    ui.financeFilter = target.value;
    render();
  }
  if (target.matches("#patient-search")) { ui.patients.search = target.value; return renderPatients(); }
  if (target.matches("#task-filter-status")) { ui.taskFilters.status = target.value; ui.tasks.list = null; return renderTasks(); }
  if (target.matches("#task-filter-assigned")) { ui.taskFilters.assignedToId = target.value; ui.tasks.list = null; return renderTasks(); }
  if (target.matches("#task-filter-overdue")) { ui.taskFilters.overdue = target.checked; ui.tasks.list = null; return renderTasks(); }
  if (target.matches("#funnel-filter-assigned")) { ui.funnelFilters.assignedToId = target.value; ui.funnel.list = null; return renderLeads(); }
  if (target.matches("#funnel-filter-temp")) { ui.funnelFilters.temperature = target.value; ui.funnel.list = null; return renderLeads(); }
  if (target.matches("[data-funnel-select]")) return moveFunnelLead(target.dataset.id, target.value);
  if (target.matches("#inbox-filter-status")) { ui.inboxFilters.status = target.value; return renderInbox(); }
  if (target.matches("#inbox-filter-channel")) { ui.inboxFilters.channel = target.value; return renderInbox(); }
  if (target.matches("#inbox-filter-assigned")) { ui.inboxFilters.assignedToId = target.value; return renderInbox(); }
  if (target.matches("#inbox-assign-select")) return assignInboxConversation(target.dataset.id, target.value);
  if (target.matches("#inbox-status-select")) return setInboxStatus(target.dataset.id, target.value);
  if (target.matches("#inbox-quick-reply")) { insertQuickReply(target.value); target.value = ""; return; }
  if (target.matches("#triage-pipeline")) { ui.triageFilter.pipeline = target.value; render(); }
  if (target.matches("#triage-prioridade")) { ui.triageFilter.prioridade = target.value; render(); }
  if (target.matches("#triage-temperatura")) { ui.triageFilter.temperatura = target.value; render(); }
  if (target.matches("#import-file")) {
    importData(target.files?.[0]);
  }
  if (target.matches("#bot-import-file")) {
    importBotFile(target.files?.[0]);
  }
  if (target.matches("#ops-csv-file")) {
    importLeadsCsv(target.files?.[0]);
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches("#lead-search")) {
    ui.leadSearch = target.value;
    renderLeads();
  }
  if (target.matches("#inbox-search")) {
    ui.inboxSearch = target.value;
    renderInbox();
  }
  // Mantem o que foi digitado no testador de IA sem re-renderizar a cada tecla.
  if (target.matches("#agent-test-input")) ui.agentTest.draft = target.value;
  if (target.matches("#agent-test-name")) ui.agentTest.name = target.value;
  if (target.matches("#global-search")) runGlobalSearch(target.value);
}

// Busca global client-side (leads). Atualiza so o dropdown, sem re-render da view.
function runGlobalSearch(query) {
  const box = document.querySelector("#global-search-results");
  if (!box) return;
  const q = query.trim().toLowerCase();
  if (!q) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const hits = state.leads
    .filter((lead) => [lead.name, lead.phone, lead.source, lead.interest].some((f) => (f || "").toLowerCase().includes(q)))
    .slice(0, 8);
  box.innerHTML = hits.length
    ? hits
        .map(
          (lead) => `
        <button type="button" class="search-hit" data-action="open-search-result" data-id="${lead.id}">
          <span class="avatar sm">${initials(lead.name)}</span>
          <span class="hit-main"><strong>${escapeHtml(lead.name)}</strong><span class="muted">${escapeHtml(lead.source || "")} · ${escapeHtml(lead.phone || "")}</span></span>
          <span class="chip ${stageTone(lead.stage)}">${escapeHtml(stageLabel(lead.stage))}</span>
        </button>`,
        )
        .join("")
    : `<div class="search-empty">Nenhum lead encontrado.</div>`;
  box.hidden = false;
}

function openSearchResult(id) {
  const box = document.querySelector("#global-search-results");
  if (box) box.hidden = true;
  const input = document.querySelector("#global-search");
  if (input) input.value = "";
  selectLead(id);
}

function handleDragStart(event) {
  const card = event.target.closest("[data-lead-card]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.id);
  card.classList.add("dragging");
}

function handleDragEnd(event) {
  event.target.closest("[data-lead-card]")?.classList.remove("dragging");
}

function handleDragOver(event) {
  if (event.target.closest("[data-stage-column]") || event.target.closest("[data-funnel-column]")) event.preventDefault();
}

function handleDrop(event) {
  const funnelCol = event.target.closest("[data-funnel-column]");
  if (funnelCol) {
    event.preventDefault();
    return moveFunnelLead(event.dataTransfer.getData("text/plain"), funnelCol.dataset.stage);
  }
  const column = event.target.closest("[data-stage-column]");
  if (!column) return;
  event.preventDefault();
  const leadId = event.dataTransfer.getData("text/plain");
  moveLead(leadId, column.dataset.stage);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.leads?.length) {
      const repaired = repairState(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired));
      return repaired;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  const initial = createInitialState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function repairState(saved) {
  let changed = false;
  const seen = new Set();
  const leads = saved.leads.map((item, index) => {
    const originalId = item.id;
    const invalid = !originalId || String(originalId).includes("NaN") || seen.has(originalId);
    const next = invalid ? { ...item, id: `lead-${index + 1}` } : item;
    if (invalid) changed = true;
    seen.add(next.id);
    return next;
  });

  saved.leads = leads;
  const hasLead = (id) => leads.some((leadItem) => leadItem.id === id);
  (saved.appointments || []).forEach((appointmentItem) => {
    if (hasLead(appointmentItem.leadId)) return;
    const match = leads.find((leadItem) => leadItem.name === appointmentItem.patientName);
    if (match) {
      appointmentItem.leadId = match.id;
      changed = true;
    }
  });
  (saved.transactions || []).forEach((transactionItem) => {
    if (hasLead(transactionItem.leadId)) return;
    const match = leads.find((leadItem) => transactionItem.description?.includes(leadItem.name));
    if (match) {
      transactionItem.leadId = match.id;
      changed = true;
    }
  });

  if (!Array.isArray(saved.whatsappTemplates) || !saved.whatsappTemplates.length) {
    saved.whatsappTemplates = defaultWhatsAppTemplates();
    changed = true;
  }
  if (!Array.isArray(saved.visualBots) || !saved.visualBots.length) {
    saved.visualBots = defaultVisualBots();
    changed = true;
  }

  // lead() so roda em createInitialState; leads novos usam uid(). Sem counter para manter aqui.
  return changed ? { ...saved } : saved;
}

function bundledBots() {
  const bundled = Array.isArray(window.CLINI_QARA_BUNDLED_BOTS) ? window.CLINI_QARA_BUNDLED_BOTS : [];
  return bundled.map(normalizeBot);
}

function createInitialState() {
  const today = todayISO();
  const tomorrow = addDaysISO(1);
  const nextWeek = addDaysISO(7);
  return {
    clinic: {
      name: "Clinica Qara",
      unit: "Copacabana - RJ",
      assistant: "Tawany",
      defaultConsultValue: 550,
    },
    leads: [
      lead("Mariana Costa", "+55 81 98888-1256", "Instagram", "Avaliacao estetica", "agendado", 750, "Confirmar presenca", tomorrow, true),
      lead("Clara Nogueira", "+55 81 97777-9011", "Google", "Avaliacao inicial", "entrada", 750, "Enviar opcoes de horario", today, true),
      lead("Rafael Souza", "+55 81 96666-4477", "Indicacao", "Procedimento", "proposta", 4800, "Validar proposta", addDaysISO(2), false),
      lead("Leticia Freitas", "+55 81 95555-3300", "Instagram", "Consulta particular", "qualificacao", 750, "Retomar conversa", today, true),
      lead("Beatriz Alves", "+55 81 94444-7711", "Retorno", "Procedimento", "fechado", 5400, "Receber saldo", nextWeek, false),
    ],
    appointments: [
      appointment("appt-1", "lead-1", "Mariana Costa", "Dr. Diego Galvez", tomorrow, "09:00", "Avaliacao", "Confirmado", 750),
      appointment("appt-2", "lead-5", "Beatriz Alves", "Dr. Diego Galvez", today, "10:00", "Procedimento", "Confirmado", 5400),
    ],
    transactions: [
      transaction("tx-1", "Consulta Mariana Costa", "Consulta", 750, tomorrow, "Pendente", "lead-1"),
      transaction("tx-2", "Procedimento Beatriz Alves", "Procedimento", 5400, today, "Pago", "lead-5"),
      transaction("tx-3", "Sinal Rafael Souza", "Procedimento", 1200, addDaysISO(2), "Pendente", "lead-3"),
    ],
    activity: [
      { id: "act-1", time: "08:58", text: "Tawany respondeu Mariana em 11 segundos.", tone: "green" },
      { id: "act-2", time: "09:01", text: "Consulta criada para amanha as 09:00.", tone: "primary" },
      { id: "act-3", time: "09:14", text: "Clara perguntou valor da avaliacao.", tone: "amber" },
    ],
    bots: bundledBots(),
    whatsappTemplates: defaultWhatsAppTemplates(),
    visualBots: defaultVisualBots(),
  };
}

function defaultWhatsAppTemplates() {
  return [
    {
      id: "tpl-google-avaliacao-copa-barra",
      name: "Google avaliacao copa e barra",
      templateName: "google_avaliacao_copa_barra",
      type: "WhatsApp",
      status: "Aprovado",
      category: "Marketing",
      language: "pt_BR",
      wabaId: "2752806691674234",
      body:
        "Olá! Esperamos que sua experiência na Clínica QARA tenha sido ótima 😊\n\nSua avaliação é muito importante para nós e ajuda outras pessoas a escolherem com mais segurança. Leva menos de 1 minuto: é só clicar no botão da sua unidade e deixar sua opinião.\n\nDesde já, muito obrigada pelo seu tempo e confiança!",
      footer: "",
      buttons: [
        { id: "copacabana", title: "Copacabana", url: "https://g.page/r/CUVSOMDyoe_YEBM" },
        { id: "barra", title: "Barra da Tijuca", url: "https://maps.app.goo.gl/j13M2BkAjb" },
      ],
    },
    {
      id: "tpl-lembrete-agendamento",
      name: "Lembrete agendamento",
      templateName: "lembrete_agendamento",
      type: "WhatsApp",
      status: "Aprovado",
      category: "Utility",
      language: "pt_BR",
      wabaId: "2752806691674234",
      body:
        "*Olá! Aqui é da Clínica Qara. 😊*\n\nLembrete: sua consulta amanhã às {{1}} com {{2}}.\n\n📍 Rua Santa Clara, 50 - Sala 521, Edifício Golden Point\n\nPodemos confirmar?",
      footer: "",
      buttons: [
        { id: "remarcar", title: "Remarcar" },
        { id: "cancelar", title: "Cancelar" },
        { id: "confirmar", title: "Confirmar" },
      ],
    },
    {
      id: "tpl-mensagem-24h",
      name: "mensagem 24h",
      templateName: "mensagem_24h",
      type: "WhatsApp",
      status: "Aprovado",
      category: "Marketing",
      language: "pt_BR",
      wabaId: "2752806691674234",
      body: "Olá! Aqui é da Clínica Qara. Podemos te ajudar a escolher o melhor horário para sua consulta?",
      footer: "",
      buttons: [{ id: "agendar", title: "Agendar" }, { id: "humano", title: "Atendente" }],
    },
    {
      id: "tpl-nota-fiscal-24h",
      name: "Nota fiscal 24h",
      templateName: "nota_fiscal_24h",
      type: "WhatsApp",
      status: "Aprovado",
      category: "Utility",
      language: "pt_BR",
      wabaId: "2752806691674234",
      body: "Sua nota fiscal está pronta! Caso precise de algum ajuste cadastral, responda esta mensagem.",
      footer: "",
      buttons: [],
    },
  ];
}

function defaultVisualBots() {
  return [
    {
      id: "vbot-leads-novos",
      name: "Leads novos",
      active: true,
      trigger: "Qualquer nova conversa",
      steps: [
        { id: "step-1", type: "message", title: "Boas-vindas", text: "Olá! Seja bem-vindo(a) à Clínica QARA! Conte conosco para cuidar da sua saúde.", options: [], extra: "" },
        { id: "step-2", type: "list", title: "Qual área tratar?", text: "Qual área você gostaria de tratar?", options: ["Pele", "Unhas", "Cabelo", "Estética", "Dermatologia infantil", "Cirurgia dermatológica", "Psoríase/Dermatite/Hidradenite", "Outras"], extra: "" },
        { id: "step-3", type: "condition", title: "Direcionar por área", text: "Encaminha conforme a opção escolhida.", options: [], extra: "unhas, cabelo, cirurgia, pele" },
        { id: "step-4", type: "message", title: "Apresentar médico", text: "Apresenta o especialista (nome, formação, endereço, horários e valor).", options: [], extra: "" },
        { id: "step-5", type: "action", title: "Aplicar tag", text: "Marca o lead pela linha de cuidado.", options: [], extra: "Cirurgia" },
        { id: "step-6", type: "message", title: "Oferecer agenda", text: "Estamos prontos para agendar! Qual dia e horário ficam melhores para você?", options: [], extra: "" },
        { id: "step-7", type: "pause", title: "Aguardar resposta", text: "Espera o paciente responder.", options: [], extra: "23h" },
        { id: "step-8", type: "start", title: "Acompanhamento", text: "Inicia bot de follow-up se não houver resposta.", options: [], extra: "Acompanhamento 1 dia sem resposta" },
        { id: "step-9", type: "handoff", title: "Atendimento humano", text: "Encaminha para a secretária em alertas ou dúvidas fora do fluxo.", options: [], extra: "" },
      ],
    },
  ];
}

function lead(name, phone, source, interest, stage, value, nextStep, followUp, autoMode) {
  const id = `lead-${lead.counter++}`;
  return {
    id,
    name,
    phone,
    source,
    interest,
    stage,
    value,
    nextStep,
    followUp,
    autoMode,
    createdAt: todayISO(),
    messages: seedMessages(name, source, interest, stage),
  };
}

function seedMessages(name, source, interest, stage) {
  const first = firstName(name);
  const messages = [
    { from: "patient", text: `Oi, vi voces pelo ${source}. Queria saber sobre ${interest.toLowerCase()}.`, time: "08:58" },
    { from: "assistant", text: `Oi, ${first}. Sou a Tawany, da Clinica Qara. Posso te ajudar com valores, horarios e agendamento.`, time: "08:58" },
  ];
  if (stage === "agendado") {
    messages.push(
      { from: "patient", text: "Pode marcar pela manha?", time: "09:00" },
      { from: "assistant", text: "Tenho 09:00 ou 10:00 disponiveis. Posso confirmar o melhor horario para voce.", time: "09:00" },
      { from: "system", text: "Consulta vinculada a agenda comercial.", time: "09:01" },
    );
  }
  return messages;
}

function appointment(id, leadId, patientName, professional, date, time, type, status, value) {
  return { id, leadId, patientName, professional, date, time, type, status, value };
}

function transaction(id, description, category, amount, dueDate, status, leadId = "") {
  return { id, description, category, amount, dueDate, status, leadId };
}

function render() {
  updateChrome();
  if (ui.view === "dashboard") renderDashboard();
  if (ui.view === "inbox") renderInbox();
  if (ui.view === "leads") renderLeads();
  if (ui.view === "pacientes") renderPatients();
  if (ui.view === "tarefas") renderTasks();
  if (ui.view === "operations") renderOperations();
  if (ui.view === "agenda") renderAgenda();
  if (ui.view === "financeiro") renderFinanceiro();
  if (ui.view === "channels") renderChannels();
  if (ui.view === "bots") renderBots();
  if (ui.view === "config") renderConfig();
}

function updateChrome() {
  const [title, kicker] = pageTitles[ui.view];
  document.querySelector("#page-title").textContent = title;
  document.querySelector("#page-kicker").textContent = kicker;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === ui.view);
  });
  const assistant = clean(state.clinic.assistant) || "Assistente";
  const nameEl = document.querySelector("#assistant-name");
  if (nameEl) nameEl.textContent = assistant;
  const avatarEl = document.querySelector("#assistant-avatar");
  if (avatarEl) avatarEl.textContent = assistant[0]?.toUpperCase() || "·";
}

function renderDashboard() {
  const today = todayISO();
  const newLeads = state.leads.filter((lead) => lead.createdAt === today || lead.stage === "entrada").length;
  const todayAppointments = state.appointments.filter((appt) => appt.date === today && appt.status !== "Cancelado");
  const pending = state.leads.filter((lead) => lead.followUp <= today && lead.stage !== "fechado").length;
  const paid = state.transactions.filter((tx) => tx.status === "Pago").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const wonLeads = state.leads.filter((lead) => lead.stage === "fechado").length;
  const conversion = state.leads.length ? Math.round((wonLeads / state.leads.length) * 100) : 0;
  const dbLeads = state.leads.filter((lead) => lead.dbId).length;
  const dbAppointments = state.appointments.filter((appt) => appt.dbId).length;
  const pendingPayments = state.transactions.filter((tx) => tx.status !== "Pago");
  const proposalCount = state.leads.filter((lead) => lead.stage === "proposta").length;
  const patientCount = new Set(
    state.appointments
      .filter((appt) => appt.status !== "Cancelado")
      .map((appt) => appt.patientName)
      .concat(state.leads.filter((lead) => lead.stage === "fechado").map((lead) => lead.name)),
  ).size;
  const pipelineValue = state.leads
    .filter((lead) => lead.stage !== "fechado")
    .reduce((sum, lead) => sum + Number(lead.value || 0), 0);

  appRoot().innerHTML = `
    ${renderOpsHero({ dbLeads, dbAppointments, patientCount, pending, pipelineValue })}

    <div class="kpi-grid">
      ${kpi("Leads em aberto", newLeads, "entrada e novos", "◆")}
      ${kpi("Consultas hoje", todayAppointments.length, "sem conflitos ativos", "◧")}
      ${kpi("Recebido", formatMoney(paid), "lancamentos pagos", "◈")}
      ${kpi("Conversao", `${conversion}%`, "leads fechados", "↗")}
    </div>

    <div class="dashboard-grid">
      <section class="panel priority-panel">
        <div class="section-header">
          <h2>Fila operacional</h2>
          <span class="chip blue">${pending + todayAppointments.length} itens</span>
        </div>
        <div class="queue-list">
          ${renderQueueItem("Responder hoje", pending, "Follow-ups vencidos e conversas aguardando retorno", "inbox")}
          ${renderQueueItem("Consultas do dia", todayAppointments.length, "Confirmacao, recepcao e pagamentos", "agenda")}
          ${renderQueueItem("Propostas abertas", proposalCount, "Orcamentos e decisao comercial", "financeiro")}
        </div>
      </section>

      <section class="panel module-panel">
        <div class="section-header">
          <h2>Modulos ativos</h2>
          <span class="chip green">Prisma</span>
        </div>
        <div class="module-grid">
          ${renderModuleCard("Pacientes", patientCount, "cadastro administrativo", "●")}
          ${renderModuleCard("Orcamentos", proposalCount, "propostas em negociacao", "◈")}
          ${renderModuleCard("Tarefas", pending, "follow-ups para executar", "✓")}
          ${renderModuleCard("Banco", dbLeads + dbAppointments, "registros sincronizados", "↻")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Proximos atendimentos</h2>
          <button class="secondary-button" type="button" data-action="open-appointment">
            <span aria-hidden="true">＋</span>
            Agendar
          </button>
        </div>
        <div class="appointment-list">
          ${nextAppointments().map(renderAppointmentItem).join("") || emptyState("Nenhum atendimento futuro.")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Automacoes recentes</h2>
          <span class="chip primary">${escapeHtml(state.clinic.assistant)} ativa</span>
        </div>
        <div class="timeline">
          ${state.activity.map(renderActivity).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Follow-ups</h2>
          <small>${pending} vencendo hoje</small>
        </div>
        <div class="follow-list">
          ${followUps().map(renderFollowUp).join("") || emptyState("Nenhum follow-up pendente.")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Funil resumido</h2>
          <button class="ghost-button" type="button" data-view="leads">Abrir funil</button>
        </div>
        <div class="bar-list">
          ${stages.map(renderStageBar).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderOpsHero({ dbLeads, dbAppointments, patientCount, pending, pipelineValue }) {
  const dbTotal = dbLeads + dbAppointments;
  const syncLabel = dbTotal ? `${dbTotal} registros no banco` : "modo local pronto";
  return `
    <section class="ops-hero">
      <div class="ops-hero-main">
        <div class="eyebrow">CRM medico-operacional</div>
        <h2>Central de atendimento, agenda e receita</h2>
        <p>Acompanhe a fila comercial, pacientes administrativos, orcamentos, tarefas e proximos atendimentos em uma unica tela.</p>
        <div class="status-row">
          <span class="chip primary">${escapeHtml(syncLabel)}</span>
          <span class="chip green">LGPD administrativo</span>
          <span class="chip amber">sem prontuario</span>
        </div>
      </div>
      <div class="ops-scoreboard">
        <div>
          <span>Pipeline aberto</span>
          <strong>${formatMoney(pipelineValue)}</strong>
        </div>
        <div>
          <span>Pacientes</span>
          <strong>${patientCount}</strong>
        </div>
        <div>
          <span>Tarefas hoje</span>
          <strong>${pending}</strong>
        </div>
      </div>
    </section>
  `;
}

function renderQueueItem(title, count, note, view) {
  return `
    <button class="queue-item" type="button" data-view="${view}">
      <span class="queue-count">${count}</span>
      <span class="queue-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(note)}</small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  `;
}

function renderModuleCard(title, value, note, icon) {
  return `
    <article class="module-card">
      <span class="module-icon" aria-hidden="true">${icon}</span>
      <strong>${escapeHtml(title)}</strong>
      <span class="module-value">${value}</span>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

// Inbox DB-first: le conversas + mensagens + classificacao do Postgres (/api/inbox).
function renderInbox() {
  const box = ui.inbox;
  if (box.list === null) {
    if (!box.loading) loadInboxData();
    appRoot().innerHTML = `<div class="data-table-wrap" style="padding:24px">Carregando inbox do banco...</div>`;
    return;
  }
  const list = filteredDbInbox();
  const selected = box.list.find((c) => c.id === box.selectedId) || list[0] || null;
  const count = (st) => box.list.filter((c) => c.status === st).length;

  appRoot().innerHTML = `
    <div class="ops-strip">
      ${renderOpsMetric("Abertas", count("OPEN"), "conversas em andamento")}
      ${renderOpsMetric("Aguardando paciente", count("WAITING_PATIENT"), "sem resposta recente")}
      ${renderOpsMetric("Com atendente", count("WAITING_TEAM"), "handoff / humano")}
      ${renderOpsMetric("Total", box.list.length, "conversas no banco")}
    </div>
    <div class="inbox-layout">
      <section class="inbox-list" aria-label="Conversas">
        <div class="list-search">
          <input id="inbox-search" class="search-input" type="search" value="${escapeHtml(ui.inboxSearch)}" placeholder="Buscar conversa" />
          ${renderInboxFilters()}
        </div>
        <div class="conversation-list">
          ${list.map((c) => renderDbConversationItem(c, selected)).join("") || emptyState("Nenhuma conversa no banco. Mensagens do webhook aparecem aqui.")}
        </div>
      </section>
      <section class="chat-pane" aria-label="Conversa selecionada">
        ${selected ? renderDbChat(selected) : emptyState("Selecione uma conversa.")}
      </section>
      <aside class="lead-pane">
        ${selected ? renderDbConversationSide(selected) : ""}
      </aside>
    </div>
  `;
  requestAnimationFrame(() => {
    const messages = document.querySelector("#messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

function inboxConvName(c) {
  return c.lead?.name || c.patient?.name || `${channelLabel(c.channel) || c.channel || ""} ${c.externalId || ""}`.trim();
}

function filteredDbInbox() {
  const q = (ui.inboxSearch || "").trim().toLowerCase();
  const f = ui.inboxFilters;
  let list = ui.inbox.list || [];
  if (f.status) list = list.filter((c) => c.status === f.status);
  if (f.channel) list = list.filter((c) => c.channel === f.channel);
  if (f.assignedToId) list = list.filter((c) => (c.assignedToId || c.assignedTo?.id) === f.assignedToId);
  if (q) list = list.filter((c) => `${inboxConvName(c)} ${c.externalId || ""} ${c.classification?.crm?.pipeline_funil || ""}`.toLowerCase().includes(q));
  return list;
}

function renderInboxFilters() {
  const users = ui.users || [];
  const f = ui.inboxFilters;
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${escapeHtml(label)}</option>`;
  return `
    <div class="inbox-filters">
      <select id="inbox-filter-status">
        ${opt("", "Status: todos", f.status)}
        ${["OPEN", "WAITING_PATIENT", "WAITING_TEAM", "RESOLVED"].map((s) => opt(s, conversationStatusLabel(s), f.status)).join("")}
      </select>
      <select id="inbox-filter-channel">
        ${opt("", "Canal: todos", f.channel)}
        ${["whatsapp", "instagram"].map((c) => opt(c, channelLabel(c) || c, f.channel)).join("")}
      </select>
      <select id="inbox-filter-assigned">
        ${opt("", "Responsável: todos", f.assignedToId)}
        ${users.map((u) => opt(u.id, u.name, f.assignedToId)).join("")}
      </select>
    </div>`;
}

async function loadInboxData() {
  ui.inbox.loading = true;
  try {
    const [response] = await Promise.all([apiFetch("/api/inbox", {}, false), ensureInboxRefs()]);
    if (!response.ok) { ui.inbox.list = []; return; }
    const payload = await response.json();
    ui.inbox.list = payload.data || [];
    if (!ui.inbox.selectedId && ui.inbox.list[0]) ui.inbox.selectedId = ui.inbox.list[0].id;
    if (ui.inbox.selectedId) await Promise.all([loadInboxMessages(ui.inbox.selectedId), loadInboxActivities(ui.inbox.selectedId)]);
  } catch {
    ui.inbox.list = [];
  } finally {
    ui.inbox.loading = false;
    if (ui.view === "inbox") renderInbox();
  }
}

// Carrega usuarios e respostas rapidas uma vez (selects de atribuir/filtro/quick reply).
// Marca [] antes do fetch para evitar reentrada; preenche so em caso de sucesso.
async function ensureInboxRefs() {
  const jobs = [];
  if (ui.users === null) {
    ui.users = [];
    jobs.push(apiFetch("/api/users", {}, false).then(async (r) => { if (r.ok) ui.users = (await r.json()).data || []; }).catch(() => {}));
  }
  if (ui.quickReplies === null) {
    ui.quickReplies = [];
    jobs.push(apiFetch("/api/quick-replies?active=true", {}, false).then(async (r) => { if (r.ok) ui.quickReplies = (await r.json()).data || []; }).catch(() => {}));
  }
  await Promise.all(jobs);
}

async function loadInboxMessages(id) {
  try {
    const response = await apiFetch(`/api/conversations/${id}/messages`, {}, false);
    ui.inbox.messages = response.ok ? (await response.json()).data || [] : [];
  } catch {
    ui.inbox.messages = [];
  }
}

// source "conversation": atividades da conversa; "lead": timeline do lead.
async function loadInboxActivities(id, source = "conversation") {
  const path = source === "lead" ? `/api/leads/${id}/timeline` : `/api/activities?conversationId=${id}`;
  try {
    const response = await apiFetch(path, {}, false);
    ui.inbox.activities = response.ok ? (await response.json()).data || [] : [];
  } catch {
    ui.inbox.activities = [];
  }
}

async function selectInboxConversation(id) {
  ui.inbox.selectedId = id;
  await Promise.all([loadInboxMessages(id), loadInboxActivities(id)]);
  renderInbox();
}

// Recarrega a lista do banco preservando a conversa selecionada (apos uma escrita).
async function reloadInboxKeepingSelection(id) {
  if (id) ui.inbox.selectedId = id;
  ui.inbox.list = null;
  await loadInboxData();
}

function renderDbConversationItem(c, selected) {
  const k = c.classification?.crm;
  const isSel = selected && c.id === selected.id;
  return `
    <article class="conversation ${isSel ? "active" : ""}" data-action="select-conversation" data-id="${c.id}">
      <div class="avatar">${initials(inboxConvName(c))}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(inboxConvName(c))}</div>
        <div class="item-meta">${escapeHtml(k ? (PIPELINE_LABEL[k.pipeline_funil] || k.pipeline_funil) : channelLabel(c.channel) || c.channel)}</div>
      </div>
      ${k?.precisa_humano_agora ? '<span class="chip red">Humano</span>' : k ? `<span class="chip ${PRIORITY_TONE[k.prioridade] || "primary"}">${escapeHtml(k.prioridade)}</span>` : ""}
    </article>`;
}

function renderDbMessage(m) {
  const from = m.direction === "INBOUND" ? "patient" : m.direction === "SYSTEM" ? "system" : "assistant";
  const by = m.metadata?.automatedBy;
  const who = from === "assistant" ? state.clinic.assistant + (by ? ` · ${by.startsWith("OpenAI") ? "IA" : "Bot"}` : "") : from === "patient" ? "" : "";
  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return `<div class="message ${from}">${who ? `<span class="who">${escapeHtml(who)}</span>` : ""}${escapeHtml(m.text)}<time>${time}</time></div>`;
}

function renderDbChat(c) {
  return `
    <div class="chat-header">
      <div class="avatar">${initials(inboxConvName(c))}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(inboxConvName(c))}</div>
        <div class="item-meta">${escapeHtml(c.externalId || "")} · ${escapeHtml(conversationStatusLabel(c.status))}</div>
      </div>
      <div class="chat-header-spacer"></div>
      <span class="chip ${c.channel === "instagram" ? "violet" : "green"}">${escapeHtml(channelLabel(c.channel) || c.channel)}</span>
      <button class="secondary-button" type="button" data-action="inbox-refresh">Atualizar</button>
    </div>
    <div class="messages" id="messages">
      ${(ui.inbox.messages || []).map(renderDbMessage).join("") || emptyState("Sem mensagens.")}
    </div>
    ${c.channel === "whatsapp" ? renderWhatsAppComposerTools() : ""}
    <div class="composer">
      <div class="composer-line patient-composer">
        <textarea id="inbox-receive-input" placeholder="Simular mensagem recebida do paciente (classifica + agente)"></textarea>
        <button class="secondary-button" type="button" data-action="inbox-receive" data-id="${c.id}">
          <span aria-hidden="true">↙</span> Receber
        </button>
      </div>
      ${
        (ui.quickReplies || []).length
          ? `<div class="composer-line">
              <select id="inbox-quick-reply" class="quick-reply-select">
                <option value="">Resposta rápida…</option>
                ${(ui.quickReplies || []).map((q) => `<option value="${escapeHtml(q.id)}">${escapeHtml(q.title || q.shortcut)}</option>`).join("")}
              </select>
            </div>`
          : ""
      }
      <div class="composer-line">
        <textarea id="inbox-reply-input" placeholder="${escapeHtml(replyPlaceholderForMode())}"></textarea>
        <button class="primary-button" type="button" data-action="inbox-reply" data-id="${c.id}">
          <span aria-hidden="true">➤</span> Enviar
        </button>
      </div>
    </div>`;
}

function renderWhatsAppComposerTools() {
  const buttonLabels = "Agendar consulta | Ver valores | Falar com atendente";
  const listRows = "consulta|Consulta dermatologica|Avaliar queixa e indicar conduta\nretorno|Retorno|Acompanhamento administrativo\nteleconsulta|Teleconsulta|Atendimento online";
  return `
    <div class="whatsapp-tools">
      <div class="segmented compact" aria-label="Tipo de mensagem WhatsApp">
        ${["text", "buttons", "list", "template"]
          .map((mode) => `<button type="button" class="${ui.waMode === mode ? "active" : ""}" data-action="set-wa-mode" data-mode="${mode}">${waModeLabel(mode)}</button>`)
          .join("")}
      </div>
      ${
        ui.waMode === "buttons"
          ? `<div class="wa-grid">
              <label>Botões<input id="wa-button-labels" value="${escapeHtml(buttonLabels)}" /></label>
              <label>Rodapé<input id="wa-footer" value="Clinica QARA" /></label>
            </div>`
          : ""
      }
      ${
        ui.waMode === "list"
          ? `<div class="wa-grid">
              <label>Texto do botão<input id="wa-list-button" value="Ver opcoes" maxlength="20" /></label>
              <label>Seção<input id="wa-list-section" value="Atendimento" maxlength="24" /></label>
              <label class="full">Linhas da lista<textarea id="wa-list-rows">${escapeHtml(listRows)}</textarea></label>
            </div>`
          : ""
      }
      ${
        ui.waMode === "template"
          ? `<div class="wa-grid">
              <label>Modelo
                <select id="wa-template-select">
                  ${(state.whatsappTemplates || []).map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.name)} · ${escapeHtml(tpl.status)}</option>`).join("")}
                </select>
              </label>
              <label>Idioma<input id="wa-template-lang" value="${escapeHtml((state.whatsappTemplates || [])[0]?.language || "pt_BR")}" /></label>
              <label class="full">Parametros do corpo<textarea id="wa-template-params" placeholder="Um parametro por linha para {{1}}, {{2}}, ..."></textarea></label>
            </div>`
          : ""
      }
    </div>
  `;
}

function waModeLabel(mode) {
  return { text: "Texto", buttons: "Botões", list: "Lista", template: "Modelo" }[mode] || mode;
}

function replyPlaceholderForMode() {
  if (ui.waMode === "buttons") return "Texto principal acima dos botões";
  if (ui.waMode === "list") return "Texto principal acima da lista";
  if (ui.waMode === "template") return "Opcional: anotação interna. O envio usa o nome do modelo";
  return "Responder (registra no banco e envia pelo canal quando configurado)";
}

function renderDbConversationSide(c) {
  const k = c.classification?.crm;
  const users = ui.users || [];
  const tags = (c.tags || []).map((t) => t.tag?.name).filter(Boolean);
  const assignedId = c.assignedToId || c.assignedTo?.id || "";
  return `
    <div class="lead-summary">
      <h3>${escapeHtml(inboxConvName(c))}</h3>
      <p class="muted">${escapeHtml(c.externalId || "")}</p>

      <div class="side-block">
        <div class="side-label">Responsável</div>
        <select id="inbox-assign-select" data-id="${c.id}" class="side-select">
          <option value="">— Sem responsável —</option>
          ${users.map((u) => `<option value="${u.id}" ${assignedId === u.id ? "selected" : ""}>${escapeHtml(u.name)}</option>`).join("")}
        </select>
        <div class="side-label">Status</div>
        <select id="inbox-status-select" data-id="${c.id}" class="side-select">
          ${["OPEN", "WAITING_PATIENT", "WAITING_TEAM", "RESOLVED"].map((s) => `<option value="${s}" ${c.status === s ? "selected" : ""}>${escapeHtml(conversationStatusLabel(s))}</option>`).join("")}
        </select>
        <div class="side-label">Tags</div>
        <div class="tag-chips">${tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("") || '<span class="muted">Sem tags</span>'}</div>
        <div class="tag-add">
          <input id="inbox-tag-input" placeholder="Nova tag" />
          <button class="secondary-button" type="button" data-action="inbox-add-tag" data-id="${c.id}">+</button>
        </div>
      </div>

      ${
        k
          ? `<div class="side-block">
              <div class="side-label">Pipeline</div><div>${escapeHtml(PIPELINE_LABEL[k.pipeline_funil] || k.pipeline_funil)}</div>
              <div class="side-label">Prioridade</div><div><span class="chip ${PRIORITY_TONE[k.prioridade] || "primary"}">${escapeHtml(k.prioridade || "-")}</span> <span class="chip ${TEMP_TONE[k.temperatura] || "amber"}">${escapeHtml(k.temperatura || "-")}</span></div>
              <div class="side-label">Médico sugerido</div><div>${escapeHtml(k.medico_indicado || "-")}</div>
              <div class="side-label">Próxima ação</div><div>${escapeHtml(k.proxima_acao || "-")}</div>
            </div>`
          : '<p class="muted">Sem classificação ainda.</p>'
      }

      ${
        c.lead
          ? `<div class="side-block">
              <div class="side-label">Lead</div>
              <div>${escapeHtml(c.lead.name || "-")}${c.lead.phone ? ` · ${escapeHtml(c.lead.phone)}` : ""}</div>
              <div class="muted">Estágio: ${escapeHtml(c.lead.stage || "-")}</div>
              <div class="button-row" style="margin-top:8px">
                <button class="ghost-button" type="button" data-action="inbox-lead-timeline" data-id="${c.lead.id}">Timeline</button>
                <button class="ghost-button" type="button" data-action="inbox-convert-patient" data-id="${c.lead.id}">Converter em paciente</button>
              </div>
            </div>`
          : ""
      }

      <div class="side-block">
        <div class="side-label">Notas & atividades</div>
        <div class="activity-list">${(ui.inbox.activities || []).map(renderActivityItem).join("") || '<p class="muted">Sem atividades.</p>'}</div>
        <div class="note-add">
          <textarea id="inbox-note-input" placeholder="Nota interna"></textarea>
          <button class="secondary-button" type="button" data-action="inbox-add-note" data-id="${c.id}">Adicionar nota</button>
        </div>
      </div>

      <div class="button-row" style="margin-top:14px">
        <button class="secondary-button" type="button" data-action="inbox-new-task" data-id="${c.id}">Criar tarefa</button>
        <button class="secondary-button" type="button" data-action="inbox-resolve" data-id="${c.id}">Resolver</button>
      </div>
    </div>`;
}

function renderActivityItem(a) {
  const time = a.createdAt ? new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const title = a.title || a.type || "Atividade";
  return `<div class="activity-item">
    <div class="activity-head"><span class="activity-type">${escapeHtml(title)}</span><time>${escapeHtml(time)}</time></div>
    ${a.description ? `<div class="activity-desc">${escapeHtml(a.description)}</div>` : ""}
  </div>`;
}

function conversationStatusLabel(s) {
  return { OPEN: "Aberta", WAITING_PATIENT: "Aguardando paciente", WAITING_TEAM: "Com atendente", RESOLVED: "Resolvida", ARCHIVED: "Arquivada" }[s] || s;
}

async function sendInboxReply(id) {
  const input = document.querySelector("#inbox-reply-input");
  const text = clean(input?.value || "");
  const conversation = (ui.inbox.list || []).find((item) => item.id === id);
  if (!conversation) return toast("Conversa nao encontrada.");
  const payload = buildInboxMessagePayload(conversation, text);
  if (!payload) return;
  try {
    const response = await apiFetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false);
    const result = await response.json().catch(() => null);
    const providerError = result?.provider?.error || result?.error;
    if (!response.ok && providerError !== "whatsapp_not_configured" && providerError !== "instagram_not_configured") {
      throw new Error("send_failed");
    }
    if (input) input.value = "";
    await loadInboxMessages(id);
    ui.inbox.list = null;
    await loadInboxData();
    ui.inbox.selectedId = id;
    renderInbox();
    toast(result?.ok ? (ui.waMode === "text" ? "Resposta enviada." : "Mensagem WhatsApp enviada.") : "Mensagem registrada; canal externo nao configurado.");
  } catch {
    toast("Falha ao enviar resposta.");
  }
}

function buildInboxMessagePayload(conversation, text) {
  const base = {
    channel: conversation.channel,
    externalId: conversation.externalId,
    name: inboxConvName(conversation),
    text,
    messageType: conversation.channel === "whatsapp" ? ui.waMode : "text",
  };
  if (conversation.channel !== "whatsapp" || ui.waMode === "text") {
    if (!text) {
      toast("Digite a mensagem.");
      return null;
    }
    return base;
  }

  if (ui.waMode === "buttons") {
    const buttons = splitButtonLabels(document.querySelector("#wa-button-labels")?.value || "");
    if (!text || !buttons.length) {
      toast("Informe texto e pelo menos um botao.");
      return null;
    }
    return {
      ...base,
      whatsapp: {
        body: text,
        footer: clean(document.querySelector("#wa-footer")?.value || ""),
        buttons,
      },
    };
  }

  if (ui.waMode === "list") {
    const rows = parseWaListRows(document.querySelector("#wa-list-rows")?.value || "");
    if (!text || !rows.length) {
      toast("Informe texto e linhas da lista.");
      return null;
    }
    return {
      ...base,
      whatsapp: {
        body: text,
        buttonText: clean(document.querySelector("#wa-list-button")?.value || "Ver opcoes"),
        sections: [{ title: clean(document.querySelector("#wa-list-section")?.value || "Atendimento"), rows }],
      },
    };
  }

  if (ui.waMode === "template") {
    const template = getWhatsAppTemplate(document.querySelector("#wa-template-select")?.value);
    const templateName = clean(template?.templateName || "");
    if (!templateName) {
      toast("Escolha um modelo aprovado.");
      return null;
    }
    const params = (document.querySelector("#wa-template-params")?.value || "").split(/\r?\n/).map(clean).filter(Boolean);
    return {
      ...base,
      text: text || renderTemplatePreview(template, params),
      whatsapp: {
        templateName,
        languageCode: clean(document.querySelector("#wa-template-lang")?.value || template.language || "pt_BR"),
        bodyParams: params,
      },
    };
  }

  return base;
}

function splitButtonLabels(value) {
  return String(value || "")
    .split("|")
    .map((title, index) => ({ id: `btn_${index + 1}`, title: clean(title) }))
    .filter((button) => button.title)
    .slice(0, 3);
}

function parseWaListRows(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const [id, title, description] = line.split("|").map(clean);
      return { id: id || `row_${index + 1}`, title, description };
    })
    .filter((row) => row.title)
    .slice(0, 10);
}

// Simula mensagem recebida via webhook (gera classificacao + agente, igual produção).
async function receiveInbox(id) {
  const c = (ui.inbox.list || []).find((x) => x.id === id);
  const input = document.querySelector("#inbox-receive-input");
  const text = clean(input?.value || "");
  if (!c || !text) return;
  const payload =
    c.channel === "instagram"
      ? { object: "instagram", entry: [{ messaging: [{ sender: { id: c.externalId }, message: { text } }] }] }
      : { object: "whatsapp_business_account", entry: [{ changes: [{ value: { contacts: [{ wa_id: c.externalId, profile: { name: inboxConvName(c) } }], messages: [{ from: c.externalId, id: `sim-${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }] };
  try {
    await fetch("/webhooks/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    toast("Mensagem recebida — classificando...");
    setTimeout(async () => {
      ui.inbox.list = null;
      await loadInboxData();
    }, 1600);
  } catch {
    toast("Falha ao simular recebimento.");
  }
}

async function resolveInboxConversation(id) {
  try {
    await apiFetch(`/api/conversations/${id}/resolve`, { method: "POST" }, false);
    ui.inbox.list = null;
    renderInbox();
    toast("Conversa resolvida.");
  } catch {
    toast("Falha ao resolver.");
  }
}

async function assignInboxConversation(id, assignedToId) {
  const result = await dbWrite(`/api/conversations/${id}/assign`, "POST", { assignedToId: assignedToId || null });
  if (result === null) return toast("Falha ao atribuir responsável.");
  await reloadInboxKeepingSelection(id);
  toast("Responsável atualizado.");
}

async function setInboxStatus(id, status) {
  const result = await dbWrite(`/api/conversations/${id}`, "PATCH", { status });
  if (result === null) return toast("Falha ao mudar status.");
  await reloadInboxKeepingSelection(id);
  toast("Status atualizado.");
}

async function addInboxTag(id) {
  const input = document.querySelector("#inbox-tag-input");
  const name = clean(input?.value || "");
  if (!name) return toast("Digite uma tag.");
  const result = await dbWrite(`/api/conversations/${id}/tags`, "POST", { name });
  if (result === null) return toast("Falha ao adicionar tag.");
  await reloadInboxKeepingSelection(id);
  toast("Tag adicionada.");
}

async function addInboxNote(id) {
  const input = document.querySelector("#inbox-note-input");
  const text = clean(input?.value || "");
  if (!text) return toast("Digite a nota.");
  const result = await dbWrite(`/api/conversations/${id}/notes`, "POST", { text });
  if (result === null) return toast("Falha ao salvar nota.");
  await loadInboxActivities(id);
  renderInbox();
  toast("Nota adicionada.");
}

async function openLeadTimeline(leadId) {
  await loadInboxActivities(leadId, "lead");
  renderInbox();
}

async function convertInboxLead(leadId) {
  if (!window.confirm("Converter este lead em paciente?")) return;
  const result = await dbWrite(`/api/leads/${leadId}/convert-to-patient`, "POST", {});
  if (result === null) return toast("Falha ao converter.");
  await reloadInboxKeepingSelection(ui.inbox.selectedId);
  toast("Lead convertido em paciente.");
}

function insertQuickReply(id) {
  const qr = (ui.quickReplies || []).find((q) => q.id === id);
  const input = document.querySelector("#inbox-reply-input");
  if (!qr || !input) return;
  input.value = input.value ? `${input.value}\n${qr.content}` : qr.content;
  input.focus();
}

function openInboxTaskModal(conversationId) {
  const conversation = (ui.inbox.list || []).find((x) => x.id === conversationId);
  const users = ui.users || [];
  openModal(`
    <div class="modal-header">
      <h2>Nova tarefa</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="inbox-task" class="form-grid">
      <input type="hidden" name="leadId" value="${escapeHtml(conversation?.lead?.id || "")}" />
      <input type="hidden" name="patientId" value="${escapeHtml(conversation?.patient?.id || "")}" />
      <div class="field full">
        <label for="task-title">Título</label>
        <input id="task-title" name="title" required placeholder="Ligar para o paciente" />
      </div>
      <div class="field">
        <label for="task-due">Vencimento</label>
        <input id="task-due" name="dueAt" type="date" value="${todayISO()}" />
      </div>
      <div class="field">
        <label for="task-assignee">Responsável</label>
        <select id="task-assignee" name="assignedToId">
          <option value="">—</option>
          ${users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}
        </select>
      </div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">Criar tarefa</button>
      </div>
    </form>
  `);
}

async function createInboxTask(data) {
  const title = clean(data.title || "");
  if (!title) return toast("Informe o título da tarefa.");
  const body = {
    title,
    dueAt: data.dueAt || null,
    assignedToId: data.assignedToId || null,
    leadId: data.leadId || null,
    patientId: data.patientId || null,
  };
  const result = await dbWrite("/api/tasks", "POST", body);
  closeModal();
  if (result === null) return toast("Falha ao criar tarefa.");
  toast("Tarefa criada.");
}

// ---- Pacientes (view DB-native, sem espelho local) ----

function renderPatients() {
  const box = ui.patients;
  if (box.list === null) {
    if (!box.loading) loadPatients();
    appRoot().innerHTML = `<div class="data-table-wrap" style="padding:24px">Carregando pacientes do banco...</div>`;
    return;
  }
  const list = filteredPatients();
  const selected = box.list.find((p) => p.id === box.selectedId) || null;
  appRoot().innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input id="patient-search" class="search-input" type="search" value="${escapeHtml(box.search)}" placeholder="Buscar por nome ou telefone" />
      </div>
      <div class="toolbar-right">
        <button class="secondary-button" type="button" data-action="new-patient">
          <span aria-hidden="true">＋</span>
          Novo paciente
        </button>
      </div>
    </div>
    <div class="agenda-layout">
      <section aria-label="Pacientes">${renderPatientsTable(list)}</section>
      <aside class="lead-pane" aria-label="Detalhe do paciente">
        ${selected ? renderPatientDetail(selected) : emptyState("Selecione um paciente.")}
      </aside>
    </div>
  `;
}

function filteredPatients() {
  const q = (ui.patients.search || "").trim().toLowerCase();
  const list = ui.patients.list || [];
  if (!q) return list;
  return list.filter((p) => `${p.name || ""} ${p.phone || ""}`.toLowerCase().includes(q));
}

function renderPatientsTable(list) {
  if (!list.length) return emptyState("Nenhum paciente. Converta um lead no inbox ou cadastre um novo.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>CPF</th><th>LGPD</th><th>Criado</th></tr>
        </thead>
        <tbody>
          ${list
            .map(
              (p) => `
            <tr data-action="select-patient" data-id="${p.id}" style="cursor:pointer${p.id === ui.patients.selectedId ? ";background:var(--surface-2,#f1f5f9)" : ""}">
              <td><div class="cell-main"><span class="avatar sm">${initials(p.name)}</span>${escapeHtml(p.name)}</div></td>
              <td class="muted">${escapeHtml(p.phone || "-")}</td>
              <td class="muted">${escapeHtml(p.email || "-")}</td>
              <td class="muted">${escapeHtml(p.cpf || "-")}</td>
              <td>${p.lgpdConsent ? '<span class="chip green">Sim</span>' : '<span class="chip">Não</span>'}</td>
              <td class="muted">${escapeHtml(formatDate(p.createdAt))}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function patientField(label, value) {
  return `<div class="side-label">${escapeHtml(label)}</div><div>${escapeHtml(value || "—")}</div>`;
}

function renderPatientDetail(p) {
  const birth = p.birthDate ? formatDate(p.birthDate) : "";
  return `
    <div class="lead-summary">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="button-row" style="margin-top:8px">
        <button class="secondary-button" type="button" data-action="patient-edit" data-id="${p.id}">Editar</button>
      </div>
      <div class="side-block">
        ${patientField("Telefone", p.phone)}
        ${patientField("E-mail", p.email)}
        ${patientField("CPF", p.cpf)}
        ${patientField("Nascimento", birth)}
        ${patientField("Canal preferido", p.preferredChannel)}
        ${patientField("LGPD", p.lgpdConsent ? "Consentimento dado" : "Sem consentimento")}
        ${p.notesAdministrative ? `<div class="side-label">Notas</div><div>${escapeHtml(p.notesAdministrative)}</div>` : ""}
      </div>
      <div class="side-block">
        <div class="side-label">Histórico</div>
        <div class="activity-list">${(ui.patients.timeline || []).map(renderActivityItem).join("") || '<p class="muted">Sem atividades.</p>'}</div>
      </div>
    </div>`;
}

async function loadPatients() {
  ui.patients.loading = true;
  try {
    const response = await apiFetch("/api/patients?limit=200", {}, false);
    ui.patients.list = response.ok ? (await response.json()).data || [] : [];
  } catch {
    ui.patients.list = [];
  } finally {
    ui.patients.loading = false;
    if (ui.view === "pacientes") renderPatients();
  }
}

async function selectPatient(id) {
  ui.patients.selectedId = id;
  await loadPatientDetail(id);
  renderPatients();
}

async function loadPatientDetail(id) {
  try {
    const [detail, timeline] = await Promise.all([
      apiFetch(`/api/patients/${id}`, {}, false),
      apiFetch(`/api/patients/${id}/timeline`, {}, false),
    ]);
    ui.patients.selected = detail.ok ? (await detail.json()).data || null : null;
    ui.patients.timeline = timeline.ok ? (await timeline.json()).data || [] : [];
  } catch {
    ui.patients.timeline = [];
  }
}

function openPatientModal(id = "") {
  const p = id ? ui.patients.selected || {} : {};
  const v = (k) => escapeHtml(p[k] || "");
  openModal(`
    <div class="modal-header">
      <h2>${id ? "Editar paciente" : "Novo paciente"}</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="patient" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(id)}" />
      <div class="field full">
        <label for="patient-name">Nome</label>
        <input id="patient-name" name="name" required value="${v("name")}" />
      </div>
      <div class="field">
        <label for="patient-phone">Telefone</label>
        <input id="patient-phone" name="phone" value="${v("phone")}" />
      </div>
      <div class="field">
        <label for="patient-email">E-mail</label>
        <input id="patient-email" name="email" type="email" value="${v("email")}" />
      </div>
      <div class="field">
        <label for="patient-cpf">CPF</label>
        <input id="patient-cpf" name="cpf" value="${v("cpf")}" />
      </div>
      <div class="field">
        <label for="patient-birth">Nascimento</label>
        <input id="patient-birth" name="birthDate" type="date" value="${p.birthDate ? String(p.birthDate).slice(0, 10) : ""}" />
      </div>
      <div class="field">
        <label for="patient-channel">Canal preferido</label>
        <input id="patient-channel" name="preferredChannel" value="${v("preferredChannel")}" />
      </div>
      <div class="field">
        <label><input type="checkbox" name="lgpdConsent" ${p.lgpdConsent ? "checked" : ""} /> Consentimento LGPD</label>
      </div>
      <div class="field full">
        <label for="patient-notes">Notas administrativas</label>
        <textarea id="patient-notes" name="notesAdministrative" rows="3">${v("notesAdministrative")}</textarea>
      </div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">${id ? "Salvar" : "Cadastrar"}</button>
      </div>
    </form>
  `);
}

async function savePatient(data) {
  const name = clean(data.name || "");
  if (!name) return toast("Informe o nome do paciente.");
  const body = {
    name,
    phone: clean(data.phone || "") || null,
    email: clean(data.email || "") || null,
    cpf: clean(data.cpf || "") || null,
    birthDate: data.birthDate || null,
    preferredChannel: clean(data.preferredChannel || "") || null,
    lgpdConsent: data.lgpdConsent === "on" || data.lgpdConsent === true,
    notesAdministrative: clean(data.notesAdministrative || "") || null,
  };
  const id = clean(data.id || "");
  const result = id
    ? await dbWrite(`/api/patients/${id}`, "PATCH", body)
    : await dbWrite("/api/patients", "POST", body);
  closeModal();
  if (result === null) return toast("Falha ao salvar paciente.");
  toast(id ? "Paciente atualizado." : "Paciente cadastrado.");
  ui.patients.list = null;
  if (result.id) {
    ui.patients.selectedId = result.id;
    await loadPatientDetail(result.id);
  }
  await loadPatients();
}

function renderLeads() {
  const totalValue = filteredLeads().reduce((sum, lead) => sum + Number(lead.value || 0), 0);
  const hot = filteredLeads().filter((lead) => lead.stage === "proposta" || lead.stage === "agendado").length;
  appRoot().innerHTML = `
    <div class="record-board-head">
      <div>
        <div class="eyebrow">Pipeline comercial</div>
        <h2>Kanban, lista e detalhe do lead</h2>
      </div>
      <div class="segmented" aria-label="Visao do funil">
        <button type="button" class="${ui.funnelView === "clinico" ? "active" : ""}" data-action="set-funnel-view" data-mode="clinico">Pipelines clínicos</button>
        <button type="button" class="${ui.funnelView === "kanban" ? "active" : ""}" data-action="set-funnel-view" data-mode="kanban">Kanban comercial</button>
        <button type="button" class="${ui.funnelView === "table" ? "active" : ""}" data-action="set-funnel-view" data-mode="table">Lista</button>
        <button type="button" class="${ui.funnelView === "triage" ? "active" : ""}" data-action="set-funnel-view" data-mode="triage">Triagem</button>
      </div>
    </div>
    <div class="ops-strip">
      ${renderOpsMetric("Valor aberto", formatMoney(totalValue), "pipeline filtrado")}
      ${renderOpsMetric("Alta intencao", hot, "proposta ou agenda")}
      ${renderOpsMetric("Leads", filteredLeads().length, "registros encontrados")}
      ${renderOpsMetric("Campos", 8, "origem, etapa, valor, follow-up")}
    </div>
    <div class="toolbar">
      <div class="toolbar-left">
        <input id="lead-search" class="search-input" type="search" value="${escapeHtml(ui.leadSearch)}" placeholder="Buscar lead, origem ou interesse" />
      </div>
      <div class="toolbar-right">
        <button class="secondary-button" type="button" data-action="new-lead">
          <span aria-hidden="true">＋</span>
          Novo lead
        </button>
      </div>
    </div>
    ${
      ui.funnelView === "clinico"
        ? renderClinicalPipelines()
        : ui.funnelView === "triage"
        ? renderTriageView()
        : ui.funnelView === "table"
        ? renderLeadTable(filteredLeads())
        : renderFunnelKanban()
    }
  `;
}

const PRIORITY_TONE = { P1: "red", P2: "amber", P3: "blue", P4: "primary" };
const TEMP_TONE = { Quente: "red", Morno: "amber", Frio: "blue" };
const PIPELINE_LABEL = {
  "1-unhas": "Unhas / Onicologia", "2-cirurgia": "Cirurgia Dermatológica", "3-tricologia": "Tricologia / Cabelos",
  "4-inflamatorias": "Inflamatórias Crônicas", "5-dermatopediatria": "Dermatopediatria", "6-dermatologia-clinica": "Dermatologia Clínica",
  "7-podologia": "Podologia", "8-administrativo": "Administrativo", "9-reativacao": "Alta / Reativação",
};
const QARA_PIPELINES = Object.keys(PIPELINE_LABEL);

function triageRowsFromLeads() {
  return filteredLeads();
}

function leadClassification(lead) {
  const crm = lead.classification?.crm;
  if (crm?.pipeline_funil) return crm;

  const pipeline = inferLeadPipeline(lead);
  const score = Number(lead.score || 0);
  const temperatura = score >= 70 ? "Quente" : score >= 40 ? "Morno" : "Frio";
  const prioridade = score >= 85 ? "P1" : score >= 70 ? "P2" : score >= 40 ? "P3" : "P4";
  return {
    pipeline_funil: pipeline,
    etapa_funil: inferLeadEtapa(lead.stage),
    prioridade,
    temperatura,
    tags: [`pipeline:${pipeline.replace(/^\d-/, "")}`, `temp:${temperatura.toLowerCase()}`],
    precisa_humano_agora: prioridade === "P1",
    medico_indicado: "",
    proxima_acao: lead.nextStep || "Acompanhar lead",
  };
}

function inferLeadPipeline(lead) {
  const text = normalize(`${lead.interest || ""} ${lead.source || ""} ${lead.nextStep || ""}`);
  if (/unha|onic|micose|encravad/.test(text)) return "1-unhas";
  if (/cirurg|pinta|cisto|lipoma|biops|cancer|sinal/.test(text)) return "2-cirurgia";
  if (/cabelo|queda|alopecia|tricolog/.test(text)) return "3-tricologia";
  if (/psoriase|dermatite|hidradenite|autoimun|inflamator/.test(text)) return "4-inflamatorias";
  if (/crianca|infantil|filha|filho|pediatr/.test(text)) return "5-dermatopediatria";
  if (/podolog|pe|pes/.test(text)) return "7-podologia";
  if (/convenio|endereco|horario|valor|preco|pagamento/.test(text)) return "8-administrativo";
  if (lead.stage === "fechado") return "9-reativacao";
  return "6-dermatologia-clinica";
}

function inferLeadEtapa(stageId) {
  return {
    entrada: "novo-lead",
    qualificacao: "qualificado",
    proposta: "horario-oferecido",
    agendado: "agendado",
    fechado: "atendido",
  }[stageId] || "novo-lead";
}

function triageFiltered() {
  const f = ui.triageFilter;
  return triageRowsFromLeads().filter((lead) => {
    const k = leadClassification(lead);
    return (
      (!f.pipeline || k.pipeline_funil === f.pipeline) &&
      (!f.prioridade || k.prioridade === f.prioridade) &&
      (!f.temperatura || k.temperatura === f.temperatura)
    );
  });
}

function renderTriageView() {
  const rows = triageFiltered();
  const opt = (v, sel) => `<option value="${escapeHtml(v)}" ${v === sel ? "selected" : ""}>${escapeHtml(v || "Todos")}</option>`;
  return `
    <div class="triage-filters">
      <select id="triage-pipeline"><option value="">Todos</option>${QARA_PIPELINES.map((p) => `<option value="${p}" ${p === ui.triageFilter.pipeline ? "selected" : ""}>${escapeHtml(PIPELINE_LABEL[p])}</option>`).join("")}</select>
      <select id="triage-prioridade">${["", "P1", "P2", "P3", "P4"].map((p) => opt(p, ui.triageFilter.prioridade)).join("")}</select>
      <select id="triage-temperatura">${["", "Quente", "Morno", "Frio"].map((p) => opt(p, ui.triageFilter.temperatura)).join("")}</select>
      <span class="muted">${rows.length} lead(s)</span>
    </div>
    ${
      rows.length
        ? `<div class="data-table-wrap"><table class="data-table"><thead><tr>
            <th>Lead</th><th>Pipeline</th><th>Prioridade</th><th>Temperatura</th><th class="num">Score</th><th>Tags</th>
          </tr></thead><tbody>
          ${rows
            .map((lead) => {
              const k = leadClassification(lead);
              return `<tr>
                <td><div class="cell-main"><span class="avatar sm">${initials(lead.name)}</span>${escapeHtml(lead.name)}</div></td>
                <td>${escapeHtml(PIPELINE_LABEL[k.pipeline_funil] || k.pipeline_funil || "-")}</td>
                <td><span class="chip ${PRIORITY_TONE[k.prioridade] || "primary"}">${escapeHtml(k.prioridade || "-")}</span>${k.precisa_humano_agora ? ' <span class="chip red">Humano</span>' : ""}</td>
                <td><span class="chip ${TEMP_TONE[k.temperatura] || "amber"}">${escapeHtml(k.temperatura || "-")}</span></td>
                <td class="num"><span class="chip ${scoreTone(lead.score)}">${lead.score || 0}</span></td>
                <td class="muted">${(k.tags || []).slice(0, 4).map((t) => escapeHtml(t)).join(", ")}</td>
              </tr>`;
            })
            .join("")}
          </tbody></table></div>`
        : emptyState("Nenhum lead encontrado para os filtros atuais.")
    }
  `;
}

const ETAPAS = ["novo-lead", "qualificado", "horario-oferecido", "agendado", "confirmado", "atendido", "reagendado", "perdido", "alta-manutencao"];
const ETAPA_LABEL = {
  "novo-lead": "Novo lead", qualificado: "Qualificado", "horario-oferecido": "Horário oferecido", agendado: "Agendado",
  confirmado: "Confirmado", atendido: "Atendido", reagendado: "Reagendado", perdido: "Perdido", "alta-manutencao": "Alta / Manutenção",
};

// Funil clínico: colunas = etapas do classificador, cards = leads do pipeline selecionado.
function renderClinicalPipelines() {
  const rows = triageRowsFromLeads();
  const countByPipe = (p) => rows.filter((lead) => leadClassification(lead).pipeline_funil === p).length;
  const selected = ui.clinicalPipeline;
  const inPipe = rows.filter((lead) => leadClassification(lead).pipeline_funil === selected);

  const tabs = QARA_PIPELINES.map((p) => {
    const n = countByPipe(p);
    return `<button type="button" class="chip ${p === selected ? "primary" : ""}" data-action="set-clinical-pipeline" data-id="${p}">${escapeHtml(PIPELINE_LABEL[p])}${n ? ` <strong>${n}</strong>` : ""}</button>`;
  }).join("");

  const columns = ETAPAS.map((etapa) => {
    const cards = inPipe.filter((lead) => (leadClassification(lead).etapa_funil || "novo-lead") === etapa);
    return `
      <div class="pipeline-col">
        <header><span>${escapeHtml(ETAPA_LABEL[etapa])}</span><span class="count">${cards.length}</span></header>
        ${cards.map(renderClinicalCard).join("") || `<p class="muted" style="padding:8px 4px">—</p>`}
      </div>`;
  }).join("");

  return `
    <div class="pipeline-tabs">${tabs}</div>
    <section class="pipeline" aria-label="Pipeline clínico: ${escapeHtml(PIPELINE_LABEL[selected])}">${columns}</section>
  `;
}

function renderClinicalCard(c) {
  const k = leadClassification(c);
  const name = c.name;
  return `
    <article class="lead-card" data-action="select-lead" data-id="${c.id}">
      <div class="cell-main"><span class="avatar sm">${initials(name)}</span><strong>${escapeHtml(name)}</strong></div>
      <div class="card-chips">
        <span class="chip ${PRIORITY_TONE[k.prioridade] || "primary"}">${escapeHtml(k.prioridade || "-")}</span>
        <span class="chip ${TEMP_TONE[k.temperatura] || "amber"}">${escapeHtml(k.temperatura || "-")}</span>
        <span class="chip ${scoreTone(c.score)}">Score ${c.score || 0}</span>
        ${k.precisa_humano_agora ? '<span class="chip red">Humano</span>' : ""}
      </div>
      ${k.medico_indicado && k.medico_indicado !== "A definir" ? `<p class="muted">${escapeHtml(k.medico_indicado)}</p>` : ""}
      ${k.proxima_acao ? `<p class="card-next">→ ${escapeHtml(k.proxima_acao)}</p>` : ""}
    </article>`;
}

function renderLeadTable(leads) {
  if (!leads.length) return emptyState("Nenhum lead encontrado.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nome</th><th>Telefone</th><th>Origem</th><th>Interesse</th><th>Etapa</th><th class="num">Score</th><th class="num">Valor</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${leads
            .map(
              (lead) => `
            <tr>
              <td><div class="cell-main"><span class="avatar sm">${initials(lead.name)}</span>${escapeHtml(lead.name)}</div></td>
              <td class="muted">${escapeHtml(lead.phone || "-")}</td>
              <td>${escapeHtml(lead.source || "-")}</td>
              <td class="muted">${escapeHtml(lead.interest || "-")}</td>
              <td><span class="chip ${stageTone(lead.stage)}">${escapeHtml(stageLabel(lead.stage))}</span></td>
              <td class="num"><span class="chip ${scoreTone(lead.score)}">${lead.score || 0}</span></td>
              <td class="num"><strong>${formatMoney(lead.value)}</strong></td>
              <td><button class="link-button" type="button" data-action="select-lead" data-id="${lead.id}">Detalhe →</button></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOperations() {
  if (!ui.ops.loading && !ui.ops.briefing && !ui.ops.error) loadOperations();
  if (ui.ops.loading && !ui.ops.briefing) {
    appRoot().innerHTML = `<div class="data-table-wrap" style="padding:24px">Carregando operacao...</div>`;
    return;
  }

  const briefing = ui.ops.briefing || {};
  const pipeline = ui.ops.pipeline || {};
  const followups = ui.ops.followups || { counts: {}, overdue: [], today: [], upcoming: [], unscheduled: [] };
  const hotLeads = briefing.hotLeads || [];
  const highScore = pipeline.highScoreWithoutAppointment || [];

  appRoot().innerHTML = `
    <div class="ops-strip">
      ${renderOpsMetric("Follow-ups atrasados", followups.counts?.overdue || 0, "tarefas vencidas")}
      ${renderOpsMetric("Para hoje", followups.counts?.today || 0, "execucao do dia")}
      ${renderOpsMetric("Leads quentes", hotLeads.length, "score 70+ ou HOT")}
      ${renderOpsMetric("Sem consulta", highScore.length, "score alto sem agenda")}
    </div>

    <div class="config-grid">
      <section class="panel">
        <div class="section-header">
          <h2>Briefing diario</h2>
          <button class="ghost-button" type="button" data-action="ops-refresh">Atualizar</button>
        </div>
        ${ui.ops.error ? `<div class="empty-state">${escapeHtml(ui.ops.error)}</div>` : renderPriorityTable(briefing.priorities || [])}
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Webhook universal</h2>
          <button class="secondary-button" type="button" data-action="ops-copy-webhook">Copiar URL</button>
        </div>
        <div class="setup-list">
          ${renderSetupItem("Endpoint", true, `${window.location.origin}/api/webhook`)}
          ${renderSetupItem("Segredo", true, "LEAD_WEBHOOK_SECRET")}
          ${renderSetupItem("Campos aceitos", true, "nome, telefone, email, origem, interesse, mensagem")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>CSV</h2>
          <span class="chip primary">leads</span>
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" data-action="ops-export-csv" data-type="leads">Exportar leads</button>
          <button class="secondary-button" type="button" data-action="ops-import-csv">Importar leads</button>
          <button class="secondary-button" type="button" data-action="ops-export-csv" data-type="appointments">Exportar agenda</button>
        </div>
        <input id="ops-csv-file" type="file" accept=".csv,text/csv" hidden />
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Score e pipeline</h2>
          <button class="secondary-button" type="button" data-action="ops-recalculate-score">Recalcular scores</button>
        </div>
        ${renderPipelineTable(pipeline.stages || [])}
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Follow-ups</h2>
          <span class="chip amber">${(followups.counts?.overdue || 0) + (followups.counts?.today || 0)} urgentes</span>
        </div>
        ${renderFollowupTable([...(followups.overdue || []), ...(followups.today || []), ...(followups.upcoming || [])].slice(0, 10))}
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Leads de alta intencao</h2>
          <span class="chip green">${highScore.length}</span>
        </div>
        ${renderHighScoreTable(highScore)}
      </section>
    </div>
  `;
}

function renderPriorityTable(items) {
  if (!items.length) return emptyState("Sem prioridade critica no briefing.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Tipo</th><th>Item</th><th>Lead</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><span class="chip ${item.type === "lead_quente" ? "green" : "amber"}">${escapeHtml(item.type || "-")}</span></td>
              <td>${escapeHtml(item.title || "-")}</td>
              <td class="muted">${escapeHtml(item.lead?.name || "-")}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPipelineTable(stagesRows) {
  if (!stagesRows.length) return emptyState("Sem dados de funil no banco.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Etapa</th><th class="num">Leads</th><th class="num">Valor</th></tr></thead>
        <tbody>
          ${stagesRows
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(row.stage)}</td>
              <td class="num">${row.total || 0}</td>
              <td class="num"><strong>${formatMoney(row.estimatedValue || 0)}</strong></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFollowupTable(tasks) {
  if (!tasks.length) return emptyState("Nenhum follow-up aberto.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Tarefa</th><th>Lead/Paciente</th><th>Vencimento</th></tr></thead>
        <tbody>
          ${tasks
            .map(
              (task) => `
            <tr>
              <td>${escapeHtml(task.title || "-")}</td>
              <td class="muted">${escapeHtml(task.lead?.name || task.patient?.name || "-")}</td>
              <td>${task.dueAt ? escapeHtml(formatDateTime(task.dueAt)) : "-"}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHighScoreTable(leads) {
  if (!leads.length) return emptyState("Nenhum lead score 70+ sem consulta.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Lead</th><th>Interesse</th><th class="num">Score</th></tr></thead>
        <tbody>
          ${leads
            .map(
              (lead) => `
            <tr>
              <td>${escapeHtml(lead.name || "-")}</td>
              <td class="muted">${escapeHtml(lead.interest || "-")}</td>
              <td class="num"><span class="chip ${scoreTone(lead.score)}">${lead.score || 0}</span></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAgenda() {
  const appointments = state.appointments
    .filter((appt) => appt.date === ui.agendaDate)
    .sort((a, b) => a.time.localeCompare(b.time));
  const conflicts = countAgendaConflicts(appointments);
  // Só profissionais com atendimento no dia viram coluna; sem nenhum, mostra todos (grade vazia honesta).
  const activePros = professionals.filter((name) => appointments.some((a) => a.professional === name));
  const board = activePros.length ? activePros : professionals;

  appRoot().innerHTML = `
    <div class="ops-strip">
      ${renderOpsMetric("Atendimentos", appointments.length, "no dia")}
      ${renderOpsMetric("Profissionais", board.length, "com agenda no dia")}
      ${renderOpsMetric("Livres", freeSlotsForDate(ui.agendaDate), "slots disponiveis")}
      ${renderOpsMetric("Conflitos", conflicts, "mesmo profissional/horario")}
    </div>
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="field-inline">
          <label for="agenda-date">Data</label>
          <input id="agenda-date" type="date" value="${ui.agendaDate}" />
        </div>
      </div>
      <div class="toolbar-right">
        <button class="primary-button" type="button" data-action="open-appointment">
          <span aria-hidden="true">＋</span>
          Agendar
        </button>
      </div>
    </div>
    <section class="panel">
      <div class="section-header">
        <h2>Agenda do dia</h2>
        <small>${formatDate(ui.agendaDate)} · ${appointments.length} atendimento(s)</small>
      </div>
      ${
        appointments.length
          ? `<div class="agenda-board">${board.map((name) => renderProfessionalColumn(name, appointments.filter((a) => a.professional === name))).join("")}</div>`
          : emptyState("Agenda livre nesta data.")
      }
    </section>
  `;
}

// Coluna por profissional: cabeçalho + pílulas ordenadas por horário.
function renderProfessionalColumn(name, appts) {
  return `
    <div class="agenda-col">
      <header><span class="avatar sm">${initials(name)}</span><div><strong>${escapeHtml(shortProfessional(name))}</strong><small>${appts.length} consulta(s)</small></div></header>
      <div class="agenda-col-body">
        ${appts.map((appt) => `
          <article class="event-pill ${appt.status.toLowerCase()}">
            <div class="event-time">${escapeHtml(appt.time)}</div>
            <div class="event-name">${escapeHtml(appt.patientName)}</div>
            <div class="event-meta">${escapeHtml(appt.type)} · ${escapeHtml(appt.status)}</div>
            <div class="mini-actions">
              ${appt.status !== "Confirmado" && appt.status !== "Cancelado" ? `<button type="button" data-action="confirm-appointment" data-id="${appt.id}">Confirmar</button>` : ""}
              ${appt.status !== "Cancelado" ? `<button type="button" data-action="cancel-appointment" data-id="${appt.id}">Cancelar</button>` : ""}
            </div>
          </article>`).join("") || `<p class="muted" style="padding:8px">—</p>`}
      </div>
    </div>`;
}

function renderFinanceiro() {
  const txs = filteredTransactions();
  const paid = state.transactions.filter((tx) => tx.status === "Pago").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const pending = state.transactions.filter((tx) => tx.status === "Pendente").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const projected = paid + pending;
  const average = state.leads.length ? Math.round(projected / state.leads.length) : 0;
  const fees = Math.round(projected * 0.035);
  const costs = Math.round(projected * 0.28);
  const repasses = Math.round(projected * 0.32);
  const profit = projected - fees - costs - repasses;

  appRoot().innerHTML = `
    <div class="kpi-grid">
      ${kpi("Projetado", formatMoney(projected), "pago + pendente", "◈")}
      ${kpi("Recebido", formatMoney(paid), "caixa confirmado", "✓")}
      ${kpi("A receber", formatMoney(pending), "em aberto", "◒")}
      ${kpi("Lucro estimado", formatMoney(profit), "apos taxas e repasses", "↗")}
    </div>
    <div class="ops-strip">
      ${renderOpsMetric("Ticket medio", formatMoney(average), "por lead")}
      ${renderOpsMetric("Taxas", formatMoney(fees), "cartao/gateway")}
      ${renderOpsMetric("Custos", formatMoney(costs), "insumos e sala")}
      ${renderOpsMetric("Repasses", formatMoney(repasses), "profissionais")}
    </div>
    <div class="finance-grid">
      <section class="panel">
        <div class="section-header">
          <h2>Recebimentos</h2>
          <div class="button-row">
            <select id="finance-filter" aria-label="Filtrar financeiro">
              <option value="todos" ${ui.financeFilter === "todos" ? "selected" : ""}>Todos</option>
              <option value="Pendente" ${ui.financeFilter === "Pendente" ? "selected" : ""}>Pendentes</option>
              <option value="Pago" ${ui.financeFilter === "Pago" ? "selected" : ""}>Pagos</option>
            </select>
            <button class="secondary-button" type="button" data-action="open-transaction">
              <span aria-hidden="true">＋</span>
              Lancar
            </button>
          </div>
        </div>
        <div class="transaction-table">
          ${txs.map(renderTransaction).join("") || emptyState("Nenhum lancamento neste filtro.")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Orcamentos e margem</h2>
          <small>${formatMoney(projected)}</small>
        </div>
        <div class="budget-stack">
          ${state.leads.slice(0, 4).map(renderBudgetCard).join("")}
        </div>
        <div class="section-header compact">
          <h2>Receita por origem</h2>
        </div>
        <div class="bar-list">
          ${renderOriginBars(projected)}
        </div>
      </section>
    </div>
  `;
}

function renderChannels() {
  const status = ui.integrationStatus;
  const configured = status?.configured || {};
  const channelLeads = state.leads.filter((lead) => lead.channel === "whatsapp" || lead.channel === "instagram");

  appRoot().innerHTML = `
    <div class="kpi-grid">
      ${kpi("Servidor", status?.ok ? "Online" : "Offline", status?.ok ? "API local respondendo" : "rode npm start", "◎")}
      ${kpi("WhatsApp", configured.whatsapp ? "Ativo" : "Pendente", "Cloud API", "◒")}
      ${kpi("Instagram", configured.instagram ? "Ativo" : "Pendente", "DM API", "◈")}
      ${kpi("Agente IA", status?.agent?.enabled ? "Ativo" : "Fallback", status?.agent?.model || "regras", "⌁")}
    </div>

    <div class="channels-layout">
      <section class="panel">
        <div class="section-header">
          <h2>Webhook da Meta</h2>
          <span class="chip ${configured.verifyToken ? "green" : "amber"}">${configured.verifyToken ? "verify token ok" : "sem token"}</span>
        </div>
        <div class="webhook-box">
          <div>
            <div class="summary-label">Callback URL</div>
            <code>${escapeHtml(status?.webhookUrl || "http://localhost:3000/webhooks/meta")}</code>
          </div>
          <button class="secondary-button" type="button" data-action="copy-webhook">Copiar</button>
        </div>
        <div class="setup-list">
          ${renderSetupItem("Rodar servidor", status?.ok, "npm start")}
          ${renderSetupItem("Login multiusuario", configured.userLogin || status?.security?.apiAuth === "session_login", "User + senha")}
          ${renderSetupItem("Configurar META_VERIFY_TOKEN", configured.verifyToken, ".env")}
          ${renderSetupItem("Validar assinatura do webhook", configured.appSecret, "META_APP_SECRET")}
          ${renderSetupItem("Configurar WhatsApp", configured.whatsapp, "WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID")}
          ${renderSetupItem("Configurar Instagram", configured.instagram, "INSTAGRAM_PAGE_ACCESS_TOKEN")}
          ${renderSetupItem("Configurar agente OpenAI", configured.openai, "AI_PROVIDER=openai + OPENAI_API_KEY")}
          ${renderSetupItem("Assinar campos de webhook", status?.ok, "WhatsApp messages e Instagram messages")}
        </div>
        ${ui.integrationError ? `<p class="note">${escapeHtml(ui.integrationError)}</p>` : ""}
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Sincronizar inbox</h2>
          <button class="primary-button" type="button" data-action="sync-channels">
            <span aria-hidden="true">↻</span>
            Sincronizar
          </button>
        </div>
        <div class="channel-list">
          ${channelLeads.map(renderChannelLead).join("") || emptyState("Nenhuma conversa real sincronizada ainda.")}
        </div>
      </section>
    </div>
  `;

  refreshIntegrationStatus();
}

function renderSetupItem(label, done, detail) {
  return `
    <div class="setup-item">
      <span class="chip ${done ? "green" : "amber"}">${done ? "ok" : "pendente"}</span>
      <div>
        <div class="item-title">${escapeHtml(label)}</div>
        <div class="item-meta">${escapeHtml(detail)}</div>
      </div>
    </div>
  `;
}

function renderChannelLead(lead) {
  const last = lead.messages.at(-1);
  return `
    <button class="conversation-item channel-lead" type="button" data-action="select-lead" data-id="${lead.id}">
      <div class="avatar">${lead.channel === "instagram" ? "IG" : "WA"}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(lead.name)}</div>
        <div class="item-meta">${escapeHtml(last?.text || "")}</div>
      </div>
      <span class="chip ${lead.channel === "instagram" ? "violet" : "green"}">${escapeHtml(channelLabel(lead.channel))}</span>
    </button>
  `;
}

function renderBots() {
  const bots = state.bots || [];
  const templates = state.whatsappTemplates || [];
  const visualBots = state.visualBots || [];
  if (!ui.selectedVisualBotId && visualBots[0]) ui.selectedVisualBotId = visualBots[0].id;
  const selectedVisualBot = visualBots.find((bot) => bot.id === ui.selectedVisualBotId) || visualBots[0];
  const activeCount = bots.filter((bot) => bot.active).length;
  const rulesCount = bots.reduce((sum, bot) => sum + (bot.rules?.length || 0), 0);

  appRoot().innerHTML = `
    <div class="workflow-grid">
      ${renderWorkflowCard("Lead novo", "Cria tarefa e primeira resposta", "ativo")}
      ${renderWorkflowCard("Orcamento enviado", "Follow-up D+1, D+3 e D+7", "ativo")}
      ${renderWorkflowCard("No-show", "Remarcacao e reativacao", "rascunho")}
      ${renderWorkflowCard("Campanha", "Templates por origem e consentimento", "rascunho")}
    </div>
    <div class="kpi-grid">
      ${kpi("Bots ativos", activeCount, "respondendo leads", "⌁")}
      ${kpi("Regras", rulesCount, "condicoes importadas", "▦")}
      ${kpi("Fluxos", bots.length, "modelos disponiveis", "◒")}
      ${kpi("Modo", "Local", "sem backend obrigatorio", "◆")}
    </div>

    <section class="panel">
      <div class="section-header">
        <h2>Modelos WhatsApp</h2>
        <div class="button-row">
          <button class="primary-button" type="button" data-action="new-wa-template">＋ Novo modelo</button>
        </div>
      </div>
      ${renderWhatsAppTemplateTable(templates)}
    </section>

    <section class="panel">
      <div class="section-header">
        <h2>Automacao visual</h2>
        <div class="button-row">
          <button class="secondary-button" type="button" data-action="new-visual-bot">＋ Criar bot</button>
          ${selectedVisualBot ? `<button class="secondary-button" type="button" data-action="add-visual-step" data-id="${selectedVisualBot.id}">＋ Passo</button>` : ""}
        </div>
      </div>
      <div class="salesbot-editor">
        <aside class="salesbot-list">
          ${visualBots.map((bot) => `
            <button type="button" class="${bot.id === selectedVisualBot?.id ? "active" : ""}" data-action="select-visual-bot" data-id="${bot.id}">
              <strong>${escapeHtml(bot.name)}</strong>
              <span>${escapeHtml(bot.trigger || "gatilho manual")} · ${bot.steps?.length || 0} passo(s)</span>
            </button>
          `).join("") || emptyState("Nenhum bot visual.")}
        </aside>
        <div class="salesbot-canvas">
          ${selectedVisualBot ? renderSalesbotCanvas(selectedVisualBot) : emptyState("Crie ou selecione um bot.")}
        </div>
      </div>
    </section>

    <div class="bots-layout">
      <section class="panel">
        <div class="section-header">
          <h2>Fluxos automaticos</h2>
          <div class="button-row">
            <button class="secondary-button" type="button" data-action="import-bot">
              <span aria-hidden="true">⇧</span>
              Importar JSON
            </button>
          </div>
        </div>
        <div class="bot-list">
          ${bots.map(renderBotCard).join("") || emptyState("Nenhum bot importado.")}
        </div>
        <input id="bot-import-file" type="file" accept="application/json,.json" hidden />
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Testar fluxo</h2>
          <span class="chip primary">WhatsApp simulado</span>
        </div>
        <div class="field">
          <label for="bot-test-lead">Lead</label>
          <select id="bot-test-lead">
            ${state.leads.map((lead) => `<option value="${lead.id}" ${lead.id === ui.selectedLeadId ? "selected" : ""}>${escapeHtml(lead.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="bot-test-message">Mensagem recebida</label>
          <textarea id="bot-test-message">Olá conheci o trabalho da Clinica pela página e gostaria de agendar uma consulta.</textarea>
        </div>
        <div class="button-row">
          <button class="primary-button" type="button" data-action="test-bot">
            <span aria-hidden="true">▶</span>
            Rodar bot
          </button>
          <button class="secondary-button" type="button" data-view="inbox">Ver inbox</button>
        </div>
      </section>
    </div>

    ${renderAgentTester()}
  `;
}

function renderWhatsAppTemplateTable(templates) {
  if (!templates.length) return emptyState("Nenhum modelo cadastrado.");
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Categoria</th><th>Idioma</th><th>ID WABA</th><th>Texto de resposta</th><th></th></tr></thead>
        <tbody>
          ${templates.map((tpl) => `
            <tr>
              <td><strong>${escapeHtml(tpl.name)}</strong><div class="muted">${escapeHtml(tpl.templateName || "")}</div></td>
              <td>${escapeHtml(tpl.type || "WhatsApp")}</td>
              <td><span class="chip ${tpl.status === "Aprovado" ? "green" : "amber"}">${escapeHtml(tpl.status || "Rascunho")}</span></td>
              <td>${escapeHtml(tpl.category || "-")}</td>
              <td>${escapeHtml(tpl.language || "pt_BR")}</td>
              <td class="muted">${escapeHtml(tpl.wabaId || "-")}</td>
              <td class="muted">${escapeHtml((tpl.body || "").slice(0, 90))}${(tpl.body || "").length > 90 ? "..." : ""}</td>
              <td>
                <div class="mini-actions">
                  <button type="button" data-action="edit-wa-template" data-id="${tpl.id}">Editar</button>
                  <button type="button" data-action="select-template-for-inbox" data-id="${tpl.id}">Usar</button>
                  <button type="button" data-action="delete-wa-template" data-id="${tpl.id}">Excluir</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderWhatsAppTemplatePreview(template) {
  const body = escapeHtml(renderTemplatePreview(template)).replaceAll("\n", "<br>");
  const buttons = template.buttons || [];
  return `
    <aside class="wa-phone-preview">
      <div class="wa-phone-shell">
        <div class="wa-phone-top">
          <span>15:30</span>
          <span>WhatsApp</span>
        </div>
        <div class="wa-phone-chat">
          <div class="wa-bubble">
            <div class="wa-bubble-text">${body || '<span class="muted">Texto do modelo</span>'}</div>
            ${
              buttons.length
                ? `<div class="wa-bubble-buttons">
                    ${buttons.map((button) => `<span>${escapeHtml(button.title)}</span>`).join("")}
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderSalesbotCanvas(bot) {
  const steps = bot.steps || [];
  return `
    <div class="salesbot-head">
      <div>
        <strong>${escapeHtml(bot.name)}</strong>
        <span>${escapeHtml(bot.trigger || "gatilho manual")} · ${steps.length} passo(s) · ${bot.active === false ? "Pausado" : "Ativo"}</span>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" data-action="add-visual-step" data-id="${bot.id}">＋ Passo</button>
        <button class="secondary-button" type="button" data-action="edit-visual-bot" data-id="${bot.id}">Editar bot</button>
        <button class="secondary-button" type="button" data-action="delete-visual-bot" data-id="${bot.id}">Excluir bot</button>
      </div>
    </div>
    <div class="salesbot-flow">
      <div class="salesbot-start">▶ Início · ${escapeHtml(bot.trigger || "gatilho manual")}</div>
      ${steps.map((step, index) => `
        <div class="salesbot-arrow">↓</div>
        <article class="salesbot-node ${escapeHtml(step.type || "message")}">
          <div class="node-index">${index + 1}</div>
          <div class="node-body">
            <span class="chip ${salesbotStepTone(step.type)}">${escapeHtml(salesbotStepLabel(step.type))}</span>
            <h3>${escapeHtml(step.title || "Passo")}</h3>
            ${step.text ? `<p>${escapeHtml(step.text)}</p>` : ""}
            ${step.extra ? `<p class="node-extra">⚙ ${escapeHtml(step.extra)}</p>` : ""}
            ${(step.options || []).length ? `<div class="node-options">${step.options.map((option) => `<span>${escapeHtml(option)}</span>`).join("")}</div>` : ""}
          </div>
          <div class="node-actions">
            <button type="button" title="Subir" data-action="move-visual-step" data-bot-id="${bot.id}" data-id="${step.id}" data-dir="up" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" title="Descer" data-action="move-visual-step" data-bot-id="${bot.id}" data-id="${step.id}" data-dir="down" ${index === steps.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" title="Editar" data-action="edit-visual-step" data-bot-id="${bot.id}" data-id="${step.id}">✎</button>
            <button type="button" title="Inserir abaixo" data-action="add-visual-step" data-id="${bot.id}" data-after="${step.id}">＋</button>
            <button type="button" title="Remover" data-action="delete-visual-step" data-bot-id="${bot.id}" data-id="${step.id}">×</button>
          </div>
        </article>
      `).join("")}
      ${steps.length ? `<div class="salesbot-arrow">↓</div><div class="salesbot-end">■ Fim do fluxo</div>` : emptyState("Nenhum passo. Clique em “＋ Passo”.")}
    </div>
  `;
}

function renderAgentTester() {
  const t = ui.agentTest;
  const collected = t.agentState?.collected || {};
  const tags = t.agentState?.tags || [];
  const stage = t.agentState?.stage || "-";
  const confidence = typeof t.confidence === "number" ? `${Math.round(t.confidence * 100)}%` : "-";

  const transcript = t.messages.length
    ? t.messages
        .map((m) => {
          const who = m.from === "patient" ? "Paciente" : "Tawany";
          const cls = m.from === "patient" ? "agent-bubble patient" : "agent-bubble agent";
          return `<div class="${cls}"><strong>${who}</strong><span>${escapeHtml(m.text)}</span></div>`;
        })
        .join("")
    : emptyState("Envie uma mensagem como paciente para ver a Tawany responder.");

  const collectedRows = Object.keys(collected).length
    ? Object.entries(collected)
        .map(([k, v]) => `<li><span class="chip">${escapeHtml(k)}</span> ${escapeHtml(String(v))}</li>`)
        .join("")
    : `<li class="muted">nada coletado ainda</li>`;

  const actionRows = (t.lastActions || []).length
    ? t.lastActions
        .map((a) => `<li><span class="chip primary">${escapeHtml(a.type || "")}</span> ${escapeHtml(a.value || "")}</li>`)
        .join("")
    : `<li class="muted">nenhuma acao no ultimo turno</li>`;

  return `
    <section class="panel">
      <div class="section-header">
        <h2>Testar agente (IA)</h2>
        <span class="chip primary">Tawany · /api/agent/test</span>
      </div>
      <p class="muted" style="margin: -6px 0 14px;">Requer servidor com <code>AI_PROVIDER=openai</code> e <code>OPENAI_API_KEY</code>. Conversa isolada, nao afeta os leads.</p>

      <div class="agent-tester">
        <div class="agent-tester-main">
          <div class="field">
            <label for="agent-test-name">Nome do paciente (opcional)</label>
            <input id="agent-test-name" type="text" placeholder="deixe vazio para testar a coleta de nome" value="${escapeHtml(t.name)}" />
          </div>
          <div class="agent-transcript">${transcript}</div>
          <div class="field">
            <label for="agent-test-input">Mensagem do paciente</label>
            <textarea id="agent-test-input" placeholder="Ex.: Oi, tenho umas manchas na pele e queria marcar">${escapeHtml(t.draft)}</textarea>
          </div>
          <div class="button-row">
            <button class="primary-button" type="button" data-action="agent-test-send" ${t.busy ? "disabled" : ""}>
              <span aria-hidden="true">▶</span>
              ${t.busy ? "Pensando..." : "Enviar como paciente"}
            </button>
            <button class="secondary-button" type="button" data-action="agent-test-reset">Reiniciar conversa</button>
          </div>
        </div>

        <aside class="agent-tester-state">
          <h3>Estado do CRM</h3>
          <p class="state-line"><strong>Etapa:</strong> ${escapeHtml(stage)}</p>
          <p class="state-line"><strong>Confianca:</strong> ${confidence}</p>
          <p class="state-line"><strong>Tags:</strong> ${tags.length ? tags.map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join(" ") : "-"}</p>
          <h3>Coletado</h3>
          <ul class="state-list">${collectedRows}</ul>
          <h3>Acoes (ultimo turno)</h3>
          <ul class="state-list">${actionRows}</ul>
        </aside>
      </div>
    </section>
  `;
}

function renderBotCard(bot) {
  const samples = (bot.rules || []).slice(0, 4);
  return `
    <article class="bot-card">
      <div class="bot-card-head">
        <div>
          <h3>${escapeHtml(bot.name)}</h3>
          <p>${escapeHtml(bot.source || "Fluxo local")} · ${bot.rules?.length || 0} regras</p>
        </div>
        <span class="chip ${bot.active ? "green" : "amber"}">${bot.active ? "Ativo" : "Pausado"}</span>
      </div>
      <div class="bot-rules">
        ${samples.map(renderBotRule).join("")}
      </div>
      <div class="mini-actions">
        <button type="button" data-action="toggle-bot" data-id="${bot.id}">${bot.active ? "Pausar" : "Ativar"}</button>
        <button type="button" data-action="delete-bot" data-id="${bot.id}">Excluir</button>
      </div>
    </article>
  `;
}

function renderBotRule(rule) {
  const term = rule.terms?.[0] || "";
  const response = rule.responses?.[0] || "";
  return `
    <div class="bot-rule">
      <div class="summary-label">Quando receber</div>
      <div class="bot-rule-text">${escapeHtml(term)}</div>
      <div class="summary-label">Responde</div>
      <div class="bot-rule-text">${escapeHtml(response)}</div>
    </div>
  `;
}

function openWhatsAppTemplateModal(id = "") {
  const tpl = getWhatsAppTemplate(id) || {
    id: "",
    name: "",
    templateName: "",
    type: "WhatsApp",
    status: "Rascunho",
    category: "Marketing",
    language: "pt_BR",
    wabaId: "",
    body: "",
    footer: "",
    buttons: [],
  };
  openModal(`
    <div class="modal-header">
      <h2>${tpl.id ? "Editar modelo WhatsApp" : "Novo modelo WhatsApp"}</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="wa-template" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(tpl.id)}" />
      <div class="field"><label>Nome</label><input name="name" required value="${escapeHtml(tpl.name)}" /></div>
      <div class="field"><label>Nome tecnico Meta</label><input name="templateName" required value="${escapeHtml(tpl.templateName)}" /></div>
      <div class="field"><label>Status</label><select name="status">${["Aprovado", "Pendente", "Rascunho"].map((x) => `<option ${x === tpl.status ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Categoria</label><select name="category">${["Marketing", "Utility", "Authentication"].map((x) => `<option ${x === tpl.category ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Idioma</label><input name="language" value="${escapeHtml(tpl.language || "pt_BR")}" /></div>
      <div class="field"><label>ID WABA</label><input name="wabaId" value="${escapeHtml(tpl.wabaId || "")}" /></div>
      <div class="field full"><label>Corpo do texto</label><textarea name="body" required>${escapeHtml(tpl.body || "")}</textarea></div>
      <div class="field full"><label>Botões (um por linha: id|titulo|url opcional)</label><textarea name="buttons">${escapeHtml((tpl.buttons || []).map((button) => [button.id, button.title, button.url].filter(Boolean).join("|")).join("\n"))}</textarea></div>
      <div class="field full">
        <label>Prévia</label>
        ${renderWhatsAppTemplatePreview(tpl)}
      </div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">Salvar modelo</button>
      </div>
    </form>
  `);
}

function saveWhatsAppTemplate(data) {
  const template = {
    id: data.id || uid("tpl"),
    name: clean(data.name),
    templateName: clean(data.templateName),
    type: "WhatsApp",
    status: clean(data.status || "Rascunho"),
    category: clean(data.category || "Marketing"),
    language: clean(data.language || "pt_BR"),
    wabaId: clean(data.wabaId || ""),
    body: clean(data.body),
    footer: "",
    buttons: parseTemplateButtons(data.buttons),
  };
  state.whatsappTemplates = upsertById(state.whatsappTemplates || [], template);
  closeModal();
  saveAndRender("Modelo salvo.");
}

function deleteWhatsAppTemplate(id) {
  const tpl = getWhatsAppTemplate(id);
  if (!tpl) return;
  if (!confirm(`Excluir modelo ${tpl.name}?`)) return;
  state.whatsappTemplates = (state.whatsappTemplates || []).filter((item) => item.id !== id);
  saveAndRender("Modelo excluido.");
}

function useTemplateInInbox(id) {
  const tpl = getWhatsAppTemplate(id);
  if (!tpl) return;
  ui.view = "inbox";
  ui.waMode = "template";
  window.location.hash = "inbox";
  render();
  setTimeout(() => {
    const select = document.querySelector("#wa-template-select");
    if (select) select.value = id;
  }, 0);
  toast("Modelo selecionado no Inbox.");
}

function openVisualBotModal(id = "") {
  const bot = getVisualBot(id) || { id: "", name: "", trigger: "Qualquer nova conversa", active: true, steps: [] };
  openModal(`
    <div class="modal-header">
      <h2>${bot.id ? "Editar bot visual" : "Novo bot visual"}</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="visual-bot" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(bot.id)}" />
      <div class="field"><label>Nome</label><input name="name" required value="${escapeHtml(bot.name)}" /></div>
      <div class="field"><label>Gatilho</label><input name="trigger" required value="${escapeHtml(bot.trigger || "")}" /></div>
      <div class="field"><label>Status</label><select name="active"><option value="true" ${bot.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${bot.active === false ? "selected" : ""}>Pausado</option></select></div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">Salvar bot</button>
      </div>
    </form>
  `);
}

async function saveVisualBot(data) {
  const current = getVisualBot(data.id);
  const body = {
    name: clean(data.name),
    trigger: clean(data.trigger),
    active: data.active !== "false",
    steps: current?.steps || [],
  };
  const saved = data.id
    ? await dbWrite(`/api/bots/${data.id}`, "PATCH", body)
    : await dbWrite("/api/bots", "POST", body);
  const bot = { id: saved?.id || data.id || uid("vbot"), ...body, steps: Array.isArray(saved?.steps) ? saved.steps : body.steps };
  state.visualBots = upsertById(state.visualBots || [], bot);
  ui.selectedVisualBotId = bot.id;
  closeModal();
  saveAndRender(saved ? "Bot salvo no banco." : "Bot salvo (offline).");
}

// Grava os passos/estado do bot no Postgres (steps são Json na tabela Bot).
function persistBot(bot) {
  if (!bot) return;
  dbWrite(`/api/bots/${bot.id}`, "PATCH", { name: bot.name, trigger: bot.trigger, active: bot.active, steps: bot.steps || [] });
}

// stepId preenchido = edição; afterId = inserir logo após esse passo.
function openVisualStepModal(botId, stepId = "", afterId = "") {
  const bot = getVisualBot(botId);
  if (!bot) return;
  const step = stepId ? (bot.steps || []).find((s) => s.id === stepId) : null;
  const sel = (v) => (step?.type === v ? "selected" : "");
  openModal(`
    <div class="modal-header">
      <h2>${step ? "Editar passo" : "Novo passo"} · ${escapeHtml(bot.name)}</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="visual-step" class="form-grid">
      <input type="hidden" name="botId" value="${escapeHtml(bot.id)}" />
      <input type="hidden" name="stepId" value="${escapeHtml(stepId)}" />
      <input type="hidden" name="afterId" value="${escapeHtml(afterId)}" />
      <div class="field"><label>Tipo</label><select name="type">${SALESBOT_STEP_TYPES.map((x) => `<option value="${x}" ${sel(x)}>${salesbotStepLabel(x)}</option>`).join("")}</select></div>
      <div class="field"><label>Título</label><input name="title" required value="${escapeHtml(step?.title || "")}" /></div>
      <div class="field full"><label>Texto / mensagem</label><textarea name="text">${escapeHtml(step?.text || "")}</textarea></div>
      <div class="field full"><label>Opções / botões (uma por linha)</label><textarea name="options" placeholder="Pele\nUnhas\nCabelo">${escapeHtml((step?.options || []).join("\n"))}</textarea></div>
      <div class="field full"><label>Configuração específica</label><input name="extra" value="${escapeHtml(step?.extra || "")}" placeholder="ex: tag, atraso, condição, bot" /><small class="muted">condição → palavra · ação → tag · pausa → atraso · iniciar bot → nome do bot</small></div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">${step ? "Salvar passo" : "Adicionar passo"}</button>
      </div>
    </form>
  `);
}

function saveVisualStep(data) {
  const bot = getVisualBot(data.botId);
  if (!bot) return;
  const steps = bot.steps || [];
  const payload = {
    type: clean(data.type || "message"),
    title: clean(data.title),
    text: clean(data.text),
    extra: clean(data.extra),
    options: String(data.options || "").split(/\r?\n/).map(clean).filter(Boolean),
  };
  if (data.stepId) {
    const i = steps.findIndex((s) => s.id === data.stepId);
    if (i >= 0) steps[i] = { ...steps[i], ...payload };
  } else {
    const step = { id: uid("step"), ...payload };
    const after = data.afterId ? steps.findIndex((s) => s.id === data.afterId) : -1;
    if (after >= 0) steps.splice(after + 1, 0, step);
    else steps.push(step);
  }
  bot.steps = steps;
  persistBot(bot);
  closeModal();
  saveAndRender(data.stepId ? "Passo atualizado." : "Passo adicionado.");
}

function deleteVisualStep(botId, stepId) {
  const bot = getVisualBot(botId);
  if (!bot) return;
  bot.steps = (bot.steps || []).filter((step) => step.id !== stepId);
  persistBot(bot);
  saveAndRender("Passo removido.");
}

function moveVisualStep(botId, stepId, dir) {
  const bot = getVisualBot(botId);
  if (!bot) return;
  const steps = bot.steps || [];
  const i = steps.findIndex((s) => s.id === stepId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= steps.length) return;
  [steps[i], steps[j]] = [steps[j], steps[i]];
  persistBot(bot);
  saveAndRender("Passo reordenado.");
}

function deleteVisualBot(botId) {
  if (!confirm("Excluir este bot e todos os seus passos?")) return;
  dbWrite(`/api/bots/${botId}`, "DELETE", {});
  state.visualBots = (state.visualBots || []).filter((b) => b.id !== botId);
  if (ui.selectedVisualBotId === botId) ui.selectedVisualBotId = state.visualBots[0]?.id || "";
  saveAndRender("Bot excluído.");
}

function renderConfig() {
  if (isAdmin() && ui.team.users === null) loadTeamUsers();
  appRoot().innerHTML = `
    <div class="config-grid">
      <section class="panel">
        <div class="section-header">
          <h2>Clinica</h2>
          <span class="chip primary">localStorage</span>
        </div>
        <form data-form="settings" class="form-grid">
          <div class="field">
            <label for="clinic-name">Nome</label>
            <input id="clinic-name" name="name" required value="${escapeHtml(state.clinic.name)}" />
          </div>
          <div class="field">
            <label for="clinic-unit">Unidade</label>
            <input id="clinic-unit" name="unit" required value="${escapeHtml(state.clinic.unit)}" />
          </div>
          <div class="field">
            <label for="assistant-name">Atendente IA</label>
            <input id="assistant-name" name="assistant" required value="${escapeHtml(state.clinic.assistant)}" />
          </div>
          <div class="field">
            <label for="consult-value">Valor padrao</label>
            <input id="consult-value" name="defaultConsultValue" type="number" min="0" step="10" required value="${state.clinic.defaultConsultValue}" />
          </div>
          <div class="modal-actions full">
            <button class="primary-button" type="submit">Salvar ajustes</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Dados</h2>
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" data-action="export-data">
            <span aria-hidden="true">⇩</span>
            Exportar JSON
          </button>
          <button class="secondary-button" type="button" data-action="import-data">
            <span aria-hidden="true">⇧</span>
            Importar JSON
          </button>
          <button class="danger-button" type="button" data-action="reset-data">
            <span aria-hidden="true">↺</span>
            Restaurar demo
          </button>
        </div>
        <input id="import-file" type="file" accept="application/json,.json" hidden />
      </section>

      ${renderTeamPanel()}

      <section class="panel">
        <div class="section-header">
          <h2>Papeis e permissoes</h2>
          <span class="chip green">RBAC</span>
        </div>
        <div class="permission-grid">
          ${renderPermissionRow("Admin", "todos os modulos", "auditoria completa")}
          ${renderPermissionRow("Recepcao", "leads, inbox e agenda", "sem financeiro sensivel")}
          ${renderPermissionRow("Financeiro", "orcamentos e pagamentos", "relatorios")}
          ${renderPermissionRow("Marketing", "campanhas e origem", "dados agregados")}
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>Governanca</h2>
          <span class="chip amber">LGPD</span>
        </div>
        <div class="setup-list">
          ${renderSetupItem("Auditoria de alteracoes", true, "AuditLog por entidade")}
          ${renderSetupItem("Retencao de leads perdidos", false, "definir prazo operacional")}
          ${renderSetupItem("Exportacao de dados", true, "JSON local e APIs")}
          ${renderSetupItem("Prontuario separado", true, "sem dados clinicos sensiveis")}
        </div>
      </section>
    </div>
  `;
}

const ROLE_LABELS = { ADMIN: "Admin", DOCTOR: "Medico", SECRETARY: "Recepcao", FINANCE: "Financeiro" };

function authUser() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_USER_STORAGE) || "{}");
  } catch {
    return {};
  }
}

function isAdmin() {
  return authUser().role === "ADMIN";
}

// Tela administrativa de equipe (substitui a dependencia de APP_USERS_JSON no Render).
// So aparece para ADMIN; o backend tambem exige ADMIN nas escritas.
function renderTeamPanel() {
  if (!isAdmin()) return "";
  const list = ui.team.users || [];
  const editing = list.find((u) => u.id === ui.team.editId);
  const rows = list.length
    ? list.map((u) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.username || "—")}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${ROLE_LABELS[u.role] || escapeHtml(u.role)}</td>
          <td><span class="chip ${u.active ? "green" : ""}">${u.active ? "Ativo" : "Inativo"}</span></td>
          <td><button class="link-button" type="button" data-action="team-edit" data-id="${u.id}">Editar</button></td>
        </tr>`).join("")
    : `<tr><td colspan="6" class="muted">${ui.team.users === null ? "Carregando..." : "Nenhum usuario."}</td></tr>`;
  const roleOptions = Object.entries(ROLE_LABELS)
    .map(([value, label]) => `<option value="${value}" ${editing?.role === value ? "selected" : ""}>${label}</option>`)
    .join("");
  return `
    <section class="panel">
      <div class="section-header">
        <h2>Equipe</h2>
        <span class="chip primary">${list.length} usuario${list.length === 1 ? "" : "s"}</span>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Usuario</th><th>E-mail</th><th>Papel</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <form data-form="team-user" class="form-grid" style="margin-top:16px">
        <input type="hidden" name="id" value="${editing?.id || ""}" />
        <div class="field">
          <label for="team-name">Nome</label>
          <input id="team-name" name="name" required value="${escapeHtml(editing?.name || "")}" />
        </div>
        <div class="field">
          <label for="team-username">Usuario (login)</label>
          <input id="team-username" name="username" value="${escapeHtml(editing?.username || "")}" placeholder="opcional, usa o e-mail" />
        </div>
        <div class="field">
          <label for="team-email">E-mail</label>
          <input id="team-email" name="email" type="email" required value="${escapeHtml(editing?.email || "")}" />
        </div>
        <div class="field">
          <label for="team-role">Papel</label>
          <select id="team-role" name="role">${roleOptions}</select>
        </div>
        <div class="field">
          <label for="team-password">Senha ${editing ? "(deixe em branco para manter)" : ""}</label>
          <input id="team-password" name="password" type="text" autocomplete="new-password" ${editing ? "" : "required"} minlength="6" />
        </div>
        <div class="field">
          <label><input type="checkbox" name="active" ${editing ? (editing.active ? "checked" : "") : "checked"} /> Ativo</label>
        </div>
        <div class="modal-actions full">
          ${editing ? `<button class="secondary-button" type="button" data-action="team-new">Cancelar edicao</button>` : ""}
          <button class="primary-button" type="submit">${editing ? "Salvar usuario" : "Adicionar usuario"}</button>
        </div>
      </form>
    </section>`;
}

async function loadTeamUsers() {
  if (ui.team.users === null) ui.team.users = [];
  try {
    const response = await apiFetch("/api/users?all=1", {}, false);
    if (response.ok) ui.team.users = (await response.json()).data || [];
  } catch {
    /* mantem lista atual */
  } finally {
    if (ui.view === "config") renderConfig();
  }
}

async function saveTeamUser(data) {
  const id = clean(data.id || "");
  const body = {
    name: clean(data.name || ""),
    username: clean(data.username || ""),
    email: clean(data.email || ""),
    role: data.role || "SECRETARY",
    active: data.active === "on" || data.active === true,
  };
  if (clean(data.password || "")) body.password = data.password;
  if (!body.name || !body.email) return toast("Informe nome e e-mail.");
  if (!id && !body.password) return toast("Defina uma senha para o novo usuario.");
  try {
    const response = await apiFetch(id ? `/api/users/${id}` : "/api/users", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, false);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return toast(payload.error?.message || "Falha ao salvar usuario.");
    toast(id ? "Usuario atualizado." : "Usuario adicionado.");
    ui.team.editId = "";
    ui.team.users = null;
    ui.users = null; // invalida selects de atribuicao
    loadTeamUsers();
  } catch {
    toast("Falha ao salvar usuario.");
  }
}

function renderLeadSummary(lead) {
  const appt = state.appointments.find((item) => item.leadId === lead.id && item.status !== "Cancelado");
  const txs = state.transactions.filter((tx) => tx.leadId === lead.id);
  const paid = txs.filter((tx) => tx.status === "Pago").reduce((sum, tx) => sum + Number(tx.amount), 0);
  return `
    <div class="lead-summary">
      <div>
        <h2>${escapeHtml(lead.name)}</h2>
        <div class="item-meta">${escapeHtml(lead.source)} · ${escapeHtml(lead.interest)}</div>
      </div>
      <span class="chip ${stageTone(lead.stage)}">${escapeHtml(stageLabel(lead.stage))}</span>
      <div class="summary-stat">
        <div class="summary-label">Interesse</div>
        <div class="summary-value">${escapeHtml(lead.interest)}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Valor estimado</div>
        <div class="summary-value">${formatMoney(lead.value)}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Proximo passo</div>
        <div class="summary-value">${escapeHtml(lead.nextStep)}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Agenda</div>
        <div class="summary-value">${appt ? `${formatDate(appt.date)} · ${appt.time}` : "Sem horario"}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Recebido</div>
        <div class="summary-value">${formatMoney(paid)}</div>
      </div>
      <div class="button-row">
        <button class="primary-button" type="button" data-action="open-appointment" data-id="${lead.id}">
          <span aria-hidden="true">＋</span>
          Agendar
        </button>
        <button class="secondary-button" type="button" data-action="next-stage" data-id="${lead.id}">
          Avancar
        </button>
      </div>
    </div>
  `;
}

// ---- Tarefas (view DB-native) ----

function renderTasks() {
  const box = ui.tasks;
  if (box.list === null) {
    if (!box.loading) loadTasks();
    appRoot().innerHTML = `<div class="data-table-wrap" style="padding:24px">Carregando tarefas do banco...</div>`;
    return;
  }
  appRoot().innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">${renderTaskFilters()}</div>
      <div class="toolbar-right">
        <button class="secondary-button" type="button" data-action="new-task">
          <span aria-hidden="true">＋</span>
          Nova tarefa
        </button>
      </div>
    </div>
    ${renderTasksTable(box.list)}
  `;
}

function renderTaskFilters() {
  const users = ui.users || [];
  const f = ui.taskFilters;
  const opt = (v, label, cur) => `<option value="${escapeHtml(v)}" ${cur === v ? "selected" : ""}>${escapeHtml(label)}</option>`;
  return `
    <div class="inbox-filters">
      <select id="task-filter-status">
        ${opt("", "Status: todos", f.status)}
        ${["OPEN", "IN_PROGRESS", "DONE", "CANCELED"].map((s) => opt(s, TASK_STATUS_LABEL[s], f.status)).join("")}
      </select>
      <select id="task-filter-assigned">
        ${opt("", "Responsável: todos", f.assignedToId)}
        ${users.map((u) => opt(u.id, u.name, f.assignedToId)).join("")}
      </select>
      <label class="muted" style="display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="task-filter-overdue" ${f.overdue ? "checked" : ""} /> Atrasadas
      </label>
    </div>`;
}

function renderTasksTable(list) {
  if (!list.length) return emptyState("Nenhuma tarefa para os filtros atuais.");
  const userName = (uid) => (ui.users || []).find((u) => u.id === uid)?.name || "—";
  const now = Date.now();
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Título</th><th>Responsável</th><th>Vínculo</th><th>Vencimento</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${list
            .map((t) => {
              const open = t.status !== "DONE" && t.status !== "CANCELED";
              const overdue = open && t.dueAt && new Date(t.dueAt).getTime() < now;
              const vinc = t.leadId ? "Lead" : t.patientId ? "Paciente" : "—";
              return `
              <tr>
                <td><strong>${escapeHtml(t.title)}</strong>${t.description ? `<div class="muted">${escapeHtml(t.description)}</div>` : ""}</td>
                <td class="muted">${escapeHtml(userName(t.assignedToId))}</td>
                <td class="muted">${vinc}</td>
                <td class="muted"${overdue ? ' style="color:var(--danger,#dc2626);font-weight:600"' : ""}>${t.dueAt ? escapeHtml(formatDate(t.dueAt)) : "—"}</td>
                <td><span class="chip ${TASK_STATUS_TONE[t.status] || ""}">${escapeHtml(TASK_STATUS_LABEL[t.status] || t.status)}</span></td>
                <td>
                  ${open ? `<button class="link-button" type="button" data-action="task-complete" data-id="${t.id}">Concluir</button>` : ""}
                  <button class="link-button" type="button" data-action="task-edit" data-id="${t.id}">Editar</button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function loadTasks() {
  ui.tasks.loading = true;
  const f = ui.taskFilters;
  const qs = new URLSearchParams({ limit: "500" });
  if (f.status) qs.set("status", f.status);
  if (f.assignedToId) qs.set("assignedToId", f.assignedToId);
  if (f.overdue) qs.set("overdue", "true");
  try {
    const [res] = await Promise.all([apiFetch(`/api/tasks?${qs}`, {}, false), ensureInboxRefs()]);
    ui.tasks.list = res.ok ? (await res.json()).data || [] : [];
  } catch {
    ui.tasks.list = [];
  } finally {
    ui.tasks.loading = false;
    if (ui.view === "tarefas") renderTasks();
  }
}

async function completeTaskById(id) {
  const ok = await dbWrite(`/api/tasks/${id}/complete`, "POST", {});
  toast(ok === null ? "Falha ao concluir tarefa." : "Tarefa concluída.");
  ui.tasks.list = null;
  await loadTasks();
}

function openTaskModal(id = "") {
  const t = id ? (ui.tasks.list || []).find((x) => x.id === id) || {} : {};
  const users = ui.users || [];
  openModal(`
    <div class="modal-header">
      <h2>${id ? "Editar tarefa" : "Nova tarefa"}</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="task" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(id)}" />
      <div class="field full">
        <label for="task-title">Título</label>
        <input id="task-title" name="title" required value="${escapeHtml(t.title || "")}" />
      </div>
      <div class="field full">
        <label for="task-desc">Descrição</label>
        <textarea id="task-desc" name="description" rows="2">${escapeHtml(t.description || "")}</textarea>
      </div>
      <div class="field">
        <label for="task-due">Vencimento</label>
        <input id="task-due" name="dueAt" type="date" value="${t.dueAt ? String(t.dueAt).slice(0, 10) : ""}" />
      </div>
      <div class="field">
        <label for="task-assignee">Responsável</label>
        <select id="task-assignee" name="assignedToId">
          <option value="">—</option>
          ${users.map((u) => `<option value="${u.id}" ${t.assignedToId === u.id ? "selected" : ""}>${escapeHtml(u.name)}</option>`).join("")}
        </select>
      </div>
      ${
        id
          ? `<div class="field">
        <label for="task-status">Status</label>
        <select id="task-status" name="status">
          ${["OPEN", "IN_PROGRESS", "DONE", "CANCELED"].map((s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${escapeHtml(TASK_STATUS_LABEL[s])}</option>`).join("")}
        </select>
      </div>`
          : ""
      }
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">${id ? "Salvar" : "Criar"}</button>
      </div>
    </form>
  `);
}

async function saveTask(data) {
  const title = clean(data.title || "");
  if (!title) return toast("Informe o título da tarefa.");
  const body = {
    title,
    description: clean(data.description || "") || null,
    dueAt: data.dueAt || null,
    assignedToId: data.assignedToId || null,
  };
  const id = clean(data.id || "");
  if (id) body.status = data.status || "OPEN";
  const result = id
    ? await dbWrite(`/api/tasks/${id}`, "PATCH", body)
    : await dbWrite("/api/tasks", "POST", body);
  closeModal();
  if (result === null) return toast("Falha ao salvar tarefa.");
  toast(id ? "Tarefa atualizada." : "Tarefa criada.");
  ui.tasks.list = null;
  await loadTasks();
}

// ---- Kanban do funil DB-native (modo "kanban" da view Leads) ----

function renderFunnelKanban() {
  const box = ui.funnel;
  if (box.list === null) {
    if (!box.loading) loadFunnel();
    return `<div class="data-table-wrap" style="padding:24px">Carregando funil do banco...</div>`;
  }
  const q = (ui.leadSearch || "").trim().toLowerCase();
  const list = q
    ? box.list.filter((l) => `${l.name || ""} ${l.interest || ""} ${l.source || ""}`.toLowerCase().includes(q))
    : box.list;
  const columns = LEAD_STAGES.map((stage) => {
    const cards = list.filter((l) => l.stage === stage);
    return `
      <div class="stage-column" data-funnel-column data-stage="${stage}">
        <div class="stage-header">
          <div class="stage-title">${escapeHtml(LEAD_STAGE_LABEL[stage])}</div>
          <span class="chip">${cards.length}</span>
        </div>
        ${cards.map(renderFunnelCard).join("") || `<div class="empty-state">Sem leads</div>`}
      </div>`;
  }).join("");
  return `
    ${renderFunnelFilters()}
    <section class="pipeline" aria-label="Funil de leads (banco)">${columns}</section>`;
}

function renderFunnelFilters() {
  const users = ui.users || [];
  const f = ui.funnelFilters;
  const opt = (v, label, cur) => `<option value="${escapeHtml(v)}" ${cur === v ? "selected" : ""}>${escapeHtml(label)}</option>`;
  return `
    <div class="inbox-filters" style="margin-bottom:12px">
      <select id="funnel-filter-assigned">
        ${opt("", "Responsável: todos", f.assignedToId)}
        ${users.map((u) => opt(u.id, u.name, f.assignedToId)).join("")}
      </select>
      <select id="funnel-filter-temp">
        ${opt("", "Temperatura: todas", f.temperature)}
        ${["HOT", "WARM", "COLD"].map((t) => opt(t, TEMP_DB_LABEL[t], f.temperature)).join("")}
      </select>
    </div>`;
}

function renderFunnelCard(l) {
  const value = Number(l.estimatedValue || 0);
  return `
    <article class="lead-card" draggable="true" data-lead-card data-id="${l.id}">
      <div class="lead-card-title">
        <div>
          <h3>${escapeHtml(l.name)}</h3>
          <p>${escapeHtml(l.interest || "—")} · ${escapeHtml(l.source || "—")}</p>
        </div>
        <div class="card-chips">
          <span class="chip ${scoreTone(l.score)}">Score ${l.score || 0}</span>
          ${value ? `<span class="chip">${formatMoney(value)}</span>` : ""}
        </div>
      </div>
      ${l.nextAction ? `<p>${escapeHtml(l.nextAction)}${l.nextActionAt ? ` · ${formatDate(l.nextActionAt)}` : ""}</p>` : ""}
      <div class="mini-actions">
        <select data-funnel-select data-id="${l.id}" aria-label="Mover lead">
          ${LEAD_STAGES.map((s) => `<option value="${s}" ${s === l.stage ? "selected" : ""}>${escapeHtml(LEAD_STAGE_LABEL[s])}</option>`).join("")}
        </select>
      </div>
    </article>`;
}

async function loadFunnel() {
  ui.funnel.loading = true;
  const f = ui.funnelFilters;
  const qs = new URLSearchParams({ limit: "500" });
  if (f.assignedToId) qs.set("assignedToId", f.assignedToId);
  if (f.temperature) qs.set("temperature", f.temperature);
  try {
    const [res] = await Promise.all([apiFetch(`/api/leads?${qs}`, {}, false), ensureInboxRefs()]);
    ui.funnel.list = res.ok ? (await res.json()).data || [] : [];
  } catch {
    ui.funnel.list = [];
  } finally {
    ui.funnel.loading = false;
    if (ui.view === "leads" && ui.funnelView === "kanban") renderLeads();
  }
}

// Move a etapa direto no banco (enum LeadStage), com update otimista e reload.
async function moveFunnelLead(id, stage) {
  if (!LEAD_STAGES.includes(stage)) return;
  const lead = (ui.funnel.list || []).find((l) => l.id === id);
  if (lead && lead.stage === stage) return;
  if (lead) lead.stage = stage;
  renderLeads();
  const ok = await dbWrite(`/api/leads/${id}`, "PATCH", { stage });
  toast(ok === null ? "Falha ao mover lead." : `Movido para ${LEAD_STAGE_LABEL[stage]}.`);
  ui.funnel.list = null;
  await loadFunnel();
}

function renderConversation(lead) {
  const last = lead.messages.at(-1);
  return `
    <button class="conversation-item ${lead.id === ui.selectedLeadId ? "active" : ""}" type="button" data-action="select-lead" data-id="${lead.id}">
      <div class="avatar">${initials(lead.name)}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(lead.name)}</div>
        <div class="item-meta">${escapeHtml(last?.text || "")}</div>
      </div>
      ${lead.channel ? `<span class="chip ${lead.channel === "instagram" ? "violet" : "green"}">${escapeHtml(channelLabel(lead.channel))}</span>` : lead.autoMode ? `<span class="chip primary">Auto</span>` : ""}
    </button>
  `;
}

function renderMessage(message) {
  const who = message.from === "assistant" ? state.clinic.assistant : message.from === "staff" ? "Equipe" : "";
  const originBadge =
    message.origin === "bot"
      ? `<span class="origin-badge bot">⚙ Bot</span>`
      : message.origin === "agent"
      ? `<span class="origin-badge agent">✦ Tawany</span>`
      : "";
  return `
    <div class="message ${message.from}">
      ${who ? `<span class="who">${escapeHtml(who)}${originBadge}</span>` : ""}
      ${escapeHtml(message.text)}
      <time>${escapeHtml(message.time)}</time>
    </div>
  `;
}

function renderAppointmentItem(appt) {
  const lead = getLead(appt.leadId);
  const statusTone = appt.status === "Confirmado" ? "green" : appt.status === "Cancelado" ? "red" : "amber";
  return `
    <div class="appointment-item">
      <span class="time-pill">${escapeHtml(appt.time)}</span>
      <div class="avatar">${initials(appt.patientName)}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(appt.patientName)}</div>
        <div class="item-meta">${formatDate(appt.date)} · ${escapeHtml(shortProfessional(appt.professional))} · ${escapeHtml(appt.type)}</div>
      </div>
      <span class="chip ${statusTone}">${escapeHtml(appt.status)}</span>
      <div class="mini-actions">
        ${appt.status !== "Confirmado" ? `<button type="button" data-action="confirm-appointment" data-id="${appt.id}">Confirmar</button>` : ""}
        ${appt.status !== "Cancelado" ? `<button type="button" data-action="cancel-appointment" data-id="${appt.id}">Cancelar</button>` : ""}
        ${lead ? `<button type="button" data-action="select-lead" data-id="${lead.id}">Inbox</button>` : ""}
      </div>
    </div>
  `;
}

function renderActivity(item) {
  return `
    <div class="timeline-item">
      <span class="time-pill">${escapeHtml(item.time)}</span>
      <div class="item-main">
        <div class="item-title">${escapeHtml(item.text)}</div>
      </div>
      <span class="chip ${item.tone}">ok</span>
    </div>
  `;
}

function renderFollowUp(lead) {
  return `
    <div class="follow-item">
      <div class="avatar">${initials(lead.name)}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(lead.name)}</div>
        <div class="item-meta">${escapeHtml(lead.nextStep)} · ${formatDate(lead.followUp)}</div>
      </div>
      <button class="secondary-button" type="button" data-action="select-lead" data-id="${lead.id}">Abrir</button>
    </div>
  `;
}

function renderStageBar(stage) {
  const count = state.leads.filter((lead) => lead.stage === stage.id).length;
  const width = state.leads.length ? Math.max(6, Math.round((count / state.leads.length) * 100)) : 0;
  return `
    <div>
      <div class="bar-label">
        <span>${stage.label}</span>
        <strong>${count}</strong>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
    </div>
  `;
}

function renderTransaction(tx) {
  const tone = tx.status === "Pago" ? "green" : "amber";
  return `
    <div class="transaction-row">
      <div class="item-main">
        <div class="item-title">${escapeHtml(tx.description)}</div>
        <div class="item-meta">${escapeHtml(tx.category)} · ${formatDate(tx.dueDate)}</div>
      </div>
      <div class="amount">${formatMoney(tx.amount)}</div>
      <span class="chip ${tone}">${escapeHtml(tx.status)}</span>
      <div class="mini-actions">
        ${tx.status !== "Pago" ? `<button type="button" data-action="mark-paid" data-id="${tx.id}">Baixar</button>` : ""}
      </div>
    </div>
  `;
}

function renderOriginBars(total) {
  const sources = {};
  state.leads.forEach((lead) => {
    const linked = state.transactions.filter((tx) => tx.leadId === lead.id);
    const amount = linked.reduce((sum, tx) => sum + Number(tx.amount), 0);
    sources[lead.source] = (sources[lead.source] || 0) + amount;
  });
  return Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .map(([source, amount]) => {
      const width = total ? Math.max(5, Math.round((amount / total) * 100)) : 0;
      return `
        <div>
          <div class="bar-label">
            <span>${escapeHtml(source)}</span>
            <strong>${formatMoney(amount)}</strong>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function kpi(label, value, note, icon) {
  return `
    <article class="kpi">
      <span class="kpi-icon" aria-hidden="true">${icon}</span>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-note">${note}</div>
    </article>
  `;
}

function renderOpsMetric(label, value, note) {
  return `
    <article class="ops-metric">
      <strong>${value}</strong>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function renderConversationOps(lead) {
  const tags = [
    lead.source || "origem",
    lead.stage === "proposta" ? "orcamento" : "qualificacao",
    lead.autoMode ? "auto" : "humano",
  ];
  return `
    <div class="conversation-ops">
      <div class="summary-stat">
        <div class="summary-label">Responsavel</div>
        <div class="summary-value">Recepcao QARA</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Etiquetas</div>
        <div class="tag-row">${tags.map((tag) => `<span class="chip primary">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Nota interna</div>
        <div class="internal-note">${escapeHtml(lead.nextStep || "Acompanhar conversa")}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">SLA</div>
        <div class="summary-value">${lead.followUp <= todayISO() ? "Atender hoje" : `Retorno ${formatDate(lead.followUp)}`}</div>
      </div>
    </div>
  `;
}

function renderLeadListRow(lead) {
  return `
    <article class="record-row">
      <div class="avatar">${initials(lead.name)}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(lead.name)}</div>
        <div class="item-meta">${escapeHtml(lead.source)} · ${escapeHtml(lead.interest)}</div>
      </div>
      <span class="chip ${stageTone(lead.stage)}">${escapeHtml(stageLabel(lead.stage))}</span>
      <strong>${formatMoney(lead.value)}</strong>
      <button type="button" data-action="select-lead" data-id="${lead.id}">Detalhe</button>
    </article>
  `;
}

function countAgendaConflicts(appointments) {
  const seen = new Set();
  let conflicts = 0;
  appointments.forEach((appt) => {
    const key = `${appt.professional}-${appt.time}`;
    if (seen.has(key)) conflicts += 1;
    seen.add(key);
  });
  return conflicts;
}

function freeSlotsForDate(date) {
  const busy = state.appointments.filter((appt) => appt.date === date && appt.status !== "Cancelado").length;
  return Math.max(times.length * professionals.length - busy, 0);
}

function renderBudgetCard(lead) {
  const gross = Number(lead.value || 0);
  const fee = Math.round(gross * 0.035);
  const cost = Math.round(gross * 0.28);
  const repass = Math.round(gross * 0.32);
  const margin = gross - fee - cost - repass;
  return `
    <article class="budget-card">
      <div class="budget-head">
        <strong>${escapeHtml(lead.name)}</strong>
        <span class="chip ${stageTone(lead.stage)}">${escapeHtml(stageLabel(lead.stage))}</span>
      </div>
      <div class="budget-lines">
        <span>Bruto <strong>${formatMoney(gross)}</strong></span>
        <span>Taxas <strong>${formatMoney(fee)}</strong></span>
        <span>Custos <strong>${formatMoney(cost)}</strong></span>
        <span>Margem <strong>${formatMoney(margin)}</strong></span>
      </div>
    </article>
  `;
}

function renderWorkflowCard(name, note, status) {
  const active = status === "ativo";
  return `
    <article class="workflow-card">
      <span class="chip ${active ? "green" : "amber"}">${escapeHtml(status)}</span>
      <strong>${escapeHtml(name)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function renderPermissionRow(role, scope, note) {
  return `
    <div class="permission-row">
      <strong>${escapeHtml(role)}</strong>
      <span>${escapeHtml(scope)}</span>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function openLeadModal() {
  openModal(`
    <div class="modal-header">
      <h2>Novo lead</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="lead" class="form-grid">
      <div class="field">
        <label for="lead-name">Nome</label>
        <input id="lead-name" name="name" required />
      </div>
      <div class="field">
        <label for="lead-phone">WhatsApp</label>
        <input id="lead-phone" name="phone" required placeholder="+55 81 99999-9999" />
      </div>
      <div class="field">
        <label for="lead-source">Origem</label>
        <select id="lead-source" name="source">
          <option>Instagram</option>
          <option>Google</option>
          <option>Indicacao</option>
          <option>Retorno</option>
          <option>Site</option>
        </select>
      </div>
      <div class="field">
        <label for="lead-interest">Interesse</label>
        <input id="lead-interest" name="interest" required placeholder="Avaliacao, procedimento, retorno" />
      </div>
      <div class="field">
        <label for="lead-value">Valor estimado</label>
        <input id="lead-value" name="value" type="number" min="0" step="10" value="${state.clinic.defaultConsultValue}" />
      </div>
      <div class="field">
        <label for="lead-follow">Follow-up</label>
        <input id="lead-follow" name="followUp" type="date" value="${todayISO()}" />
      </div>
      <div class="field full">
        <label for="lead-next">Proximo passo</label>
        <input id="lead-next" name="nextStep" value="Enviar opcoes de horario" />
      </div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">Criar lead</button>
      </div>
    </form>
  `);
}

function openAppointmentModal(leadId = "") {
  const lead = getLead(leadId) || getSelectedLead();
  openModal(`
    <div class="modal-header">
      <h2>Novo agendamento</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="appointment" class="form-grid">
      <div class="field">
        <label for="appt-lead">Lead</label>
        <select id="appt-lead" name="leadId" required>
          ${state.leads.map((item) => `<option value="${item.id}" ${lead?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="appt-type">Tipo</label>
        <select id="appt-type" name="type">
          <option>Avaliacao</option>
          <option>Consulta</option>
          <option>Procedimento</option>
          <option>Retorno comercial</option>
        </select>
      </div>
      <div class="field">
        <label for="appt-professional">Profissional</label>
        <select id="appt-professional" name="professional">
          ${professionals.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="appt-date">Data</label>
        <input id="appt-date" name="date" type="date" value="${ui.agendaDate}" required />
      </div>
      <div class="field">
        <label for="appt-time">Horario</label>
        <select id="appt-time" name="time">
          ${times.map((time) => `<option>${time}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="appt-value">Valor</label>
        <input id="appt-value" name="value" type="number" min="0" step="10" value="${lead?.value || state.clinic.defaultConsultValue}" />
      </div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">Agendar</button>
      </div>
    </form>
  `);
}

function openTransactionModal() {
  openModal(`
    <div class="modal-header">
      <h2>Novo lancamento</h2>
      <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
    </div>
    <form data-form="transaction" class="form-grid">
      <div class="field full">
        <label for="tx-description">Descricao</label>
        <input id="tx-description" name="description" required />
      </div>
      <div class="field">
        <label for="tx-lead">Lead</label>
        <select id="tx-lead" name="leadId">
          <option value="">Sem lead</option>
          ${state.leads.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="tx-category">Categoria</label>
        <select id="tx-category" name="category">
          <option>Consulta</option>
          <option>Procedimento</option>
          <option>Pacote</option>
          <option>Outro</option>
        </select>
      </div>
      <div class="field">
        <label for="tx-amount">Valor</label>
        <input id="tx-amount" name="amount" type="number" min="0" step="10" required />
      </div>
      <div class="field">
        <label for="tx-due">Vencimento</label>
        <input id="tx-due" name="dueDate" type="date" value="${todayISO()}" required />
      </div>
      <div class="field">
        <label for="tx-status">Status</label>
        <select id="tx-status" name="status">
          <option>Pendente</option>
          <option>Pago</option>
        </select>
      </div>
      <div class="modal-actions full">
        <button class="secondary-button" type="button" data-action="close-modal">Cancelar</button>
        <button class="primary-button" type="submit">Lancar</button>
      </div>
    </form>
  `);
}

function openModal(content) {
  document.querySelector("#modal-root").innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        ${content}
      </div>
    </div>
  `;
}

function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
}

function createLead(data) {
  const newLead = {
    id: uid("lead"),
    name: clean(data.name),
    phone: clean(data.phone),
    source: clean(data.source),
    interest: clean(data.interest),
    stage: "entrada",
    value: Number(data.value || state.clinic.defaultConsultValue),
    nextStep: clean(data.nextStep || "Enviar opcoes de horario"),
    followUp: data.followUp || todayISO(),
    autoMode: true,
    createdAt: todayISO(),
    messages: seedMessages(clean(data.name), clean(data.source), clean(data.interest), "entrada"),
  };
  state.leads.unshift(newLead);
  ui.selectedLeadId = newLead.id;
  addActivity(`Novo lead: ${newLead.name}.`, "blue");
  closeModal();
  saveAndRender("Lead criado.");
  pushLeadToDb(newLead).then((created) => {
    if (!created) return;
    ui.inbox.list = null;
    if (ui.view === "inbox") renderInbox();
  });
}

function createAppointment(data) {
  const lead = getLead(data.leadId);
  if (!lead) return toast("Lead nao encontrado.");
  const conflict = state.appointments.find(
    (item) =>
      item.id !== data.id &&
      item.status !== "Cancelado" &&
      item.professional === data.professional &&
      item.date === data.date &&
      item.time === data.time,
  );
  if (conflict) {
    toast(`Conflito com ${conflict.patientName} no mesmo horario.`);
    return;
  }
  const appt = {
    id: uid("appt"),
    leadId: lead.id,
    patientName: lead.name,
    professional: clean(data.professional),
    date: data.date,
    time: data.time,
    type: clean(data.type),
    status: "Confirmado",
    value: Number(data.value || lead.value || 0),
  };
  state.appointments.push(appt);
  lead.stage = "agendado";
  lead.nextStep = "Confirmar presenca";
  lead.followUp = appt.date;
  lead.messages.push({
    from: "system",
    text: `Agenda criada: ${formatDate(appt.date)} as ${appt.time} com ${shortProfessional(appt.professional)}.`,
    time: nowTime(),
  });
  const apptTx = {
    id: uid("tx"),
    description: `${appt.type} ${lead.name}`,
    category: appt.type,
    amount: appt.value,
    dueDate: appt.date,
    status: "Pendente",
    leadId: lead.id,
  };
  state.transactions.push(apptTx);
  ui.agendaDate = appt.date;
  addActivity(`Agendamento criado para ${lead.name}.`, "primary");
  closeModal();
  saveAndRender("Agendamento criado.");
  pushLeadStageToDb(lead, "agendado");
  pushAppointmentToDb(appt);
  pushTransactionToDb(apptTx);
}

function createTransaction(data) {
  const tx = {
    id: uid("tx"),
    description: clean(data.description),
    category: clean(data.category),
    amount: Number(data.amount || 0),
    dueDate: data.dueDate,
    status: clean(data.status),
    leadId: data.leadId || "",
  };
  state.transactions.unshift(tx);
  closeModal();
  saveAndRender("Lancamento criado.");
  pushTransactionToDb(tx);
}

function saveSettings(data) {
  state.clinic = {
    name: clean(data.name),
    unit: clean(data.unit),
    assistant: clean(data.assistant),
    defaultConsultValue: Number(data.defaultConsultValue || 0),
  };
  saveAndRender("Ajustes salvos.");
}

function selectLead(id) {
  ui.selectedLeadId = id;
  ui.view = "inbox";
  window.location.hash = "inbox";
  render();
}

function moveLead(id, stage) {
  const lead = getLead(id);
  if (!lead || !stages.some((item) => item.id === stage)) return;
  lead.stage = stage;
  lead.nextStep = stage === "fechado" ? "Receber saldo e acompanhar satisfacao" : lead.nextStep;
  addActivity(`${lead.name} movido para ${stageLabel(stage)}.`, stageTone(stage));
  saveAndRender("Funil atualizado.");
  pushLeadStageToDb(lead, stage);
}

function deleteLead(id) {
  const lead = getLead(id);
  if (!lead) return;
  if (!confirm(`Excluir ${lead.name}?`)) return;
  state.leads = state.leads.filter((item) => item.id !== id);
  state.appointments = state.appointments.filter((item) => item.leadId !== id);
  state.transactions = state.transactions.filter((item) => item.leadId !== id);
  ui.selectedLeadId = state.leads[0]?.id || "";
  saveAndRender("Lead excluido.");
}

async function sendComposedMessage() {
  const input = document.querySelector("#message-input");
  const text = clean(input?.value || "");
  if (!text) return;
  const lead = getSelectedLead();
  lead.messages.push({ from: "staff", text, time: nowTime() });
  input.value = "";
  addActivity(`Equipe respondeu ${lead.name}.`, "primary");
  const sent = await sendExternalMessage(lead, text);
  saveAndRender(sent ? "Mensagem enviada pelo canal." : "Mensagem salva localmente.");
}

async function receivePatientMessage() {
  const input = document.querySelector("#patient-message-input");
  const text = clean(input?.value || "");
  if (!text) return;
  const lead = getSelectedLead();
  lead.messages.push({ from: "patient", text, time: nowTime() });
  input.value = "";

  // Fluxo hibrido (espelha o servidor): abertura -> bot; depois -> agente Tawany.
  const agentState = lead.agentState || {};
  const hadOutbound = lead.messages.some((message) => message.from === "assistant");
  const isOpening = !hadOutbound && !agentState.botIntroDone;

  let result = null;
  let via = "";

  if (isOpening) {
    result = processBots(lead, text);
    if (result) {
      lead.agentState = { ...agentState, botIntroDone: true, botIntroAt: Date.now() };
      via = "Bot (abertura)";
    }
  }

  if (!result) {
    const agentResult = await runServerAgentForLead(lead, text);
    result = agentResult || processBots(lead, text);
    via = agentResult ? "Agente IA" : result ? "Bot" : "";
  }

  addActivity(`${lead.name} enviou mensagem recebida.`, result ? "green" : "amber");
  persist();
  render();
  toast(result ? `${via} respondeu.` : "Mensagem recebida sem regra automatica.");
}

async function apiFetch(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem(AUTH_TOKEN_STORAGE) || "";
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && !document.body.classList.contains("auth-locked")) {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE);
    sessionStorage.removeItem(AUTH_USER_STORAGE);
    renderLogin("Sessao expirada. Entre novamente.");
  }
  return response;
}

async function dbWrite(path, method, body, target) {
  try {
    const response = await apiFetch(
      path,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      false,
    );
    if (!response.ok) return null;
    const payload = await response.json();
    if (target && payload.data?.id) {
      target.dbId = payload.data.id;
      persist();
    }
    return payload.data || null;
  } catch {
    return null;
  }
}

async function loadOperations(showToast = false) {
  ui.ops.loading = true;
  ui.ops.error = "";
  if (ui.view === "operations") renderOperations();
  try {
    const [briefingRes, pipelineRes, followupsRes] = await Promise.all([
      apiFetch("/api/reports/daily-briefing", {}, false),
      apiFetch("/api/reports/pipeline-analysis", {}, false),
      apiFetch("/api/followups", {}, false),
    ]);
    if (!briefingRes.ok || !pipelineRes.ok || !followupsRes.ok) throw new Error("Nao foi possivel carregar a operacao.");
    const [briefing, pipeline, followups] = await Promise.all([briefingRes.json(), pipelineRes.json(), followupsRes.json()]);
    ui.ops.briefing = briefing.data || {};
    ui.ops.pipeline = pipeline.data || {};
    ui.ops.followups = followups.data || {};
    if (showToast) toast("Operacao atualizada.");
  } catch (error) {
    ui.ops.error = error.message || "Erro ao carregar operacao.";
  } finally {
    ui.ops.loading = false;
    if (ui.view === "operations") renderOperations();
  }
}

async function downloadCsv(type) {
  try {
    const response = await apiFetch(`/api/export?type=${encodeURIComponent(type)}`, {}, false);
    if (!response.ok) throw new Error("Exportacao indisponivel.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("CSV exportado.");
  } catch (error) {
    toast(error.message || "Falha ao exportar CSV.");
  }
}

async function importLeadsCsv(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const response = await apiFetch("/api/import/leads", { method: "POST", headers: { "Content-Type": "text/csv" }, body: text }, false);
    if (!response.ok) throw new Error("Importacao indisponivel.");
    const payload = await response.json();
    toast(`${payload.data?.imported || 0} lead(s) importado(s).`);
    await hydrateLeadsFromDb();
    await loadOperations();
  } catch (error) {
    toast(error.message || "Falha ao importar CSV.");
  } finally {
    const input = document.querySelector("#ops-csv-file");
    if (input) input.value = "";
  }
}

async function recalculateLeadScores() {
  try {
    const response = await apiFetch("/api/leads/score-all", { method: "POST" }, false);
    if (!response.ok) throw new Error("Recalculo indisponivel.");
    const payload = await response.json();
    toast(`${payload.data?.updated || 0} lead(s) recalculado(s).`);
    await hydrateLeadsFromDb();
    await loadOperations();
  } catch (error) {
    toast(error.message || "Falha ao recalcular scores.");
  }
}

async function copyText(text, message = "Copiado.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast(text);
  }
}

// ───── Cutover de Leads para o banco (best-effort, sem apagar leads locais) ─────

function mapDbLeadToUi(d) {
  return {
    id: `db-${d.id}`,
    dbId: d.id,
    name: d.name,
    phone: d.phone || "",
    email: d.email || "",
    source: d.source || "Banco",
    interest: d.interest || "Atendimento",
    stage: STAGE_DB_TO_UI[d.stage] || "entrada",
    score: Number(d.score || 0),
    temperature: d.temperature || "",
    classification: d.classification || null,
    value: Number(d.estimatedValue || state.clinic.defaultConsultValue),
    nextStep: d.nextAction || "Acompanhar lead",
    followUp: d.nextActionAt ? String(d.nextActionAt).slice(0, 10) : todayISO(),
    autoMode: true,
    createdAt: d.createdAt ? String(d.createdAt).slice(0, 10) : todayISO(),
    messages: [],
  };
}

// ESPELHA os leads do banco no estado. Quando o banco tem leads reais, ele vira
// fonte visual do Funil e os dados demo locais deixam de aparecer.
async function hydrateLeadsFromDb() {
  try {
    const response = await apiFetch("/api/leads", {}, false);
    if (!response.ok) return;
    const payload = await response.json();
    const dbLeads = payload.data || [];
    const before = JSON.stringify(state.leads.map((lead) => [lead.id, lead.dbId, lead.name, lead.phone, lead.stage, lead.score]));

    if (dbLeads.length) {
      const localUnsynced = state.leads.filter((lead) => !lead.dbId && !isSeedDemoLead(lead));
      state.leads = [...dbLeads.map(mapDbLeadToUi), ...localUnsynced];
      state.appointments = state.appointments.filter((appt) => !isSeedDemoRecord(appt.id, "appt") && !isSeedDemoLeadId(appt.leadId));
      state.transactions = state.transactions.filter((tx) => !isSeedDemoRecord(tx.id, "tx") && !isSeedDemoLeadId(tx.leadId));
    } else {
      state.leads = state.leads.filter((lead) => !lead.dbId);
    }

    const after = JSON.stringify(state.leads.map((lead) => [lead.id, lead.dbId, lead.name, lead.phone, lead.stage, lead.score]));
    const changed = before !== after;
    if (changed) {
      persist();
      render();
      if (dbLeads.length) toast(`${dbLeads.length} lead(s) sincronizado(s) do banco.`);
    }
  } catch {
    /* offline: segue com localStorage */
  }
}

// Bots: banco é a fonte de verdade. Primeira execução sobe os bots semente locais.
async function hydrateBotsFromDb() {
  try {
    const res = await apiFetch("/api/bots", {}, false);
    if (!res.ok) return;
    let dbBots = (await res.json()).data || [];
    if (!dbBots.length && (state.visualBots || []).length) {
      for (const b of state.visualBots) {
        const created = await dbWrite("/api/bots", "POST", { name: b.name, trigger: b.trigger, active: b.active, steps: b.steps || [] });
        if (created) dbBots.push(created);
      }
    }
    if (!dbBots.length) return;
    state.visualBots = dbBots.map((b) => ({
      id: b.id, name: b.name, trigger: b.trigger, active: b.active,
      steps: Array.isArray(b.steps) ? b.steps : [],
    }));
    if (!state.visualBots.some((b) => b.id === ui.selectedVisualBotId)) ui.selectedVisualBotId = state.visualBots[0]?.id || "";
    persist();
    if (ui.view === "bots") render();
  } catch {
    /* offline: segue com localStorage */
  }
}

function isSeedDemoLead(lead) {
  return isSeedDemoLeadId(lead?.id);
}

function isSeedDemoLeadId(id) {
  return /^lead-\d+$/.test(String(id || ""));
}

function isSeedDemoRecord(id, prefix) {
  return new RegExp(`^${prefix}-\\d+$`).test(String(id || ""));
}

function pushLeadToDb(lead) {
  return dbWrite("/api/leads", "POST", {
    name: lead.name,
    phone: lead.phone,
    source: lead.source,
    interest: lead.interest,
    stage: STAGE_UI_TO_DB[lead.stage] || "NEW",
    estimatedValue: lead.value,
    nextAction: lead.nextStep,
  }, lead);
}

// Atualiza a etapa do lead no banco (se ele tiver dbId).
function pushLeadStageToDb(lead, uiStage) {
  if (!lead.dbId) return;
  dbWrite(`/api/leads/${lead.dbId}`, "PATCH", { stage: STAGE_UI_TO_DB[uiStage] || "NEW" });
}

// ───── Cutover de Agenda (medicos reais) e Financeiro (lancamentos = pagamentos) ─────

const APPT_STATUS_UI_TO_DB = { Confirmado: "CONFIRMED", Cancelado: "CANCELED", Agendado: "SCHEDULED" };
const APPT_STATUS_DB_TO_UI = { CONFIRMED: "Confirmado", CANCELED: "Cancelado", SCHEDULED: "Agendado", NO_SHOW: "Cancelado", ATTENDED: "Confirmado" };
const PAY_STATUS_UI_TO_DB = { Pago: "PAID", Pendente: "PENDING" };

// Carrega o mapa nome->id dos profissionais do banco.
async function hydrateProfessionalsFromDb() {
  try {
    const response = await apiFetch("/api/professionals", {}, false);
    if (!response.ok) return;
    const payload = await response.json();
    (payload.data || []).forEach((p) => {
      professionalDbIdByName[p.name] = p.id;
    });
  } catch {
    /* offline */
  }
}

// Grava uma consulta nova no banco (resolve profissional + lead pelo nome/dbId).
function pushAppointmentToDb(appt) {
  const professionalId = professionalDbIdByName[appt.professional];
  if (!professionalId) return; // profissional nao mapeado: fica so local
  const lead = getLead(appt.leadId);
  const startAt = new Date(`${appt.date}T${appt.time || "09:00"}:00`).toISOString();
  return dbWrite("/api/appointments", "POST", {
    professionalId,
    leadId: lead?.dbId || null,
    startAt,
    status: APPT_STATUS_UI_TO_DB[appt.status] || "CONFIRMED",
    value: appt.value,
  }, appt);
}

function pushAppointmentStatusToDb(appt) {
  if (!appt.dbId) return;
  dbWrite(`/api/appointments/${appt.dbId}`, "PATCH", { status: APPT_STATUS_UI_TO_DB[appt.status] || "SCHEDULED" });
}

// Lancamento -> Payment no banco (valor + status). Descricao/categoria ficam so na UI.
function pushTransactionToDb(tx) {
  return dbWrite("/api/payments", "POST", {
    amount: tx.amount,
    method: "PIX",
    status: PAY_STATUS_UI_TO_DB[tx.status] || "PENDING",
  }, tx);
}

function pushTransactionPaidToDb(tx) {
  if (!tx.dbId) return;
  dbWrite(`/api/payments/${tx.dbId}`, "PATCH", { status: "PAID", paidAt: new Date().toISOString() });
}

// Espelha as consultas do banco no estado (igual aos leads): dbId reflete o banco.
async function hydrateAppointmentsFromDb() {
  try {
    const response = await apiFetch("/api/appointments", {}, false);
    if (!response.ok) return;
    const payload = await response.json();
    const dbAppts = payload.data || [];
    const dbIds = new Set(dbAppts.map((a) => a.id));
    state.appointments = state.appointments.filter((a) => !a.dbId || dbIds.has(a.dbId));
    let changed = false;
    dbAppts.forEach((a) => {
      const start = new Date(a.startAt);
      const existing = state.appointments.find((x) => x.dbId === a.id);
      const mapped = {
        date: start.toISOString().slice(0, 10),
        time: start.toTimeString().slice(0, 5),
        professional: a.professional?.name || "",
        status: APPT_STATUS_DB_TO_UI[a.status] || "Confirmado",
        value: Number(a.value || 0),
        type: a.appointmentType?.name || "Consulta",
        patientName: a.lead?.name || a.patient?.name || "Paciente",
        leadId: a.lead?.id ? `db-${a.lead.id}` : "",
      };
      if (existing) {
        if (existing.leadId !== mapped.leadId) changed = true;
        Object.assign(existing, mapped);
      } else {
        state.appointments.push({ id: `db-${a.id}`, dbId: a.id, leadId: "", ...mapped });
        changed = true;
      }
    });
    if (changed) {
      persist();
      render();
    }
  } catch {
    /* offline */
  }
}

async function runServerAgentForLead(lead, text) {
  try {
    const response = await apiFetch("/api/agent/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead: {
          id: lead.id,
          name: lead.name,
          stage: lead.stage,
          nextStep: lead.nextStep,
          agentState: lead.agentState || {},
        },
        text,
        messages: lead.messages.slice(-12),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.replies?.length) return null;

    data.replies.forEach((reply) => {
      lead.messages.push({ from: "assistant", origin: "agent", text: reply, time: nowTime() });
    });
    lead.messages.push({ from: "system", text: `Agente IA aplicado: ${data.agentName}`, time: nowTime() });
    lead.agentState = data.agentState || lead.agentState || {};
    applyAgentActionsToLead(lead, data.actions || []);
    if (lead.agentState.stage) lead.stage = mapAgentStage(lead.agentState.stage, lead.stage);
    if (lead.agentState.nextStep) lead.nextStep = lead.agentState.nextStep;
    return { name: data.agentName || "OpenAI", replies: data.replies, actions: data.actions || [] };
  } catch {
    return null;
  }
}

function applyAgentActionsToLead(lead, actions) {
  const agentState = lead.agentState || {};
  actions.forEach((action) => {
    const type = clean(action.type);
    const value = clean(action.value);
    if (!type || !value) return;
    if (type === "set_stage") {
      agentState.stage = value;
      lead.stage = mapAgentStage(value, lead.stage);
    }
    if (type === "set_next_step") {
      agentState.nextStep = value;
      lead.nextStep = value;
    }
    if (type === "handoff_human") {
      agentState.handoff = { reason: value, at: Date.now() };
      lead.autoMode = false;
    }
    if (type === "save_memory") {
      agentState.notes = [...(agentState.notes || []), { text: value, at: Date.now() }].slice(-12);
    }
  });
  lead.agentState = agentState;
}

async function sendExternalMessage(lead, text) {
  if (!lead?.channel || !lead.externalId || !["whatsapp", "instagram"].includes(lead.channel)) return false;
  try {
    const response = await apiFetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: lead.channel, externalId: lead.externalId, text }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      toast(`Canal nao enviou: ${result.error || result.provider?.error || "erro"}.`);
      return false;
    }
    return true;
  } catch {
    toast("Servidor de canais indisponivel. Rode npm start para envio real.");
    return false;
  }
}

async function refreshIntegrationStatus(force = false) {
  if (ui.view !== "channels") return;
  if (!force && (ui.integrationStatus || ui.integrationLoading)) return;
  ui.integrationLoading = true;
  try {
    const response = await apiFetch("/api/integrations/status");
    if (!response.ok) throw new Error("status_unavailable");
    ui.integrationStatus = await response.json();
    ui.integrationError = "";
  } catch {
    ui.integrationStatus = { ok: false, configured: {}, conversations: 0, messages: 0 };
    ui.integrationError = "Abra pelo servidor local com npm start para ativar WhatsApp API e Instagram.";
  } finally {
    ui.integrationLoading = false;
    if (ui.view === "channels") render();
  }
}

async function syncExternalConversations() {
  try {
    const response = await apiFetch("/api/conversations");
    if (!response.ok) throw new Error("sync_failed");
    const data = await response.json();
    const conversations = data.conversations || [];
    conversations.forEach(importConversationAsLead);
    persist();
    render();
    toast(`${conversations.length} conversa(s) sincronizada(s).`);
  } catch {
    toast("Nao foi possivel sincronizar. Rode npm start e configure o webhook.");
  }
}

function importConversationAsLead(conversation) {
  const id = `channel-${conversation.channel}-${conversation.externalId}`;
  let lead = state.leads.find(
    (item) => item.id === id || (item.channel === conversation.channel && item.externalId === conversation.externalId),
  );
  if (!lead) {
    lead = {
      id,
      name: conversation.name || `${channelLabel(conversation.channel)} ${conversation.externalId}`,
      phone: conversation.phone || conversation.externalId,
      source: channelLabel(conversation.channel),
      interest: "Atendimento via canal",
      stage: "entrada",
      value: state.clinic.defaultConsultValue,
      nextStep: "Responder conversa",
      followUp: todayISO(),
      autoMode: true,
      createdAt: todayISO(),
      channel: conversation.channel,
      externalId: conversation.externalId,
      messages: [],
    };
    state.leads.unshift(lead);
  }

  lead.channel = conversation.channel;
  lead.externalId = conversation.externalId;
  lead.name = conversation.name || lead.name;
  lead.phone = conversation.phone || lead.phone;
  lead.messages = (conversation.messages || []).map(convertChannelMessage);
  lead.agentState = conversation.agentState || {};
  if (lead.agentState.stage) lead.stage = mapAgentStage(lead.agentState.stage, lead.stage);
  if (lead.agentState.nextStep) lead.nextStep = lead.agentState.nextStep;
  ui.selectedLeadId = lead.id;
}

function convertChannelMessage(message) {
  return {
    from: message.direction === "inbound" ? "patient" : "assistant",
    text: message.text,
    time: formatMessageTime(message.timestamp),
  };
}

async function copyWebhookUrl() {
  const url = ui.integrationStatus?.webhookUrl || "http://localhost:3000/webhooks/meta";
  try {
    await navigator.clipboard.writeText(url);
    toast("Webhook copiado.");
  } catch {
    toast(url);
  }
}

async function sendTemplate(template) {
  const lead = getSelectedLead();
  if (!lead) return;
  const textByTemplate = {
    valor: `A avaliacao na ${state.clinic.name} fica em ${formatMoney(state.clinic.defaultConsultValue)}. Posso conferir um horario para voce?`,
    horarios: `Tenho horarios disponiveis amanha as 09:00 ou 10:00. Qual fica melhor para voce?`,
    confirmacao: `Perfeito. Vou deixar seu horario pre-confirmado e envio o lembrete antes do atendimento.`,
    humano: `Vou passar sua conversa para a equipe agora. Ela continua por aqui com voce.`,
  };
  const text = textByTemplate[template];
  lead.messages.push({ from: "assistant", text, time: nowTime() });
  if (template === "humano") lead.autoMode = false;
  addActivity(`${state.clinic.assistant} respondeu ${lead.name}.`, "green");
  const sent = await sendExternalMessage(lead, text);
  saveAndRender(sent ? "Resposta enviada pelo canal." : "Resposta enviada localmente.");
}

function processBots(lead, text) {
  if (!lead?.autoMode) return null;
  const bots = (state.bots || []).filter((bot) => bot.active);
  for (const bot of bots) {
    const rule = findMatchingRule(bot, text);
    if (!rule) continue;
    const responses = (rule.responses || []).filter(Boolean).slice(0, 4);
    responses.forEach((response) => {
      lead.messages.push({ from: "assistant", origin: "bot", text: cleanBotText(response), time: nowTime() });
    });
    lead.messages.push({ from: "system", text: `Fluxo automatico aplicado: ${bot.name}`, time: nowTime() });
    lead.stage = inferBotStage(lead.stage, responses);
    lead.nextStep = inferNextStep(lead.nextStep, responses);
    addActivity(`${bot.name} respondeu ${lead.name}.`, "green");
    return { bot, rule, name: bot.name };
  }
  return null;
}

function findMatchingRule(bot, text) {
  const incoming = normalize(text);
  return (bot.rules || []).find((rule) =>
    (rule.terms || []).some((term) => {
      const candidate = normalize(term);
      if (!candidate) return false;
      if (candidate.length <= 2) return incoming === candidate;
      return incoming === candidate || incoming.includes(candidate) || candidate.includes(incoming);
    }),
  );
}

function inferBotStage(currentStage, responses) {
  const joined = normalize(responses.join(" "));
  if (joined.includes("qual dia") || joined.includes("horario ficam melhores")) return "proposta";
  if (joined.includes("qual area") || joined.includes("cidade deseja")) return "qualificacao";
  return currentStage === "entrada" ? "qualificacao" : currentStage;
}

function inferNextStep(current, responses) {
  const joined = normalize(responses.join(" "));
  if (joined.includes("qual dia") || joined.includes("horario ficam melhores")) return "Aguardar melhor dia e horario";
  if (joined.includes("qual area")) return "Aguardar area de interesse";
  if (joined.includes("cidade deseja")) return "Aguardar cidade/unidade";
  return current;
}

function cleanBotText(text) {
  return clean(text)
    .replaceAll("*", "")
    .replace(/\n{3,}/g, "\n\n");
}

function toggleBot(id) {
  const bot = getBot(id);
  if (!bot) return;
  bot.active = !bot.active;
  saveAndRender(bot.active ? "Bot ativado." : "Bot pausado.");
}

function deleteBot(id) {
  const bot = getBot(id);
  if (!bot) return;
  if (!confirm(`Excluir o bot ${bot.name}?`)) return;
  state.bots = (state.bots || []).filter((item) => item.id !== id);
  saveAndRender("Bot excluido.");
}

function testBot() {
  const leadId = document.querySelector("#bot-test-lead")?.value;
  const text = clean(document.querySelector("#bot-test-message")?.value || "");
  const lead = getLead(leadId);
  if (!lead || !text) return toast("Escolha um lead e uma mensagem.");
  ui.selectedLeadId = lead.id;
  lead.messages.push({ from: "patient", text, time: nowTime() });
  const result = processBots(lead, text);
  persist();
  render();
  toast(result ? `Bot ${result.name} respondeu na inbox.` : "Nenhuma regra encontrada para essa mensagem.");
}

async function sendAgentTestMessage() {
  const t = ui.agentTest;
  if (t.busy) return;
  // Captura nome e mensagem do DOM antes de re-renderizar.
  t.name = clean(document.querySelector("#agent-test-name")?.value || "");
  const text = clean(document.querySelector("#agent-test-input")?.value || "");
  if (!text) return toast("Digite uma mensagem do paciente.");

  t.messages.push({ from: "patient", text });
  t.draft = "";
  t.busy = true;
  render();

  try {
    const response = await apiFetch("/api/agent/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead: { id: "agent-tester", name: t.name, agentState: t.agentState || {} },
        text,
        messages: t.messages.slice(-12),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.replies?.length) {
      toast(`Agente indisponivel: ${data.error || "verifique AI_PROVIDER=openai e a OPENAI_API_KEY"}.`);
      return;
    }
    data.replies.forEach((reply) => t.messages.push({ from: "assistant", text: reply }));
    t.agentState = data.agentState || t.agentState || {};
    t.lastActions = data.actions || [];
    t.confidence = typeof t.agentState.lastConfidence === "number" ? t.agentState.lastConfidence : null;
  } catch {
    toast("Servidor indisponivel. Rode npm start para testar o agente.");
  } finally {
    t.busy = false;
    render();
  }
}

function resetAgentTest() {
  ui.agentTest = { name: "", draft: "", messages: [], agentState: {}, lastActions: [], confidence: null, busy: false };
  render();
  toast("Conversa de teste reiniciada.");
}

function getBot(id) {
  return (state.bots || []).find((bot) => bot.id === id);
}

function markTransactionPaid(id) {
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) return;
  tx.status = "Pago";
  addActivity(`Recebimento baixado: ${tx.description}.`, "green");
  saveAndRender("Recebimento baixado.");
  if (tx.dbId) pushTransactionPaidToDb(tx);
  else pushTransactionToDb(tx);
}

function updateAppointmentStatus(id, status) {
  const appt = state.appointments.find((item) => item.id === id);
  if (!appt) return;
  appt.status = status;
  addActivity(`${appt.patientName}: agenda ${status.toLowerCase()}.`, status === "Cancelado" ? "red" : "green");
  saveAndRender("Agenda atualizada.");
  pushAppointmentStatusToDb(appt);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cliniqara-dados-${todayISO()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast("Arquivo JSON gerado.");
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result || ""));
      if (!imported?.leads || !imported?.appointments || !imported?.transactions) {
        throw new Error("Formato invalido");
      }
      state = imported;
      ui.selectedLeadId = state.leads[0]?.id || "";
      persist();
      render();
      toast("Dados importados.");
    } catch {
      toast("Nao foi possivel importar este JSON.");
    }
  };
  reader.readAsText(file);
}

function importBotFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(String(reader.result || ""));
      const bot = parseBotFlow(raw, file.name);
      state.bots = upsertBot([...(state.bots || [])], bot);
      persist();
      render();
      toast(`Bot importado: ${bot.name}.`);
    } catch (error) {
      console.error(error);
      toast("Nao foi possivel importar este fluxo.");
    }
  };
  reader.readAsText(file);
}

function parseBotFlow(raw, source = "importado.json") {
  if (raw?.rules?.length) {
    return normalizeBot({ ...raw, source: raw.source || source });
  }
  const model = raw?.model;
  if (!model?.positions) throw new Error("Fluxo sem model.positions");
  const positions = typeof model.positions === "string" ? JSON.parse(model.positions) : model.positions;
  if (!Array.isArray(positions)) throw new Error("positions invalido");

  const blockMap = new Map(positions.map((position) => [String(position.id), position]));
  const getActions = (block) => (Array.isArray(block?.actions) ? block.actions : []);
  const getHandler = (action) => action?.params?.handler || action?.params?.params?.handler;
  const getParams = (action) => action?.params?.params || {};
  const getTexts = (block) =>
    getActions(block)
      .filter((action) => getHandler(action) === "send_message")
      .map((action) => getParams(action).text)
      .filter(Boolean);
  const getNextBlocks = (block) => {
    const ids = [];
    getActions(block).forEach((action) => {
      (action.links || []).forEach((link) => {
        if (link.block != null) ids.push(String(link.block));
      });
    });
    if (block?.goto?.block != null) ids.push(String(block.goto.block));
    return [...new Set(ids)];
  };
  const collectResponses = (startId, visited = new Set()) => {
    const id = String(startId);
    if (visited.has(id) || visited.size > 12) return [];
    const block = blockMap.get(id);
    if (!block) return [];
    visited.add(id);
    const texts = getTexts(block);
    const hasCondition = getActions(block).some((action) => getHandler(action) === "conditions");
    if (hasCondition && texts.length === 0) return [];
    const responses = [...texts];
    getNextBlocks(block).forEach((next) => {
      responses.push(...collectResponses(next, new Set(visited)));
    });
    return responses;
  };

  const rules = [];
  positions.forEach((block) => {
    getActions(block).forEach((action) => {
      if (getHandler(action) !== "conditions") return;
      const params = getParams(action);
      const conditions = Array.isArray(params.conditions) ? params.conditions : [];
      const terms = conditions.map((condition) => condition.term2).filter(Boolean);
      const links = (action.links || []).map((link) => link.block).filter((blockId) => blockId != null);
      links.forEach((targetBlock) => {
        const responses = [...new Set(collectResponses(targetBlock).map((text) => clean(text)))].filter(Boolean).slice(0, 4);
        if (terms.length && responses.length) {
          rules.push({ blockId: block.id, terms, targetBlock, responses });
        }
      });
    });
  });

  if (!rules.length) throw new Error("Nenhuma regra extraida");
  return normalizeBot({
    id: uid("bot"),
    name: model.name || source.replace(/\.json$/i, ""),
    active: true,
    source,
    mode: "first-match",
    match: "normalized-contains",
    rules,
  });
}

function normalizeBot(bot) {
  return {
    id: bot.id || uid("bot"),
    name: clean(bot.name || "Bot importado"),
    active: bot.active !== false,
    source: clean(bot.source || "Fluxo importado"),
    mode: bot.mode || "first-match",
    match: bot.match || "normalized-contains",
    rules: (bot.rules || [])
      .map((rule) => ({
        blockId: rule.blockId,
        targetBlock: rule.targetBlock,
        terms: (rule.terms || []).map(clean).filter(Boolean),
        responses: (rule.responses || []).map(clean).filter(Boolean),
      }))
      .filter((rule) => rule.terms.length && rule.responses.length),
  };
}

function upsertBot(bots, bot) {
  const normalized = normalizeBot(bot);
  const index = bots.findIndex((item) => item.id === normalized.id || item.name === normalized.name);
  if (index >= 0) bots[index] = normalized;
  else bots.push(normalized);
  return bots;
}

function resetData() {
  if (!confirm("Restaurar dados demonstrativos?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = createInitialState();
  persist();
  ui.selectedLeadId = state.leads[0]?.id || "";
  render();
  toast("Demo restaurada.");
}

function saveAndRender(message) {
  persist();
  render();
  toast(message);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addActivity(text, tone) {
  state.activity.unshift({ id: uid("act"), time: nowTime(), text, tone });
  state.activity = state.activity.slice(0, 8);
}

function filteredLeads() {
  const query = normalize(ui.leadSearch);
  if (!query) return state.leads;
  return state.leads.filter((lead) =>
    normalize(`${lead.name} ${lead.source} ${lead.interest} ${lead.phone}`).includes(query),
  );
}

function filteredInboxLeads() {
  const query = normalize(ui.inboxSearch);
  if (!query) return state.leads;
  return state.leads.filter((lead) =>
    normalize(`${lead.name} ${lead.source} ${lead.interest} ${lead.messages.at(-1)?.text || ""}`).includes(query),
  );
}

function filteredTransactions() {
  if (ui.financeFilter === "todos") return state.transactions;
  return state.transactions.filter((tx) => tx.status === ui.financeFilter);
}

function nextAppointments() {
  return state.appointments
    .filter((appt) => appt.date >= todayISO() && appt.status !== "Cancelado")
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 6);
}

function followUps() {
  return state.leads
    .filter((lead) => lead.followUp <= addDaysISO(1) && lead.stage !== "fechado")
    .sort((a, b) => a.followUp.localeCompare(b.followUp))
    .slice(0, 6);
}

function getLead(id) {
  return state.leads.find((leadItem) => leadItem.id === id);
}

function getWhatsAppTemplate(id) {
  return (state.whatsappTemplates || []).find((template) => template.id === id) || null;
}

function renderTemplatePreview(template, params = []) {
  if (!template) return "";
  let body = template.body || "";
  params.forEach((value, index) => {
    body = body.replaceAll(`{{${index + 1}}}`, value);
  });
  return body;
}

function parseTemplateButtons(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const [id, title, url] = line.split("|").map(clean);
      if (!title) return null;
      return { id: id || `btn_${index + 1}`, title, ...(url ? { url } : {}) };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function getVisualBot(id) {
  return (state.visualBots || []).find((bot) => bot.id === id) || null;
}

function upsertById(list, item) {
  const next = [...(list || [])];
  const index = next.findIndex((entry) => entry.id === item.id);
  if (index >= 0) next[index] = item;
  else next.unshift(item);
  return next;
}

const SALESBOT_STEP_TYPES = ["message", "buttons", "list", "condition", "action", "handoff", "pause", "start", "finish"];

function salesbotStepLabel(type) {
  return {
    message: "Enviar mensagem",
    buttons: "Botões",
    list: "Lista",
    condition: "Condição",
    action: "Ação / Tag",
    handoff: "Humano",
    pause: "Pausa",
    start: "Iniciar bot",
    finish: "Fim",
  }[type] || "Passo";
}

function salesbotStepTone(type) {
  return {
    message: "primary",
    buttons: "green",
    list: "green",
    condition: "amber",
    action: "violet",
    handoff: "red",
    pause: "blue",
    start: "green",
    finish: "red",
  }[type] || "primary";
}

// Rótulo do campo "extra" por tipo (config específica do passo).
function salesbotExtraLabel(type) {
  return {
    condition: "Condição (palavra/opção, ex: unha, 1, Pele)",
    action: "Tag a aplicar (ex: Cirurgia)",
    pause: "Atraso (ex: 23h, 1 dia)",
    start: "Bot a iniciar (ex: Acompanhamento 1 dia)",
  }[type] || "Configuração (opcional)";
}

function getSelectedLead() {
  return getLead(ui.selectedLeadId) || state.leads[0];
}

function nextStageFor(id) {
  const lead = getLead(id);
  const index = stages.findIndex((stage) => stage.id === lead?.stage);
  return stages[Math.min(index + 1, stages.length - 1)]?.id || "entrada";
}

function stageLabel(stageId) {
  return stages.find((stage) => stage.id === stageId)?.label || stageId;
}

function stageTone(stageId) {
  return stages.find((stage) => stage.id === stageId)?.tone || "primary";
}

function scoreTone(score) {
  const value = Number(score || 0);
  if (value >= 70) return "green";
  if (value >= 40) return "amber";
  return "blue";
}

function toggleMenu() {
  const sidebar = document.querySelector("#sidebar");
  const backdrop = document.querySelector("#sidebar-backdrop");
  const open = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  backdrop.hidden = !open;
}

function closeMenu() {
  document.querySelector("#sidebar")?.classList.remove("open");
  const backdrop = document.querySelector("#sidebar-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function toast(message) {
  const root = document.querySelector("#toast-root");
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function appRoot() {
  return document.querySelector("#app");
}

function todayISO() {
  return toLocalISO(new Date());
}

function addDaysISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalISO(date);
}

function toLocalISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  if (!value) return "—";
  // "YYYY-MM-DD" via parseISODate (data local, sem shift de fuso); datetime ISO/Date via new Date().
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISODate(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function firstName(name) {
  return name.split(" ")[0] || name;
}

function shortProfessional(name) {
  return name.replace("Dra. ", "").replace("Dr. ", "");
}

function channelLabel(channel) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "instagram") return "Instagram";
  return "Manual";
}

function mapAgentStage(value, fallback = "entrada") {
  const normalized = normalize(value);
  if (stages.some((stage) => stage.id === normalized)) return normalized;
  if (normalized.includes("qualifica")) return "qualificacao";
  if (normalized.includes("proposta") || normalized.includes("horario")) return "proposta";
  if (normalized.includes("agenda")) return "agendado";
  if (normalized.includes("fech")) return "fechado";
  return fallback;
}

function leadContactLine(lead) {
  if (lead.channel === "instagram") return `Instagram · ${lead.externalId || "DM"}`;
  if (lead.channel === "whatsapp") return `WhatsApp · ${maskPhone(lead.phone || lead.externalId || "")}`;
  return maskPhone(lead.phone || "");
}

function maskPhone(phone) {
  return phone.replace(/(\d{2})\d{4,5}(\d{2})$/, "$1•••••$2");
}

function formatMessageTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function clean(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
