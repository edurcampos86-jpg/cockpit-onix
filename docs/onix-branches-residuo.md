# Branches remotas — resíduo vs trabalho não integrado

> **Levantado em 2026-08-14**, contra `main` em `aa78914`.
> **NADA foi apagado.** Este documento separa; apagar é decisão do Eduardo.

| | |
|---|---|
| branches remotas (fora a `main`) | **134** |
| **JÁ MERGEADAS** — resíduo, seguro apagar | **114** |
| **NÃO MERGEADAS** — não tocar sem decisão | **20** |

## Como cada branch foi classificada

Dois sinais, nesta ordem de autoridade:

1. **A branch é head de uma PR mergeada** (dado da API do GitHub, para as 328
   PRs do repositório). É prova direta: o merge é squash, o conteúdo entrou na
   `main` e a branch ficou para trás. **104 branches.**
2. **Sem PR, mas `git merge-tree --write-tree main <branch>` devolve a árvore
   idêntica à da `main`** — mergear não acrescentaria um byte. **10 branches**,
   resíduo da época em que se empurrava direto para a `main`.

Tudo que não satisfaz (1) nem (2) fica na segunda lista, **por padrão**.

> ⚠️ **Por que o sinal 1 vem primeiro, e por que o 2 sozinho não bastaria.**
> Para branch antiga, `merge-tree` deixa de ser conclusivo: a `main` andou
> sobre os mesmos arquivos, então o merge de três pontas devolve uma árvore
> diferente **mesmo quando a branch já foi mergeada**. Classificando só por
> `merge-tree`, 87 branches cairiam como "não mergeadas" — e 67 delas são PRs
> comprovadamente fechadas com merge. O sinal de conteúdo é bom para achar o
> que entrou **sem PR**; é ruim para julgar idade.

> ⚠️ **Correção ao que a #326 registrou.** O inventário afirmou que as 8
> branches órfãs tinham "o trabalho já na `main`". Conferido agora uma a uma:
> **4 têm** (`juridico-fase-1a-cofre`, `juridico-fase-1c-backup-bulk`,
> `juridico-fase-2-gmail-ingest`, `recover-team-data-HAUP2` — e as migrations
> `juridico_fase_*` estão de fato na `main`). As outras 4 —
> `painel-event-extraction`, `painel-gmail-search`, `painel-quick-reply` e
> `docs/auditoria-integracoes` — **não passam no teste de conteúdo** e por isso
> estão na segunda lista. A conclusão anterior foi tirada da existência do
> `painel-do-dia` na `main`, não de comparação arquivo a arquivo.

---

## ⚠️ NÃO MERGEADAS — 20 branches, NÃO TOCAR

Pode haver trabalho não integrado aqui. **Nenhuma será apagada sem decisão
explícita do Eduardo.** Onze são head de PR aberta hoje.

| branch | último commit | por que está aqui |
|---|---|---|
| `claude/deploy-guardas` | 2026-08-14 | PR aberta ou fechada sem merge |
| `claude/auditoria-btg-leitura` | 2026-08-14 | PR aberta ou fechada sem merge |
| `claude/permissoes-3-niveis` | 2026-08-12 | PR aberta ou fechada sem merge |
| `claude/hub-ecossistema-onix-m3m4b8` | 2026-08-12 | PR aberta ou fechada sem merge |
| `claude/ci-guarda-not-null-sem-default` | 2026-08-12 | PR aberta ou fechada sem merge |
| `backup/pre-split-fcb41a2` | 2026-08-08 | sem PR |
| `feat/backfill-conversas-dryrun` | 2026-06-16 | PR aberta ou fechada sem merge |
| `chore/no-any-datacrazy` | 2026-06-13 | PR aberta ou fechada sem merge |
| `feat/automation-import-saldo-cc` | 2026-06-11 | PR aberta ou fechada sem merge |
| `claude/carousel-visual-identity-jcvfcw` | 2026-06-10 | PR aberta ou fechada sem merge |
| `docs/auditoria-integracoes` | 2026-06-03 | sem PR |
| `feat/busca-inteligente` | 2026-05-30 | PR aberta ou fechada sem merge |
| `claude/painel-quick-reply` | 2026-05-19 | sem PR |
| `claude/painel-gmail-search` | 2026-05-19 | sem PR |
| `claude/painel-event-extraction` | 2026-05-19 | sem PR |
| `security/remove-credentials-from-tutorial` | 2026-05-18 | PR aberta ou fechada sem merge |
| `claude/rename-cockpit-ecossistema-rRFXH` | 2026-05-14 | PR aberta ou fechada sem merge |
| `claude/create-prompt-helper-BO7eu` | 2026-05-09 | sem PR |
| `claude/security-analysis-3a4Va` | 2026-05-01 | sem PR |
| `claude/editorial-calendar-planning-MChss` | 2026-04-26 | sem PR |

