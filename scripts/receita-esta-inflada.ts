/**
 * A receita em produção está inflada por importação repetida?
 *
 * SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE, nenhum DDL. Não imprime nome de
 * cliente, de assessor nem qualquer linha individual — só contagens e somas.
 *
 * ── POR QUE ESTE SCRIPT EXISTE ───────────────────────────────────────────
 * A tela de Receita diz, por escrito, que "a importação substitui o snapshot
 * anterior". A tela manda `replace: true`. E o servidor faz `void replace`
 * (`api/backoffice/receita/route.ts:168`) — descarta o pedido e só acrescenta.
 *
 * A pergunta que isso levanta não é de código, é de dinheiro: o número que
 * aparece na tela hoje está certo? E a resposta não dá para deduzir lendo o
 * repositório, porque depende de quantas vezes cada planilha foi importada e do
 * que mudou entre uma importação e outra.
 *
 * ── POR QUE NÃO É ÓBVIO QUE ESTÁ INFLADO ─────────────────────────────────
 * Existe uma defesa: cada linha carrega um `hash` sha1 de
 * data+valores+assessor+parceiro+produto+categoria+cliente, a coluna é
 * `@unique`, e o `createMany` usa `skipDuplicates`. Reimportar o MESMO arquivo
 * insere zero linhas.
 *
 * A defesa tem dois furos, e são eles que este script mede:
 *
 *   1. CORREÇÃO. Se um valor mudou na planilha (o mês fechou, o imposto foi
 *      ajustado, o nome do produto foi padronizado), o hash muda. A linha nova
 *      entra e a antiga FICA. O mesmo fato econômico passa a existir duas vezes,
 *      com dois valores, e os dois somam.
 *
 *   2. LINHA SEM HASH. `hash` é `String?`. Em Postgres, `UNIQUE` não colide
 *      entre NULLs: linhas gravadas antes de a coluna existir não desduplicam
 *      contra nada, nem entre si.
 *
 * ── POR QUE IMPORTA MAIS DO QUE PARECE ───────────────────────────────────
 * `recomputeReceitaClientes` (`route.ts:52`) soma `faturamentoLiquido` dos
 * últimos 12 meses por nome de cliente e ESCREVE o resultado em
 * `ClienteBackoffice.receitaAnual`. Linha duplicada aqui não fica contida na
 * tela de receita: vira o número de receita na ficha do cliente.
 */

import "dotenv/config";

/** Host de destino SEM credencial — a URL do Postgres carrega usuário e senha. */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

let aberto: { $disconnect: () => Promise<void> } | null = null;

/** As somas vêm do Postgres como string ou number conforme o driver. */
const n = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const dia = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "—";

const pct = (parte: number, todo: number) => (todo === 0 ? "—" : `${((parte / todo) * 100).toFixed(1)}%`);


/**
 * O que as telas mostram, com ou sem `ReceitaItem`.
 *
 * `ClienteBackoffice.receitaAnual` alimenta a ficha do cliente, a soma "renda
 * total" da tabela, o CSV exportado e o KPI "Receita anual" do dashboard de
 * performance. Tem DOIS escritores: o import da planilha (a tabela de clientes
 * aceita as colunas `receita`, `receitaAnual`, `receitaAno`, `rendaAnual`) e o
 * `recomputeReceitaClientes` do import de receita.
 *
 * O detalhe que faz esta leitura valer mesmo com a tabela vazia:
 * `recomputeReceitaClientes` começa com `if (!items.length) return` — com zero
 * linhas em `ReceitaItem` ele NÃO zera nada. O número que estiver na ficha
 * continua na ficha, e nada nesta rodada o corrige.
 */
