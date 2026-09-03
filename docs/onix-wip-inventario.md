# Livro-caixa das frentes — Ecossistema Onix

> **Como usar, em duas linhas:**
> **Antes de abrir** uma frente, acrescente a linha aqui.
> **Antes de fechar** uma frente, marque-a como concluída aqui.
>
> Este arquivo é a **fonte única de verdade entre sessões paralelas** do Claude
> Code. Sessões diferentes não se enxergam: sem um lugar comum, cada uma abre
> achando que é a única — foi assim que **seis PRs entraram na `main` em 91
> minutos** na madrugada de 24/08, sem que nenhuma soubesse das outras.
>
> Escrever aqui é barato; descobrir a colisão depois do merge não é.
> O teto de WIP da skill `onix-entrega-segura` (3 frentes) só é verificável
> contra esta lista.

**Estado corrente levantado em 2026-09-03, contra a `main` em `c5881ce`.**

## Frentes ativas — teto 3/3

| vaga | frente | estado |
|---:|---|---|
| 1 | **#454** — impedir restore drill no Postgres de produção | ativa |
| 2 | **#432 → #433** — ADM/Financeiro + gates de receita | pilha ativa |
| 3 | **Cliente Onix Capital** — datas manuais, Google Agenda e relato obrigatório | ativa |

Fechada nesta atualização: **#456**, questionário e acompanhamento por PAT,
mergeada após o gate vermelho e validada em produção.

As demais PRs abertas foram marcadas `congelada` em 02/09, com autorização
do Eduardo. Nenhuma foi fechada ou apagada. A fotografia de 26/08 abaixo fica
preservada como histórico e não representa o WIP atual.

---

## Fotografia anterior: frentes abertas em 26/08 — 17

Ordenadas da mais recente para a mais antiga. "Parada há" conta desde a última
movimentação da PR.

| PR | parada há | frente | faixa |
|---|---:|---|---|
| **#405** | horas | Grade PR 2 — a grade ganha um dono, e encolhe | 🟡 |
| **#404** | horas | Apagar TODA a receita passa a exigir administrador | 🔴 (RBAC) |
| **#367** | horas | Backup do MSP/Supabase — script manual, read-only, cifrado com `age` | 🔴 (segredo) |
| **#400** | 2 d | Upload do PAT diz por que recusou; teto sobe para 20 MB | 🟡 |
| **#399** | 2 d | Grade PR 1 — a esteira de produção ganha um dono | 🟡 |
| **#387** | 3 d | Remove `tipoProduto` do acordo de parceiro — **marcada PARADA** | 🔴 |
| **#394** | 3 d | Importação: PDF passa a ter de declarar a estratégia | 🟡 |
| **#382** | 3 d | Guia de Voz — extrator somente-leitura das transcrições | 🟢 |
| **#370** | 8 d | Tela de abertura da Onix Capital, atrás de flag OFF | 🟢 (flag OFF) |
| **#353** | 11 d | Auditor de 6 integrações + idade por integração no `/api/health` | 🟡 |
| **#180** | 71 d | Backfill de conversas DataCrazy (dry-run) | 🟡 · 🗄️ congelar |
| **#166** | 74 d | Tipagem dos `no-explicit-any` de `datacrazy.ts` | 🟢 · 🗄️ congelar |
| **#161** | 75 d | Endpoint server-side de import do Saldo em CC | 🔴 · 🗄️ arquivar |
| **#154** | 77 d | Carrossel "Tudo dá trabalho" | 🟢 · 🗄️ arquivar |
| **#113** | 88 d | Busca inteligente de clientes | 🟡 · 🗄️ congelar |
| **#27** | 100 d | Remove credenciais em claro + script de rotação | 🔴 · 🗄️ arquivar **após conferir a exposição na `main`** |
| **#2** | 104 d | Rename Cockpit → Ecossistema Onix | 🔴 · 🗄️ arquivar (já entregue por outra via) |