**Das 20:**

- **11** são head de **PR aberta** — `deploy-guardas` (#323),
  `auditoria-btg-leitura` (#309), `permissoes-3-niveis` (#304),
  `hub-ecossistema-onix-m3m4b8` (#301), `backfill-conversas-dryrun` (#180),
  `no-any-datacrazy` (#166), `automation-import-saldo-cc` (#161),
  `carousel-visual-identity-jcvfcw` (#154), `busca-inteligente` (#113),
  `remove-credentials-from-tutorial` (#27), `rename-cockpit-ecossistema-rRFXH` (#2).
- **1** é head de PR **fechada sem merge**: `ci-guarda-not-null-sem-default`
  (#315, substituída pela #320).
- **8** não têm PR nenhuma. `backup/pre-split-fcb41a2` é foto deliberada; as
  outras 7 precisam de olhada humana antes de qualquer coisa.

---

## ✅ JÁ MERGEADAS — 114 branches, resíduo

O conteúdo destas está na `main`. Apagar não perde nada — e é o que faz as 20
acima ficarem visíveis, em vez de afogadas em 134 nomes.

> **Como apagar, quando o Eduardo decidir** (da máquina dele; o proxy desta
> sessão devolve **403** em `push --delete`):
>
> ```bash
> # extrai SÓ a tabela desta seção — a de cima é a lista que não se toca
> awk '/^## ✅ JÁ MERGEADAS/,0' docs/onix-branches-residuo.md \
>   | sed -n 's/^| `\([^`]*\)` |.*/\1/p' > /tmp/apagar.txt
> wc -l /tmp/apagar.txt          # tem de dar 114
> grep -c . /tmp/apagar.txt      # confira a lista ANTES; o comando não pergunta
> xargs -a /tmp/apagar.txt -n 20 git push origin --delete
> ```
>
> Rede: branch apagada volta com `git push origin <sha>:refs/heads/<nome>`
> enquanto o objeto existir no servidor. Os shas estão no histórico das PRs.

**Para o futuro:** `gh pr merge --squash --delete-branch` não deixa o resíduo
nascer. As 114 abaixo são o passivo de não ter usado a flag até aqui.

| branch | último commit | por que é resíduo |
|---|---|---|
| `claude/verificar-empresa-vazia` | 2026-08-14 | PR mergeada |
| `claude/skill-entrega-segura-v2` | 2026-08-14 | PR mergeada |
| `claude/guarda-skills-ci` | 2026-08-14 | PR mergeada |
| `claude/wip-inventory-cycle-metrics-8usqfl` | 2026-08-13 | PR mergeada |
| `claude/testes-conferir-raiz-reparent` | 2026-08-12 | PR mergeada |
| `claude/teste-acoes-do-post` | 2026-08-12 | PR mergeada |
| `claude/smoke-probe-hierarquia` | 2026-08-12 | PR mergeada |
| `claude/predeploy-migrate` | 2026-08-12 | PR mergeada |
| `claude/parceiros-fase1d-exclusividade` | 2026-08-12 | PR mergeada |
| `claude/parceiro-core` | 2026-08-12 | PR mergeada |
| `claude/hierarquia-get-enriquecido` | 2026-08-12 | PR mergeada |
| `claude/docs-backup-pitr-nao-ativo` | 2026-08-12 | PR mergeada |
| `claude/db-backup-slack-obrigatorio` | 2026-08-12 | PR mergeada |
| `claude/cockpit-onix-recon-y71yvp` | 2026-08-12 | PR mergeada |
| `claude/ci-teste-guarda-fts` | 2026-08-12 | PR mergeada |
| `claude/ci-guarda-not-null-script` | 2026-08-12 | PR mergeada |
| `claude/backlog-acordo-vigencia` | 2026-08-12 | PR mergeada |
| `claude/aviso-doc-modelos` | 2026-08-12 | PR mergeada |
| `claude/acordo-comercial-parceiro` | 2026-08-12 | PR mergeada |
| `claude/parceiros-fase1c-arvore` | 2026-08-11 | PR mergeada |
| `claude/parceiros-fase1b-vinculo` | 2026-08-11 | PR mergeada |
| `claude/parceiros-fase1a-model` | 2026-08-11 | PR mergeada |
| `claude/origem-indicacao-recon-87vicu` | 2026-08-10 | PR mergeada |
| `feature/remover-copiloto` | 2026-08-09 | PR mergeada |
| `feature/rbac-pessoa-empresa` | 2026-08-09 | PR mergeada |
| `feature/logo-volta-ao-hub` | 2026-08-09 | PR mergeada |
| `claude/pr-b3-reparent-endpoint` | 2026-08-09 | PR mergeada |
| `claude/pr-b1c-reparent-guardas` | 2026-08-09 | PR mergeada |
| `claude/pr-b1b-guardas` | 2026-08-09 | PR mergeada |
| `claude/pr-b1-pessoa-grupo` | 2026-08-08 | PR mergeada |
| `claude/pr-a2-bootstrap-hierarquia` | 2026-08-08 | PR mergeada |
| `claude/agents-golden-circle` | 2026-08-08 | PR mergeada |
| `claude/recon-identidade-endpoint` | 2026-08-07 | PR mergeada |
| `claude/pr-a-empresa-hierarquia` | 2026-08-07 | PR mergeada |
| `claude/onix-guided-implementation-flow-i7crc1` | 2026-08-06 | PR mergeada |
| `claude/audit-meeting-columns-sync-h4nvbj` | 2026-08-04 | PR mergeada |
| `claude/time-telefone-confiavel` | 2026-08-01 | PR mergeada |
| `claude/risco-evasao-reuniao` | 2026-08-01 | PR mergeada |
| `claude/reuniao-fonte-e-selo` | 2026-08-01 | PR mergeada |
| `claude/override-cadencia-edicao` | 2026-08-01 | PR mergeada |
| `claude/normaliza-telefone-whatsapp` | 2026-08-01 | PR mergeada |
| `claude/cron-guard-fail-closed` | 2026-08-01 | PR mergeada |
| `claude/conta-zeros-esquerda` | 2026-08-01 | PR mergeada |
| `claude/alertas-risco-evasao` | 2026-08-01 | PR mergeada |
| `claude/agents-sugestoes-por-merge` | 2026-08-01 | PR mergeada |
| `claude/agents-sugestoes-especialista` | 2026-08-01 | PR mergeada |
| `claude/deps-server-only` | 2026-07-31 | PR mergeada |
| `claude/fee-fixo-kpi-filtro-auditoria` | 2026-07-30 | PR mergeada |
| `claude/fee-fixo-coluna-clientes` | 2026-07-30 | PR mergeada |
| `claude/agents-convencao-3-sugestoes` | 2026-07-30 | PR mergeada |
| `claude/pendencia-idor-closure-zv8k9t` | 2026-07-10 | PR mergeada |
| `claude/cockpit-onix-sugestao-rice-log-e4sw1h` | 2026-07-09 | PR mergeada |
| `claude/cockpit-onix-sugerir-rice-config-e4sw1h` | 2026-07-09 | PR mergeada |
| `claude/cockpit-onix-implementacoes-idor-e4sw1h` | 2026-07-09 | PR mergeada |
| `feat/implementacoes-rice-ia-ui` | 2026-06-24 | PR mergeada |
| `feat/implementacoes-rice-ia-rota` | 2026-06-24 | PR mergeada |
| `feat/implementacoes-inverter-ordem` | 2026-06-24 | PR mergeada |
| `feat/implementacoes-anexos-ui` | 2026-06-24 | PR mergeada |
| `feat/implementacoes-anexo-schema` | 2026-06-24 | PR mergeada |
| `chore/implementacoes-anexo-delete-guardrail` | 2026-06-24 | PR mergeada |
| `feat/rbac-ui-pessoas` | 2026-06-21 | PR mergeada |
| `feat/rbac-ui-papeis` | 2026-06-20 | PR mergeada |
| `feat/rbac-ui-carteiras` | 2026-06-20 | PR mergeada |
| `feat/rbac-seed-papeis` | 2026-06-20 | PR mergeada |
| `feat/rbac-fundacao` | 2026-06-20 | PR mergeada |
| `feat/cockpit-reuniao-pr2-pat-polimorfico` | 2026-06-20 | PR mergeada |
| `feat/cockpit-reuniao-fase1-pr2-contexto` | 2026-06-20 | PR mergeada |
| `feat/cockpit-reuniao-fase1-pr1-shell` | 2026-06-20 | PR mergeada |
| `feat/namespacing-investimentos-fase4` | 2026-06-06 | PR mergeada |
| `feat/implementacoes-print-download` | 2026-06-06 | PR mergeada |
| `fix/commit-rice-stale-closure` | 2026-06-05 | PR mergeada |
| `feat/nav-hibrida-fase1` | 2026-06-05 | PR mergeada |
| `feat/implementacoes-fase3` | 2026-06-05 | PR mergeada |
| `feat/empresa-shell-fase2` | 2026-06-05 | PR mergeada |
| `backup/main-convite-url-absoluta` | 2026-06-02 | sem PR, conteúdo já na main |
| `fix/dedup-normalizacao-conta` | 2026-06-01 | PR mergeada |
| `feat/termometro-presenca` | 2026-06-01 | PR mergeada |
| `feat/btg-api-sync` | 2026-06-01 | PR mergeada |
| `feat/alertas-clientes` | 2026-06-01 | PR mergeada |
| `fix/reunioes-cleanup-fetch-falho` | 2026-05-31 | PR mergeada |
| `fix/integracao-auditoria-migration` | 2026-05-31 | PR mergeada |
| `feat/clientes-cadencia-presenca` | 2026-05-31 | PR mergeada |
| `feat/auditor-integracoes` | 2026-05-31 | PR mergeada |
| `feature/multi-fonte-btg-apelido-v2` | 2026-05-29 | PR mergeada |
| `feature/disaster-recovery` | 2026-05-21 | PR mergeada |
| `claude/quickreply-thread-context` | 2026-05-20 | PR mergeada |
| `claude/juridico-fase-2-gmail-ingest` | 2026-05-20 | sem PR, conteúdo já na main |
| `claude/insights-semanais` | 2026-05-20 | PR mergeada |
| `claude/fts-backfill` | 2026-05-20 | PR mergeada |
| `claude/clientes-esquecidos` | 2026-05-20 | PR mergeada |
| `claude/recover-team-data-HAUP2` | 2026-05-19 | sem PR, conteúdo já na main |
| `claude/painel-search-on-main` | 2026-05-19 | PR mergeada |
| `claude/painel-quickreply-on-main` | 2026-05-19 | PR mergeada |
| `claude/painel-events-on-main` | 2026-05-19 | PR mergeada |
| `claude/juridico-fase-1c-backup-bulk` | 2026-05-19 | sem PR, conteúdo já na main |
| `claude/juridico-fase-1a-cofre` | 2026-05-19 | sem PR, conteúdo já na main |
| `claude/google-calendar-gmail-integration-hR76a` | 2026-05-19 | PR mergeada |
| `claude/gmail-aliases` | 2026-05-19 | PR mergeada |
| `fix/datacrazy-ingest-unique-constraint` | 2026-05-18 | PR mergeada |
| `fix/datacrazy-atividades-debug` | 2026-05-18 | PR mergeada |
| `feat/reunioes-sync-logs-endpoint` | 2026-05-18 | PR mergeada |
| `feat/reunioes-outlook-refactor` | 2026-05-18 | PR mergeada |
| `feat/reunioes-datacrazy-atividades` | 2026-05-18 | PR mergeada |
| `feat/reunioes-cliente-dedupe` | 2026-05-18 | PR mergeada |
| `feat/reunioes-agentes` | 2026-05-18 | PR mergeada |
| `feat/github-actions-crons` | 2026-05-18 | PR mergeada |
| `feat/datacrazy-poll-now-endpoint` | 2026-05-18 | PR mergeada |
| `fix/clientes-page-no-cache` | 2026-05-17 | PR mergeada |
| `feat/cockpit-clientes-ux` | 2026-05-14 | PR mergeada |
| `feat/painel-timeline` | 2026-04-21 | sem PR, conteúdo já na main |
| `feat/painel-quadrantes` | 2026-04-21 | sem PR, conteúdo já na main |
| `feat/painel-encerramento` | 2026-04-21 | sem PR, conteúdo já na main |
| `feat/painel-dedupe-pm` | 2026-04-21 | sem PR, conteúdo já na main |
| `feat/painel-automacoes` | 2026-04-21 | sem PR, conteúdo já na main |
