# Onix Co — estado do projeto

Memória compartilhada entre sessões. Quem chega novo lê **este arquivo** e sabe
o estado real sem auditar o repositório do zero.

> **Última atualização:** 2026-08-15, contra `main` em `f5d6646`.

## Como ler este arquivo

Cada afirmação carrega a sua procedência, porque as duas não valem o mesmo:

| marca | significa |
|---|---|
| 🔎 **verificado** | conferido no repositório nesta atualização — `arquivo:linha` ou commit |
| 📋 **declarado** | informado pelo Eduardo a partir de produção. Uma sessão **não alcança produção** (o gateway bloqueia o domínio), então isto não é verificável daqui — é registro, não prova |
| ⚠️ **em conflito** | duas fontes do próprio repositório discordam. Não resolver por conta própria |

---

## Modelos existentes

🔎 Todos conferidos em `prisma/schema.prisma`.

### `Empresa` — desde a #288 (`2d460fe`)
`id` (slug, PK) · `nome` · `parentId` (nullable, auto-relação `EmpresaHierarquia`) ·
`createdAt`/`updatedAt` · relação `acessos PessoaEmpresa[]` · índice em `parentId`.

**A régua de profundidade vive em CÓDIGO, não no schema** — `src/lib/empresas/hierarquia.ts`.
`parentId` é auto-relação sem limite de profundidade *de propósito*: limitar em SQL
exigiria trigger ou CHECK recursivo, e o número de níveis é decisão de **negócio**.
Mudar a régua tem de ser deploy de código, não migration em tabela viva.

O schema aguenta N níveis; `validarArvore` / `validarParent` é quem recusa o excesso.

### `PessoaGrupo` — desde a #292
`id` · `cpfCnpj` **UNIQUE** (canônico: só dígitos, sem máscara — 11 = CPF, 14 = CNPJ) ·
`tipoDocumento` ("CPF" | "CNPJ", derivado do tamanho mas materializado para permitir
filtro em SQL sem `length()`) · `clientes ClienteBackoffice[]` · índice em `tipoDocumento`.

### `ClienteBackoffice.pessoaGrupoId`
Nullable, indexado (`@@index([pessoaGrupoId])`), FK para `PessoaGrupo`.
É o elo cliente → pessoa-titular. **Null não é erro**: é ausência de documento
reconhecível, preservada em vez de inventada.

### `EmpresaBootstrapLog`
Auditoria imutável. `usuarioId` (FK obrigatória para `User`) · `acao` · `resultado` ·
`empresaId` · `ipAddress` · `userAgent` · `metadata` (Json) · `timestamp`.
Índices: `[usuarioId, timestamp↓]`, `[acao, timestamp↓]`, `[empresaId, timestamp↓]`.

`acao` já usado: `bootstrap_raiz`, `seed-filha`, `reparent`, `backfill-pessoa-grupo`.

> **`empresaId` não tem FK, e isso é declarado no schema** — "o log tem de sobreviver
> ao alvo". Por isso o backfill de identidade pôde gravar a constante `"pessoa-grupo"`
> ali: o campo carrega o **alvo da operação**, não necessariamente uma empresa.
> É empréstimo de campo, funciona, e é o ponto menos elegante do desenho atual.

### `PessoaEmpresa` — concessão de acesso
`pessoaId` (FK `Pessoa`, `onDelete: Restrict`) · `empresaId` (FK `Empresa`,
`onDelete: Cascade`) · `incluiDescendentes Boolean @default(true)` ·
`@@unique([pessoaId, empresaId])`.

> ⚠️ **Não confundir com `PessoaGrupo`.** São coisas sem relação:
>
> | | o que é | de quem fala |
> |---|---|---|
> | `PessoaEmpresa` | **autorização** — quem do time pode ver o quê | pessoa do TIME ↔ empresa |
> | `PessoaGrupo` | **identidade** — quais contas são o mesmo titular | CLIENTE ↔ documento |
>
> O nome parecido é armadilha real. `PessoaEmpresa` nunca decide identidade de
> cliente; `PessoaGrupo` nunca decide acesso.

---

## Árvore em produção (hoje)

📋 Estado informado pelo Eduardo — não verificável de uma sessão. A **contagem**
foi medida por query: `SELECT count(*) FROM "Empresa";` → **6**.

```
onix-co  (raiz, "Onix Co")
├─ investimentos   "Onix Capital"
├─ corretora       "Onix Corretora"
├─ imobiliaria     "Onix Imobiliária"
├─ corporate       "Onix Corporate"
└─ tech            "Onix Tech"
```

