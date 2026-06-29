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
- `MARKETING` nao acessa corpo de mensagens.
- Alteracoes criticas devem gerar `AuditLog`.
- Localhost pode usar bootstrap `admin` / `admin` se nenhuma senha for configurada; URL publica exige usuario no banco.
