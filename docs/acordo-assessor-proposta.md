# Acordo do assessor — proposta de modelo de dados

> **Nada aqui foi implementado.** Este documento é a proposta que a governança
> exige antes do código: a migration é faixa **vermelha**, roda dentro do
> `startCommand` (`package.json:8` — `"start": "prisma migrate deploy && next start"`),
> e o Eduardo lê o SQL antes. O que existe é este texto e os fatos de código
> que o sustentam — todos com `arquivo:linha`, todos relidos nesta sessão.
>
> **Regra de leitura deste documento:** afirmação sem medição é defeito. Onde
> um número não foi medido, está escrito *não medido* — nunca estimado. Onde o
> desenho decide algo que é regra de **negócio**, a decisão virou **pergunta**
> no §8, não decreto. E onde o desenho **permite um estado inválido** e não
> tem trava para ele, isso está dito por escrito, no lugar onde a trava
> faltaria — nunca em silêncio.

---

## 0. O que o recon achou, e o que ele muda na proposta

| pergunta | resposta, e onde está no código |
|---|---|
| o acordo do assessor tem campo de percentual? | **não.** `AcordoComercial` (`prisma/schema.prisma:2575-2607`) tem **13 colunas** — contadas uma a uma nesta sessão — e a única numérica é `contratoBytes`, tamanho de PDF |
| onde estão os percentuais reais, então? | **em prosa**, em `regrasEspeciais` e `observacoes` (`@db.Text`). As 6 regras conhecidas estão em `scripts/seed-acordos-comerciais.ts:31-138` |
| existe histórico de conteúdo do acordo? | **não.** `criarAcordo` fecha-e-abre (`src/app/actions/acordo-comercial.ts:70-91`), mas `atualizarAcordo` faz `prisma.acordoComercial.update` no lugar (`:147-150`) e não toca `dataInicio`/`dataFim` |
| existe trava de "um acordo vigente por pessoa"? | **não.** Só dois índices NÃO-únicos (`schema.prisma:2605-2606`). O irmão do parceiro TEM índice parcial único (`prisma/migrations/20260822020000_acordo_parceiro_por_empresa/migration.sql:85-87`) |
| existe cálculo de comissão de pessoa no repo? | **nenhum, em nenhuma forma.** A única leitura de `ComissaoMensalCliente` agrupa por competência (`src/app/empresas/investimentos/receita/page.tsx:65-72`) |
| existe histórico de "quem era o assessor daquele cliente"? | **não.** `ClienteBackoffice.assessorCge` (`schema.prisma:764`) é snapshot sobrescrito (`src/app/api/backoffice/btg-enrich/route.ts:147-149`, gravado em `:166`) |
| o documento do ADM/Financeiro decide algo sobre isso? | **não.** `grep -niE "acordo\|assessor\|rateio\|split"` nas 707 linhas de `docs/onix-financeiro-modelo.md` devolve **zero** — medido nesta sessão. Não há contradição possível; há silêncio |

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

Quatro REDAÇÕES de base diferentes (`comissão líquida da ONX`, `faturamento
bruto da Onx Corretora`, `receita líquida da ONX`, `comissão líquida da Onix
Imob`) sobre **duas** pessoas jurídicas: Onx Agro Corretora, CNPJ
31.238.019/0001-02 (Thiago `:49`, Alexandra `:63`, Rose `:82`), e Onix Imob
LTDA, CNPJ 57.646.566/0001-02 (Leide `:103`, Renan `:120`). Quatro jeitos de
escrever, duas caixas de onde o dinheiro sai — e nenhuma das quatro é um número
que uma query alcance.

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
model no lado do parceiro (`prisma/schema.prisma:1564-1566`):

> *"`atualizarAcordo` (acordo-comercial.ts:147) faz UPDATE no lugar — o que
> viola frontalmente a regra abaixo de que alterar percentual FECHA e ABRE.
> Reusar o model herdaria esse caminho de escrita."*

**3. O extrato existe; o rateio não.** `ComissaoMensalCliente`
(`schema.prisma:1825-1912`) guarda a receita mensal por cliente em
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