🔎 **Os slugs são os antigos de propósito.** A decisão chegou escrita com ids no
padrão da raiz (`onix-capital`, `onix-tech`…) e **só os nomes foram adotados**.
Os ids não, por três razões de dado:

- `Implementacao.empresaId` já tem linhas em produção com `investimentos`,
  `corretora`, … — ver `src/lib/empresas-config.ts:17`, que registra isso desde
  antes deste projeto
- `PessoaEmpresa.empresaId` tem **FK** para `Empresa.id`: as concessões de RBAC
  apontam para os ids atuais
- `NOS_ECOSSISTEMA` (`hub-ecossistema/nos.ts`) e `EMPRESAS` (`empresas-config.ts`)
  casam **por valor** com esses mesmos ids — é essa igualdade que faz o RBAC
  funcionar sem tabela de-para

Renomear os ids é PR própria, com `UPDATE` em massa de `Implementacao` e
`PessoaEmpresa` no mesmo commit. **Não fazer aos pedaços.**

### Fora da árvore, por decisão

| fora | por quê |
|---|---|
| Onix Agro | departamento |
| Planejamento Patrimonial | departamento, dentro da Onix Capital |
| Onix Contábil | **não existe juridicamente** |
| Meu Sucesso Patrimonial (`educacao`) | produto, não PJ |
| Barreiras, Unaí | **filiais** — viram atributo, nunca nó |

🔎 O motivo de filial não virar nó: um terceiro nível reabriria a régua de
`hierarquia.ts`, que é exatamente o que se quer evitar.

**Pendente:** o formato do atributo de filial ainda não foi decidido — rótulo
simples (`String[]` em `Empresa`) ou tabela própria `Filial`. A escolha depende
de filial precisar ou não de dado próprio (CNPJ, endereço, pessoas). Enquanto
não decidir, Barreiras e Unaí não existem em lugar nenhum do sistema.

### ⚠️ Conflito aberto — PR #301 propõe 3 níveis

**A PR #301 está ABERTA (draft, tier vermelho) e contradiz tudo desta seção.**
Ela propõe:

- hierarquia de **3 níveis**, com `tipo` (`TipoNo` enum: holding/empresa/departamento)
  como coluna e `transversal` como flag — **migration nova**
- **20 nós** em vez de 6
- **Agro e Corporate deixam de ser empresa** e viram departamento
- **Educação e Contábil passam a existir como empresa** — o oposto do que está acima
- `"Onix Imobiliária"` volta a `"Onix Imob"`
- o eixo `cadastrada` do catálogo **desaparece**

> 🔴 **O ponto que trava:** a migration da #301 adiciona `tipo NOT NULL` **sem
> DEFAULT**, de propósito, como guarda — ela **falha com `23502` se `Empresa`
> tiver qualquer linha**. A própria PR declara que não conseguiu confirmar se
> `Empresa` está vazia em produção.
>
> 📋 **MEDIDO: `Empresa` tem 6 linhas em produção** (query rodada pelo Eduardo).
> Isso deixa de ser hipótese: **a #301 não aplica como está**.
>
> A cadeia completa, porque o efeito é maior que "a migration falha":
>
> 1. `tipo` entra `NOT NULL` sem `DEFAULT` → Postgres recusa com **`23502`**
>    (`column "tipo" ... contains null values`) nas 6 linhas existentes
> 2. o start do serviço é `prisma migrate deploy && next start`
> 3. o `&&` faz o `next start` **não rodar** quando a migration falha
> 4. resultado: **app em loop de restart**, não "migration pendente"
>
> A guarda foi bem pensada para impedir rotulagem por chute — mas, com esse
> start command, ela para o SERVIÇO, não a migration. Saídas possíveis:
> `DEFAULT` na coluna, ou backfill em dois passos (nullable → popular →
> `SET NOT NULL`). Registrado como comentário na própria #301.

Enquanto a #301 não for resolvida — aplicada ou fechada — **esta seção e a #301
descrevem grupos diferentes**. Não tratar nenhuma das duas como verdade única.

---

## Identidade — decisões travadas

🔎 A régua vive em `src/lib/empresas/pessoa-grupo.ts`, escrita **antes** do
backfill justamente para o UPDATE em massa não a inventar no meio do caminho.

- **União automática APENAS por `cpfCnpj` normalizado idêntico.**
- **CPF ↔ CNPJ nunca une automaticamente**, nem quando é sabidamente o mesmo dono.
  Sócio e empresa são titulares distintos: patrimônio, tributação e suitability
  próprios. Unir misturaria dois patrimônios num só saldo. O vínculo existe no
  mundo real, mas é decisão **humana**.
