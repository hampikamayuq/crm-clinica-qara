// Seed inicial da Clinica QARA.

import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile?.();
} catch {
  // .env ausente: assume DATABASE_URL ja no ambiente.
}

const prisma = new PrismaClient();

const PRICE = {
  dermato: 550,
  tricologia: 550,
  cirurgia: 450,
  procedimento: 0,
  retorno: 0,
};

async function findOrCreate(model, where, create) {
  const existing = await prisma[model].findFirst({ where });
  if (existing) return existing;
  return prisma[model].create({ data: create });
}

async function seedUnits() {
  const units = [
    { name: "QARA Copacabana", address: "Rua Santa Clara, 50, sala 521 - Edificio Golden Point", city: "Rio de Janeiro", state: "RJ" },
    { name: "QARA Barra da Tijuca", address: "Av. das Americas, 2480, Bloco 2, sala 312 - Lead Americas Business", city: "Rio de Janeiro", state: "RJ" },
    { name: "QARA Sao Paulo", address: "R. Joaquim Floriano, 820 - Itaim Bibi", city: "Sao Paulo", state: "SP" },
  ];
  const result = {};
  for (const u of units) result[u.name] = await findOrCreate("clinicUnit", { name: u.name }, { ...u, active: true });
  return result;
}

async function seedProfessionals(units) {
  const copa = units["QARA Copacabana"];
  const pros = [
    { name: "Dr. Diego Galvez", specialty: "Cirurgia dermatologica" },
    { name: "Dr. Miguel Ceccarelli", specialty: "Doencas das unhas" },
    { name: "Dra. Diana Stohmann", specialty: "Tricologia" },
    { name: "Dra. Manuela Pedretti Cabral", specialty: "Psoriase / autoimunes" },
    { name: "Dr. Fabricio de Andrade", specialty: "Dermatopediatria" },
  ];
  for (const p of pros) {
    await findOrCreate("professional", { name: p.name }, { ...p, active: true, defaultUnitId: copa?.id || null });
  }
}

async function seedAppointmentTypes() {
  const types = [
    { name: "Consulta dermatologica", durationMinutes: 60, basePrice: PRICE.dermato, requiresDoctor: true },
    { name: "Consulta tricologia", durationMinutes: 60, basePrice: PRICE.tricologia, requiresDoctor: true },
    { name: "Consulta cirurgia dermatologica", durationMinutes: 60, basePrice: PRICE.cirurgia, requiresDoctor: true },
    { name: "Procedimento cirurgico", durationMinutes: 60, basePrice: PRICE.procedimento, requiresDoctor: true },
    { name: "Retorno", durationMinutes: 30, basePrice: PRICE.retorno, requiresDoctor: true },
    { name: "Teleconsulta", durationMinutes: 60, basePrice: PRICE.dermato, requiresDoctor: true },
  ];
  for (const t of types) await findOrCreate("appointmentType", { name: t.name }, { ...t, active: true });
}

async function seedServices() {
  const services = [
    { name: "Consulta dermatologica", category: "Consulta", basePrice: PRICE.dermato },
    { name: "Consulta tricologia", category: "Consulta", basePrice: PRICE.tricologia },
    { name: "Consulta cirurgia dermatologica", category: "Consulta", basePrice: PRICE.cirurgia },
    { name: "Retirada de cisto", category: "Cirurgia", basePrice: 0 },
    { name: "Retirada de lipoma", category: "Cirurgia", basePrice: 0 },
    { name: "Biopsia de pele", category: "Cirurgia", basePrice: 0 },
    { name: "Retirada de nevo", category: "Cirurgia", basePrice: 0 },
    { name: "Cirurgia de unha", category: "Cirurgia", basePrice: 0 },
    { name: "Avaliacao de cancer de pele", category: "Avaliacao", basePrice: PRICE.dermato },
    { name: "Procedimento dermatologico", category: "Procedimento", basePrice: 0 },
  ];
  for (const s of services) await findOrCreate("service", { name: s.name }, { ...s, active: true });
}

async function seedQuickReplies() {
  const replies = [
    { shortcut: "/endereco", title: "Endereco", content: "Atendemos em Copacabana: Rua Santa Clara, 50, sala 521 - Edificio Golden Point." },
    { shortcut: "/valor-consulta", title: "Valor da consulta", content: "O valor da consulta varia por profissional. Posso confirmar o valor certinho do(a) especialista que voce procura." },
    { shortcut: "/retorno", title: "Retorno", content: "A consulta da direito a retorno em ate 30 dias." },
    { shortcut: "/cisto", title: "Cisto", content: "A retirada de cisto e avaliada em consulta com o Dr. Diego (cirurgia dermatologica)." },
    { shortcut: "/biopsia", title: "Biopsia", content: "A biopsia de pele e definida pelo medico durante a consulta de avaliacao." },
    { shortcut: "/unha", title: "Unha", content: "Doencas das unhas sao com o Dr. Miguel, especialista na area." },
    { shortcut: "/preparo-cirurgia", title: "Preparo cirurgia", content: "As orientacoes de preparo sao enviadas pela equipe apos a confirmacao do procedimento." },
    { shortcut: "/pos-operatorio", title: "Pos-operatorio", content: "O acompanhamento pos-operatorio administrativo e feito pela equipe; duvidas clinicas sao avaliadas em retorno." },
    { shortcut: "/humano", title: "Falar com humano", content: "Vou te encaminhar para um atendente da equipe. Um momento, por favor." },
  ];
  for (const r of replies) {
    await prisma.quickReply.upsert({
      where: { shortcut: r.shortcut },
      update: { title: r.title, content: r.content, active: true },
      create: { ...r, active: true },
    });
  }
}

async function seedTags() {
  const tags = ["cirurgia dermatologica", "cisto", "cancer de pele", "tricologia", "unha", "estetica", "orcamento enviado", "urgente", "retorno", "pos-operatorio", "valor informado"];
  for (const name of tags) await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
}

async function main() {
  const units = await seedUnits();
  await seedProfessionals(units);
  await seedAppointmentTypes();
  await seedServices();
  await seedQuickReplies();
  await seedTags();
  console.log("Seed QARA: concluido.");
}

main()
  .catch((error) => {
    console.error("Seed QARA falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