O desenho é o **espelho** de `AcordoComercialParceiro` (`schema.prisma:1597-1695`),
cuja migration vermelha (#318, `20260812205040`) está mergeada e roda no
`startCommand`. Copiar é a decisão principal: o dialeto datado, os `CHECK`s
escritos à mão, o índice parcial único do vigente, `criadoPor`/`encerradoPor` e
o fechar-e-abre em transação (`src/app/actions/parceiros.ts:240-260`) já foram
pagos uma vez. Ter dois dialetos de vigência para o mesmo cálculo, sobre a mesma
comissão líquida, seria como ter dois formatos de data no mesmo relatório.

**O que NÃO se copia do parceiro é o buraco dele.** Este documento mede, no
§2.4 e no §3.1, uma falha de sobreposição que o caminho de escrita do parceiro
**aceita hoje** e que o índice parcial não pega. Copiar a tabela e não copiar a
falha é a parte cara desta proposta.

Diverge em **seis** pontos, e cada um tem um dado real por trás.

### 2.1 `AcordoAssessor` — a regra de cálculo

```prisma
model AcordoAssessor {
  id String @id @default(cuid())

  /// QUEM recebe. `Restrict`, não `Cascade`.
  /// `AcordoComercial.pessoaId` é Cascade (schema.prisma:2579) e o acordo do
  /// parceiro copiou (schema.prisma:1601). O precedente financeiro MAIS
  /// RECENTE da casa é o oposto, e está justificado por escrito em
  /// `ComissaoMensalCliente.clienteId` (schema.prisma:1832-1853): "apagar um
  /// cliente não pode apagar o registro de quanto ele gerou". Um acordo com
  /// percentual é a RAZÃO de um pagamento passado — desligar uma pessoa não
  /// pode apagar a razão do que já saiu do caixa.
  pessoaId String
  pessoa   Pessoa @relation("AcordoAssessorPessoa", fields: [pessoaId], references: [id], onDelete: Restrict)

  /// SOBRE QUAL PARTE DA CASA. FK real, NOT NULL, `Restrict`.
  /// No parceiro esta coluna é nullable só por convivência com o
  /// `tipoProduto` legado (schema.prisma:1608-1633). Aqui não há linha legada:
  /// a tabela nasce vazia, então nasce obrigatória.
  ///
  /// ⚠️ LIMITAÇÃO CONHECIDA, e ela está aberta no §8, pergunta 12:
  /// `empresaId` aponta para um NÓ DA ÁRVORE, não para uma PJ. São 48 nós
  /// (1 holding, 6 empresas, 41 departamentos — `src/lib/empresas/catalogo.test.ts:43-57`),
  /// e a mesma PJ aparece como mais de um nó: `corretora` (empresa,
  /// `catalogo.ts:296`) e `corretora-corretora` (departamento, `:311-320`,
  /// com a nota "Rótulo IGUAL ao da empresa que o contém, id diferente —
  /// intencional"); idem `investimentos`/`investimentos-investimentos`
  /// (`catalogo.ts:45` e `:251`). Nada em `AcordoAssessor` diz se o nó é
  /// empresa ou departamento, e índice parcial não faz join.
  ///
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

**3 das 6 pessoas têm parte fixa em reais** — contagem medida nesta sessão
varrendo TODA ocorrência de `R$` em `scripts/seed-acordos-comerciais.ts`, que
devolve exatamente seis linhas (`:37`, `:38`, `:71`, `:90`, `:120`, `:137`):

- **Thiago** — R$ 5.000 até jun/2026 e R$ 4.000 a partir de jul/2026 (`:37-38`);
- **Rose** — R$ 4.000 (`:71`);
- **Leide** — R$ 1.518 (`:90`).

São **3 pessoas** e **4 linhas** de fixo, porque o degrau do Thiago é duas
linhas datadas — a mesma contagem que o §4 faz (`Thiago → 4 linhas`). As outras
três **não** têm fixo em reais: Alexandra é só percentual (1%, `:56`); Renan
(`:105-121`) e Matheus (`:122-138`) têm cláusula de pró-labore **sem valor no
contrato** (`:112-114` e `:129-131`) — o único `R$` nos registros deles é
capital social (`:120`, `:137`), não remuneração.

Um campo `valorFixoMensal` pendurado numa linha de percentual **não fecha**: a
chave do vigente inclui `origemNegocio`, e o mesmo R$ 4.000 ficaria
representável em duas ou três linhas do mesmo nó (uma por origem), sem nada no
banco impedindo. Pagar em triplicata seria estado válido.

**A solução é a forma da linha, não uma tabela a mais.** `tipoRemuneracao`
separa dois formatos dentro da mesma tabela, e os `CHECK`s tornam a mistura
impossível:

| forma | preenche | não pode se sobrepor a | pipeline que a paga |
|---|---|---|---|
| `percentual` | `percentual`, `base`, `origemNegocio` | outra linha `percentual` do mesmo (pessoa, nó, origem) **em nenhuma data** — §2.4 | dirigido pelas **linhas de receita** da competência |
| `fixo_mensal` | `valorFixoMensal` | outra linha `fixo_mensal` do mesmo (pessoa, nó) **em nenhuma data** — §2.4 | dirigido pelos **acordos fixos vigentes** — independe de haver receita |

> ⚠️ **O que essa coluna NÃO diz.** "Não pode se sobrepor" vale **dentro do
> mesmo nó**. A mesma pessoa com fixo vigente em **dois nós** passa — está
> medido no §2.4 — e o custo disso é o valor cheio (R$ 4.000 viram R$ 8.000),
> não um arredondamento. É a pergunta 12 do §8, e enquanto ela não for
> respondida a defesa é o aviso do Passo 8, não uma trava.

É o que faz *"R$ 4.000 do Thiago em jul/2026 é devido mesmo num mês sem
comissão nenhuma"* ser verdade **e** executável: o fixo não passa pelo caminho
que começa na lista de clientes.

**Alternativa descartada — tabela separada só para o fixo.** Ela custaria uma
terceira tabela com vigência datada, fechar-e-abre, `criadoPor`/`encerradoPor`
e índice parcial próprio: o mesmo maquinário, duplicado, para guardar um número.
O degrau R$ 5.000 → R$ 4.000 do Thiago é exatamente **duas linhas datadas** —
a mesma vigência que já resolve o percentual resolve o fixo de graça.

> ⚠️ Essa frase depende de o backfill poder gravar data passada: hoje
> (01/09/2026) as duas datas do degrau já são passado. Ver §3.1 — a guarda de
> retroatividade é **escopada** justamente para isso, e o backfill é exceção
> **nomeada** no §4. Com a guarda absoluta que este documento carregava até
> aqui, só uma das duas linhas seria criável e esta seção seria falsa.

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
  /// EDITÁVEL — se um CGE for remanejado para outra pessoa, o histórico
  /// precisa dizer o que foi lido, não o que vale hoje.
  cgeNaEpoca String?

  /// "btg_enrich" | "manual" | "backfill_presumido"
  /// Separa o que a API afirmou do que alguém corrigiu à mão. É o mesmo
  /// problema de dois escritores que a FIELD_SOURCE_POLICY já registra para
  /// `assessorCge` (src/lib/backoffice/field-source-policy.ts:97 declara
  /// `base_btg` dono único, e o enrich grava por fora, com `update` cru —
  /// `btg-enrich/route.ts:148` e `:166`).
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
dono **atual**, sobrescrito a cada enrich (`btg-enrich/route.ts:147-149`,
gravado em `:166`), sem nenhuma coluna de vigência. Pagar a competência de
março exige saber quem era o assessor **em março**, e o banco só sabe quem é
hoje: trocar um cliente de assessor **reescreve retroativamente todo o passado
de comissão dele**. E não há de onde reconstruir — `BtgSyncLog` guarda
`resumo`, `erros` e contadores, e **não guarda payload**
(`schema.prisma:1212-1227`).

É o mesmo argumento, palavra por palavra, que já está escrito para o parceiro
em `schema.prisma:1502-1504`: *"Um campo no cliente responderia 'de quem é
hoje' e perderia 'de quem era quando a receita entrou' — que é a pergunta que
decide comissão."*

> ⚠️ **Uma diferença que importa, e que a irmã não tem.** `ParceiroCliente`
> hoje está limpa por acidente, não por trava: `vincularClienteForm` não aceita
> `dataInicio` nenhuma (`src/app/actions/parceiros.ts:335-336`, só
> `parceiroId`/`clienteId`/`vinculadoPor`), então toda linha nasce em `now()` e
> a cadeia sai ordenada por construção. `AssessorCliente` **vai** expor
> `dataInicio` gravável (o backfill precisa disso) e vai ter
> `origem = 'backfill_presumido'`. Herdar só o índice parcial da irmã e
> acrescentar a data seria jogar fora a única coisa que mantém a irmã limpa —
> por isso o §2.4 acrescenta a restrição de exclusão.

*No seu vocabulário:* é a diferença entre a posição de hoje e o extrato do mês.
Pagar março pela custódia de setembro é o extrato de ontem numa mesa que já
operou hoje.

### 2.4 O que só existe na migration

`CHECK` e índice parcial **não são representáveis em `schema.prisma`** — é o
padrão da casa (`prisma/migrations/20260812205040_acordo_comercial_parceiro/migration.sql:143-151`),
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

-- ── UM ABERTO por (pessoa, nó, origem) nas linhas de percentual ──────────
-- Cobre só `dataFim IS NULL`. NÃO cobre competência passada — ver a EXCLUDE.
CREATE UNIQUE INDEX "AcordoAssessor_vigente_percentual_key"
  ON "AcordoAssessor" ("pessoaId", "empresaId", "origemNegocio")
  WHERE "dataFim" IS NULL AND "tipoRemuneracao" = 'percentual';

-- ── UM fixo ABERTO por (pessoa, nó) ──────────────────────────────────────
-- Não impede duas linhas FECHADAS cobrindo a mesma competência: quem impede
-- isso é a EXCLUDE abaixo. E NENHUM dos dois impede a mesma pessoa com fixo
-- vigente em DOIS NÓS (§8, pergunta 12).
CREATE UNIQUE INDEX "AcordoAssessor_vigente_fixo_key"
  ON "AcordoAssessor" ("pessoaId", "empresaId")
  WHERE "dataFim" IS NULL AND "tipoRemuneracao" = 'fixo_mensal';

-- ── AssessorCliente: um titular ABERTO por cliente ───────────────────────
-- A unicidade em si é DECISÃO DE NEGÓCIO, não técnica — §8, pergunta 11.
CREATE UNIQUE INDEX "AssessorCliente_vigente_key"
  ON "AssessorCliente" ("clienteId")
  WHERE "dataFim" IS NULL;

ALTER TABLE "AssessorCliente" ADD CONSTRAINT "AssessorCliente_vigencia_coerente"
  CHECK ("dataFim" IS NULL OR "dataFim" >= "dataInicio");

ALTER TABLE "AssessorCliente" ADD CONSTRAINT "AssessorCliente_origem_conhecida"
  CHECK ("origem" IN ('btg_enrich', 'manual', 'backfill_presumido'));

-- ── A TRAVA QUE O ÍNDICE PARCIAL NÃO DÁ ──────────────────────────────────
-- Índice parcial guarda o instante "agora" (`dataFim IS NULL`); o rateio
-- pergunta por um mês PASSADO. São conjuntos diferentes, e nada os conectava.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "AssessorCliente" ADD CONSTRAINT "AssessorCliente_sem_sobreposicao"
  EXCLUDE USING gist ("clienteId" WITH =,
                      tsrange("dataInicio", "dataFim", '[)') WITH &&);

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_sem_sobreposicao_percentual"
  EXCLUDE USING gist ("pessoaId" WITH =, "empresaId" WITH =, "origemNegocio" WITH =,
                      tsrange("dataInicio", "dataFim", '[)') WITH &&)
  WHERE ("tipoRemuneracao" = 'percentual');

ALTER TABLE "AcordoAssessor" ADD CONSTRAINT "AcordoAssessor_sem_sobreposicao_fixo"
  EXCLUDE USING gist ("pessoaId" WITH =, "empresaId" WITH =,
                      tsrange("dataInicio", "dataFim", '[)') WITH &&)
  WHERE ("tipoRemuneracao" = 'fixo_mensal');
```

**Por que a `EXCLUDE`, e o que ela custa — tudo medido.** Rodei o DDL acima em
PostgreSQL **16.13** local (a produção é PG 16 — `.github/workflows/db-backup.yml:132`
e `.github/workflows/estado-do-banco.yml:844` usam `postgres:16-alpine`). Sete
resultados:

| o que testei | resultado medido |
|---|---|
| duas linhas **fechadas** sobrepostas no mesmo cliente, **só** com o índice parcial | `INSERT 0 2` — passam. A leitura por intervalo do Passo 0 para 2026-03 devolveu **2 titulares** para o mesmo cliente |
| as mesmas duas linhas, **com** a `EXCLUDE` | `ERROR 23P01: conflicting key value violates exclusion constraint` |
| fecha-e-abre **adjacente** (`dataFim` do anterior = `dataInicio` do novo) | **passa** — é o `'[)'` que preserva o dialeto da casa (`parceiros.ts:245` e `:256`) |
| duas linhas **abertas** no mesmo cliente, com a `EXCLUDE` e **sem** o índice parcial | recusadas — a `EXCLUDE` **subsume** o índice parcial |
| `direto` + `indicado_parceiro` vigentes no mesmo nó; fixo + percentual no mesmo nó; degrau do fixo em duas linhas datadas | os quatro **passam**. Tudo que §2.2 exige sobrevive |
| a mesma pessoa com fixo no **mesmo** nó, períodos sobrepostos | recusado |
| a mesma pessoa com fixo em **dois nós**, mesmo período | **passa** — é o vão da pergunta 12, e ele fica aberto de propósito |

Dois detalhes que decidem implementação, também medidos:

- **`origemNegocio` NULL derrota a `EXCLUDE`** exatamente como derrota o índice
  único: duas linhas de percentual com `origemNegocio = NULL` no mesmo nó
  passaram as duas. O `CHECK AcordoAssessor_forma_percentual`, que obriga
  `origemNegocio IS NOT NULL`, é portanto **load-bearing para as duas travas**,
  não decoração.
- **A violação sai como SQLSTATE `23P01`, não `23505`.** O Prisma não a
  converte em `P2002`, e um catch de mensagem amigável como o de
  `parceiros.ts:339` **não dispara**. Por isso os índices parciais **ficam**:
  eles seguram o caso comum ("já existe um vigente") com erro traduzível, e a
  `EXCLUDE` segura o caso raro e caro (passado sobreposto) com erro cru.

**`btree_gist` é `trusted = true` no PG 16** — conferido em
`/usr/share/postgresql/16/extension/btree_gist.control` nesta sessão —, então o
dono do banco cria a extensão sem superusuário. ⚠️ **Isso não é prova de que o
papel do Railway consegue.** Ver §7: `CREATE EXTENSION` que falha dentro do
`startCommand` é o loop de restart que o próprio §6 descreve, e o ensaio em
`.github/workflows/ensaio-migration.yml:69` roda contra um `postgres:16-alpine`
cujo `POSTGRES_USER` é superusuário — **ele passaria e a produção não**. Se a
extensão não for possível, a alternativa é **trigger `BEFORE INSERT/UPDATE`**
(o mesmo instrumento já previsto para a frente #4), nunca `CHECK`: `CHECK` não
enxerga outra linha.

**A janela para pagar isso de graça é esta PR.** `ALTER TABLE … ADD CONSTRAINT
… EXCLUDE` sobre tabela que já tem sobreposição gravada **aborta** — é o mesmo
motivo pelo qual o 🔴 item 8 do WIP fica de fora (`docs/onix-wip-inventario.md:162`).
As duas tabelas nascem vazias; depois, não.

**Dois índices parciais aqui NÃO são a dívida do parceiro.** Lá, os dois
(`…_vigente_key` e `…_vigente_empresa_key`, migrations `20260812205040:138-140`
e `20260822020000:85-87`) convivem como estado intermediário de uma troca de
chave em duas PRs. Aqui eles são **disjuntos por predicado** (`tipoRemuneracao`),
permanentes e de propósito: um cobre a linha de percentual, o outro a de fixo,
e nenhuma linha entra nos dois.

### 2.5 O que NÃO muda

| tabela | o que acontece | por quê |
|---|---|---|
| `AcordoComercial` | **ZERO SQL.** Muda de PAPEL, não de forma | vira o **dossiê** — `tipo`, prosa e o PDF. Pôr `percentual` dentro dela herdaria as duas rotas de escrita erradas que já existem: `update` no lugar (`acordo-comercial.ts:147`) e DELETE físico (`:194`). ⚠️ o "dossiê" ainda não é um só — ver a nota abaixo |
| `ComissaoMensalCliente` | **ganha só um leitor** | não acrescentar `pessoaId` nem `empresaId`: o §1.7 do ADM já decidiu que ela MIGRA para `ParcelaReceita`, e toda coluna nova é mais uma a migrar. Titularidade é datada e mora em `AssessorCliente` — gravá-la na linha de receita repetiria o erro do `assessorCge` |
| `Empresa`, `Pessoa`, `ClienteBackoffice` | só **lados inversos de relação** | nenhum SQL. ⚠️ mas `src/lib/ci/tabelas-tocadas.ts:38-48` conta `REFERENCES "X"` como *tocar X*: as três vão aparecer no destaque da PR. Isso é ruído esperado, não erro |
| índice parcial único de `AcordoComercial` | **fica de fora** | é o 🔴 item 8 de `docs/onix-wip-inventario.md:162`: a tabela **tem dados** e o `CREATE UNIQUE INDEX` aborta se já houver duas linhas abertas para a mesma pessoa. Entra só o `SELECT` de diagnóstico, para o número existir antes da decisão |

> ⚠️ **O "dossiê" é TRABALHO A FAZER, não estado atual — e isto foi medido.**
> O elo 1:1 entre `AcordoComercial` e o jurídico **existe no schema**
> (`schema.prisma:2603` ↔ `:2889-2890`; `CREATE UNIQUE INDEX
> "ContratoArquivo_acordoComercialId_key"` em
> `prisma/migrations/20260519140000_juridico_fase_1a_contratos/migration.sql:32`,
> FK `SET NULL` em `:47-49`). Mas em **código** ele tem **um** gravador — o
> script manual `scripts/migrate-acordos-pdfs-to-b2.ts:91` e `:136` — e
> **nenhuma tela**. O parâmetro `acordoComercialId` lido em
> `src/app/api/juridico/contratos/upload/route.ts:71` e `:80` é **código
> morto**: o único cliente do endpoint monta o FormData só com `file`,
> `pessoaId` e `observacoes` (`src/app/juridico/contratos/novo/_components/upload-form.tsx:41-44`),
> e os outros dois chamadores de `registrarUploadContrato` (`src/lib/juridico.ts:141`)
> também não passam o campo. Há dois leitores que renderizam o vínculo
> (`src/app/api/juridico/contratos/[id]/route.ts:33` e `:61`;
> `src/app/juridico/contratos/[id]/page.tsx:34` e `:99-102`).
>
> **E o PDF do acordo hoje nem passa por lá.** `criarAcordo` grava o PDF em
> base64 dentro do próprio `AcordoComercial` (`acordo-comercial.ts:63`) e a
> ficha do `/time` exibe `acordo.contratoFilename`
> (`acordo-comercial-section.tsx:165-168`) — nenhum dos dois lê
> `contratoArquivo`. As duas metades do dossiê **não se falam**. Se o dossiê é
> para ser um só, a proposta precisa dizer qual dos dois caminhos de PDF
> sobrevive — e isso é PR à parte, fora desta.

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
> ao dia é impossível sem outra fonte. **É a pergunta 3 do §8** — não é detalhe
> de implementação.

**Passo 1 — a base, de uma fonte só.**
`WHERE "competencia" = $mes AND "fonte" = 'btg_rm_reports'`, somado em SQL
(`NUMERIC` exato). Uma **constante única** decide de onde se lê: enquanto
`ParcelaReceita` não existir, é `ComissaoMensalCliente`; quando existir, passa a
ser `ParcelaReceita` com `origem='apuracao' AND status='recebida'`
(`docs/onix-financeiro-modelo.md:592-593`). **Ler as duas é o erro de 2x** que a
janela de convivência do §1.7 abre — por isso é uma constante, não um `if`
espalhado.

> ⚠️ **A troca de fonte troca de REGIME, e isso precisa ser dito.** Hoje a
> constante lê *"tudo que o relatório trouxe naquela competência"*. Amanhã ela
> vai ler *"só o que está `status = 'recebida'`"* — o *stop loss* do ADM
> (`docs/onix-financeiro-modelo.md:600`, *"Projeção não paga prêmio"*). Não é
> a mesma pergunta. `ComissaoMensalCliente` **não tem coluna de status**
> (`schema.prisma:1825-1912`: `competencia`, `comissao`, `fonte`,
> `importadoEm`, `origemSyncId` — nenhuma de recebimento), então hoje se opera
> "competência **como se** recebida", que é o que o backfill do ADM carimba por
> decreto (`:437` grava `'recebida'` em toda linha migrada). **Se essa troca é
> correção ou mudança da regra de pagamento é a pergunta 13 do §8** — e ela
> tem de ser respondida ANTES de a fonte trocar, não depois.

**Passo 1b — a competência corrente não é rateável.** A competência gravada é o
**mês em que o enrich rodou**, não a do relatório, e o próprio código diz isso
(`btg-enrich/route.ts:44-49`): *"Rodar o enrich no dia 1º pode gravar sob o mês
corrente um relatório que ainda é do mês anterior."* O rateio, então, recusa a
competência aberta, e mostra ao lado a data de coleta de cada linha
(`ComissaoMensalCliente.origemSyncId` → `BtgSyncLog.iniciado`,
`schema.prisma:1896`). Um mês carimbado no dia 1º fica **visível**, em vez de
virar rateio silenciosamente do mês errado.

> ⚠️ **O `BtgSyncLog` que este passo lê tem ruído, e ele está medido.** Existe
> um cron **semanal** que grava `BtgSyncLog.tipo = 'enrich'` e **não** é este
> enrich: `syncBtgCadastral` (`src/lib/integrations/btg-api-sync.ts:245`),
> disparado por `/api/cron/btg-cadastral-poll` no schedule `0 7 * * 0`
> (`.github/workflows/cron.yml:26`). Ele nunca chama `getAccountsByAdvisor`,
> nunca escreve `assessorCge` e nunca escreve comissão. Efeito colateral **já
> no código de produção**: `src/app/empresas/investimentos/receita/page.tsx:90` e `:98`
> contam `WHERE "tipo" = 'enrich'` como *"a rotina que grava comissão"*
> (comentário em `:79-85`) e passam a contar esse cron cadastral. Quem for
> implementar o Passo 1b precisa filtrar mais que `tipo`, ou herda o ruído.

**Passo 2 — quem era o dono naquele mês.** `AssessorCliente` vigente em `$X`.
Cliente sem linha vigente **não vira "o assessor ganhou zero"**: vai para
`semTitular[]`, exibido com a soma que ficou de fora. É a mesma distinção que
`src/lib/financeiro/serie-competencia.ts:35-46` já carimba — `presente` é campo,
não inferência de valor — e é o buraco que `docs/onix-financeiro-modelo.md:615-619`
já registra para a campanha: linha sem pessoa não apura, em silêncio, e a soma
nunca bate.

**Passo 3 — o nó.** Constante `NO_DA_RECEITA_BTG = "investimentos"`. Não há
aresta cliente→nó no lado Investimentos, e isso é **decisão registrada** —
`ClienteBackoffice` não tem `empresaId` e o schema recusa isso por escrito em
`schema.prisma:911-919` e `:3261-3273`. Não é invenção: é a mesma escolha que o
**backfill proposto** do ADM faz — `docs/onix-financeiro-modelo.md:437` grava
`'investimentos'` fixo em toda linha do `INSERT … SELECT`.

> **Precedente de desenho, não de dado.** Aquele documento se declara
> não-implementado (`docs/onix-financeiro-modelo.md:3`), o merge da PR #425
> (commit `5332711`) alterou **um arquivo só, 707 linhas de texto**, e
> `ParcelaReceita` tem **zero** ocorrências em `prisma/schema.prisma` e em
> `prisma/migrations/` — medido nesta sessão. Nada foi migrado porque não há
> para onde migrar.

Quando `ParcelaReceita` existir, a coluna é nativa e NOT NULL, e a constante
morre.

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
valor até o Eduardo responder a pergunta 1.** O parser aceita SEIS nomes de
campo — `commission`, `Commission`, `totalCommission`, `value`, `amount`,
`comissao` — e grava o que vier (`btg-enrich/route.ts:380-381`); pior, o `?? 0`
da mesma linha grava **zero** quando nenhum casa, e zero-por-ausência fica
indistinguível de comissão zero real. O próprio documento do ADM trata o mesmo
número como bruto **e** líquido (`:434-438`). Sem resposta,
a função **recusa e explica**; não estima. É parada dura em vez de repasse
errado — e é a única coisa que faz a coluna `base` valer alguma coisa.

*No seu vocabulário:* é o *stop loss*. Não é desconfiança do cálculo, é limite
escrito antes.

**Passo 7 — a conta.** `valor = comissao × percentual ÷ 100`, tudo em
`Prisma.Decimal`, do primeiro ao último operando — converter para `Number` na
entrada derrotaria a escolha da #318 na porta (é o cuidado que
`parceiros.ts:209-217` já toma). Nenhum operando `Float`: `saldo` e
`receitaAnual` continuam `Float` no schema, e um só deles na multiplicação anula
a precisão. Arredonda a 2 casas **uma vez**, no total por pessoa, nunca por linha.

**Passo 8 — o fixo tem pipeline próprio.** Ele **não** passa pelos passos 1–5.
A consulta é: acordos `tipoRemuneracao = 'fixo_mensal'` vigentes em `$X`. Entra
uma vez por competência, mesmo em mês sem comissão nenhuma. Sem cliente, sem
base, sem origem.

Três coisas precisam estar ditas por escrito, porque nenhuma é óbvia:

1. **A consulta devolve uma linha por (pessoa, nó)** — não uma por pessoa. A
   unicidade de `(pessoa, nó)` entre linhas ABERTAS vem do índice parcial; a
   não-sobreposição no PASSADO vem da `EXCLUDE` de §2.4. Nenhum dos dois
   restringe **nó**.
2. **As linhas SOMAM por pessoa**, e **não há precedência de ancestral no
   fixo** — ao contrário do percentual (Passo 5). Duas linhas de fixo em dois
   nós viram dois pagamentos.
3. **Por isso, o aviso** — no mesmo estilo do Passo 9, *avisa, não bloqueia*:
   quando uma pessoa tiver fixo vigente em **mais de um nó** na mesma
   competência, o rateio **sinaliza a linha antes de somar**. Está medido que o
   banco deixa passar (§2.4), e o custo é o valor cheio: os R$ 4.000 da Rose
   viram R$ 8.000. Dois nós da mesma PJ existem e o seletor oferece os dois
   (`src/app/actions/parceiros.ts:199` — *"Escolha a empresa ou o departamento
   do acordo"* — é o caminho de escrita que esta proposta copia). São dois
   cliques. **A trava certa depende da pergunta 12 do §8**; até lá, o aviso é o
   que se pode afirmar com o que está medido.

**Passo 9 — o que o cálculo NÃO decide sozinho.**

- **Estorno.** Comissão negativa é permitida por decisão explícita
  (`prisma/migrations/20260824030000_comissao_mensal_cliente/migration.sql:60-61`).
  O rateio **propaga o sinal e sinaliza** — não compensa, não zera. Pergunta 6.
- **Soma acima de 100%** entre assessor e parceiros: **avisa, não bloqueia.** O
  schema afirma independência (`:1573-1576`, *"Eduardo 40% e Michel 20% do mesmo
  negócio convivem"*) e soma-100 (`:1660-1662`, *"assessor + parceiros fecham
  100%?"*) a poucas linhas de distância. As duas não podem valer juntas, e
  escolher é do Financeiro. Pergunta 2.
- **Mesma pessoa com acordo de time e de parceiro** (o caso Renan): **avisa ao
  gravar, não impede.** `docs/onix-co-estado.md:915-936` pede explicitamente
  para não decidir por conta própria. Pergunta 8.
- **Dois titulares no mesmo cliente na mesma competência.** O desenho responde
  NÃO por índice — e isso é **decisão de negócio**, não técnica. Pergunta 11.

**Passo 10 — onde isso aparece.** Tela **nova**, `requireAdmin()` na primeira
linha, rotulada **"conferência"** e não "fechamento" enquanto a frente #4 não
existir. **Não** em `/empresas/investimentos/receita`: aquela página soma a
tabela inteira em SQL cru, sem `getAuthContext` e sem `resolverCgesVisiveis`
(`src/app/empresas/investimentos/receita/page.tsx:64-100`) — ao contrário de
`/clientes`, `/performance` e `/cadencia`. Pendurar remuneração de pessoa
naquela rota vazaria o pagamento de todo o time para qualquer logado.

### 3.1 Retroatividade: o buraco que existe HOJE, e a guarda que ele exige

**Primeiro o fato medido, porque ele não é hipotético.** O lado do parceiro
aceita sobreposição por dois cliques na tela — o caminho de código foi lido
linha a linha e o comportamento do banco foi reproduzido localmente. ⚠️ O que
**não** foi medido é quantas linhas sobrepostas já existem lá (§7):

1. `encerrarAcordoForm` fecha o acordo vigente com `dataFim = new Date()`
   (`src/app/actions/parceiros.ts:281-286`);
2. em seguida `criarAcordoForm` consulta a retroatividade lendo **só a linha
   aberta** (`findFirst({ where: { …, dataFim: null } })`, `:229-232`) — que
   agora **não existe**. A guarda de `:233` não dispara, o `updateMany` de
   `:243` não acha nada, e o INSERT com `dataInicio` retroativa entra limpo. O
   input existe na UI: `src/app/time/parceiros/_components/acordos-section.tsx:234-239`
   (`<input name="dataInicio" type="date">`).

Reproduzi isso em PG 16.13 com o DDL real das duas migrations do parceiro
(`20260812205040:138-140` + `20260822020000:85-87`): criar 5% em 01/01 →
encerrar em 15/09 → criar 25% com `dataInicio = 01/03` é **aceito**, e a
leitura por intervalo para 2026-04 devolve **duas linhas vigentes, 5% e 25%**.
Fator de 5 — exatamente o caso do Passo 4.

**Mesmo sem o fecha-e-abre**, a guarda original já era frouxa: com um acordo
vigente desde janeiro, cadastrar em setembro uma linha começando em **março**
fatia a linha antiga com `dataFim = março` e a competência de março muda de 5%
para 25%. Sem `UPDATE`, sem violar `CHECK`, sem violar o índice parcial (que só
olha `dataFim IS NULL`).

`ParceiroCliente` escapa disso **por acidente**, não por desenho:
`vincularClienteForm` não expõe `dataInicio` (`parceiros.ts:335-336`).
`AssessorCliente` **vai** expor.

**A conclusão que a #318 já tinha escrito** (`20260812205040:40-46`): *"Se
aparecer rota que edite percentual no lugar, a resposta certa é trigger, não
revisão de código."* Guarda de escrita **não substitui** a trava de banco. Por
isso a `EXCLUDE` de §2.4 é o que fecha o buraco; a guarda abaixo existe para a
**mensagem** e para a **política**, não para a garantia.

**A guarda, escopada — e por que ela não pode ser um piso absoluto.**

Uma versão anterior deste documento dizia: *"um acordo novo só pode começar a
partir do primeiro dia da competência corrente"*, sem exceção. Isso **se
contradiz com o resto da proposta e quebra o produto**, e o cálculo é direto:
hoje é 01/09/2026; a competência mais recente rateável é 2026-08, com
`$X = 2026-08-31T23:59:59Z`. Toda linha criada sob aquela guarda teria
`dataInicio >= 2026-09-01 > $X` — **nenhum acordo vigente, rateio zero para as
6 pessoas**, e só deixaria de ser zero a partir de 01/10/2026. A mesma guarda
matava o degrau do Thiago do §2.2 (as duas `dataInicio`, 2025-11-01 e
2026-07-01, são passadas — `seed:47` e a prosa em `:49`), matava o backfill que
o §4 manda fazer, e matava duas das três opções da pergunta 5. A guarda, como
estava escrita, **não protegia o passado: impedia o produto de gerar qualquer
número.**

A guarda passa a ser **dois predicados**, nenhum deles absoluto:

> **(a) Não fatiar linha aberta.** Recusar `dataInicio` anterior ao início de
> uma linha JÁ ABERTA do mesmo `(pessoa, nó, origem)` — é o caso que
> `parceiros.ts:229-233` já cobre, e o motivo escrito lá é **UX de constraint**
> (fechar o vigente grava `dataFim = dataInicio` do novo, e data anterior
> violaria o CHECK `vigencia_coerente`), não política antirretroatividade.
>
> **(b) Não escrever antes do corte.** Recusar `dataInicio` anterior a uma
> constante declarada em código, `DATA_CORTE_APURACAO`. O valor dela é resposta
> de negócio — **pergunta 5 do §8**.
>
> **A PRIMEIRA linha de um par `(pessoa, nó, origem)`, sem vigente aberto,
> PODE nascer retroativa**, desde que `>= DATA_CORTE_APURACAO`. Não há linha
> para fatiar, e não há apuração para reescrever.

**E a frase que faltava, porque sem ela a guarda não tem onde se ancorar:**
enquanto `ApuracaoComissao` (frente #4) não existir, **"mês já apurado" não tem
representação nenhuma no banco** — nada é persistido, como o próprio parágrafo
seguinte admite. Logo a guarda tem de se ancorar numa **data declarada**, nunca
em `now()`. Ancorar em `now()` é o que produzia o rateio-zero acima.

A mesma guarda vale para `AssessorCliente`, com a mesma exceção: sem ela, a
tabela criada para impedir que trocar de assessor reescreva o passado
aceitaria, pelo caminho `origem = 'manual'`, uma `dataInicio` retroativa que
reatribui o dono de março em silêncio — mas **com** ela em versão absoluta, o
backfill que a tabela existe para receber seria impossível.

**E é preciso dizer o que ainda fica em aberto:** enquanto **nada é
persistido**, o rateio responde *"quanto é devido hoje, pelas regras de hoje"* —
não *"o que foi pago em março"*. Três entradas dessa recomputação são
retroeditáveis (acordo, titularidade e a árvore de `Empresa`). Fechar isso é
`ApuracaoComissao` com snapshot de percentual/base/valor e **trigger** de
imutabilidade — a frente #4 do §6.

---

## 4. O que acontece com os `AcordoComercial` existentes

**Nenhum é alterado, migrado ou apagado. Zero linhas de SQL naquela tabela.**

O que muda é o papel, e ele passa a estar escrito: `AcordoComercial` é o
**dossiê** (tipo, prosa, PDF); `AcordoAssessor` é a **regra de cálculo**. Uma
pessoa tem os dois, e a ficha em `/time/[id]` mostra os dois **na mesma seção** —
a prosa ao lado do número, para conferência humana. Separá-los esconderia
metade do acordo: a cumulatividade da Leide (`seed:95`) e o *"alterável
unilateralmente a cada 6 meses"* da Rose (`seed:74`) não cabem em coluna nenhuma
e continuam só na prosa.

*(Sobre o elo com o jurídico e sobre qual PDF sobrevive, ver a nota do §2.5: o
vínculo existe no schema, tem um gravador de script e nenhuma tela.)*

**Sem backfill automático de percentual — e isso é impossibilidade medida, não
preguiça.** As 6 linhas-fonte conhecidas (`scripts/seed-acordos-comerciais.ts:31-138`)
são multi-cláusula:

| pessoa | vira, no mínimo | por quê |
|---|---|---|
| Thiago (`:31-50`) | **4 linhas** | fixo R$ 5.000 até jun/2026 + fixo R$ 4.000 de jul/2026 (duas linhas datadas), + 5% `direto` + 25% `indicado_parceiro`, base `comissao_liquida` |
| Alexandra (`:51-64`) | 1 linha | 1%, base `faturamento_bruto` — base diferente de todas as outras |
| Rose (`:65-83`) | 2 linhas | fixo R$ 4.000 + 20% base `receita_liquida` |
| Leide (`:84-104`) | 3 linhas | fixo R$ 1.518 + 20% (captação de imóvel) + 30% (captação de cliente), **cumulativos** — e o eixo que separa os dois papéis **não existe em dado nenhum do banco** |
| Renan (`:105-121`) | 0 linhas | pró-labore de contrato social, **sem valor no contrato** (`:112-114`) |
| Matheus (`:122-138`) | 0 linhas | idem (`:129-131`) |

Um único campo `percentual` não cabe em nenhuma das seis. Uma migration que
tentasse parsear essa prosa seria **palpite gravado em produção**.

**O backfill é ato humano, e é a exceção NOMEADA da guarda de §3.1.** Na tela
nova, uma linha por vez, com a prosa do acordo antigo visível ao lado. São 6
pessoas — custa uma tarde, não uma migration. As condições, todas obrigatórias,
porque sem elas o parágrafo estaria mandando fazer o que §3.1 proíbe:

- **`requireAdmin()`**, e o backfill é um modo próprio da tela, não o formulário
  normal;
- **`DATA_CORTE_APURACAO` fixada ANTES da primeira linha** — é a resposta da
  pergunta 5, e ela precisa estar em código antes do primeiro INSERT;
- **`criadoPor` obrigatório** em toda linha, que é o rastro que
  `AcordoComercial` nunca teve;
- **roda uma vez.** Depois disso, o caminho normal volta a valer, com os dois
  predicados de §3.1;
- **a `EXCLUDE` de §2.4 é quem segura**, não a boa vontade de quem digita.

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
   `AcordoAssessor` da mesma pessoa. O `onDelete: SetNull` de
   `ContratoArquivo.acordoComercialId` (`schema.prisma:2889-2890`,
   `20260519140000:47-49`) é real, **mas só atinge linhas que o script de
   migração já vinculou** — e **quantas são não foi medido** (§7). Se for 0,
   esta correção é **prevenção**, não conserto, e a prioridade dela muda. O
   botão ainda diz *"Excluir definitivamente"*
   (`acordo-comercial-section.tsx:195`) e o rótulo muda junto.

---

## 5. Pontos de contato com o ADM/Financeiro (`docs/onix-financeiro-modelo.md`)

O documento é **silencioso** sobre o acordo do assessor — zero ocorrências de
`acordo|assessor|rateio|split` em 707 linhas, medido nesta sessão. Não há
contradição possível; há cinco pontos de contato obrigatórios.

⚠️ **Tudo naquele documento é PROPOSTA, não código.** Ele se declara
não-implementado na terceira linha (`:3`), o merge da PR #425 (`5332711`)
alterou um arquivo só — 707 linhas de texto —, e `ParcelaReceita` tem zero
ocorrências em `prisma/schema.prisma` e em `prisma/migrations/`. Nenhuma das
linhas abaixo é precedente de **dado**; todas são precedente de **desenho**.

| # | o que o ADM já propôs | o que esta proposta faz |
|---|---|---|
| 1 | **`ParcelaReceita.pessoaId`** — *"QUEM DO TIME ganhou. O eixo da apuração de campanha"* (`:232-234`); `Contrato.pessoaId` (`:142-146`) | **herda.** Não criar segunda ligação parcela→assessor. Quando `ParcelaReceita` existir, o rateio lê `pessoaId` de lá, e `AssessorCliente` continua servindo só o histórico de titularidade da carteira BTG |
| 2 | **Campanha paga prêmio em reais por degrau** (`reguaPremiacao`, `:308-322`; `premioDevido Decimal(14,2)`, `:349`) | **não substitui.** Campanha ≠ comissão: são dois caminhos sobre o mesmo dinheiro. Precisam se enxergar na tela, ou o mesmo real sai duas vezes |
| 3 | **O ADM já escolheu `valorLiquido`** de fato (`:587`, `:639`) sem que o Financeiro tenha decidido | **torna explícito.** A coluna `base` obriga a escolha a ser dita em vez de herdada por omissão — é o 🔴 de `docs/onix-co-estado.md:958-965` |
| 4 | **`ComissaoMensalCliente` migra e é congelada** (§1.7, `:420-478`); o `DROP` é PR posterior | **respeita a janela.** Durante ela, as duas tabelas têm o mesmo dinheiro. Por isso a fonte da base é uma **constante única** (passo 1), e não um `if` — e por isso o passo 1 registra que a troca muda de regime |
| 5 | **`ContratoCorretora` → `Contrato` só se vazia** (`:160-176`, não medido) | **imune.** `AcordoAssessor` não tem FK para contrato nenhum. O rename incerto não a atinge |

**`AcordoAssessor` sobrevive à migration #2 do ADM sem mudança:** já é por nó
(`empresaId`), e `ParcelaReceita.empresaId` é NOT NULL na proposta do ADM.

---

## 6. Ordem de execução — e a resposta sobre uma PR ou duas

**Duas PRs vermelhas, não uma. E esta migration NÃO entra na #2 do ADM.**
A migration roda dentro do `startCommand` e o próprio documento do ADM avisa
(`:480-484`): migration que falha **derruba o serviço em loop de restart**. A #2
do ADM carrega backfill de dado com `RAISE EXCEPTION`; esta aqui é **puramente
aditiva sobre tabela que nasce vazia** — `CREATE TABLE`, `CHECK`, índice
parcial, `EXCLUDE` e `CREATE EXTENSION`, zero `UPDATE`/`INSERT`/`DELETE`, zero
`DROP`, zero rename. Juntar as duas trocaria uma PR sem risco de dado por meia
PR com risco.

Os dois modos de falha que já doeram nesta casa estão **estruturalmente
ausentes**: não há `ADD COLUMN NOT NULL` sem default em tabela com linhas (a
guarda é `scripts/guarda-not-null-sem-default.sh`, gate em
`.github/workflows/ci.yml:115`), e não há `CREATE UNIQUE INDEX` sobre dado vivo
— é exatamente por isso que o 🔴 item 8 do WIP fica **fora** desta PR.

⚠️ **Um modo de falha NOVO entra com esta PR, e ele precisa de checagem antes
do merge:** `CREATE EXTENSION IF NOT EXISTS btree_gist`. Ela é `trusted = true`
no PG 16 (medido), mas isso não prova que o papel da aplicação no Railway a
cria. Ver §7 — e o plano B (trigger) está em §2.4.

| # | frente | faixa | depende de |
|---|---|---|---|
| 1 | `SELECT` de diagnóstico — ver a lista abaixo | 🟢 | nada |
| 2 | **Migration** — `AcordoAssessor` + `AssessorCliente`, CHECKs, índices parciais e `EXCLUDE` | 🔴 | **seu ok no SQL** + respostas 1, 2, 11 e 12 + a checagem de `btree_gist` do §7 |
| 3 | Módulo puro do rateio + `ancestraisDe` + resolvedor de `incluiDescendentes` (serve os DOIS lados) e testes | 🟢 | #2 |
| 4 | **`ApuracaoComissao`** — linha imutável com snapshot e trigger. Só a partir daqui existe "fechamento" | 🔴 | #3 rodado como conferência + resposta 14 |
| 5 | Tela do acordo estruturado em `/time/[id]`, ao lado da prosa + **backfill humano** das 6 pessoas | 🟡 | #2 + **resposta 5** |
| 6 | Escritor de `AssessorCliente` no `btg-enrich` (fecha-e-abre em transação) + as três correções de `Restrict` | 🟡 | **resposta 5** |
| 7 | Tela de conferência do rateio, `requireAdmin` | 🟡 | #3, #5 |

**As frentes #5 e #6 dependem da resposta 5, e nenhuma das duas pode furar a
fila.** A #6 porque, a partir do primeiro clique pós-deploy, o enrich passaria a
gravar `dataInicio = data do clique` — e a decisão sobre a data do backfill
passaria a ser tomada pela ordem do deploy, não pelo Eduardo. A #5 porque
`DATA_CORTE_APURACAO` (§3.1) precisa existir em código **antes** da primeira
linha de backfill.

**O `SELECT` de diagnóstico da frente #1 precisa trazer, no mínimo:**

- quantos `AcordoComercial` existem, e quantos vigentes por pessoa (é o que
  decide o 🔴 item 8 do WIP);
- quantas linhas `ComissaoMensalCliente`, em quantas competências, e
  `count(DISTINCT "clienteId")` — este último é o **proxy do teto de linhas**
  que `AssessorCliente` teria no dia 1;
- quantas linhas `ParceiroCliente` existem, e quantas vigentes;
- **quantas sobreposições JÁ existem** em `AcordoComercialParceiro` e em
  `ParceiroCliente` — o CAMINHO de §3.1 está vivo no código, mas **quantas
  linhas já se sobrepõem no banco real não foi medido**. Se houver sobreposição
  gravada lá, a mesma `EXCLUDE` não poderá ser aplicada àquelas tabelas sem
  limpeza antes (PR à parte);
- `SELECT count(*) FROM "ContratoArquivo" WHERE "acordoComercialId" IS NOT NULL;`
  — decide se a correção 2 do §4 é conserto ou prevenção;
- quantos clientes têm linha de `ComissaoMensalCliente` — é quantos **já não
  podem ser apagados hoje** (ver abaixo).

**Três efeitos colaterais de `Restrict` em `AssessorCliente.clienteId`, e eles
são conhecidos.** Medido: das **25** FKs que referenciam `ClienteBackoffice` nas
migrations, **19 são `ON DELETE CASCADE`, 5 são `SET NULL` e exatamente 1 é
`RESTRICT`** — `ComissaoMensalCliente` (`20260824030000:93-96`,
`schema.prisma:1853`). `AssessorCliente` seria a segunda.

1. `src/lib/backoffice/merge-leading-zeros.ts` só enxerga filhos
   `ON DELETE CASCADE` — a consulta filtra `confdeltype = 'c'` (`:66`) —, então
   o guarda do passo 5 passa limpo e o `delete` do passo 6 (`:157`) estoura
   violação de FK crua.
2. O mesmo vale para o reset com `force: true` em
   `src/app/api/backoffice/clientes/route.ts:1178`.
3. **A rota `DELETE /api/backoffice/clientes/[id]`**, que a versão anterior
   deste documento não listava: ela faz `prisma.clienteBackoffice.delete` cru
   (`src/app/api/backoffice/clientes/[id]/route.ts:184`) dentro de um
   `try/catch` que devolve `{ error: "Erro" }` com status 500 (`:188`), sem
   discriminar código de erro. O admin recebe falha sem causa.

Os itens 1 e 2 são o **modo de falha seguro** — a transação reverte, nada é
destruído — e é o mesmo que `ComissaoMensalCliente` já escolheu e documentou
(`schema.prisma:1832-1853`). O item 3 **não é seguro nem novo**: já acontece
hoje para qualquer cliente com linha de `ComissaoMensalCliente`.
`AssessorCliente` não cria o defeito — muda a frequência.

⚠️ **Severidade, medida, para não superdimensionar:** nenhuma tela chama essa
rota. Há **15** chamadas `fetch` com `method: "DELETE"` em `src/`, e **nenhuma**
delas aponta para `/api/backoffice/clientes/[id]` — apontam para outros
recursos (metas, eventos, grupos de clientes, o bulk em `clientes/route.ts`,
entre outros; a lista completa não foi enumerada aqui, só a ausência foi
medida). É chamada HTTP direta de admin, não botão.

**A correção do item 3 entra na frente #6**, junto com "ensinar os dois scripts
a enxergar `Restrict`": a rota passa a discriminar
`Prisma.PrismaClientKnownRequestError` com `code === "P2003"` e a responder
**409 nomeando a tabela que segura o cliente**, em vez de 500 genérico. O padrão
já existe na casa, na rota irmã: `src/app/api/backoffice/clientes/route.ts:1169-1175`
devolve 409 com a contagem e o que fazer. Medido: `grep -rn "P2003" src` devolve
**zero** ocorrências hoje. Sem isso, `AcordoAssessor`/`AssessorCliente` entregam
uma tela nova em cima de uma rota que falha muda.

**Correção de fato sobre a versão anterior deste documento:** ela afirmava que
`AssessorCliente` *"não nasce vazia por muito tempo: o enrich a preenche para
todo cliente com assessor"*. **Isso é falso, e está medido.** O enrich tem UM
chamador em todo o repositório, e ele manda sempre `?clienteId=`:
`src/components/backoffice/cliente-btg-section.tsx:99`, dentro do botão
"Enriquecer" da ficha. Com `clienteId`, a rota processa **uma linha**
(`btg-enrich/route.ts:98` e `:105`). O modo em lote existe (`hasMore`, `:224` e
`:253`, com o docstring em `:27` mandando o frontend chamar em loop) e **não tem
consumidor** — `grep -rn "hasMore" src/` devolve só a própria rota. E **não há
cron de enrich**: `src/app/api/cron/` tem 22 rotas e nenhuma é enrich,
`grep -rn "enrich" .github/` devolve zero, `railway.toml` só faz `curl` em
`/api/cron/*`, e a própria rota crava `trigger: "manual"` sem parâmetro
(`:57`).

**Logo: `AssessorCliente` também nasce esparsa e cresce um clique por vez,**
como `ComissaoMensalCliente` já cresce. O risco de FK do parágrafo acima
continua real para os clientes já clicados — só não vale "para todo cliente".

**E isso muda o alvo da frente #6.** Quem preenche `assessorCge` em **lote** não
é o enrich: é a importação da planilha Base BTG
(`src/app/api/backoffice/clientes/route.ts:780` no update e `:845` no create),
dono declarado da coluna em `src/lib/backoffice/field-source-policy.ts:97`. A
única escrita de `assessorCge` pelo enrich é `btg-enrich/route.ts:148`, um
cliente por vez. Se a meta for **cobertura total** de `AssessorCliente`, o
fecha-e-abre mora na importação da Base BTG — outra rota, outra faixa, outra
PR. Enquanto a meta for a cobertura esparsa, a frente #6 como está serve.

---

## 7. O que NÃO consegui verificar

Sessão de agente não alcança o banco de produção nem o Railway. Tudo abaixo é
`⚠️` de verdade — nenhum número foi estimado.

| afirmação | estado |
|---|---|
| **o papel da aplicação no Railway consegue `CREATE EXTENSION btree_gist`** | ⚠️ **não verificado, e é BLOQUEIO da frente #2.** A extensão é `trusted = true` no PG 16 (medido em `/usr/share/postgresql/16/extension/btree_gist.control`), o que dispensa superusuário — mas `CREATE EXTENSION` que falha dentro do `startCommand` é loop de restart, e o ensaio de `.github/workflows/ensaio-migration.yml:69` roda contra `postgres:16-alpine` com `POSTGRES_USER` superusuário: **ele passaria e a produção não**. Precisa de checagem manual antes do merge. Plano B em §2.4: trigger, nunca `CHECK` |
| quantas sobreposições de vigência JÁ existem em `AcordoComercialParceiro` e `ParceiroCliente` | ⚠️ **não medido.** O CAMINHO de §3.1 está vivo no código e reproduzido em PG local; quantas linhas já se sobrepõem no banco real, não. Entra na frente #1 |
| quantas linhas `AcordoComercial` existem, e se **alguma pessoa tem duas vigentes** | ⚠️ **não medido.** É o que decide se o 🔴 item 8 do WIP pode sequer ser criado. As 6 do seed são o piso conhecido, não a contagem |
| quantas linhas de `ContratoArquivo` têm `acordoComercialId IS NOT NULL` | ⚠️ **não medido.** Se for 0, a correção 2 do §4 é prevenção, não conserto |
| `ComissaoMensalCliente.comissao` é **bruto ou líquido** | ⚠️ **indeterminável no código.** O parser aceita SEIS nomes (`commission \| Commission \| totalCommission \| value \| amount \| comissao`) e grava o que vier; o `?? 0` da mesma linha ainda torna "nenhum campo casou" indistinguível de "comissão zero" (`btg-enrich/route.ts:380-381`) |
| quantas linhas `ComissaoMensalCliente`, em quantas competências | ⚠️ **não medido.** A série é esparsa por construção: nada de comissão roda em lote, só cresce por clique na ficha (`src/components/backoffice/cliente-btg-section.tsx:99`). ⚠️ ressalva: existe um cron semanal que grava `BtgSyncLog.tipo = 'enrich'` **sem** escrever comissão nem `assessorCge` (`btg-api-sync.ts:245`, `cron.yml:26`) — ver o aviso do Passo 1b |
| **quantos clientes já passaram pelo enrich** — o teto de linhas que `AssessorCliente` teria no dia 1 | ⚠️ **não medido.** Proxy possível: `count(DISTINCT "clienteId")` em `ComissaoMensalCliente`, que só cresce pelo mesmo clique |
| **quantos clientes já têm linha de `ComissaoMensalCliente`** — ou seja, quantos JÁ não podem ser apagados hoje | ⚠️ **não medido.** É o número que diz se o 500 mudo da rota `DELETE` é teórico ou já aconteceu |
| quantas linhas `ParceiroCliente` existem, e quantas vigentes | ⚠️ **não medido.** É o que decide se o passo 4 vai encontrar vínculo ou só o balde de indeterminado |
| quantos clientes estão **sem `assessorCge`** hoje | ⚠️ **não medido.** É o tamanho da lista `semTitular[]` que o rateio vai devolver |
| `ContratoCorretora` está vazia | ⚠️ **não medido** (§8 do doc do ADM). Não afeta esta proposta — não há FK para lá |
| `getCommissionReport()` realmente não devolve competência | ⚠️ **não chamei a API.** Tenho a afirmação escrita no próprio código (`btg-enrich/route.ts:44-49`) |
| o histórico de `assessorCge` é irrecuperável | ⚠️ **parcial.** Verifiquei que `BtgSyncLog` não guarda payload (`schema.prisma:1212-1227`); **não** varri backups nem `pg_dump` |
| a migration aplica limpo; `lint`/`build` passam | ⚠️ **não testado.** Shadow-DB é gate da PR da frente #2, não deste documento. O que **foi** testado: o DDL de §2.4 em PG 16.13 local, tabela por tabela — ver a tabela de sete resultados lá |
| `ComissaoMensalCliente` já tem mais de uma linha por conta no mesmo mês | ⚠️ **não medido**, e é risco silencioso: `receitasMap.set` **sobrescreve em vez de somar** (`btg-enrich/route.ts:88`). Se o relatório trouxer duas linhas para a mesma conta, a base já está menor que a real, sem sintoma |

---

## 8. As perguntas que só você responde

Todas são regra de negócio. Nenhuma tem resposta no código — procurei. As
quatro últimas são novas nesta revisão: elas existiam como **decisão silenciosa
do desenho**, e decisão de negócio não pode entrar por decreto de quem escreve
a migration.

**1. O número que o BTG grava é BRUTO ou LÍQUIDO?** Sem isso o rateio não roda,
de propósito (passo 6). Todos os seus acordos escritos falam em *"comissão
líquida"* ou *"receita líquida"*; se o gravado for bruto, todo repasse sai
maior e ninguém percebe.

**2. Assessor, parceiros e a casa somam 100% no mesmo negócio, ou são
independentes?** O schema afirma as duas coisas a poucas linhas de distância
(`:1573-1576` contra `:1660-1662`). Isso decide se existe validação de soma — e
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

**5. A partir de qual competência a casa pretende apurar? E qual `dataInicio`
o backfill grava?** Esta é a pergunta que a guarda de §3.1 depende — a resposta
é o valor da constante `DATA_CORTE_APURACAO`, e ela vale para **`AcordoAssessor`
e `AssessorCliente` juntos** (a versão anterior só perguntava pela segunda).
Para `AssessorCliente` as opções continuam sendo: data de abertura da conta,
primeira competência com comissão, ou a data do backfill. Não há histórico
recuperável — qualquer das três é presunção, e é ela que decide se um assessor
recebe por competências anteriores à entrada dele. Para `AcordoAssessor` a
pergunta é a mesma com outro nome: o degrau do Thiago (R$ 5.000 até jun/2026)
só existe se o corte for **anterior a nov/2025** (`seed:47`).

**6. Estorno.** Comissão negativa é permitida por decisão explícita
(`migration 20260824030000:60-61`). Ela vira repasse **negativo** para a pessoa
naquele mês, compensa no mês seguinte, ou zera?

**7. O fixo é comissão ou é folha?** R$ 5.000 → R$ 4.000 do Thiago, R$ 4.000 da
Rose, R$ 1.518 da Leide. Se for folha/pró-labore e não pertencer ao rateio, a
coluna `valorFixoMensal` sai e **3 dos 6 acordos** ficam pela metade nesta
tabela (3 pessoas, 4 linhas — §2.2).

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

**11. Um cliente pode ter DOIS assessores vigentes ao mesmo tempo?** Hoje o
desenho responde **NÃO por índice** (`AssessorCliente_vigente_key`, §2.4) — e
essa resposta nunca foi perguntada. Três coisas para decidir com:

- O lado do parceiro tratou a MESMA pergunta como pergunta aberta de PR e a
  respondeu em migration dedicada
  (`prisma/migrations/20260812055036_parceiro_cliente_exclusividade/migration.sql:3-15`).
  **Mas o motivo escrito lá NÃO se transfere:** *"a comissão do parceiro é um
  PERCENTUAL RETIRADO da comissão do assessor"* (`:5-7`). Dois assessores não
  retiram um do outro.
- O schema **já modela** duas pessoas sobre a mesma carteira:
  `AcessoCarteira.tipo = "dono" | "apoia"` (`schema.prisma:2478-2490`) e
  `Papel.escopoOperacional = "propria" | "propria_mais_apoio" | "todas"`
  (`:2496`). Isso é **acesso**, não remuneração — e é exatamente aí que mora a
  pergunta: **quem "apoia" recebe?**
- Consequência da resposta: se for "sim", o `CREATE UNIQUE INDEX` de §2.4 sai e
  entra um percentual de rateio por titular. Um índice único sobre tabela que
  já cresceu é caro de desfazer — **é o oposto da janela que a migration
  20260812055036 aproveitou com a tabela vazia**. A `EXCLUDE` de não-sobreposição
  também mudaria de forma (passaria a incluir `pessoaId`).

**12. A mesma pessoa pode receber FIXO de mais de uma empresa do grupo?** (Rose
na Corretora e, digamos, na Imob.) Está medido que hoje **passa**: o índice de
§2.4 é `(pessoaId, empresaId)` e a `EXCLUDE` de fixo também — nenhum dos dois
olha "pessoa". A pergunta decide a chave, e **as duas respostas possíveis
mostram que o índice de hoje é frouxo**:

- **Se NÃO** — a chave certa é `(pessoaId)`, e o índice atual permite pagar
  duas vezes.
- **Se SIM** — a chave certa é `(pessoa, PJ pagadora)`, e o índice atual
  **também** é frouxo: `empresaId` aponta para **48 nós**
  (`catalogo.test.ts:43-57`) e a mesma PJ aparece como mais de um nó —
  `corretora` (empresa, `catalogo.ts:296`) e `corretora-corretora`
  (departamento, `:311-320`, com a nota *"Rótulo IGUAL ao da empresa que o
  contém, id diferente — intencional"*). O seletor da tela oferece os dois
  (`parceiros.ts:199`). Dois cliques gravam R$ 4.000 duas vezes.

O contexto do dado real: os três fixos têm **dois pagadores jurídicos** —
Thiago e Rose pela Onx Agro Corretora, CNPJ 31.238.019/0001-02 (`seed:49` e
`:82`); Leide pela Onix Imob, CNPJ 57.646.566/0001-02 (`:103`). E
`PessoaEmpresa` é N:N por desenho (`schema.prisma:2264-2294`), com Renan e
Matheus sócios administradores da Onix Imob (`seed:105-138`) enquanto o Renan
tem também acordo de parceiro (pergunta 8).

**Enquanto a resposta não vier, NÃO mexer no índice:** ele fica
`(pessoaId, empresaId)`, e o vão fica coberto pelo **aviso do Passo 8**, que é
o que se pode afirmar com o que está medido. Trocar para `(pessoaId)` agora
bloquearia pró-labore legítimo em duas PJs e desfaria o precedente da casa, que
andou no sentido **oposto**: o acordo do parceiro **ganhou** a dimensão de nó em
migração posterior (`20260822020000:85-87`).

**13. O que dispara o direito ao repasse: a COMPETÊNCIA ou o RECEBIMENTO pela
ONX?** Dois dos quatro acordos com cláusula de pagamento condicionam ao
recebimento — Thiago, *"até dia 10 do mês subsequente **ao recebimento das
comissões pela ONX**"* (`seed:46`), e Leide, *"em até 5 dias úteis **após
recebimento** das comissões pela Onix"* (`seed:97`). Os outros dois não
mencionam recebimento: Alexandra, *"até o décimo dia do mês subsequente,
mediante apresentação de NF"* (`seed:57`), e Rose, *"até dia 15 do mês
subsequente"* (`seed:76`). Renan e Matheus não têm cláusula de pagamento.

Hoje o Passo 0 responde **"competência"** por omissão, e
`ComissaoMensalCliente` não tem coluna de recebimento nenhuma. O Passo 1
**muda a resposta sozinho** no dia em que `ParcelaReceita` chegar, porque lá a
leitura é `status = 'recebida'`. Se isso é correção de um erro atual ou mudança
da regra de pagamento é decisão sua, e ela precisa vir **antes** da troca de
fonte.

**14. Existe janela de contestação?** O acordo da Rose obriga: *"Comissionamento
divulgado até dia 10. Pessoa tem 48h após recebimento para impugnar"*
(`seed:77`). Isso vale **para todos** ou só para ela? E o que acontece com a
apuração **dentro** da janela?

A pergunta tem consequência estrutural imediata: a frente #4
(`ApuracaoComissao`) define a linha como **imutável, com trigger** — e uma
linha imutável é justamente onde uma impugnação de 48h não tem onde pousar. Se
a resposta for "vale", a linha precisa nascer com estado de divulgação e prazo
(`divulgadoEm` + janela), senão a obrigação contratual do `seed:77` não tem
onde existir no banco.

*(A **revisão semestral** da Rose — *"alterável unilateralmente a cada 6
meses"*, `seed:74` — **não** é pergunta aberta: já está decidida e escrita no
§4. Ela não cabe em coluna nenhuma e continua na prosa, ao lado do número.)*