- **E-mail e telefone nunca unem.** 📋 33,6% e 31,9% de repetição na base — casal
  divide e-mail, empresa divide telefone. Sinal fraco para dimensionar
  conciliação, nunca chave de união. 🔎 A recusa é função com teste
  (`contatoUneSozinho()` devolve `false`), não só comentário — para aparecer em
  `grep` de quem for tentado a usar contato como chave.
- **Documento ausente ⇒ `pessoaGrupoId` null.** Não é erro. Agrupar sob chave
  vazia faria de todo cadastro incompleto "a mesma pessoa".
- **Documento duplicado ⇒ a MESMA `PessoaGrupo`** para todas as contas. É o ponto
  do backfill, não efeito colateral.

### Backfill B2 (#299) — concluído em produção

📋 Números informados pelo Eduardo:

| | |
|---|---|
| `PessoaGrupo` criadas | **2.476** |
| links gravados | **2.613** |
| divergentes | **0** |
| sem link (sem documento) | **80** |

🔎 A rota é `POST /api/backoffice/pessoa-grupo/backfill`, com `modo: "dry-run" | "aplicar"`,
lotes de 200 em transação própria, idempotente por `upsert` com `update: {}`.
**Reexecutar é seguro** e devolve `pessoasACriar: 0` / `linksAGravar: 0` quando fechou.

### Pendente — fila de revisão CPF↔CNPJ

📋 ~331 pares estimados por sinal fraco (e-mail, telefone, endereço).
**Nenhuma união automática aqui, em hipótese alguma.** A fila é para conferência
humana caso a caso. Ferramenta ainda não existe.

📋 117 documentos com múltiplas contas (máx. 5) — merece conferência humana caso
a caso, **não é erro por padrão**: é exatamente o que o backfill unificou de propósito.

---

## RBAC — estado e decisão pendente

### Hoje: só o eixo CGE

🔎 `src/lib/rbac.ts` filtra por `assessorCge`. 📋 `RBAC_ENFORCEMENT = ON` em
produção (flag de Config DB).

> ⚠️ **O código declara `default OFF`** (`rbac.ts:26`) e a flag é lida do banco
> (`rbac.ts:33`, via `getConfig`). Ou seja: o valor de produção **não está no
> repositório** e só se confere em `/api/configuracoes/flags`. Não deduzir o
> estado lendo o código.

🔎 **7 clientes sem CGE ficam INVISÍVEIS sob escopo restrito** — `src/lib/rbac.ts:131`:

```ts
// Restrito: cliente sem assessorCge nunca casa um escopo restrito
return assessorCge !== null && cges.includes(assessorCge);
```

📋 A contagem (7) é de produção. **A correção é DADO, não código**: preencher o
`assessorCge` desses clientes. Mudar a linha para incluir os sem-CGE abriria a
carteira inteira para todo escopo restrito.

### A fazer: eixo empresa

Compor com CGE por **AND**, nunca OR. `OR` transformaria concessão de empresa em
escape do filtro de carteira — quem tem acesso a uma empresa passaria a ver
clientes de CGE alheio.

### ✅ Resolvido: `isAdmin(ctx)` **não** é `Papel.adminGlobal`

Esta pergunta estava aberta. 🔎 **São conceitos distintos e desconectados:**

| | onde | o que resolve |
|---|---|---|
| `isAdmin(ctx)` | `src/lib/rbac-papeis.ts:28-30` | `ctx.role === "admin" \|\| ctx.pessoa?.teamRole === "admin"` |
| `Papel.adminGlobal` | lido **só** em `src/lib/rbac.ts:57` | escopo de CGE — `adminGlobal \|\| escopoOperacional === "todas"` ⇒ sem filtro |

`adminGlobal` **não participa** de `isAdmin()`. Gatear literalmente por
`Papel.adminGlobal` deixaria a rota inacessível na prática, porque `Pessoa.papelId`
é nullable e as Pessoas existentes seguem sem papel por decisão da Fase 1 do RBAC.

**Consequência para o eixo empresa:** usar `isAdmin` como gate de concessão de
acesso por empresa é coerente com todas as rotas admin atuais
(`api/backoffice/recon-identidade`, `api/empresas/hierarquia`,
`api/backoffice/pessoa-grupo/backfill`). Se a intenção for mesmo `adminGlobal`,
é uma decisão a tomar explicitamente — e a troca é de uma linha.

---

## Política de alçadas

Governa **toda** PR deste projeto. A classificação é declarada no prompt da
tarefa; o auditor **rebaixa automaticamente** se a entrega não couber na faixa
declarada.