async function fichaDoCliente(
  prisma: { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> },
  liquidoDoReceitaItem: number,
) {
  const [ficha] = await prisma.$queryRaw<
    Array<{ clientes: bigint; com_receita: bigint; soma: unknown; maior: unknown }>
  >`
    SELECT count(*)                                   AS clientes,
           count(*) FILTER (WHERE "receitaAnual" > 0) AS com_receita,
           coalesce(sum("receitaAnual"), 0)           AS soma,
           coalesce(max("receitaAnual"), 0)           AS maior
    FROM "ClienteBackoffice"
  `;

  console.log("\n── O QUE AS TELAS MOSTRAM (ClienteBackoffice.receitaAnual) ──");
  console.log(`  clientes na base           ${Number(ficha.clientes)}`);
  console.log(`  com receitaAnual > 0       ${Number(ficha.com_receita)}`);
  console.log(`  soma                       ${dinheiro(n(ficha.soma))}`);
  console.log(`  maior de um cliente só     ${dinheiro(n(ficha.maior))}`);
  console.log("\n  Este é o número do KPI 'Receita anual' em /empresas/investimentos/");
  console.log("  performance, da 'renda total' na tabela de clientes, da ficha e do CSV.");

  if (liquidoDoReceitaItem === 0 && Number(ficha.com_receita) > 0) {
    console.log("\n  ⚠ As telas mostram receita e `ReceitaItem` está vazia.");
    console.log("  Não é contradição: o import da planilha de clientes também escreve");
    console.log("  `receitaAnual`. Mas significa que o número exibido NÃO vem do");
    console.log("  relatório de receita — e que `recomputeReceitaClientes` não tem como");
    console.log("  corrigi-lo, porque ele desiste na primeira linha quando a tabela está");
    console.log("  vazia. Qual das duas fontes está na tela hoje, só o histórico do");
    console.log("  import diz — e não existe histórico: é a sugestão 'Extrato do");
    console.log("  apagamento' que ficou pendente.");
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exitCode = 2;
    return;
  }

  console.log("RECEITA — a base está inflada por importação repetida?");
  console.log("Somente leitura. Sem nome de cliente, sem linha individual.");
  console.log(`Destino: ${descreverDestino(url)}\n`);

  const { prisma } = await import("../src/lib/prisma");
  aberto = prisma;

  /* ── 1. PANORAMA ─────────────────────────────────────────────────────── */

  const [geral] = await prisma.$queryRaw<
    Array<{
      linhas: bigint;
      lotes: bigint;
      liquido: unknown;
      bruto: unknown;
      data_min: Date | null;
      data_max: Date | null;
      import_primeiro: Date | null;
      import_ultimo: Date | null;
    }>
  >`
    SELECT count(*)                        AS linhas,
           count(DISTINCT "loteId")        AS lotes,
           coalesce(sum("faturamentoLiquido"), 0) AS liquido,
           coalesce(sum("faturamento"), 0)        AS bruto,
           min("data")                     AS data_min,
           max("data")                     AS data_max,
           min("criadoEm")                 AS import_primeiro,
           max("criadoEm")                 AS import_ultimo
    FROM "ReceitaItem"
  `;

  const linhas = Number(geral.linhas);
  const liquidoTotal = n(geral.liquido);

  console.log("── PANORAMA ──");
  if (linhas === 0) {
    console.log("  `ReceitaItem` está VAZIA. Zero linhas.");
    console.log("  Não há inflação a medir — mas VAZIO não é o mesmo que INOFENSIVO,");
    console.log("  e a pergunta que sobra é o que as telas mostram sem esta tabela.");
    await fichaDoCliente(prisma, 0);
    return;
  }
  console.log(`  linhas                 ${linhas}`);
  console.log(`  snapshots (loteId)     ${Number(geral.lotes)}`);
  console.log(`  período dos lançamentos ${dia(geral.data_min)} → ${dia(geral.data_max)}`);
  console.log(`  importações             ${dia(geral.import_primeiro)} → ${dia(geral.import_ultimo)}`);
  console.log(`  faturamento bruto      ${dinheiro(n(geral.bruto))}`);
  console.log(`  faturamento líquido    ${dinheiro(liquidoTotal)}   ← é este que vai para a ficha do cliente`);

  /* ── 2. UM LOTE POR IMPORTAÇÃO ───────────────────────────────────────── */

  const lotes = await prisma.$queryRaw<
    Array<{
      lote: string;
      linhas: bigint;
      liquido: unknown;
      data_min: Date | null;
      data_max: Date | null;
      importado_em: Date | null;
    }>
  >`
    SELECT left("loteId", 8)               AS lote,
           count(*)                        AS linhas,
           coalesce(sum("faturamentoLiquido"), 0) AS liquido,
           min("data")                     AS data_min,
           max("data")                     AS data_max,
           min("criadoEm")                 AS importado_em
    FROM "ReceitaItem"
    GROUP BY "loteId"
    ORDER BY min("criadoEm")
  `;

  console.log("\n── CADA IMPORTAÇÃO QUE DEIXOU LINHA ──");
  console.log("  Um lote por importação. Lote com poucas linhas cobrindo um período");
  console.log("  que outro lote já cobria é o retrato do 'reimportei e só somou'.\n");
  console.log("  lote      linhas  período dos lançamentos     líquido            importado em");
  for (const l of lotes) {
    console.log(
      `  ${l.lote}  ${String(Number(l.linhas)).padStart(6)}  ` +
        `${dia(l.data_min)} → ${dia(l.data_max)}  ` +
        `${dinheiro(n(l.liquido)).padStart(16)}   ${dia(l.importado_em)}`,
    );
  }

  /* ── 3. AS DUAS BRECHAS DO DEDUPE ────────────────────────────────────── */

  const [semHash] = await prisma.$queryRaw<Array<{ total: bigint; liquido: unknown }>>`
    SELECT count(*) AS total, coalesce(sum("faturamentoLiquido"), 0) AS liquido
    FROM "ReceitaItem" WHERE "hash" IS NULL
  `;

  const [hashRepetido] = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT coalesce(sum(extra), 0) AS total FROM (
      SELECT count(*) - 1 AS extra FROM "ReceitaItem"
      WHERE "hash" IS NOT NULL GROUP BY "hash" HAVING count(*) > 1
    ) g
  `;

  console.log("\n── BRECHA 1: linha sem hash ──");
  console.log(`  ${Number(semHash.total)} linha(s), ${dinheiro(n(semHash.liquido))}.`);
  console.log("  `hash` é opcional e NULL não colide com NULL em UNIQUE do Postgres:");
  console.log("  estas nunca desduplicaram, nem contra as novas nem entre si.");

  console.log("\n── A TRAVA QUE FUNCIONA ──");
  console.log(`  ${Number(hashRepetido.total)} linha(s) com hash repetido.`);
  console.log("  Espera-se ZERO: `hash` é @unique. Diferente de zero significa que a");
  console.log("  constraint não está aplicada neste banco — e aí o problema é outro,");
  console.log("  maior, e reimportar o mesmo arquivo duplica tudo.");

  /* ── 4. BRECHA 2: O MESMO FATO, DUAS VEZES, COM VALORES DIFERENTES ──── */

  /* A identidade do fato econômico SEM o dinheiro. Se duas linhas casam nisto e
   * mesmo assim têm hash diferente, o que mudou foi valor ou assessor — é a
   * assinatura da correção reimportada. */
  const [correcoes] = await prisma.$queryRaw<
    Array<{ grupos: bigint; linhas_extras: bigint; liquido_extra: unknown }>
  >`
    WITH grupo AS (
      SELECT "data", "nomeCliente", "produto", "parceiro", "categoria",
             count(*) AS n,
             sum("faturamentoLiquido") AS soma,
             max("faturamentoLiquido") AS maior
      FROM "ReceitaItem"
      GROUP BY "data", "nomeCliente", "produto", "parceiro", "categoria"
      HAVING count(*) > 1
    )
    SELECT count(*)                       AS grupos,
           coalesce(sum(n - 1), 0)        AS linhas_extras,
           coalesce(sum(soma - maior), 0) AS liquido_extra
    FROM grupo
  `;

  const gruposDup = Number(correcoes.grupos);
  const extras = Number(correcoes.linhas_extras);
  const dinheiroExtra = n(correcoes.liquido_extra);

  console.log("\n── BRECHA 2: o mesmo fato, mais de uma vez ──");
  console.log("  Mesma data, mesmo cliente, mesmo produto, mesmo parceiro, mesma");
  console.log("  categoria — e ainda assim mais de uma linha. Como o hash inclui os");
  console.log("  valores, isto só acontece quando o VALOR mudou entre importações.\n");
  console.log(`  grupos afetados        ${gruposDup}`);
  console.log(`  linhas a mais          ${extras}  (${pct(extras, linhas)} da base)`);
  console.log(`  dinheiro a mais        ${dinheiro(dinheiroExtra)}  (${pct(dinheiroExtra, liquidoTotal)} do líquido)`);
  console.log("\n  Leitura do número: mantendo a MAIOR linha de cada grupo, é isto que");
  console.log("  sai. Se a correção foi para BAIXO (imposto ajustado, estorno), manter a");
  console.log("  maior superestima o que sobra — o valor acima é o piso do excesso,");
  console.log("  não o teto.");

  /* Quantos desses grupos cruzam lotes — a prova de que veio de reimportação e
   * não de dois lançamentos legítimos no mesmo dia. */
  const [entreLotes] = await prisma.$queryRaw<Array<{ grupos: bigint; linhas: bigint }>>`
    WITH grupo AS (
      SELECT count(*) AS n, count(DISTINCT "loteId") AS lotes
      FROM "ReceitaItem"
      GROUP BY "data", "nomeCliente", "produto", "parceiro", "categoria"
      HAVING count(*) > 1
    )
    SELECT count(*) FILTER (WHERE lotes > 1) AS grupos,
           coalesce(sum(n) FILTER (WHERE lotes > 1), 0) AS linhas
    FROM grupo
  `;

  console.log(`\n  Destes, ${Number(entreLotes.grupos)} grupo(s) têm linhas vindas de MAIS DE UM lote`);
  console.log(`  (${Number(entreLotes.linhas)} linhas). Esse é o recorte que veio de reimportação —`);
  console.log("  grupo inteiro dentro de um lote só pode ser lançamento legítimo repetido.");

  /* ── 5. MÊS A MÊS, PARA CONFERIR CONTRA O POWER BI ───────────────────── */

  const meses = await prisma.$queryRaw<
    Array<{ mes: string; linhas: bigint; liquido: unknown; lotes: bigint }>
  >`
    SELECT to_char("data", 'YYYY-MM')      AS mes,
           count(*)                        AS linhas,
           coalesce(sum("faturamentoLiquido"), 0) AS liquido,
           count(DISTINCT "loteId")        AS lotes
    FROM "ReceitaItem"
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 18
  `;

  console.log("\n── MÊS A MÊS (18 últimos) ──");
  console.log("  Só você sabe o número certo: compare com o relatório do Power BI.");
  console.log("  Mês com mais de um lote é candidato a ter sido importado duas vezes.\n");
  console.log("  mês       linhas  lotes            líquido");
  for (const m of meses) {
    console.log(
      `  ${m.mes}  ${String(Number(m.linhas)).padStart(6)}  ${String(Number(m.lotes)).padStart(5)}  ` +
        `${dinheiro(n(m.liquido)).padStart(16)}`,
    );
  }

  await fichaDoCliente(prisma, liquidoTotal);

  /* ── VEREDITO ────────────────────────────────────────────────────────── */

  const inflado = extras > 0 || Number(semHash.total) > 0 || Number(hashRepetido.total) > 0;
  console.log("\n── VEREDITO ──");
  if (!inflado) {
    console.log("  NÃO há sinal de inflação por reimportação:");
    console.log("  zero linha sem hash, zero hash repetido, zero fato repetido.");
    console.log("  O `void replace` continua sendo um defeito — a tela promete o que o");
    console.log("  servidor não faz —, mas hoje ele não está corrompendo número nenhum.");
  } else {
    console.log(`  HÁ excesso: ${extras} linha(s) do mesmo fato, ${dinheiro(dinheiroExtra)} a mais,`);
    console.log(`  mais ${Number(semHash.total)} linha(s) fora do dedupe.`);
    console.log("  Este número ENTRA na ficha do cliente por `recomputeReceitaClientes`.");
  }
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exitCode = 1;
  })
  .finally(() => aberto?.$disconnect());
