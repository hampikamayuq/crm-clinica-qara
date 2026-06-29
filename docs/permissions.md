# Permissoes

Hoje, a UI exige login por usuario/senha do `User` no banco. A sessao usa token temporario em memoria; `ADMIN_API_KEY` fica apenas como acesso tecnico opcional.

## Roles

- `ADMIN`: tudo.
- `DOCTOR`: pacientes, agenda, mensagens relevantes e timeline.
- `SECRETARY`: leads, inbox, agenda, tarefas e orcamentos administrativos.
- `FINANCE`: orcamentos, pagamentos e relatorios financeiros.
- `MARKETING`: agregados de origem/conversao sem conteudo sensivel de mensagens.

## Regras

- `requireRole([...])` existe como helper preparatorio.
- Login grava `req.user` e usa sessoes temporarias em memoria; reiniciar o servidor exige login novamente.
- `MARKETING` nao acessa corpo de mensagens.
- Alteracoes criticas devem gerar `AuditLog`.
- O primeiro admin nasce via `BOOTSTRAP_USERNAME`/`BOOTSTRAP_PASSWORD` no seed.
- URL publica exige usuario no banco; `ADMIN_API_KEY` e apenas acesso tecnico opcional.
