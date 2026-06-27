# Agente Tawany — arquitetura modular

Prompt **curto/comportamental** + **knowledge como dados** + **classificador determinístico**. Nada de estrutura operacional no prompt principal.

## Arquivos canônicos ([`src/agent/`](../src/agent/))

- [`agent-system-prompt-tawany.md`](../src/agent/agent-system-prompt-tawany.md) — system prompt (carregado em runtime por `server.js`; o código só anexa o contrato de execução: actions, present_doctor, formato JSON).
- [`qara-knowledge-base.md`](../src/agent/qara-knowledge-base.md) — knowledge operacional (médicos, valores, unidades, pipelines, etapas, prioridade, temperatura, NPS, tags, mensagens). Consultável, **não** injetado inteiro a cada chamada.
- [`qara-classification-rules.ts`](../src/agent/qara-classification-rules.ts) — regras de classificação (canônico tipado).
- [`crm-classifier.schema.ts`](../src/agent/crm-classifier.schema.ts) — formato da saída do classificador.
- [`conversation-examples.md`](../src/agent/conversation-examples.md) — exemplos de estilo (referência, não prompt).

## Runtime (JS)

- Classificador: [`src/server/services/classifier.service.js`](../src/server/services/classifier.service.js) (`classify(message, context)` → `CrmClassifierOutput`).
- Config/keywords: [`src/server/config/qara-knowledge.js`](../src/server/config/qara-knowledge.js) (espelha o `.ts`).
- Endpoint: `POST /api/classify`.
- Auto-classificação: cada mensagem de paciente no webhook é classificada e gravada em `Conversation.classification` (e `Lead.classification` se houver lead); **P1 → handoff** (tarefa + conversa em `WAITING_TEAM`).
- Visualização: aba **Funil → Triagem** (filtros por pipeline/prioridade/temperatura).
- Testes: [`classifier.test.js`](../classifier.test.js) (fixtures de `conversation-examples.md` + invariantes).

## Pipelines (IDs)

`1-unhas` · `2-cirurgia` · `3-tricologia` · `4-inflamatorias` · `5-dermatopediatria` · `6-dermatologia-clinica` · `7-podologia` · `8-administrativo` · `9-reativacao`.
Retorno/pós-operatório ficam na especialidade original (via etapa + tag).

## Saída do classificador

`{ mensagem_paciente, crm: { pipeline_funil, etapa_funil, especialidade_original, subespecialidade_queixa, medico_indicado, unidade, tags[], prioridade (P1–P4), temperatura, origem, paciente_novo_ou_antigo, precisa_humano_agora, motivo_alerta, proxima_acao, campos_faltantes[], nota_resumida }, acoes_internas[] }`.

Invariantes: P1 ⇒ `precisa_humano_agora`; teleconsulta não vira `confirmado` antes do pagamento; NPS < 9 não pede Google.