| faixa | escopo | quem aprova |
|---|---|---|
| 🟢 **verde** | sem migration, sem escrita, sem RBAC, sem segredo | auditor de sessão separada aprova e mergeia. Eduardo só recebe relatório |
| 🟡 **amarela** | escrita reversível, rota nova | aprovação por resumo de **3 linhas**, sem ler diff |
| 🔴 **vermelha** | migration, backfill, RBAC, segredo, DELETE/UPDATE em massa | **parada obrigatória**. Eduardo lê o número/SQL antes de autorizar |

> **PR vermelha só mergeia na sessão que a especificou.** Uma sessão que não
> escreveu a spec não tem como saber o que foi combinado fora do texto da PR.

### Domínio de produção

**`https://www.ecossistemaonix.com.br`** — o apex sem `www` **NÃO resolve**.

> Sessões não alcançam produção: o gateway do container responde
> `CONNECT tunnel failed, 403`. Toda validação ao vivo é feita pelo navegador do
> Eduardo. Uma sessão que afirmar ter conferido produção está enganada.

---

## Método de trabalho — skills e teto de WIP

### As skills do método vivem no repositório

🔎 **As 8 skills do método Onix são carregadas de `.claude/skills/` por
qualquer sessão do Claude Code que abra este repo** — não do canal
sincronizado da conta. Entraram na **#327**.

| pasta em `.claude/skills/` | versão |
|---|---|
| `onix-entrega-segura` | **2.3** |
| `backoffice-btg-onix` · `create-prompt-onix` · `instagram-carousel-onix` · `onix-atendimento-analise` · `onix-briefing-reuniao` · `orquestra-multiagente` · `story-fitness-onix` | 1.0 |

**O repositório é a fonte canônica.** Editar aqui e subir para a conta
(Customize > Skills), nunca o inverso — está declarado no topo do próprio
`SKILL.md` da `onix-entrega-segura`.

> ⚠️ **A razão é medida, não teórica: a #327 ficou 25,1 h aberta versionando a
> versão ERRADA da skill** — a v2 (129 linhas) no lugar da v2.2 (155 linhas) —
> entre a abertura (2026-08-13 10:59 UTC) e o force-push (2026-08-14 12:03
> UTC). Duas versões diferentes chegaram a rodar na mesma sessão sem que nada
> acusasse a troca. Enquanto a origem for o canal sincronizado, **nenhuma
> sessão sabe qual versão leu**.

🔎 `scripts/guarda-skills.sh` roda em toda PR (`ci.yml`) e reprova pasta ≠
`name`, frontmatter malformado, `name`/`description`/`version`/`updated`
ausentes, UTF-8 inválido ou arquivo sem quebra de linha final. Existe porque
skill quebrada **não** derruba build, teste nem lint: ela só deixa de
carregar, em silêncio.

🔎 **Desde a #331 há também `.claude/skills/MANIFESTO.md`**, com `sha256` de
cada `SKILL.md`, conferido pela mesma guarda. As cinco regras acima provam que
o arquivo é **bem-formado**; nenhuma prova que é o arquivo **certo** — um
`version: 2.2` com o conteúdo da 2.0 passaria em todas. Com o manifesto, a v2
publicada por engano na #327 teria reprovado no primeiro CI, e não 25 h depois.

> **O manifesto é gerado, nunca editado à mão.** Mudou uma skill? Rode
> `./scripts/atualiza-manifesto.sh` e commite o resultado junto. Manifesto que
> se atualiza à mão apodrece — é literalmente o que aconteceu com este arquivo
> aqui, que listava como pendentes três itens já entregues pelas #316, #322 e
> #324.

🔎 **Desde a #333 o hash cobre a PASTA inteira, não só o `SKILL.md`.** A
`story-fitness-onix` traz `scripts/retoque_story.py`, e um script de 115 linhas
de OpenCV é exatamente o arquivo cuja troca ninguém percebe numa revisão. Vale
nos dois sentidos: arquivo em disco que o manifesto não declara, e arquivo
declarado que sumiu do disco.

