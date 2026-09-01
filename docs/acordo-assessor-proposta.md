# Acordo do assessor — proposta de modelo de dados

> **Nada aqui foi implementado.** Este documento é a proposta que a governança
> exige antes do código: a migration é faixa **vermelha**, roda dentro do
> `startCommand` (`package.json:8` — `"start": "prisma migrate deploy && next start"`),
> e o Eduardo lê o SQL antes. O que existe é este texto e os fatos de código
> que o sustentam — todos com `arquivo:linha`, todos relidos nesta sessão.

---

## 0. O que o recon achou, e o que ele muda na proposta

| pergunta | resposta, e onde está no código |
|---|---|
| o acordo do assessor tem campo de percentual? | **não.** `AcordoComercial` (`prisma/schema.prisma:2574-2607`) tem 14 colunas e a única numérica é `contratoBytes` — tamanho de PDF |
| onde estão os percentuais reais, então? | **em prosa**, em `regrasEspeciais` e `observacoes` (`@db.Text`). As 6 regras conhecidas estão em `scripts/seed-acordos-comerciais.ts:36-134` |
| existe histórico de conteúdo do acordo? | **não.** `criarAcordo` fecha-e-abre (`src/app/actions/acordo-comercial.ts:70-91`), mas `atualizarAcordo` faz `prisma.acordoComercial.update` no lugar (`:147-150`) e não toca `dataInicio`/`dataFim` |
| existe trava de "um acordo vigente por pessoa"? | **não.** Só dois índices NÃO-únicos (`schema.prisma:2605-2606`). O irmão do parceiro TEM índice parcial único (`prisma/migrations/20260822020000_acordo_parceiro_por_empresa/migration.sql:85-87`) |
| existe cálculo de comissão de pessoa no repo? | **nenhum, em nenhuma forma.** A única leitura de `ComissaoMensalCliente` agrupa por competência (`src/app/empresas/investimentos/receita/page.tsx:65-72`) |
| existe histórico de "quem era o assessor daquele cliente"? | **não.** `ClienteBackoffice.assessorCge` (`schema.prisma:764`) é snapshot sobrescrito a cada enrich (`src/app/api/backoffice/btg-enrich/route.ts:147-150`, gravado em `:166`) |
| o documento do ADM/Financeiro decide algo sobre isso? | **não.** `grep -niE "acordo|assessor|rateio|split"` nas 707 linhas de `docs/onix-financeiro-modelo.md` devolve **zero**. Não há contradição possível — há silêncio |

**Consequência de recon que muda o desenho:** o percentual não é o que falta.
O que falta são **três** coisas, e o percentual é a mais fácil delas — falta a
**base** ("20% de quê", 🔴 registrado em `docs/onix-co-estado.md:958-965`),
falta a **titularidade datada** do cliente, e falta a **regra de precedência**
por nó da árvore, que hoje não existe nem para o parceiro.

---

## 1. O problema, em três frases que o código sustenta

**1. A regra de remuneração da pessoa que move o volume está escrita em prosa.**
`AcordoComercial` guarda `tipo String` — quatro valores validados só em código
(`src/lib/team.ts:40-45`, `isTipo()` em `src/app/actions/acordo-comercial.ts:8-10`) —
mais dois campos de texto livre. Os percentuais reais moram lá dentro:

> *"5% sobre comissão líquida da ONX em negócios de operação direta / 25% sobre
> comissão líquida em negócios indicados pelo PARCEIRO"* — Thiago,
> `scripts/seed-acordos-comerciais.ts:41-42`
>
> *"1% do faturamento bruto da Onx Corretora"* — Alexandra, `:56`
>
> *"Retirada fixa mensal: R$ 4.000,00 / Mais 20% da receita líquida da ONX"* —
> Rose, `:71-72`
>
> *"R$ 1.518,00 fixo / 20% por captação de imóvel / 30% por captação de cliente
> / Cumulativo…"* — Leide, `:90-95`

Quatro bases diferentes (`comissão líquida da ONX`, `faturamento bruto da Onx
Corretora`, `receita líquida da ONX`, `comissão líquida da Onix Imob`), em
quatro empresas diferentes. Nenhuma delas é um número que uma query alcance.

**2. Editar o acordo apaga o passado, sem deixar rastro.**
`atualizarAcordo` é um `UPDATE` no lugar (`src/app/actions/acordo-comercial.ts:147-150`):
trocar *"split de 20%"* por *"30%"* sobrescreve o texto e **nada** no banco
registra que o 20% existiu. O único carimbo é `atualizadoEm` (`@updatedAt`),
que não diz o que mudou, nem quem, e não aparece em tela nenhuma. Pior: a
função aplica `sOrNull()` sobre campo ausente (`:120-121`) — um POST sem
`regrasEspeciais` grava `NULL` e **apaga a regra comercial inteira**. Só não
acontece hoje porque o formulário sempre reenvia os dois textareas
(`src/app/time/_components/acordo-comercial-section.tsx:349` e `:361`).

O schema já nomeou esse defeito, e usou-o como razão para **não** reusar o
model no lado do parceiro (`prisma/schema.prisma:1563-1565`):

> *"`atualizarAcordo` (acordo-comercial.ts:147) faz UPDATE no lugar — o que
> viola frontalmente a regra abaixo de que alterar percentual FECHA e ABRE.
> Reusar o model herdaria esse caminho de escrita."*

**3. O extrato existe; o rateio não.** `ComissaoMensalCliente`
(`schema.prisma:1825-1911`) guarda a receita mensal por cliente em
`Decimal(14,2)`, com chave `(clienteId, competencia, fonte)` (`:1904`) e
idempotência garantida pelo upsert (`btg-enrich/route.ts:189-209`). É a base do
rateio, e ela está pronta. O que não existe é o elo entre esse número e uma
pessoa: **nenhum `groupBy` por `empresaId` e nenhum cálculo de comissão de
pessoa em todo o repositório.** A coluna "Comissão" da lista de Parceiros nasce
`visivel: false` exatamente por isso, e diz por quê no próprio código
(`src/lib/parceiros/colunas.ts:50-58`).