**Sete estão vivas** (movimentação nos últimos 3 dias) e **sete são herança de
maio/junho**, todas com veredito de congelar ou arquivar desde a fotografia de
13/08 — e todas ainda abertas. A leitura de 13/08 continua valendo: a dívida de
WIP deste repositório é herdada, não produzida pelo ritmo atual.

---

## Entregas recentes — flag e confirmação em produção

O que já está na `main`. A coluna que importa é a última: **código na `main` não
é código no ar**, e código no ar atrás de flag OFF não muda nada para ninguém.

| PR | fundida | o que faz | flag | no ar? |
|---|---|---|---|---|
| **#403** | 26/08 22:02Z | Central de Implementações abre para todos: cada um vê as próprias, admin vê todas. O `redirect("/")` para não-admin virou recorte em 6 pontos de leitura | **sem flag** | ⏳ fundida há minutos — deploy ainda não conferido |
| **#397** | 24/08 02:41Z | Sidebar filtrada por cargo e por nó, resolvida no servidor | `SIDEBAR_FILTRADA` — **OFF** | ✅ no ar e **inerte**. Ligar é uma linha em `Config`, sem redeploy |
| **#402** | 24/08 02:30Z | Remove o workflow da #398 e os dois `.sql`, já executados | sem flag | ✅ só CI |
| **#401** | 24/08 02:25Z | Registra as 2 linhas apagadas e o estado final dos acordos do Renan | sem flag | ✅ documento, sem efeito em runtime |
| **#396** | 24/08 01:29Z | O 12-4-2 passa a contar toques do ano; o alerta de cadência sai do canal do escritório e vai ao assessor e ao backoffice da carteira | **sem flag** | ✅ **ativo** — muda a tela de clientes e o destino do alerta |
| **#398** | 24/08 01:13Z | Botão de Actions para rodar os dois `.sql` de correção dos acordos | sem flag | ✅ executado e depois removido pela #402 |
| **#395** | 24/08 01:10Z | Traz o SQL que apaga os 2 acordos de parceiro residuais por `tipoProduto` | sem flag | ✅ script; a execução foi à parte |
| **#383** | 22/08 | Registro rico da ficha do cliente — 6 tabelas novas, 7 rotas, 6 componentes | `CLIENTES_REGISTRO_RICO` — **OFF** | ✅ no ar e **inerte**. Migration aplicada; UI não aparece |

> **Duas flags OFF acumuladas** (`SIDEBAR_FILTRADA`, `CLIENTES_REGISTRO_RICO`).
> Flag desligada é entrega parada com custo de manutenção: enquanto dorme, o
> caminho antigo e o novo convivem e toda PR vizinha tem de acertar os dois.

**Última confirmação de produção:** `6f2f0e7` servindo em `production`,
verificado pelo `post-deploy-smoke` em 25/08 15:20Z.

---
---

# Fotografia de 2026-08-13 — preservada como histórico

> O que vem abaixo é o inventário original, levantado contra a `main` em
> `ea60148`. **Não foi reescrito de propósito**: o veredito de cada frente
> (manter / congelar / arquivar) e a análise da #301 continuam válidos, e a
> lista de branches órfãs não foi refeita desde então.
>
> **O que mudou desde ele:** as frentes #305, #309, #323, #301, #304 e #326
> saíram da lista de abertas — a seção "Frentes abertas" no topo é a que vale.
> As sete frentes de maio/junho continuam exatamente onde estavam.

> **Levantado em 2026-08-13**, contra `main` em `ea60148`.
> Fontes cruzadas e deduplicadas: **PRs abertas** (12) · **issues abertas** (0) ·
> **`docs/onix-co-estado.md`** (itens não concluídos) · **branches remotas**
> (133 no total, 123 com commit nos últimos 90 dias).
>
> **23 frentes** depois da deduplicação — 12 vindas de PR aberta e 11 só do
> `onix-co-estado.md` ou do cruzamento de branches. Ordenadas por **mais perto de
> fechar** primeiro.

---

## RECOMENDAÇÃO

### As 3 que devem permanecer abertas (teto de WIP = 3)

