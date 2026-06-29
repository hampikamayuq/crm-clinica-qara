# LGPD

O CRM QARA e administrativo/comercial. Nao e prontuario medico.

## Dados Permitidos

- Dados de contato, origem, interesse, etapa comercial e responsavel.
- Mensagens necessarias ao atendimento por WhatsApp/Instagram/site.
- Agenda, valores administrativos, orcamentos e pagamentos.
- Consentimento LGPD e notas administrativas sem dado clinico sensivel.

## Evitar

- Diagnostico, prescricao, evolucao clinica, exames, fotos clinicas e laudos.
- Dado sensivel em campos livres quando nao houver necessidade operacional.
- Duplicar conteudo completo de mensagens em auditoria ou logs.

## Controles

- Login multiusuario por usuario/senha, com senha armazenada apenas como hash.
- `AuditLog` para alteracoes criticas, usando metadados quando mensagens estiverem envolvidas.
- Segredos em variaveis de ambiente, TLS no deploy e backups do PostgreSQL.
- Politica de retencao para leads perdidos, conversas antigas e exports.
