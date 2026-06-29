# Integracoes

## Meta Webhooks

Endpoints preservados:

- `GET /webhooks/meta`
- `POST /webhooks/meta`

`GET` valida `META_VERIFY_TOKEN`. `POST` valida `X-Hub-Signature-256` quando `META_APP_SECRET` esta configurado; webhook sem assinatura deve ficar restrito a desenvolvimento.

## WhatsApp Cloud API

Envio atual por `POST /api/messages/send`, usando `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`. A rota exige token de login.

## Instagram Messaging API

Usa token de pagina e envio por Graph API. Variaveis atuais: `INSTAGRAM_PAGE_ACCESS_TOKEN` e `INSTAGRAM_SEND_ID`.

## OpenAI Agent

Endpoint preservado: `POST /api/agent/test`. A rota exige token de login. O agente sugere respostas; envio automatico so com configuracao explicita futura.

## Lead Externo

`POST /api/webhook` e `POST /api/leads/webhook` recebem leads de formularios. Em producao, use `LEAD_WEBHOOK_SECRET` no header `x-webhook-secret` ou `Authorization: Bearer <segredo>`.

## Futuro

- Google Calendar: sincronizar disponibilidade/agendamentos.
- n8n: automacoes externas nao destrutivas.
