# CliniQara CRM

MVP estatico para clinicas que precisam de CRM comercial, inbox, agenda e financeiro simples, sem prontuario.

## O que esta incluido

- Leads com funil por etapas.
- Inbox estilo WhatsApp com respostas rapidas.
- Agenda com verificacao de conflito por profissional, data e horario.
- Lancamentos financeiros e baixa de recebimentos.
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
6. Rode:

```bash
npm start
```

7. Abra `http://localhost:3000`.
8. Na aba Canais, copie a URL `/webhooks/meta`.
9. No painel da Meta, use essa URL como Callback URL e o mesmo `META_VERIFY_TOKEN`.

Para receber webhooks reais, a URL precisa estar publica em HTTPS. Em desenvolvimento, use ngrok, Cloudflare Tunnel ou equivalente apontando para `localhost:3000`.

Endpoints criados:

- `GET /webhooks/meta`: verificacao da Meta com `hub.challenge`.
- `POST /webhooks/meta`: recebe mensagens de WhatsApp e Instagram.
- `GET /api/integrations/status`: status da configuracao.
- `GET /api/conversations`: conversas recebidas por webhook.
- `POST /api/messages/send`: envio de resposta pelo canal original.

## Proximo passo para producao

Substituir `localStorage` e `data/channel-conversations.json` por banco de dados e adicionar autenticacao. A estrutura atual ja separa os dominios principais: leads, mensagens, bots, canais, agenda e financeiro.

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