Pilha empilhada conta como **uma** frente: `#309 → #323` e `#301 → #304` só
fecham em ordem, e tratá-las como quatro frentes é contabilidade, não trabalho.

| # | frente | por que fica |
|---|---|---|
| 1 | **`#309` → `#323`** — estado do banco no CI + guardas de deploy | É a rede que torna a #301 sobrevivível. A #317 já tirou o `migrate deploy` do `start`; estas duas fecham o resto: migration pendente vira **falha de smoke**, e `DROP` sem label vira **parada**. Sem elas, o mesmo erro da #301 volta na próxima migration. Ambas prontas — a #309 só está `behind`. |
| 2 | **`#305`** — pré-checagem read-only de "Empresa vazia" | **Um arquivo novo, nenhum arquivo tocado**, base `main`, só `SELECT`. É a frente mais barata do inventário e é o passo 1 da ordem de aplicação da #301. Fecha em minutos. |
| 3 | **`#301`** → `#304` — hierarquia de 3 níveis | Maior impacto do repositório: redefine a árvore inteira, e enquanto estiver aberta o `onix-co-estado.md` e a #301 **descrevem grupos diferentes**. É a única que exige decisão do Eduardo, então fica aberta *como decisão pendente*, não como trabalho em curso. |

### Congelar (não fechar, não trabalhar)

| frente | uma linha |
|---|---|
| **`#180`** backfill de conversas DataCrazy (dry-run) | Trabalho ainda relevante, mas 58 dias atrás da `main` — rebase custa mais que o dry-run entrega hoje. |
| **`#113`** busca inteligente de clientes | Feature legítima e sem bloqueio técnico; 75 dias parada porque nunca foi prioridade — congelar é honesto, deixar "aberta" finge que está em curso. |
| **`#166`** tipagem dos 10 `no-explicit-any` de `datacrazy.ts` | 🔎 **A dívida ainda existe:** `npm run lint` nesta sessão devolve **27 erros**, e **11** deles são `no-explicit-any` em `src/lib/datacrazy.ts`. A #157 (`fix/lint-debt`) não a cobriu. Escopo pequeno, premissa confirmada — congelar por capacidade, não por obsolescência. |
| **RTO nunca medido / PITR desligado** | Pendência declarada de maior risco fora de código (`onix-co-estado.md`, "Bloqueantes"). Não cabe em nenhuma das 3 vagas agora, mas **não é candidata a arquivamento** — é a única frente que não tem substituto. |
| **`AcordoComercial` sem índice parcial único** | Tier 🔴, tabela **com dados**, exige decidir o que fazer com duplicatas antes de qualquer SQL. PR própria, com o Eduardo presente. |
| **Fila de revisão CPF↔CNPJ (~331 pares)** · **7 clientes sem CGE** · **formato do atributo de filial** | Três decisões de negócio, não de código. Ficam registradas; nenhuma vira trabalho sem o Eduardo dizer o quê. |

### Arquivar de vez

| frente | por quê |
|---|---|
| **`#2`** rename Cockpit → Ecossistema Onix | **Já entregue por outra via** — `package.json` traz `"name": "ecossistema-onix"` e o domínio de produção já é `www.ecossistemaonix.com.br`. A PR descreve um trabalho que não existe mais. **100 dias.** |
| **`#154`** carrossel "Tudo dá trabalho" | Conteúdo de campanha de junho. 65 dias. Não há o que rebasear: refazer é mais barato que reviver. |
| **`#161`** endpoint server-side de import do Saldo em CC | 62 dias — e a #309 mediu que `saldo_em_cc` tem **1 escrita, em 1 cliente**: o relatório foi substituído na prática pelo poll diário da Partner API. A PR automatiza um caminho que morreu. |
| **`#27`** remove credenciais em claro + script de rotação | 87 dias. `docs/SECRETS.md` nasceu **depois** dela e é hoje o lugar canônico do assunto. ⚠️ **Arquivar só depois de reconferir se a exposição original ainda existe na `main`** — o mérito é de segurança, e branch velha não é prova de problema resolvido. |
| **8 branches órfãs** (jurídico 1a/1c/2, painel event/gmail/quick-reply, recover-team-data, docs/auditoria-integracoes) | Nenhuma tem PR, nenhuma delas. E o trabalho **está na `main`** — as migrations `juridico_fase_1a/1c/fase_2_email_ingest` e todo o `painel-do-dia` estão lá. São resíduo de quando se empurrava direto para a `main`. Cada uma diverge da `main` em **450–600 arquivos**. |
| **2 branches `backup/*`** | `backup/main-convite-url-absoluta` e `backup/pre-split-fcb41a2` são fotos deliberadas. Manter é barato; só não contam como frente. |

