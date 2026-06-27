# Permissoes

Hoje, escrita em `/api/*` usa `ADMIN_API_KEY`. O schema ja prepara `User.role`.

## Roles

- `ADMIN`: tudo.
- `DOCTOR`: pacientes, agenda, mensagens relevantes e timeline.
- `SECRETARY`: leads, inbox, agenda, tarefas e orcamentos administrativos.
- `FINANCE`: orcamentos, pagamentos e relatorios financeiros.
- `MARKETING`: agregados de origem/conversao sem conteudo sensivel de mensagens.

## Regras

- `requireRole([...])` existe como helper preparatorio.
- `MARKETING` nao acessa corpo de mensagens.
- Alteracoes criticas devem gerar `AuditLog`.
- Localhost pode ficar aberto se `ADMIN_API_KEY` nao estiver configurada; URL publica nao.
