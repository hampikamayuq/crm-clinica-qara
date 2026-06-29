# Fluxos CRM

## Lead Novo

Webhook ou UI cria `Lead`; quando ha WhatsApp/telefone, cria ou vincula `Conversation` para aparecer no Inbox. Registra `LEAD_CREATED` e permite qualificar origem/interesse.

## Consulta Marcada

Agenda cria `Appointment`, valida conflito por profissional, registra `APPOINTMENT_CREATED` e atualiza lead para `APPOINTMENT_SCHEDULED`.

## Falta

Status `NO_SHOW` cria tarefa de remarcacao e pode mover lead para `WAITING_PATIENT` ou `REACTIVATE`.

## Orcamento Enviado

`Budget` sai de `DRAFT` para `SENT`, registra `BUDGET_SENT` e cria follow-ups D+1, D+3 e D+7.

## Procedimento Agendado

Budget aceito pode virar agenda futura de procedimento, mantendo vinculo com lead/paciente.

## Pos-operatorio Administrativo

Equipe cria tarefa de acompanhamento administrativo. Duvida clinica vai para consulta/retorno.

## Reativacao

Lead antigo pode receber tarefa/campanha se houver consentimento e contexto comercial valido.