> **Nada aqui pede autorização.** Congelar e arquivar são rótulos de inventário —
> nenhuma branch é apagada e nenhuma PR é fechada por esta PR.

---

## Frentes, da mais perto de fechar à mais longe

Faixa pelo critério da alçada (`onix-co-estado.md`, "Política de alçadas").
**Regra da flag aplicada:** entrega atrás de feature flag OFF **rebaixa um
nível** — está anotada onde vale.

### Prontas para merge

| # | frente | faixa | idade | estado | bloqueio |
|---|---|---|---:|---|---|
| 1 | **PR #305** — pré-checagem read-only de "Empresa vazia" | 🟢 verde | 2 d | pronta | `mergeable_state: behind` — precisa de `update-branch`, nada mais. |
| 2 | **PR #309** — estado do banco de produção como check de PR | 🟡 amarela | 1 d | pronta | `behind`. Toca só `.github/workflows/`; lê o banco, não escreve. |
| 3 | **PR #323** — health com migrations, probes, gate destrutivo | 🟡 amarela | 1 d | pronta | Empilhada: base é a branch da #309. **Ordem: #309 → #323.** |
| 4 | **Atualizar `docs/onix-co-estado.md`** | 🟢 verde | — | pronta | Doc diz "atualizado contra `main` em `7091ef8`"; a `main` está em `ea60148`. Itens do backlog dele já entregues por **#316** (`divergencias` no GET), **#322** (probe de hierarquia no smoke) e **#324** (testes de `conferirRaiz`/reparent) seguem listados como pendentes. A #325 criou o aviso de CI que detecta isso — a doc é a próxima a andar. |
| 5 | **Limpeza de 8 branches órfãs** | 🟢 verde | 85–100 d | pronta | Nenhuma decisão pendente: o trabalho das 8 está na `main`. |

### Precisam de decisão do Eduardo

| # | frente | faixa | idade | estado | bloqueio |
|---|---|---|---:|---|---|
| 6 | **PR #304** — tela de acessos por nó (3 níveis, herança OFF) | 🔴 vermelha | 3 d | bloqueada | Empilhada na #301 **e** traz migration própria (`ALTER … SET DEFAULT false`). Não anda antes da #301. |
| 7 | **PR #301** — hierarquia de 3 níveis, `tipo` + `transversal` | 🔴 vermelha | 3 d | bloqueada | ⚠️ **Ver seção própria abaixo.** `mergeable_state: dirty` (conflito com a `main`) + parada obrigatória de tier vermelho. |
| 8 | **`AcordoComercial` sem índice parcial único** | 🔴 vermelha | — | precisa decisão | O `CREATE UNIQUE INDEX` **aborta** se já existirem dois acordos abertos para a mesma pessoa. O `SELECT` de diagnóstico vem primeiro, e o que fazer com as duplicatas é decisão de negócio. |
| 9 | **7 clientes sem `assessorCge`** | 🔴 vermelha | — | precisa decisão | A correção é **dado**, não código (`rbac.ts:131`). Mexer na linha abriria a carteira inteira para todo escopo restrito. |
| 10 | **Fila de revisão CPF↔CNPJ (~331 pares)** | 🟡 amarela → 🟢 se atrás de flag OFF | — | precisa decisão | Ferramenta não existe. **Nenhuma união automática, em hipótese alguma** — a tela é de conferência humana caso a caso. |
| 11 | **Formato do atributo de filial (Barreiras, Unaí)** | 🔴 vermelha (se virar coluna/tabela) | — | precisa decisão | Rótulo simples (`String[]`) ou tabela `Filial`? Depende de filial precisar de dado próprio. Enquanto não decidir, as duas **não existem em lugar nenhum do sistema**. |
| 12 | **117 documentos com múltiplas contas (máx. 5)** | — | — | precisa decisão | Conferência humana. **Não é erro por padrão** — é o que o backfill da #299 unificou de propósito. |