*No seu vocabulário:* o extrato da corretora chega todo mês, certinho. O que
falta é o contrato de rateio da mesa — e ele hoje está num e-mail, não no
sistema.

---

## 2. As tabelas

**Duas novas. ZERO SQL em `AcordoComercial`.**

O desenho é o **espelho** de `AcordoComercialParceiro` (`schema.prisma:1597-1698`),
que já roda em produção. Copiar é a decisão principal: o dialeto datado, os
`CHECK`s escritos à mão, o índice parcial único do vigente, `criadoPor`/
`encerradoPor` e o fechar-e-abre em transação (`src/app/actions/parceiros.ts:240-260`)
já foram pagos uma vez, com uma migration vermelha (#318). Ter dois dialetos de
vigência para o mesmo cálculo, sobre a mesma comissão líquida, seria como ter
dois formatos de data no mesmo relatório.

Diverge em **seis** pontos, e cada um tem um dado real por trás.

### 2.1 `AcordoAssessor` — a regra de cálculo

```prisma
model AcordoAssessor {
  id String @id @default(cuid())

  /// QUEM recebe. `Restrict`, não `Cascade`.
  /// `AcordoComercial.pessoaId` é Cascade (baseline:1442) e o acordo do
  /// parceiro copiou (schema.prisma:1601). O precedente financeiro MAIS
  /// RECENTE da casa é o oposto, e está justificado por escrito em
  /// `ComissaoMensalCliente.clienteId` (schema.prisma:1830-1851): "apagar um
  /// cliente não pode apagar o registro de quanto ele gerou". Um acordo com
  /// percentual é a RAZÃO de um pagamento passado — desligar uma pessoa não
  /// pode apagar a razão do que já saiu do caixa.
  pessoaId String
  pessoa   Pessoa @relation("AcordoAssessorPessoa", fields: [pessoaId], references: [id], onDelete: Restrict)

  /// SOBRE QUAL PARTE DA CASA. FK real, NOT NULL, `Restrict`.
  /// No parceiro esta coluna é nullable só por convivência com o
  /// `tipoProduto` legado (schema.prisma:1608-1633). Aqui não há linha legada:
  /// a tabela nasce vazia, então nasce obrigatória.
  /// NÃO copiar `tipoProduto` nem nada em texto livre: o preço já está pago e
  /// visível em `src/lib/parceiros/vocabulario.ts`, que existe só para impedir
  /// que "assessoria" e "Assessoria" passem os dois pelo índice parcial.
  empresaId String
  empresa   Empresa @relation("AcordoAssessorEmpresa", fields: [empresaId], references: [id], onDelete: Restrict)

  /// A FORMA da linha: "percentual" | "fixo_mensal".
  /// É a divergência que o dado real obriga — ver §2.2.
  tipoRemuneracao String

  // ── só em linha "percentual" (NULL nas linhas de fixo, garantido por CHECK)
  /// "qualquer" | "direto" | "indicado_parceiro"
  origemNegocio String?
  /// "comissao_liquida" | "faturamento_bruto" | "receita_liquida"
  base          String?
  /// 0–100 (40.0000 = 40%), NÃO fração. Cópia literal de schema.prisma:1668.
  percentual    Decimal? @db.Decimal(7, 4)

  // ── só em linha "fixo_mensal" (NULL nas linhas de percentual, por CHECK)
  /// Dinheiro é (14,2) nesta casa — mesmo de ComissaoMensalCliente.comissao.
  valorFixoMensal Decimal? @db.Decimal(14, 2)

  /// O acordo deste nó vale também para os nós ABAIXO dele?
  /// Só entra JUNTO com o resolvedor (§3, passo 5). Hoje o campo existe no
  /// acordo do parceiro, é gravado (parceiros.ts:252), guardado, exibido como
  /// selo "+ o que está abaixo" (acordos-section.tsx:114) — e NENHUMA linha de
  /// código o resolve. Copiar o campo sem o resolvedor replicaria a promessa
  /// vazia no lado que TEM dado real para calcular.
  incluiDescendentes Boolean @default(false)

  dataInicio DateTime  @default(now())
  dataFim    DateTime? // null = vigente

  /// "Quem mudou o percentual, e quando" é a primeira pergunta de qualquer
  /// contestação de fechamento. `AcordoComercial` não tem nenhum dos dois.
  criadoPor    String?
  encerradoPor String?

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  @@index([pessoaId, dataInicio])
  @@index([pessoaId, dataFim])
  @@index([empresaId])
}
```

### 2.2 Por que o fixo mora aqui, e como ele deixa de duplicar

**4 dos 6 acordos reais têm parte fixa** (Thiago R$ 5.000 → R$ 4.000, Rose
R$ 4.000, Leide R$ 1.518 — `seed-acordos-comerciais.ts:37-38`, `:71`, `:90`).
Um campo `valorFixoMensal` pendurado numa linha de percentual **não fecha**: a
chave do vigente inclui `origemNegocio`, e o mesmo R$ 4.000 ficaria
representável em duas ou três linhas do mesmo nó (uma por origem), sem nada no
banco impedindo. Pagar em triplicata seria estado válido.

**A solução é a forma da linha, não uma tabela a mais.** `tipoRemuneracao`
separa dois formatos dentro da mesma tabela, e os `CHECK`s tornam a mistura
impossível:

| forma | preenche | é única por | pipeline que a paga |
|---|---|---|---|
| `percentual` | `percentual`, `base`, `origemNegocio` | (pessoa, nó, origem) | dirigido pelas **linhas de receita** da competência |
| `fixo_mensal` | `valorFixoMensal` | (pessoa, nó) | dirigido pelos **acordos fixos vigentes** — independe de haver receita |

É o que faz *"R$ 4.000 do Thiago em jul/2026 é devido mesmo num mês sem
comissão nenhuma"* ser verdade **e** executável: o fixo não passa pelo caminho
que começa na lista de clientes.

**Alternativa descartada — tabela separada só para o fixo.** Ela custaria uma
terceira tabela com vigência datada, fechar-e-abre, `criadoPor`/`encerradoPor`
e índice parcial próprio: o mesmo maquinário, duplicado, para guardar um número.
O degrau R$ 5.000 → R$ 4.000 do Thiago é exatamente **duas linhas datadas** —
a mesma vigência que já resolve o percentual resolve o fixo de graça.

### 2.3 `AssessorCliente` — a titularidade datada

É `ParceiroCliente` (`schema.prisma:1514-1546`) copiado para o lado do time. É
a peça sem a qual o rateio **não pode** ser feito certo:

```prisma
model AssessorCliente {
  id String @id @default(cuid())

  clienteId String
  cliente   ClienteBackoffice @relation("AssessorDoCliente", fields: [clienteId], references: [id], onDelete: Restrict)

  pessoaId String
  pessoa   Pessoa @relation("ClientesDoAssessor", fields: [pessoaId], references: [id], onDelete: Restrict)

  /// O CGE que estava em `ClienteBackoffice.assessorCge` quando a linha
  /// nasceu. Guardado por CÓPIA: `Pessoa.codigoAssessorBtg` é `@unique` e
  /// EDITÁVEL (schema.prisma:2376 e :2383-2384) — se um CGE for remanejado
  /// para outra pessoa, o histórico precisa dizer o que foi lido, não o que
  /// vale hoje.
  cgeNaEpoca String?

  /// "btg_enrich" | "manual" | "backfill_presumido"
  /// Separa o que a API afirmou do que alguém corrigiu à mão. É o mesmo
  /// problema de dois escritores que a FIELD_SOURCE_POLICY já registra para
  /// `assessorCge` (src/lib/backoffice/field-source-policy.ts:97 declara
  /// `base_btg` dono único, e o enrich grava por fora, com `update` cru).
  origem String

  dataInicio DateTime  @default(now())
  dataFim    DateTime? // null = vigente

  vinculadoPor    String?
  desvinculadoPor String?

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  @@index([pessoaId, dataFim])
  @@index([clienteId, dataFim])
  @@index([clienteId, dataInicio])
}
```

**Por que uma tabela, e não confiar em `assessorCge`.** O campo é snapshot do
dono **atual**, sobrescrito a cada enrich (`btg-enrich/route.ts:147-150`), sem
nenhuma coluna de vigência. Pagar a competência de março exige saber quem era o
assessor **em março**, e o banco só sabe quem é hoje: trocar um cliente de
assessor **reescreve retroativamente todo o passado de comissão dele**. E não
há de onde reconstruir — `BtgSyncLog` guarda `resumo`, `erros` e contadores, e
**não guarda payload** (`schema.prisma:1212-1227`).

É o mesmo argumento, palavra por palavra, que já está escrito para o parceiro
em `schema.prisma:1502-1506`: *"Um campo no cliente responderia 'de quem é
hoje' e perderia 'de quem era quando a receita entrou' — que é a pergunta que
decide comissão."*

*No seu vocabulário:* é a diferença entre a posição de hoje e o extrato do mês.
Pagar março pela custódia de setembro é o extrato de ontem numa mesa que já
operou hoje.

### 2.4 O que só existe na migration

`CHECK` e índice parcial **não são representáveis em `schema.prisma`** — é o
padrão da casa (`prisma/migrations/20260812205040_acordo_comercial_parceiro/migration.sql:145-151`),
e é dívida de leitura conhecida: **quem copiar a tabela lendo só o schema perde
a faixa 0–100**, e a confusão fração×percentual volta calada (gravar `0.40`
achando que é 40% e a pessoa receber 0,4%).

```sql
-- ── AcordoAssessor: a FORMA da linha ─────────────────────────────────────
ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_tipo_conhecido"
  CHECK ("tipoRemuneracao" IN ('percentual', 'fixo_mensal'));

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_forma_percentual"
  CHECK ("tipoRemuneracao" <> 'percentual' OR (
         "percentual" IS NOT NULL AND "base" IS NOT NULL
     AND "origemNegocio" IS NOT NULL AND "valorFixoMensal" IS NULL));

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_forma_fixo"
  CHECK ("tipoRemuneracao" <> 'fixo_mensal' OR (
         "valorFixoMensal" IS NOT NULL
     AND "percentual" IS NULL AND "base" IS NULL AND "origemNegocio" IS NULL));

-- ── faixas e vocabulário ─────────────────────────────────────────────────
ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_percentual_faixa"
  CHECK ("percentual" IS NULL OR ("percentual" >= 0 AND "percentual" <= 100));

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_fixo_nao_negativo"
  CHECK ("valorFixoMensal" IS NULL OR "valorFixoMensal" >= 0);

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_base_conhecida"
  CHECK ("base" IS NULL OR "base" IN
        ('comissao_liquida', 'faturamento_bruto', 'receita_liquida'));

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_origem_conhecida"
  CHECK ("origemNegocio" IS NULL OR "origemNegocio" IN
        ('qualquer', 'direto', 'indicado_parceiro'));

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_vigencia_coerente"
  CHECK ("dataFim" IS NULL OR "dataFim" >= "dataInicio");

-- ── UM vigente por (pessoa, nó, origem) nas linhas de percentual ─────────
CREATE UNIQUE INDEX "AcordoAssessor_vigente_percentual_key"
  ON "AcordoAssessor" ("pessoaId", "empresaId", "origemNegocio")
  WHERE "dataFim" IS NULL AND "tipoRemuneracao" = 'percentual';

-- ── UM fixo vigente por (pessoa, nó). É o que impede pagar o fixo 2x ─────
CREATE UNIQUE INDEX "AcordoAssessor_vigente_fixo_key"
  ON "AcordoAssessor" ("pessoaId", "empresaId")
  WHERE "dataFim" IS NULL AND "tipoRemuneracao" = 'fixo_mensal';

-- ── AssessorCliente: um titular vigente por cliente ──────────────────────
CREATE UNIQUE INDEX "AssessorCliente_vigente_key"
  ON "AssessorCliente" ("clienteId")
  WHERE "dataFim" IS NULL;

ALTER TABLE "AssessorCliente" ADD CONSTRAINT "AssessorCliente_vigencia_coerente"
  CHECK ("dataFim" IS NULL OR "dataFim" >= "dataInicio");

ALTER TABLE "AssessorCliente" ADD CONSTRAINT "AssessorCliente_origem_conhecida"
  CHECK ("origem" IN ('btg_enrich', 'manual', 'backfill_presumido'));
```

**Dois índices parciais aqui NÃO são a dívida do parceiro.** Lá, os dois
(`…_vigente_key` e `…_vigente_empresa_key`, migrations `20260812205040:138-140`
e `20260822020000:85-87`) convivem como estado intermediário de uma troca de
chave em duas PRs. Aqui eles são **disjuntos por predicado** (`tipoRemuneracao`),
permanentes e de propósito: um cobre a linha de percentual, o outro a de fixo,
e nenhuma linha entra nos dois.

**`origemNegocio` é NOT NULL nas linhas de percentual (por CHECK) antes de
entrar no índice.** Isso importa: o Postgres trata NULL como distinto em índice
único, e uma coluna nullable ali deixaria duas linhas vigentes passarem — que é
exatamente a classe de erro que `vocabulario.ts` existe para tapar do lado do
parceiro.

### 2.5 O que NÃO muda

| tabela | o que acontece | por quê |
|---|---|---|
| `AcordoComercial` | **ZERO SQL.** Muda de PAPEL, não de forma | vira o **dossiê** — `tipo`, prosa, PDF assinado, elo 1:1 com o jurídico (`schema.prisma:2603` ↔ `:2889-2890`). Pôr `percentual` dentro dela herdaria as duas rotas de escrita erradas que já existem: `update` no lugar (`acordo-comercial.ts:147`) e DELETE físico (`:194`) |
| `ComissaoMensalCliente` | **ganha só um leitor** | não acrescentar `pessoaId` nem `empresaId`: o §1.7 do ADM já decidiu que ela MIGRA para `ParcelaReceita`, e toda coluna nova é mais uma a migrar. Titularidade é datada e mora em `AssessorCliente` — gravá-la na linha de receita repetiria o erro do `assessorCge` |
| `Empresa`, `Pessoa`, `ClienteBackoffice` | só **lados inversos de relação** | nenhum SQL. ⚠️ mas `src/lib/ci/tabelas-tocadas.ts:38-48` conta `REFERENCES "X"` como *tocar X*: as três vão aparecer no destaque da PR. Isso é ruído esperado, não erro |
| índice parcial único de `AcordoComercial` | **fica de fora** | é o 🔴 item 8 de `docs/onix-wip-inventario.md:162`: a tabela **tem dados** e o `CREATE UNIQUE INDEX` aborta se já houver duas linhas abertas para a mesma pessoa. Entra só o `SELECT` de diagnóstico, para o número existir antes da decisão |

**Nenhum valor novo em `TIPOS_ACORDO`** (`src/lib/team.ts:40-45`). A semântica
de cálculo passa a morar na tabela nova, não numa string sem `CHECK` que
`src/lib/recover-team-data.ts:712` grava direto, sem passar por `isTipo()`.

---

## 3. Como uma linha de `ComissaoMensalCliente` vira valor a pagar

Módulo puro, sem IO — o padrão de `escopo.ts`/`permissoes.ts`/`rbac-papeis.ts`.
`ratearCompetencia("2026-03")` devolve, por pessoa, o valor **e a lista do que
não coube**. Dez passos.

**Passo 0 — a data do fato gerador.** Competência é rótulo `"AAAA-MM"` (String
com CHECK, `schema.prisma:1867`); o acordo é datado em `DateTime`. A tradução é
`$X` = último instante da competência, em UTC. **Nunca `dataInicio <= now()`**:
está medido que `TIMESTAMP(3)` arredonda `CURRENT_TIMESTAMP` e em 75,8% dos
casos a linha recém-criada cai no futuro (`schema.prisma:1584-1590`). A leitura
correta é sempre `"dataInicio" <= $X AND ("dataFim" IS NULL OR "dataFim" > $X)`.

> ⚠️ **Isto entrega o mês inteiro ao estado do dia 31.** Se o acordo mudou no
> dia 12, ou o cliente trocou de assessor no dia 12, a competência inteira sai
> pela regra do fim do mês. A base é mensal e não tem granularidade diária
> (`ComissaoMensalCliente` guarda um número por cliente/mês), então fidelidade
> ao dia é impossível sem outra fonte. **É a pergunta 3 do §7** — não é detalhe
> de implementação.

**Passo 1 — a base, de uma fonte só.**
`WHERE "competencia" = $mes AND "fonte" = 'btg_rm_reports'`, somado em SQL
(`NUMERIC` exato). Uma **constante única** decide de onde se lê: enquanto
`ParcelaReceita` não existir, é `ComissaoMensalCliente`; quando existir, passa a
ser `ParcelaReceita` com `origem='apuracao' AND status='recebida'`
(`docs/onix-financeiro-modelo.md:586-601`). **Ler as duas é o erro de 2x** que a
janela de convivência do §1.7 abre — por isso é uma constante, não um `if`
espalhado.

**Passo 1b — a competência corrente não é rateável.** A competência gravada é o
**mês em que o enrich rodou**, não a do relatório, e o próprio código diz isso
(`btg-enrich/route.ts:44-49`): *"Rodar o enrich no dia 1º pode gravar sob o mês
corrente um relatório que ainda é do mês anterior."* O rateio, então, recusa a
competência aberta, e mostra ao lado a data de coleta de cada linha
(`ComissaoMensalCliente.origemSyncId` → `BtgSyncLog.iniciado`,
`schema.prisma:1896`). Um mês carimbado no dia 1º fica **visível**, em vez de
virar rateio silenciosamente do mês errado.

**Passo 2 — quem era o dono naquele mês.** `AssessorCliente` vigente em `$X`.
Cliente sem linha vigente **não vira "o assessor ganhou zero"**: vai para
`semTitular[]`, exibido com a soma que ficou de fora. É a mesma distinção que
`src/lib/financeiro/serie-competencia.ts:35-46` já carimba — `presente` é campo,
não inferência de valor — e é o buraco que `docs/onix-financeiro-modelo.md:615-620`
já registra para a campanha: linha sem pessoa não apura, em silêncio, e a soma
nunca bate.

**Passo 3 — o nó.** Constante `NO_DA_RECEITA_BTG = "investimentos"`. Não há
aresta cliente→nó no lado Investimentos, e isso é **decisão registrada** —
`ClienteBackoffice` não tem `empresaId` e o schema recusa isso por escrito em
`schema.prisma:912-919` e `:3261-3274`. Não é invenção: é a mesma escolha do
backfill já mergeado do ADM (`docs/onix-financeiro-modelo.md:449`, que grava
`'investimentos'` em toda linha migrada). Quando `ParcelaReceita` chegar, a
coluna é nativa e NOT NULL, e a constante morre.

**Passo 4 — a origem do negócio, com balde de "não sei".** `ParceiroCliente`
vigente em `$X` → `indicado_parceiro`; sem vínculo → `direto`. **Com uma
exceção obrigatória:** se a pessoa tiver **duas** linhas de percentual naquele
nó (uma `direto`, outra `indicado_parceiro`), ausência de vínculo é
**ambiguidade, não afirmação** — a linha vai para `origemIndeterminada[]` e não
é rateada. Entre os 5% e os 25% do Thiago há um fator de 5, e errar para baixo
em silêncio é pior que não pagar e perguntar. Quando a pessoa tem uma taxa só
(`qualquer`), a ausência não muda nada e o rateio segue.

**Passo 5 — o acordo, com precedência declarada.** Hoje essa ordem não está
escrita em lugar nenhum do repositório — **nem para o parceiro**. Ela passa a
ser:

1. (pessoa, nó exato, origem exata) vigente em `$X`;
2. (pessoa, nó exato, `qualquer`);
3. sobe por `Empresa.parentId`, um nível de cada vez, e aceita o **primeiro**
   ancestral com acordo vigente **e** `incluiDescendentes = true`, tentando
   origem exata e depois `qualquer` em cada nível.

**O mais específico ganha, e o primeiro achado encerra a busca.** A travessia é
TypeScript sobre a árvore em memória, **nunca `WITH RECURSIVE`**:
`Empresa.parentId` não tem trigger anti-ciclo (só `Parceiro` tem —
`prisma/migrations/20260811092601_parceiro_arvore_anticiclo/migration.sql:90-132`)
e um ciclo viraria query que não devolve.

> ⚠️ **`descendentesDe` NÃO serve aqui.** Ela desce
> (`src/lib/empresas/acesso-core.ts:52-79`) e não inclui a própria raiz (teste
> explícito em `acesso-core.test.ts:27`). Subir é uma função **nova** —
> `ancestraisDe(noId, empresas)` —, e ela precisa do **seu próprio `Set` de
> vistos**: a proteção anti-ciclo não se transfere por vizinhança.

> ⚠️ **`Empresa.parentId` é mutável e não é datado.** Existe rota viva de
> reparent em produção (`src/app/api/empresas/hierarquia/route.ts:24` — *"UPDATE
> de `parentId`. Nunca INSERT"*, lógica em `src/lib/empresas/reparent.ts`).
> Remanejar um departamento em setembro muda qual acordo herdado responde por
> março. Enquanto o fechamento não for congelado (frente #4, §6), a herança é
> resolvida contra a árvore **de hoje** — e isso precisa estar dito na tela.

**Passo 6 — a base tem de casar.** O acordo declara `base`; o rateio só aplica
se ela for igual à constante `BASE_DA_COMISSAO_BTG`. **Essa constante não tem
valor até o Eduardo responder a pergunta 1.** O parser aceita cinco nomes de
campo e grava o que vier (`btg-enrich/route.ts:380-381`), e o próprio documento
do ADM trata o mesmo número como bruto **e** líquido (`:434-438`). Sem resposta,
a função **recusa e explica**; não estima. É parada dura em vez de repasse
errado — e é a única coisa que faz a coluna `base` valer alguma coisa.

*No seu vocabulário:* é o *stop loss*. Não é desconfiança do cálculo, é limite
escrito antes.

**Passo 7 — a conta.** `valor = comissao × percentual ÷ 100`, tudo em
`Prisma.Decimal`, do primeiro ao último operando — converter para `Number` na
entrada derrotaria a escolha da #318 na porta (é o cuidado que
`parceiros.ts:209-218` já toma). Nenhum operando `Float`: `saldo` e
`receitaAnual` continuam `Float` no schema, e um só deles na multiplicação anula
a precisão. Arredonda a 2 casas **uma vez**, no total por pessoa, nunca por linha.

**Passo 8 — o fixo tem pipeline próprio.** Ele **não** passa pelos passos 1–5.
A consulta é: acordos `tipoRemuneracao = 'fixo_mensal'` vigentes em `$X`, um por
(pessoa, nó) — garantido pelo índice parcial de §2.4. Entra uma vez por
competência, mesmo em mês sem comissão nenhuma. Sem cliente, sem base, sem
origem.

**Passo 9 — o que o cálculo NÃO decide sozinho.**

- **Estorno.** Comissão negativa é permitida por decisão explícita
  (`prisma/migrations/20260824030000_comissao_mensal_cliente/migration.sql:60-61`).
  O rateio **propaga o sinal e sinaliza** — não compensa, não zera. Pergunta 6.
- **Soma acima de 100%** entre assessor e parceiros: **avisa, não bloqueia.** O
  schema afirma independência (`:1572-1576`, *"Eduardo 40% e Michel 20% do mesmo
  negócio convivem"*) e soma-100 (`:1660`, *"assessor + parceiros fecham 100%?"*)
  a oito linhas de distância. As duas não podem valer juntas, e escolher é do
  Financeiro. Pergunta 2.
- **Mesma pessoa com acordo de time e de parceiro** (o caso Renan): **avisa ao
  gravar, não impede.** `docs/onix-co-estado.md:915-936` pede explicitamente
  para não decidir por conta própria. Pergunta 8.

**Passo 10 — onde isso aparece.** Tela **nova**, `requireAdmin()` na primeira
linha, rotulada **"conferência"** e não "fechamento" enquanto a frente #4 não
existir. **Não** em `/empresas/investimentos/receita`: aquela página soma a
tabela inteira em SQL cru, sem `getAuthContext` e sem `resolverCgesVisiveis`
(`src/app/empresas/investimentos/receita/page.tsx:64-100`) — ao contrário de
`/clientes`, `/performance` e `/cadencia`. Pendurar remuneração de pessoa
naquela rota vazaria o pagamento de todo o time para qualquer logado.

### 3.1 Retroatividade: o que a guarda do parceiro NÃO cobre

A guarda copiada do parceiro (`src/app/actions/parceiros.ts:225-238`) consulta
**apenas a linha aberta** (`findFirst({ where: { …, dataFim: null } })`, `:229-232`)
e recusa só `dataInicio < vigenteAtual.dataInicio` (`:233`). Com um acordo
vigente desde janeiro, cadastrar em setembro uma linha começando em **março**
**passa** — fatia a linha antiga com `dataFim = março` e a competência de março
muda de 5% para 25%. Sem `UPDATE`, sem violar `CHECK`, sem violar o índice
parcial (que só olha `dataFim IS NULL`).

**Por isso a guarda daqui é mais dura, e é regra de negócio, não de código:**

> Um acordo novo só pode começar **a partir do primeiro dia da competência
> corrente**. Corrigir um mês já apurado não é editar acordo — é estorno
> explícito, e ele depende da frente #4.

A mesma guarda vale para `AssessorCliente`: sem ela, a tabela criada para
impedir que trocar de assessor reescreva o passado aceitaria, pelo caminho
`origem = 'manual'`, uma `dataInicio` retroativa que reatribui o dono de março
em silêncio.

**E é preciso dizer o que ainda fica em aberto:** enquanto **nada é
persistido**, o rateio responde *"quanto é devido hoje, pelas regras de hoje"* —
não *"o que foi pago em março"*. Três entradas dessa recomputação são
retroeditáveis (acordo, titularidade e a árvore de `Empresa`). Fechar isso é
`ApuracaoComissao` com snapshot de percentual/base/valor e **trigger** de
imutabilidade — a frente #4 do §6. A migration do parceiro já escreveu a regra
que a autoriza (`20260812205040:40-46`): *"Se aparecer rota que edite percentual
no lugar, a resposta certa é trigger, não revisão de código."*

---

## 4. O que acontece com os `AcordoComercial` existentes

**Nenhum é alterado, migrado ou apagado. Zero linhas de SQL naquela tabela.**

O que muda é o papel, e ele passa a estar escrito: `AcordoComercial` é o
**dossiê** (tipo, prosa, PDF assinado, elo com o jurídico); `AcordoAssessor` é a
**regra de cálculo**. Uma pessoa tem os dois, e a ficha em `/time/[id]` mostra
os dois **na mesma seção** — a prosa ao lado do número, para conferência humana.
Separá-los esconderia metade do acordo: a cumulatividade da Leide (`seed:95`) e
o *"alterável unilateralmente a cada 6 meses"* da Rose (`seed:74`) não cabem em
coluna nenhuma e continuam só na prosa.

**Sem backfill automático de percentual — e isso é impossibilidade medida, não
preguiça.** As 6 linhas-fonte conhecidas (`scripts/seed-acordos-comerciais.ts:30-134`)
são multi-cláusula:

| pessoa | vira, no mínimo | por quê |
|---|---|---|
| Thiago (`:36-46`) | **4 linhas** | fixo R$ 5.000 até jun/2026 + fixo R$ 4.000 de jul/2026 (duas linhas datadas), + 5% `direto` + 25% `indicado_parceiro`, base `comissao_liquida` |
| Alexandra (`:56-60`) | 1 linha | 1%, base `faturamento_bruto` — base diferente de todas as outras |
| Rose (`:70-79`) | 2 linhas | fixo R$ 4.000 + 20% base `receita_liquida` |
| Leide (`:89-100`) | 3 linhas | fixo R$ 1.518 + 20% (captação de imóvel) + 30% (captação de cliente), **cumulativos** — e o eixo que separa os dois papéis **não existe em dado nenhum do banco** |
| Renan (`:105-121`) | 0 linhas de percentual | pró-labore de contrato social |
| Matheus (`:122-134`) | 0 linhas de percentual | idem |

Um único campo `percentual` não cabe em nenhuma das seis. Uma migration que
tentasse parsear essa prosa seria **palpite gravado em produção**.

**O backfill é ato humano**, na tela nova, uma linha por vez, com a prosa do
acordo antigo visível ao lado. São 6 pessoas — custa uma tarde, não uma
migration. E cada linha nasce com `criadoPor` preenchido, que é o rastro que
`AcordoComercial` nunca teve.

**Consequência honesta, e ela fica visível na tela:** os acordos de Imobiliária
e Corretora ficam **cadastrados e sem cálculo**. `ComissaoMensalCliente` é só
BTG/Investimentos — não existe, no banco, base para *"comissão líquida da Onix
Imob"* nem para *"faturamento bruto da Onx Corretora"*. Leide, Renan e Matheus
terão regra estruturada e nenhum número derivado até `ParcelaReceita` existir.
Melhor ver isso escrito na tela do que descobrir no primeiro fechamento.

**Duas correções de caminho de escrita entram junto** — não são migration, e são
necessárias porque a tela nova as torna perigosas:

1. `atualizarAcordo` deixa de gravar `NULL` em campo ausente
   (`src/app/actions/acordo-comercial.ts:120-121`). Hoje só não apaga a prosa
   porque o formulário sempre reenvia os dois textareas.
2. `excluirAcordo` (`:194`) deixa de ser DELETE físico quando existir
   `AcordoAssessor` da mesma pessoa. Hoje ele apaga o acordo **e** desliga o
   contrato do jurídico em silêncio (`ContratoArquivo.acordoComercialId` é
   `onDelete: SetNull`, `schema.prisma:2889-2890`), sem log. O botão ainda diz
   *"Excluir definitivamente"* (`acordo-comercial-section.tsx:195`) e o rótulo
   muda junto.

---

## 5. Pontos de contato com o ADM/Financeiro (`docs/onix-financeiro-modelo.md`)

O documento é **silencioso** sobre o acordo do assessor — zero ocorrências de
`acordo|assessor|rateio|split` em 707 linhas. Não há contradição possível; há
cinco pontos de contato obrigatórios.

| # | o que o ADM já decidiu | o que esta proposta faz |
|---|---|---|
| 1 | **`ParcelaReceita.pessoaId`** — *"QUEM DO TIME ganhou. O eixo da apuração de campanha"* (`:232-234`); `Contrato.pessoaId` (`:142-146`) | **herda.** Não criar segunda ligação parcela→assessor. Quando `ParcelaReceita` existir, o rateio lê `pessoaId` de lá, e `AssessorCliente` continua servindo só o histórico de titularidade da carteira BTG |
| 2 | **Campanha paga prêmio em reais por degrau** (`reguaPremiacao`, `:308-322`; `premioDevido Decimal(14,2)`, `:349`) | **não substitui.** Campanha ≠ comissão: são dois caminhos sobre o mesmo dinheiro. Precisam se enxergar na tela, ou o mesmo real sai duas vezes |
| 3 | **O ADM já escolheu `valorLiquido`** de fato (`:587`, `:639`) sem que o Financeiro tenha decidido | **torna explícito.** A coluna `base` obriga a escolha a ser dita em vez de herdada por omissão — é o 🔴 de `docs/onix-co-estado.md:958-965` |
| 4 | **`ComissaoMensalCliente` migra e é congelada** (§1.7, `:420-478`); o `DROP` é PR posterior | **respeita a janela.** Durante ela, as duas tabelas têm o mesmo dinheiro. Por isso a fonte da base é uma **constante única** (passo 1), e não um `if` |
| 5 | **`ContratoCorretora` → `Contrato` só se vazia** (`:160-176`, não medido) | **imune.** `AcordoAssessor` não tem FK para contrato nenhum. O rename incerto não a atinge |

**`AcordoAssessor` sobrevive à migration #2 do ADM sem mudança:** já é por nó
(`empresaId`), e `ParcelaReceita.empresaId` é NOT NULL.

---

## 6. Ordem de execução — e a resposta sobre uma PR ou duas

**Duas PRs vermelhas, não uma. E esta migration NÃO entra na #2 do ADM.**
A migration roda dentro do `startCommand` e o próprio documento do ADM avisa
(`:480-486`): migration que falha **derruba o serviço em loop de restart**. A #2
do ADM carrega backfill de dado com `RAISE EXCEPTION`; esta aqui é **puramente
aditiva sobre tabela que nasce vazia** — só `CREATE TABLE`, `CHECK` e índice
parcial em tabela nova, zero `UPDATE`/`INSERT`/`DELETE`, zero `DROP`, zero
rename. Juntar as duas trocaria uma PR sem risco de dado por meia PR com risco.

Os dois modos de falha que já doeram nesta casa estão **estruturalmente
ausentes**: não há `ADD COLUMN NOT NULL` sem default em tabela com linhas (a
guarda é `scripts/guarda-not-null-sem-default.sh`, gate em
`.github/workflows/ci.yml:115`), e não há `CREATE UNIQUE INDEX` sobre dado vivo
— é exatamente por isso que o 🔴 item 8 do WIP fica **fora** desta PR.

| # | frente | faixa | depende de |
|---|---|---|---|
| 1 | `SELECT` de diagnóstico: quantos `AcordoComercial`, quantos vigentes por pessoa, quantas linhas `ComissaoMensalCliente` e `ParceiroCliente` | 🟢 | nada |
| 2 | **Migration** — `AcordoAssessor` + `AssessorCliente`, CHECKs e índices parciais | 🔴 | **seu ok no SQL** + respostas 1 e 2 |
| 3 | Módulo puro do rateio + `ancestraisDe` + resolvedor de `incluiDescendentes` (serve os DOIS lados) e testes | 🟢 | #2 |
| 4 | **`ApuracaoComissao`** — linha imutável com snapshot e trigger. Só a partir daqui existe "fechamento" | 🔴 | #3 rodado como conferência |
| 5 | Tela do acordo estruturado em `/time/[id]`, ao lado da prosa + backfill humano das 6 pessoas | 🟡 | #2 |
| 6 | Escritor de `AssessorCliente` no `btg-enrich` (fecha-e-abre em transação) | 🟡 | **resposta 5** |
| 7 | Tela de conferência do rateio, `requireAdmin` | 🟡 | #3, #5 |

**A #6 depende da resposta 5 e não pode furar a fila.** A partir do primeiro
clique pós-deploy, o enrich passaria a gravar `dataInicio = data do clique` — e
a decisão sobre a data do backfill passaria a ser tomada pela ordem do deploy,
não pelo Eduardo.

**Dois efeitos colaterais de `Restrict` em `AssessorCliente.clienteId`, e eles
são conhecidos:** `src/lib/backoffice/merge-leading-zeros.ts` só enxerga filhos
`ON DELETE CASCADE` — a consulta filtra `confdeltype = 'c'` (`:66`) —, então o
guarda do passo 5 passa limpo e o `delete` do passo 6 (`:157`) estoura violação
de FK crua. O mesmo vale para o reset com `force: true` em
`src/app/api/backoffice/clientes/route.ts:1178`. É o **modo de falha seguro** — a
transação reverte, nada é destruído — e é o mesmo que `ComissaoMensalCliente` já
escolheu e documentou (`schema.prisma:1836-1851`). A diferença é que lá *"a
tabela nasce VAZIA, então nada quebra hoje"*; aqui ela **não** nasce vazia por
muito tempo: o enrich a preenche para todo cliente com assessor. Ensinar os dois
scripts a enxergar `Restrict` entra na frente #6, não depois.

---

## 7. O que NÃO consegui verificar

Sessão de agente não alcança o banco de produção. Tudo abaixo é `⚠️` de
verdade — nenhum número foi estimado.

| afirmação | estado |
|---|---|
| quantas linhas `AcordoComercial` existem, e se **alguma pessoa tem duas vigentes** | ⚠️ **não medido.** É o que decide se o 🔴 item 8 do WIP pode sequer ser criado. As 6 do seed são o piso conhecido, não a contagem |
| `ComissaoMensalCliente.comissao` é **bruto ou líquido** | ⚠️ **indeterminável no código.** O parser aceita `commission \| Commission \| totalCommission \| value \| amount` e grava o que vier (`btg-enrich/route.ts:380-381`) |
| quantas linhas `ComissaoMensalCliente`, em quantas competências | ⚠️ **não medido.** A série é esparsa por construção: nada roda em lote, só cresce por clique na ficha (`src/components/backoffice/cliente-btg-section.tsx:99`) |
| quantas linhas `ParceiroCliente` existem, e quantas vigentes | ⚠️ **não medido.** É o que decide se o passo 4 vai encontrar vínculo ou só o balde de indeterminado |
| quantos clientes estão **sem `assessorCge`** hoje | ⚠️ **não medido.** É o tamanho da lista `semTitular[]` que o rateio vai devolver |
| `ContratoCorretora` está vazia | ⚠️ **não medido** (§8 do doc do ADM). Não afeta esta proposta — não há FK para lá |
| `getCommissionReport()` realmente não devolve competência | ⚠️ **não chamei a API.** Tenho a afirmação escrita no próprio código (`btg-enrich/route.ts:44-49`) |
| o histórico de `assessorCge` é irrecuperável | ⚠️ **parcial.** Verifiquei que `BtgSyncLog` não guarda payload (`schema.prisma:1212-1227`); **não** varri backups nem `pg_dump` |
| a migration aplica limpo; `lint`/`build` passam | ⚠️ **não testado.** Shadow-DB é gate da PR da frente #2, não deste documento |
| `ComissaoMensalCliente` já tem mais de uma linha por conta no mesmo mês | ⚠️ **não medido**, e é risco silencioso: `receitasMap.set` **sobrescreve em vez de somar** (`btg-enrich/route.ts:88`). Se o relatório trouxer duas linhas para a mesma conta, a base já está menor que a real, sem sintoma |

---

## 8. As perguntas que só você responde

Todas são regra de negócio. Nenhuma tem resposta no código — procurei.

**1. O número que o BTG grava é BRUTO ou LÍQUIDO?** Sem isso o rateio não roda,
de propósito (passo 6). Todos os seus acordos escritos falam em *"comissão
líquida"* ou *"receita líquida"*; se o gravado for bruto, todo repasse sai
maior e ninguém percebe.

**2. Assessor, parceiros e a casa somam 100% no mesmo negócio, ou são
independentes?** O schema afirma as duas coisas com oito linhas de distância
(`:1572-1576` contra `:1660`). Isso decide se existe validação de soma — e
implementar a errada **reprova um rateio correto**. Se a resposta for "somam",
a diferença até 100% é a **casa**, e ela precisa aparecer como linha, não como
sobra.

**3. O cliente troca de assessor no dia 12. Quem leva a competência inteira?**
O novo, o antigo, ou metade para cada? A base é mensal e não tem granularidade
diária — não existe pró-rata possível a partir do dado que temos. A mesma
pergunta vale para o acordo que muda de percentual no meio do mês.

**4. Existe PISO ou TETO?** Piso: o fixo mensal é **garantia mínima** (se o
percentual render R$ 3.000 e o fixo for R$ 4.000, paga-se 4.000) ou é **soma**
(paga-se 7.000)? Hoje eu modelei como soma, porque a prosa da Rose diz *"R$
4.000,00 / **Mais** 20%"* (`seed:71-72`). Teto: existe limite por pessoa ou por
competência?

**5. No backfill de `AssessorCliente`, qual `dataInicio`?** Data de abertura da
conta, primeira competência com comissão, ou a data do backfill? Não há
histórico recuperável — qualquer das três é presunção, e é ela que decide se um
assessor recebe por competências anteriores à entrada dele.

**6. Estorno.** Comissão negativa é permitida por decisão explícita
(`migration 20260824030000:60-61`). Ela vira repasse **negativo** para a pessoa
naquele mês, compensa no mês seguinte, ou zera?

**7. O fixo é comissão ou é folha?** R$ 5.000 → R$ 4.000 do Thiago, R$ 4.000 da
Rose, R$ 1.518 da Leide. Se for folha/pró-labore e não pertencer ao rateio, a
coluna `valorFixoMensal` sai e 4 dos 6 acordos ficam pela metade nesta tabela.

**8. Renan — a mesma pessoa com acordo de time e de parceiro vigentes.** O
sistema **avisa** ou **bloqueia**? E qual dos dois manda no cálculo? Hoje a
única defesa é gravar 0% no nó onde ele já é remunerado, e isso é **convenção,
não trava** (`docs/onix-co-estado.md:915-936`).

**9. Aceita a entrega sem número para Imobiliária e Corretora?** Os acordos
ficam cadastrados e sem cálculo até `ParcelaReceita` existir, porque
`ComissaoMensalCliente` só tem BTG/Investimentos. Ou você espera ver valor para
a Leide e para a Onx Corretora já agora — o que significa esperar a migration
#2 do ADM?

**10. A Leide tem 20% por captação de imóvel e 30% por captação de cliente,
cumulativos** (`seed:93-95`). Esse eixo — o papel dela em cada negócio — **não
existe em dado nenhum do banco**. Ele vira coluna nova, vira lançamento manual
por negócio, ou fica na prosa e o cálculo dela segue humano?
