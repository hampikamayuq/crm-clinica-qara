const STORAGE_KEY = "cliniqara-crm-v4";

const stages = [
  { id: "entrada", label: "Entrada", tone: "blue" },
  { id: "qualificacao", label: "Qualificacao", tone: "violet" },
  { id: "proposta", label: "Proposta", tone: "amber" },
  { id: "agendado", label: "Agendado", tone: "primary" },
  { id: "fechado", label: "Fechado", tone: "green" },
];

const professionals = ["Dra. Helena Martins", "Dr. Ricardo Almeida", "Carla Souza"];
const times = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
const pageTitles = {
  dashboard: ["Hoje", "Operacao comercial da clinica"],
  inbox: ["Inbox", "Conversas, respostas e agendamentos"],
  leads: ["Funil", "Leads ate virarem consultas"],
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
  agendaDate: todayISO(),
  financeFilter: "todos",
  integrationStatus: null,
  integrationError: "",
  agentTest: { name: "", draft: "", messages: [], agentState: {}, lastActions: [], confidence: null, busy: false },
};

if (!pageTitles[ui.view]) ui.view = "dashboard";

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  render();
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
  if (action === "new-lead") return openLeadModal();
  if (action === "close-modal") return closeModal();
  if (action === "export-data") return exportData();
  if (action === "import-data") return document.querySelector("#import-file")?.click();
  if (action === "import-bot") return document.querySelector("#bot-import-file")?.click();
  if (action === "reset-data") return resetData();
  if (action === "select-lead") return selectLead(id);
  if (action === "next-stage") return moveLead(id, nextStageFor(id));
  if (action === "mark-won") return moveLead(id, "fechado");
  if (action === "open-appointment") return openAppointmentModal(id);
  if (action === "open-transaction") return openTransactionModal();
  if (action === "sync-channels") return syncExternalConversations();
  if (action === "copy-webhook") return copyWebhookUrl();
  if (action === "send-message") return sendComposedMessage();
  if (action === "receive-patient-message") return receivePatientMessage();
  if (action === "send-template") return sendTemplate(actionEl.dataset.template || "");
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

  if (form.dataset.form === "lead") createLead(data);
  if (form.dataset.form === "appointment") createAppointment(data);
  if (form.dataset.form === "transaction") createTransaction(data);
  if (form.dataset.form === "settings") saveSettings(data);
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
  if (target.matches("#import-file")) {
    importData(target.files?.[0]);
  }
  if (target.matches("#bot-import-file")) {
    importBotFile(target.files?.[0]);
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
  if (event.target.closest("[data-stage-column]")) event.preventDefault();
}