### Abertas, sem bloqueio, sem prioridade

| # | frente | faixa | idade | estado | bloqueio |
|---|---|---|---:|---|---|
| 13 | **RTO nunca medido · PITR desligado** | 🟡 amarela | — | bloqueada por capacidade | O drill prova que o dump restaura (verde há 10 semanas, 87 tabelas em 4 s). **Não prova que dá para voltar a operar.** `DISASTER_RECOVERY.md:37` registra ~45 min como estimativa. E com PITR off são **2 cópias ativas, não 3**. |
| 14 | **`cockpit-onix-staging`: "1/2 service crashed"** | 🟡 amarela | — | abandonada | Auditoria nunca concluída. Enquanto isso, toda entrega depende das duas redes do Railway (build falho não derruba o ar + rollback de 1 clique) em vez de staging. |
| 15 | **PR #180** — backfill de conversas DataCrazy (dry-run) | 🟡 amarela | **58 d** | 🗄️ candidata a congelamento | 58 dias atrás da `main`. Sem bloqueio técnico — só nunca voltou. |
| 16 | **PR #166** — tipa os 10 `no-explicit-any` de `datacrazy.ts` | 🟢 verde | **61 d** | 🗄️ candidata a congelamento | 🔎 Dívida **confirmada nesta sessão**: `datacrazy.ts` tem **11** `no-explicit-any` (de 27 erros do lint global). Sem bloqueio — só capacidade. |
| 17 | **PR #113** — busca inteligente de clientes (NL → Prisma + UI) | 🟡 amarela | **75 d** | 🗄️ candidata a congelamento | Feature inteira, sem bloqueio; parada por prioridade. |
| 18 | **Backlog técnico do `onix-co-estado.md`** | 🟢/🟡 | — | backlog | Restam: ensaios (`ensaio-hierarquia`, `ensaio-backfill-pessoa-grupo`) fora do CI · campo `operacao` no `EmpresaBootstrapLog` (hoje empresta `empresaId`) · `Implementacao` órfã vs `idsCadastradas()` · merge de leading zeros órfão · guard de `DATABASE_URL` · SHA do build no `/api/health`. |
| 19 | **Infra de CI observada** | 🟢 verde | — | backlog | `ci.yml`/`actionlint.yml` sem `ready_for_review` (sair do draft não dispara run; a saída vira force-push) · workflows sem `permissions`, logo sem `actions: write` para cancelar run travado · Build não cacheia `.next/cache`. |

### Candidatas a arquivamento (paradas há mais de 45 dias)

| # | frente | faixa | idade | estado | bloqueio |
|---|---|---|---:|---|---|
| 20 | **PR #161** — import server-side do Saldo em CC | 🔴 vermelha | **62 d** | 🗄️ arquivar | Token dedicado + escrita em massa. A #309 mediu: `saldo_em_cc` tem **1 escrita em 1 cliente** desde 2026-07-30. O caminho morreu. |
| 21 | **PR #154** — carrossel "Tudo dá trabalho" | 🟢 verde | **65 d** | 🗄️ arquivar | Conteúdo de junho. |
| 22 | **PR #27** — remove credenciais em claro + script de rotação | 🔴 vermelha | **87 d** | 🗄️ arquivar após conferência | ⚠️ Mérito de segurança: **conferir na `main` se a exposição ainda existe** antes de fechar. `docs/SECRETS.md` nasceu depois. |
| 23 | **PR #2** — rename Cockpit → Ecossistema Onix + domínio | 🔴 vermelha | **100 d** | 🗄️ arquivar | **Já entregue por outra via.** `package.json` → `"name": "ecossistema-onix"`; domínio de produção já trocado. |

