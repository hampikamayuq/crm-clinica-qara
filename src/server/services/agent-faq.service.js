function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function has(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function resolveDoctor(text, agentState, careTeam) {
  const collected = agentState?.collected || {};
  const presentedDoctor = (agentState?.presentedDoctors || [])[0] || null;
  const doctorId =
    collected.medico ||
    presentedDoctor ||
    (has(text, ["diego", "galvez"]) ? "diego"
      : has(text, ["miguel", "ceccarelli"]) ? "miguel"
      : has(text, ["diana", "stohmann"]) ? "diana"
      : has(text, ["manuela", "pedretti"]) ? "manuela"
      : has(text, ["fabricio", "andrade"]) ? "fabricio"
      : null);
  return doctorId ? careTeam.find((doctor) => doctor.id === doctorId) : null;
}

function resolveUnit(text, agentState) {
  const collected = agentState?.collected || {};
  return collected.unidade ||
    (has(text, ["sp", "sao paulo", "paulo", "itaim"]) ? "sp-itaim"
      : has(text, ["barra da tijuca", "barra"]) ? "barra"
      : has(text, ["copacabana", "copa"]) ? "copacabana"
      : null);
}

// Responde perguntas frequentes de forma deterministica, sem chamar a IA.
export function faqReply(text, agentState, { careTeam, locations }) {
  const t = norm(text);
  const doctor = resolveDoctor(t, agentState, careTeam);
  const unit = resolveUnit(t, agentState);
  const collected = agentState?.collected || {};

  if (has(t, ["convenio", "plano de saude", "plano medico", "bradesco", "amil", "unimed", "sulamerica", "hapvida", "particular"])) {
    return "A clínica é particular. Não atendemos por convênio direto, mas emitimos nota fiscal para você solicitar reembolso ao plano. Quer agendar mesmo assim?";
  }

  if (has(t, ["estacionamento", "tem vaga", "vaga de garagem", "onde estacionar", "tem estacionamento", "pode estacionar", "garagem"])) {
    if (unit === "sp-itaim") return "Em SP (Itaim Bibi) o estacionamento é rotativo na rua.";
    if (unit === "barra") return "Na unidade da Barra da Tijuca o estacionamento é rotativo.";
    return "Em Copacabana temos vaga de garagem para pacientes, mas é preciso autorização prévia — me informe placa e modelo do carro (exceto moto). Nas unidades da Barra e SP o estacionamento é rotativo.";
  }

  if (has(t, ["aceita cartao", "pode parcelar", "aceita pix", "forma de pagamento", "como pagar", "aceita credito", "aceita debito", "parcelado", "cartao de credito", "pix", "dinheiro"])) {
    if (collected.modalidade === "teleconsulta" || has(t, ["teleconsulta", "online"])) {
      return "Teleconsulta: pagamento antecipado via PIX ou cartão de crédito em até 6x sem juros. O link é enviado por aqui após a confirmação do horário.";
    }
    if (unit === "sp-itaim" || has(t, ["sp", "sao paulo", "itaim"])) {
      return "Em SP aceitamos PIX, dinheiro e cartão de crédito em até 3x sem juros. Agendamentos em SP exigem sinal de 30% para confirmar.";
    }
    return "Aceitamos dinheiro, PIX, débito e cartão de crédito em até 6x sem juros. Pagamento na clínica no dia da consulta.";
  }

  if (has(t, ["qual o valor", "quanto custa", "quanto e a consulta", "valor da consulta", "preco da consulta", "custa a consulta", "valor consulta", "preco consulta"])) {
    if (doctor) {
      if (collected.modalidade === "teleconsulta") {
        return `A teleconsulta com ${doctor.name} custa R$ ${doctor.values.teleconsulta},00. Quer que eu verifique horários?`;
      }
      if (unit === "sp-itaim" && doctor.values.presencial_sp) {
        return `A consulta com ${doctor.name} em SP custa R$ ${doctor.values.presencial_sp},00. Quer que eu verifique horários?`;
      }
      const value = doctor.values.presencial || doctor.values.presencial_rj;
      return `A consulta com ${doctor.name} custa R$ ${value},00. Quer que eu verifique horários?`;
    }
    return "Os valores variam por médico: Dr. Diego Galvez R$ 450, Dr. Miguel Ceccarelli R$ 650 (RJ) / R$ 800 (SP), Dra. Diana Stohmann R$ 550, Dra. Manuela Pedretti R$ 550 e Dr. Fabricio de Andrade R$ 550. Quer saber com qual médico você se encaixaria melhor?";
  }

  if (has(t, ["onde fica", "endereco", "como chegar", "qual o endereco", "localizacao", "fica onde", "qual endereco", "me passa o endereco", "me manda o endereco"])) {
    if (unit === "sp-itaim" || has(t, ["sp", "sao paulo", "itaim"])) return `Nossa unidade em SP fica na ${locations.itaim}.`;
    if (unit === "barra" || has(t, ["barra da tijuca", "barra"])) return `Nossa unidade na Barra fica na ${locations.barra}.`;
    return `Nossa unidade principal fica na ${locations.copacabana}. Também temos unidades na Barra da Tijuca (RJ) e Itaim Bibi (SP).`;
  }

  if (has(t, ["horario de atendimento", "que horas abre", "quando atende", "que dias", "quais dias atende", "horarios de atendimento", "dias de atendimento", "funciona aos sabados", "atende sabado", "atende domingo"])) {
    if (doctor) {
      const lines = doctor.locations.map((location) => `• ${location.local.split(",")[0]}: ${location.horarios}`).join("\n");
      return `Horários de ${doctor.name}:\n${lines}`;
    }
    return "Os horários variam por médico e unidade. Me conta qual médico ou especialidade você busca e te passo os horários certos.";
  }

  if (has(t, ["retorno gratuito", "prazo de retorno", "direito a retorno", "consulta de retorno", "tem retorno"])) {
    return "Sim, toda consulta tem direito a retorno gratuito em até 30 dias.";
  }

  if (has(t, ["como funciona teleconsulta", "o que e teleconsulta", "como e a teleconsulta", "funciona a teleconsulta", "teleconsulta funciona"])) {
    return "A teleconsulta é por videoconferência, com a mesma qualidade da consulta presencial. Você paga antecipado (PIX ou cartão) e recebe o link aqui no WhatsApp antes do horário.";
  }

  return null;
}