function handleDrop(event) {
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
      appointment("appt-1", "lead-1", "Mariana Costa", "Dra. Helena Martins", tomorrow, "09:00", "Avaliacao", "Confirmado", 750),
      appointment("appt-2", "lead-5", "Beatriz Alves", "Dra. Helena Martins", today, "10:00", "Procedimento", "Confirmado", 5400),
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
  };
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
  const conversion = Math.round((state.leads.filter((lead) => lead.stage === "fechado").length / state.leads.length) * 100);

  appRoot().innerHTML = `
    <div class="kpi-grid">
      ${kpi("Leads em aberto", newLeads, "entrada e novos", "◆")}
      ${kpi("Consultas hoje", todayAppointments.length, "sem conflitos ativos", "◧")}
      ${kpi("Recebido", formatMoney(paid), "lancamentos pagos", "◈")}
      ${kpi("Conversao", `${conversion}%`, "leads fechados", "↗")}
    </div>

    <div class="dashboard-grid">
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

function renderInbox() {
  const selected = getSelectedLead();
  if (!selected) {
    appRoot().innerHTML = emptyState("Cadastre um lead para iniciar a inbox.");
    return;
  }
  const leads = filteredInboxLeads();

  appRoot().innerHTML = `
    <div class="inbox-layout">
      <section class="inbox-list" aria-label="Conversas">
        <div class="list-search">
          <input id="inbox-search" class="search-input" type="search" value="${escapeHtml(ui.inboxSearch)}" placeholder="Buscar conversa" />
        </div>
        <div class="conversation-list">
          ${leads.map(renderConversation).join("") || emptyState("Nenhuma conversa encontrada.")}
        </div>
      </section>

      <section class="chat-pane" aria-label="Conversa selecionada">
        <div class="chat-header">
          <div class="avatar">${initials(selected.name)}</div>
          <div class="item-main">
            <div class="item-title">${escapeHtml(selected.name)}</div>
            <div class="item-meta">${escapeHtml(leadContactLine(selected))} · ${escapeHtml(stageLabel(selected.stage))}</div>
          </div>
          <div class="chat-header-spacer"></div>
          ${selected.channel ? `<span class="chip ${selected.channel === "instagram" ? "violet" : "green"}">${escapeHtml(channelLabel(selected.channel))}</span>` : ""}
          <label class="switch">
            <input type="checkbox" data-auto-mode data-id="${selected.id}" ${selected.autoMode ? "checked" : ""} />
            Auto
          </label>
        </div>
        <div class="messages" id="messages">
          ${selected.messages.map(renderMessage).join("")}
        </div>
        <div class="composer">
          <div class="template-row">
            <button type="button" data-action="send-template" data-template="valor">Valor</button>
            <button type="button" data-action="send-template" data-template="horarios">Horarios</button>
            <button type="button" data-action="send-template" data-template="confirmacao">Confirmar</button>
            <button type="button" data-action="send-template" data-template="humano">Humano</button>
          </div>
          <div class="composer-line patient-composer">
            <textarea id="patient-message-input" placeholder="Simular mensagem recebida do paciente"></textarea>
            <button class="secondary-button" type="button" data-action="receive-patient-message">
              <span aria-hidden="true">↙</span>
              Receber
            </button>
          </div>
          <div class="composer-line">
            <textarea id="message-input" placeholder="Responder conversa"></textarea>
            <button class="primary-button" type="button" data-action="send-message">
              <span aria-hidden="true">➤</span>
              Enviar
            </button>
          </div>
        </div>
      </section>

      <aside class="lead-pane">
        ${renderLeadSummary(selected)}
      </aside>
    </div>
  `;
  requestAnimationFrame(() => {
    const messages = document.querySelector("#messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

function renderLeads() {
  appRoot().innerHTML = `
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
    <section class="pipeline" aria-label="Funil de leads">
      ${stages.map(renderStageColumn).join("")}
    </section>
  `;
}

function renderAgenda() {
  const appointments = state.appointments
    .filter((appt) => appt.date === ui.agendaDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  appRoot().innerHTML = `
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
    <div class="agenda-layout">
      <section class="panel">
        <div class="section-header">
          <h2>Grade do dia</h2>
          <small>${formatDate(ui.agendaDate)}</small>
        </div>
        <div class="schedule-grid">
          <div class="schedule-cell header">Hora</div>
          ${professionals.map((name) => `<div class="schedule-cell header">${escapeHtml(shortProfessional(name))}</div>`).join("")}
          ${times.map((time) => renderScheduleRow(time)).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="section-header">
          <h2>Atendimentos</h2>
          <span class="chip blue">${appointments.length} no dia</span>
        </div>
        <div class="appointment-list">
          ${appointments.map(renderAppointmentItem).join("") || emptyState("Agenda livre nesta data.")}
        </div>
      </section>
    </div>
  `;
}

function renderFinanceiro() {
  const txs = filteredTransactions();
  const paid = state.transactions.filter((tx) => tx.status === "Pago").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const pending = state.transactions.filter((tx) => tx.status === "Pendente").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const projected = paid + pending;
  const average = state.leads.length ? Math.round(projected / state.leads.length) : 0;

  appRoot().innerHTML = `
    <div class="kpi-grid">
      ${kpi("Projetado", formatMoney(projected), "pago + pendente", "◈")}
      ${kpi("Recebido", formatMoney(paid), "caixa confirmado", "✓")}
      ${kpi("A receber", formatMoney(pending), "em aberto", "◒")}
      ${kpi("Ticket medio", formatMoney(average), "por lead", "↗")}
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
          <h2>Receita por origem</h2>
          <small>${formatMoney(projected)}</small>
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
          ${renderSetupItem("Configurar META_VERIFY_TOKEN", configured.verifyToken, ".env")}
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
  const activeCount = bots.filter((bot) => bot.active).length;
  const rulesCount = bots.reduce((sum, bot) => sum + (bot.rules?.length || 0), 0);

  appRoot().innerHTML = `
    <div class="kpi-grid">
      ${kpi("Bots ativos", activeCount, "respondendo leads", "⌁")}
      ${kpi("Regras", rulesCount, "condicoes importadas", "▦")}
      ${kpi("Fluxos", bots.length, "modelos disponiveis", "◒")}
      ${kpi("Modo", "Local", "sem backend obrigatorio", "◆")}
    </div>

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

function renderConfig() {
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
    </div>
  `;
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

function renderStageColumn(stage) {
  const leads = filteredLeads().filter((lead) => lead.stage === stage.id);
  return `
    <div class="stage-column" data-stage-column data-stage="${stage.id}">
      <div class="stage-header">
        <div class="stage-title">${stage.label}</div>
        <span class="chip ${stage.tone}">${leads.length}</span>
      </div>
      ${leads.map(renderLeadCard).join("") || `<div class="empty-state">Sem leads</div>`}
    </div>
  `;
}

function renderLeadCard(lead) {
  return `
    <article class="lead-card" draggable="true" data-lead-card data-id="${lead.id}">
      <div class="lead-card-title">
        <div>
          <h3>${escapeHtml(lead.name)}</h3>
          <p>${escapeHtml(lead.interest)} · ${escapeHtml(lead.source)}</p>
        </div>
        <span class="chip ${stageTone(lead.stage)}">${formatMoney(lead.value)}</span>
      </div>
      <p>${escapeHtml(lead.nextStep)} · ${formatDate(lead.followUp)}</p>
      <div class="mini-actions">
        <button type="button" data-action="select-lead" data-id="${lead.id}">Inbox</button>
        <button type="button" data-action="open-appointment" data-id="${lead.id}">Agendar</button>
        <select data-stage-select data-id="${lead.id}" aria-label="Mover lead">
          ${stages.map((stage) => `<option value="${stage.id}" ${stage.id === lead.stage ? "selected" : ""}>${stage.label}</option>`).join("")}
        </select>
      </div>
    </article>
  `;
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

function renderScheduleRow(time) {
  return `
    <div class="schedule-cell time">${time}</div>
    ${professionals.map((professional) => renderScheduleCell(time, professional)).join("")}
  `;
}

function renderScheduleCell(time, professional) {
  const appt = state.appointments.find(
    (item) => item.date === ui.agendaDate && item.time === time && item.professional === professional,
  );
  if (!appt) return `<div class="schedule-cell"></div>`;
  return `
    <div class="schedule-cell">
      <div class="event-pill ${appt.status.toLowerCase()}">
        <div class="event-name">${escapeHtml(appt.patientName)}</div>
        <div class="event-meta">${escapeHtml(appt.type)} · ${escapeHtml(appt.status)}</div>
      </div>
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
  state.transactions.push({
    id: uid("tx"),
    description: `${appt.type} ${lead.name}`,
    category: appt.type,
    amount: appt.value,
    dueDate: appt.date,
    status: "Pendente",
    leadId: lead.id,
  });
  ui.agendaDate = appt.date;
  addActivity(`Agendamento criado para ${lead.name}.`, "primary");
  closeModal();
  saveAndRender("Agendamento criado.");
}

function createTransaction(data) {
  state.transactions.unshift({
    id: uid("tx"),
    description: clean(data.description),
    category: clean(data.category),
    amount: Number(data.amount || 0),
    dueDate: data.dueDate,
    status: clean(data.status),
    leadId: data.leadId || "",
  });
  closeModal();
  saveAndRender("Lancamento criado.");
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

async function runServerAgentForLead(lead, text) {
  try {
    const response = await fetch("/api/agent/test", {
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
    const response = await fetch("/api/messages/send", {
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
    const response = await fetch("/api/integrations/status");
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
    const response = await fetch("/api/conversations");
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
    const response = await fetch("/api/agent/test", {
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
}

function updateAppointmentStatus(id, status) {
  const appt = state.appointments.find((item) => item.id === id);
  if (!appt) return;
  appt.status = status;
  addActivity(`${appt.patientName}: agenda ${status.toLowerCase()}.`, status === "Cancelado" ? "red" : "green");
  saveAndRender("Agenda atualizada.");
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
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseISODate(value));
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