> Sete frentes passam de 45 dias: **#2 (100 d)**, **#27 (87 d)**, **#113 (75 d)**,
> **#154 (65 d)**, **#161 (62 d)**, **#166 (61 d)**, **#180 (58 d)** — e **todas**
> são PRs de maio/junho. Nenhuma frente aberta em agosto
> passou de 3 dias. A dívida de WIP deste repositório é **inteiramente herdada**;
> o ritmo atual não a está produzindo.

---

## 🔴 PR #301 — sinalização explícita

`feat(empresas): hierarquia de 3 níveis com tipo declarado e função transversal`
· draft · tier vermelho · `mergeable_state: **dirty**` · +1627 −547 em 14 arquivos.

**O conflito 23502 com a tabela `Empresa` já não é o bloqueio que era — mas a PR
continua parada, por outros dois.**

O que mudou desde o registro em `onix-co-estado.md`:

| | estado registrado na doc | estado real hoje |
|---|---|---|
| migration | `tipo NOT NULL` **sem DEFAULT** ⇒ `23502` nas 6 linhas | reescrita em **três fases**: coluna nullable → 5 `UPDATE` por id → `SET NOT NULL`, com guard `RAISE EXCEPTION` para linha sem papel |
| efeito da falha | `migrate deploy && next start` ⇒ **serviço em loop de restart** | **igual ao registrado.** A #317 tirou a migration do `start`, mas o Railway ignorou a chave e a #335 reverteu — falha de migration derruba o serviço de novo. Ver `[deploy]` do `railway.toml` |
| premissa "`Empresa` está vazia" | não verificável de uma sessão | **falsa e medida** — 6 linhas, lidas pelo workflow da #309 |

**O que ainda trava, em ordem:**

1. **Conflito de merge** — `dirty` contra a `main`. Precisa de rebase antes de
   qualquer coisa; a `main` andou 24 PRs desde que a #301 foi aberta.
2. **Parada obrigatória de tier vermelho** — a migration dá `UPDATE` em dado de
   produção (`corporate` muda de pai, `imobiliaria` muda de nome). Alçada exige
   que o Eduardo leia o SQL antes de autorizar. **E PR vermelha só mergeia na
   sessão que a especificou** — não é esta.
3. **Ordem de merge obrigatória:** ~~#317~~ (já em produção) → **#305** (confere
   as 6 linhas) → **#301** → **#304**.

**Enquanto ela não for aplicada ou fechada, `docs/onix-co-estado.md` e a #301
descrevem grupos diferentes** — 6 nós contra 20, Corporate como empresa contra
Corporate como departamento. Não tratar nenhuma das duas como verdade única.

---

## Branches — o que o cruzamento mostrou

| | |
|---|---|
| branches remotas | **133** |
| com commit nos últimos 90 dias (≥ 2026-05-15) | **123** |
| dessas, com PR (aberta, mergeada ou fechada) | **113** |
| **sem PR nenhuma** | **10** |
| dessas 10, resíduo deliberado (`backup/*`) | 2 |
| dessas 10, trabalho **já presente na `main`** | **8** |

🔎 Conferido arquivo a arquivo: as migrations `juridico_fase_1a_contratos`,
`juridico_fase_1c_backup_bulk` e `juridico_fase_2_email_ingest` estão na `main`,
e o `painel-do-dia` inteiro também. As branches `claude/painel-event-extraction`,
`painel-gmail-search` e `painel-quick-reply` têm gêmeas `*-on-main` que **foram
mergeadas** (#42, #43, #44). Cada uma das 8 diverge da `main` em 450–600
arquivos.

**Conclusão que importa:** o cruzamento de branches **não revelou nenhuma frente
escondida**. Todo trabalho aberto deste repositório está representado por uma PR.
As 113 branches com PR mergeada são lixo de retenção — o merge é squash e não
apaga a branch de origem.
