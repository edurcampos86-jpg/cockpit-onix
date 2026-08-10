# Onix Co — estado do projeto

Memória compartilhada entre sessões. Quem chega novo lê **este arquivo** e sabe
o estado real sem auditar o repositório do zero.

> **Última atualização:** 2026-08-10, contra `main` em `8da0b4c`.

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

📋 Estado informado pelo Eduardo — não verificável de uma sessão.

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
> Se a árvore acima de fato existe em produção (6 linhas), **a #301 não aplica
> como está**. Confirmar `SELECT count(*) FROM "Empresa";` antes de qualquer
> decisão sobre ela.

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

## Pendências conhecidas

### Bloqueantes

- **Backup nunca restaurado/verificado.** Pré-requisito da faixa verde — backup
  não testado é backup que não existe. Ver `docs/DISASTER_RECOVERY.md` e
  `.github/workflows/restore-drill.yml`.
- **`cockpit-onix-staging`: "1/2 service crashed"**, auditoria não concluída.
- **PR #301 aberta com 3 níveis** — ver o conflito registrado acima. É a pendência
  de maior impacto: ela redefine a árvore inteira.

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