🔎 **`scripts/exporta-skills.sh` (#333) leva o repo para a conta** — um ZIP por
skill, com a pasta dentro (não o conteúdo solto, que é o erro que faz a skill
subir sem erro e não carregar), mais o manifesto junto. Roda a guarda antes de
empacotar. A ordem é: editar → `atualiza-manifesto.sh` → `guarda-skills.sh` →
`exporta-skills.sh` → subir em Customize > Skills.

### Contador de revisão da skill

A `onix-entrega-segura` é revisada **a cada 10 PRs fechadas**, por calendário
e não por acúmulo de dor (seção 10 da própria skill).

### 🚩 MARCO ZERO — a contagem NÃO é retroativa

| | |
|---|---|
| **última revisão da skill** | **PR #327** (v2.2) |
| **commit do marco zero** | **`a609d09`** (merge da #327 na `main`) — fonte única em **`.claude/skills/MARCO-ZERO`** |
| **data** | **2026-08-14**, 12:19 UTC |
| limite | **10** PRs fechadas |
| próxima revisão | ao fechar a 10ª PR **a partir de `a609d09`** |

> **Nada antes de `a609d09` conta.** As 327 PRs anteriores foram fechadas sob
> a v1 e a v2 da skill, sem esta regra existir — contá-las tornaria a revisão
> imediatamente vencida no dia em que a regra nasceu, e uma revisão que já
> nasce atrasada é a mesma "revisão por acúmulo de dor" que a seção 10 recusa.
>
> Este parágrafo existe para que ninguém proponha contagem retroativa mais
> adiante. Se a regra mudar, muda por decisão declarada — não por releitura.

🔎 O contador é automático desde a **#331**: `scripts/aviso-revisao-skill.sh`
roda em toda PR (`ci.yml`) e emite `::warning::` ao atingir 10, com as três
perguntas fixas no corpo do aviso. **É aviso, não gate** — "está na hora de
revisar o método" não reprova a PR de outra pessoa.

🔎 **O sha tem UMA fonte: `.claude/skills/MARCO-ZERO`.** O `ci.yml` lê o
arquivo; esta tabela repete o valor só para leitura humana. Antes ele vivia em
dois lugares e nada os amarrava — e sha desatualizado não é relido por
ninguém: o contador passaria a contar do ponto errado, em silêncio. Ao revisar
a skill, troque o sha **no arquivo** e atualize a data aqui.

Ao revisar, responder as três perguntas fixas da seção 10 e — só se houver o
que mudar — subir `version` e `updated` no frontmatter **e rodar
`./scripts/atualiza-manifesto.sh`**, senão a guarda de sha256 reprova a
própria PR de revisão.

### Teto de WIP = 3 frentes — critério recalibrado na v2.3

**Proibido abrir a quarta antes de fechar uma.** O inventário completo, com o
critério e o que está congelado ou arquivado, está em
`docs/onix-wip-inventario.md` (entrou na #326).

🔎 **O que conta como frente mudou na skill v2.3:** só conta o que
**atravessa sessão OU exige mais de uma PR**. **PR verde única não ocupa
vaga.**

> A v2.2 contava toda PR aberta, e isso estava calibrado errado porque não
> havia medição. A #326 mediu: mediana 🟢 **1,0 h**, 🟡 **1,0 h**,
> 🔴 **2,8 h**. Com verde fechando em uma hora, contar PR única como frente
> fazia uma tarefa de 60 minutos disputar vaga com a **#301**, travada há
> semanas — o teto passava a proteger o que está parado em vez do que está
> andando.

🔎 **Alarme de envelhecimento** (`scripts/aviso-pr-envelhecendo.sh`, no
`ci.yml` desde a #333) substitui o efeito colateral que segurava a fila curta,
medindo a cauda longa que era o gargalo real:

| faixa | limiar | ≈ múltiplo da mediana |
|---|---|---|
| 🟢 verde | 8 h | 8× |
| 🟡 amarela | 12 h | 12× |
| 🔴 vermelha | 48 h | 17×, com o **bloqueio nomeado** |

**Aviso, nunca gate.** PR 🔴 esperando decisão deve esperar; o que não pode é
ninguém saber que ela espera. A #327 ficou 25,1 h errada — 21× a mediana — com
CI verde o tempo todo.

As frentes abertas hoje — pilha empilhada conta como uma:

| # | frente | estado |
|---|---|---|
| 1 | **#309 → #323** — estado do banco no CI + guardas de deploy | prontas; a #309 só está `behind` |
| 2 | **#301 → #304** — hierarquia de 3 níveis | bloqueada: conflito de merge + parada de tier 🔴 |
| 3 | — | **vaga livre** |

🔎 A **#305** (pré-checagem read-only de "Empresa vazia") ocupava a vaga 2 e
**mergeou em 2026-08-14**. Era o passo 1 da ordem de aplicação da #301, que
agora não depende mais de PR nenhuma para ser conferida:
`npx tsx scripts/verificar-empresa-vazia.ts`.

### Branches remotas — 114 de resíduo, 20 a preservar

🔎 `docs/onix-branches-residuo.md` (#331) separa as **134** branches remotas em
**114 já mergeadas** (resíduo seguro) e **20 não mergeadas** — 11 delas head de
PR aberta. **Nada foi apagado**, e a segunda lista não se toca sem decisão do
Eduardo.

> Corrige o que a #326 afirmou: das 8 branches órfãs, **4** têm o trabalho na
> `main` (as três `juridico-fase-*` e `recover-team-data`), não as 8. As outras
> 4 foram para a lista que não se toca.

---

## Pendências conhecidas

### Bloqueantes

- ✅ **Backup: VERIFICADO.** 🔎 `restore-drill.yml` está **verde há 10 semanas
  seguidas** (última em **10/08/2026**, 17 runs no total, 4 falhas todas em
  mai–jun/2026 durante a construção do workflow). `db-backup.yml` roda diário
  às 06:00 UTC e **não falhou nenhuma vez em 30 dias** (90 runs no total).
  O drill de 10/08 restaurou em 4s e validou 87 tabelas e 4 usuários.

  > **Esta linha já disse o contrário.** Ela nasceu afirmando "backup nunca
  > restaurado/verificado" — errado, e por um motivo que vale registrar: a
  > pendência foi herdada de conversa, não conferida contra o histórico de
  > Actions. É o mesmo defeito que o "lote verde de 12+ PRs" (abaixo).

  **A pendência real é outra: o RTO nunca foi medido.** O drill prova que o
  dump é bom — restaura, o schema está lá, há usuários, há registro dos
  últimos 7 dias. Não prova que dá para **voltar a operar**: recriar projeto,
  restaurar, apontar `DATABASE_URL`, subir app. `DISASTER_RECOVERY.md:37`
  registra ~45 min como **estimativa**, e assim segue.

  **PITR desligado ⇒ são 2 cópias ativas, não 3.** `BACKUP_ARCHITECTURE.md:58`
  conta o PITR do Railway na regra 3-2-1-1-0, e ele não está ligado.
- **`cockpit-onix-staging`: "1/2 service crashed"**, auditoria não concluída.
- **PR #301 aberta com 3 níveis** — ver o conflito registrado acima. É a pendência
  de maior impacto: ela redefine a árvore inteira.

### Sem garantia no banco

- 📋 **`AcordoComercial` (Pessoa) não tem índice parcial único.** A regra "um
  acordo vigente por pessoa" existe **apenas em código**:
  `src/app/actions/acordo-comercial.ts:70-78` faz `updateMany` fechando o
  vigente e `create` do novo, dentro de uma transação. O banco não impede dois
  acordos com `dataFim` null para a mesma pessoa.

  Dois caminhos furam a regra sem passar por ali: `atualizarAcordo`
  (`:147`) faz `update` direto, e `encerrarAcordo` (`:168`) mexe em `dataFim`
  de uma linha só. Qualquer script, import ou rota futura também passa por fora.

  É a **mesma classe** do problema fechado pela #310 do lado do parceiro, onde
  a garantia virou índice parcial único no banco. O padrão a copiar existe e
  está testado:

  ```sql
  CREATE UNIQUE INDEX "AcordoComercial_pessoa_vigente_key"
    ON "AcordoComercial" ("pessoaId")
    WHERE "dataFim" IS NULL;
  ```

  ⚠️ **Diferente da #310, aqui a tabela TEM dados.** O `CREATE` aborta se já
  existirem duas linhas abertas para a mesma pessoa, então a PR precisa
  começar por um `SELECT` de diagnóstico e decidir o que fazer com as
  duplicatas — decisão de negócio, não de código. PR própria, tier 🔴 RED.

### Conferências humanas pendentes

- 📋 ~331 pares CPF↔CNPJ por sinal fraco — fila de revisão, sem união automática.
- 📋 117 documentos com múltiplas contas (máx. 5) — caso a caso.
- 📋 7 clientes sem `assessorCge` — invisíveis sob escopo restrito.

### ⚠️ Correção de registro — o "lote verde de 12+ PRs" **não existe**

🔎 Conferido em 2026-08-10: as PRs abertas são **8**, e **nenhuma** corresponde aos
temas que se supunha acumulados.

| # | título | criada |
|---|---|---|
| 301 | hierarquia de 3 níveis (draft, 🔴) | 2026-08-10 |
| 180 | backfill de conversas DataCrazy (dry-run) | 2026-06-16 |
| 166 | tipa os 10 `no-explicit-any` de `datacrazy.ts` | 2026-06-13 |
| 161 | import server-side do Saldo em CC | 2026-06-12 |
| 154 | carrossel "Tudo dá trabalho" (draft) | 2026-06-09 |
| 113 | busca inteligente de clientes | 2026-05-30 |
| 27 | remove credenciais em claro | 2026-05-18 |
| 2 | rename Cockpit → Ecossistema Onix | 2026-05-05 |

Os itens abaixo foram **sugeridos em conversa e nunca viraram PR**. Ficam
registrados como backlog, não como trabalho pendente de revisão:

- `acoesDisponiveis` no GET de `/api/empresas/hierarquia` (não há marcador de
  versão na resposta — hoje só se prova a versão nova provocando um 400)
- probe de `/api/empresas/hierarquia` no `post-deploy-smoke.yml` (hoje ele só
  testa `/login` e `/api/health`)
- `divergencias` no GET (hoje só sai no POST — descobrir um problema de leitura
  exige uma escrita)
- testes de `conferirRaiz` / `reparent`
- ensaios (`ensaio-hierarquia.ts`, `ensaio-backfill-pessoa-grupo.ts`) no CI —
  **nenhum dos dois roda em CI hoje**
- campo `operacao` no `EmpresaBootstrapLog`, para parar de emprestar `empresaId`
- `Implementacao` órfã: conferir `empresaId` contra `idsCadastradas()` antes de a
  FK entrar — `educacao` e `planejamento` saíram do cadastro na #297
- merge de leading zeros órfão
- guard de `DATABASE_URL`
- SHA do build no `/api/health`

### Deploy — migrations rodam no `startCommand`

**Estado atual:** `package.json` → `"start": "prisma migrate deploy && next start"`,
e `railway.toml` **não tem** `preDeployCommand`.

🔎 **A #317 tentou tirar as migrations do start** e pô-las como
`preDeployCommand`, por um motivo correto: dentro do `start`, o `&&` amarra
migrar e subir ao mesmo destino, e migration que falha derruba o serviço em
loop de restart — falha de DADO vira INDISPONIBILIDADE.

**O Railway nunca leu a chave.** Conferido no painel: o deploy mostrava
Initialization / Build / Deploy / Post-deploy, **sem estágio Pre-deploy**. A
causa é de tipo — a chave espera **array** (`preDeployCommand = ["npm run
db:migrate"]`) e a #317 escreveu string.

O efeito era **pior** que o problema original: com o `start` reduzido a `next
start`, migration pendente **não aplicava**, o app subia saudável, healthcheck
e smoke passavam, e o schema ficava atrás do código em silêncio. Divergência
silenciosa não avisa; indisponibilidade avisa.

**Revertido pela #335.** Nenhuma migration entrou entre a #317 e o revert, então
o estrago ficou em zero — por sorte de calendário, não por desenho.

✅ **EXERCITADO E PROVADO em 15/08/2026** pela #355 (`DeployProbe`), a primeira
migration a entrar depois do revert. Até ali o smoke provava apenas **ausência
de divergência**; a #355 criou o caso que faltava — um schema que o banco
PRECISAVA mudar.

O que se observou, no smoke das 22:45 UTC sobre `b0ebafb`:

| sinal | resultado |
|---|---|
| `Convergiu: b0ebafb está no ar` | o código no ar É o commit da migration |
| `migrations.pendentes` | **vazio** |
| `migrations.falhas` | vazio (não vazio reprova o step) |

Como `pendentes` é a diferença entre as pastas de `prisma/migrations/` **na
imagem no ar** e as linhas de `_prisma_migrations` com `finished_at`
preenchido e `rolled_back_at` nulo (`src/lib/migrations-aplicadas.ts`),
`pendentes` vazio significa que `20260815152536_deploy_probe` **entrou no
banco com `finished_at` gravado**. O `startCommand` aplicou.

⚠️ Registro honesto do método: os dois sinais vêm da **mesma fonte** (o
`/api/health` lendo `_prisma_migrations`). Nem `psql` contra produção nem o
`workflow_dispatch` de `estado-do-banco.yml` estavam disponíveis à sessão
(rede bloqueada e 403 de permissão). A leitura independente por SQL continua
pendente — e a PR que remover a `DeployProbe` é a segunda prova, desta vez de
um `DROP`.

A tabela `DeployProbe` **fica no ar como marco** até o Eduardo confirmar a
remoção.

**Para retomar o `preDeployCommand`** (não fazer sem isto):
1. Sintaxe em **array**, confirmada em documentação.
2. ⚠️ **O builder é `DOCKERFILE`** (`railway.toml`, `builder = "DOCKERFILE"`,
   com `Dockerfile` no repo — o comentário lá diz "NÃO usar Nixpacks"). Sob
   Dockerfile o pré-deploy pode precisar de shell explícito
   (`["/bin/sh", "-c", "..."]`), porque `&&` é sintaxe de shell. Quem assumir
   Railpack vai depurar o sintoma errado.
3. Provar com migration real e inofensiva, conferindo **os dois** sinais: o
   estágio Pre-deploy no painel **e** o nome da migration no `/api/health`.

### Detecção de schema pendente — entregue pela #323

`/api/health` (bloco autenticado) expõe `migrations`, com `pendentes`, ao lado
de `versao` e `flags`. O `post-deploy-smoke.yml` **reprova em vermelho** quando
há pendente, e também quando há migration **começada e não concluída** — que é
um modo de falha distinto, com conserto distinto (`prisma migrate resolve`).

É a rede que faltava no episódio acima: a partir dela, schema atrás do código
para de ser silencioso. Lógica pura em `src/lib/migrations-aplicadas.ts`, com
teste sem banco.

> ⚠️ O gate de divergência do mesmo workflow chegou a **reprovar o caminho
> feliz** (`escrever_estado` terminava em `[ -n "$x" ] && echo`, que sob
> `set -e` devolve 1 quando o teste é falso — e é chamada com argumentos
> vazios justamente quando o deploy CONVERGE). Corrigido pela #350. Enquanto
> durou, abriu issue de incidente a cada ciclo com produção sadia.

### Parceiros — Fase 1 completa em produção

Cinco tabelas no ar, **todas vazias**, e nada as lê ainda:

| tabela / campo | PR | o que garante |
|---|---|---|
| `Parceiro` | #306 | entidade própria; `clienteBackofficeId` é FK **opcional** — parceiro PODE ser cliente, não precisa ser |
| `Indicacao.parceiroId` | #306 | anda ao lado de `indicadorId` (#302), que não foi tocado |
| `ParceiroCliente` | #307 | vínculo **datado** (`dataFim` null = vigente) |
| índice `..._cliente_vigente_key` | #310 | **um cliente tem no máximo UM parceiro vigente** — a comissão do parceiro sai da do assessor, e dois retirariam da mesma base duas vezes |
| `Parceiro.indicadoPorParceiroId` + trigger | #308 | árvore com guarda anti-ciclo **no banco**, não no TS |
| `AcordoComercialParceiro` | #318 | comissão datada por `tipoProduto`; `DECIMAL(7,4)`, 2 CHECKs, um vigente por (parceiro, produto) |

Apoio sem banco: `src/lib/parceiros/parceiro-core.ts` (#312, travessia da
árvore, teto próprio de 64 níveis) e `vocabulario.ts` (#329, normalização —
sem ela `"assessoria"` e `"Assessoria"` passam os dois pelo índice parcial e
criam **dois acordos vigentes no mesmo produto** sem violar constraint).

**`AcordoComercialParceiro` é tabela IRMÃ de `AcordoComercial`, não extensão.**
Aquele é da `Pessoa` do time, tem `pessoaId` NOT NULL, **não tem campo de
percentual**, e `atualizarAcordo` faz `UPDATE` no lugar — o que violaria a regra
de que alterar percentual FECHA e ABRE.

**Piloto: `scripts/seed-parceiro-piloto.ts` (#330).** Dry-run por padrão;
escreve só com `--aplicar`. Existe para provar que a modelagem serve ao caso
real antes de haver UI. **Não contém migration** — merge dele não aplica nada;
a escrita é ato manual separado.

### Infra de CI observada

🔎 Durante a #299 o job `ci` travou no passo Build por ~30 min **sem honrar o
próprio `timeout-minutes: 20`**, duas vezes, em SHAs diferentes. Contribuem:

- `on: pull_request` em `ci.yml` e `actionlint.yml` **não inclui `ready_for_review`**
  — sair do draft re-exige os checks e nenhum run dispara; a saída vira force-push
- o workflow não declara `permissions`, então não há `actions: write` para cancelar
  um run travado (`403 Resource not accessible by integration`)
- o Build não cacheia `.next/cache`

---

## Como manter este arquivo

**Toda PR que mude modelo, decisão travada ou estado da árvore atualiza este
arquivo NA MESMA PR.** Não deixar para depois — memória compartilhada que
envelhece é pior que memória nenhuma, porque parece confiável.

Ao atualizar:

1. Mexeu em `prisma/schema.prisma`? → **Modelos existentes**
2. Mudou quem é PJ, quem é departamento, ou um id/nome? → **Árvore em produção**
3. Mudou a régua de união, ou rodou backfill? → **Identidade**
4. Mexeu em `rbac.ts`, `rbac-papeis.ts` ou numa flag? → **RBAC**
5. Fechou ou abriu uma pendência? → **Pendências conhecidas**
6. Sempre: atualizar o commit de referência no topo

**Marcar a procedência.** 🔎 verificado / 📋 declarado / ⚠️ em conflito. Número de
produção que uma sessão não pode conferir entra como 📋 — nunca como fato do
repositório. Foi por não separar as duas coisas que o "lote verde de 12+ PRs"
sobreviveu sem nunca ter existido.
