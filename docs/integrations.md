# Integracoes

## Meta Webhooks

Endpoints preservados:

- `GET /webhooks/meta`
- `POST /webhooks/meta`

## WhatsApp Cloud API

Envio atual por `POST /api/messages/send`, usando `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.

## Instagram Messaging API

Usa token de pagina e envio por Graph API. Variaveis atuais: `INSTAGRAM_PAGE_ACCESS_TOKEN` e `INSTAGRAM_SEND_ID`.

## OpenAI Agent

Endpoint preservado: `POST /api/agent/test`. O agente sugere respostas; envio automatico so com configuracao explicita futura.

## Futuro

- Google Calendar: sincronizar disponibilidade/agendamentos.
- n8n: automacoes externas nao destrutivas.
