/**
 * `ClienteBackoffice.receitaAnual` tem TRÊS escritores e DOIS significados.
 * Quantos clientes cada um escreveu?
 *
 * SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE, nenhum DDL. Não imprime nome de
 * cliente, de assessor, nem qualquer linha individual — só contagens e somas.
 *
 * ── A PERGUNTA, E POR QUE ELA PRECEDE O CONSERTO ─────────────────────────
 * O campo é declarado como renda anual DECLARADA do cliente, vinda do Base BTG
 * (`field-source-policy.ts:54`, sob "Posição financeira"). Mas dois outros
 * caminhos gravam nele a RECEITA DA ONIX, que é grandeza mil vezes menor:
 *
 *   A. `api/backoffice/btg-enrich/route.ts:141` — comissão do mês × 12.
 *   B. `api/backoffice/receita/route.ts:108`    — líquido dos últimos 12 meses
 *                                                 apurado sobre `ReceitaItem`.
 *
 * Antes de decidir de quem é o campo, é preciso saber o tamanho da mistura. Um
 * punhado de clientes contaminados se resolve com um reimport; metade da base
 * contaminada é outro problema, e outra decisão.
 *
 * ── COMO DÁ PARA SABER, SEM COLUNA DE PROCEDÊNCIA POR ESCRITOR ───────────
 * Existe `ClienteBackoffice.fonteUltimoUpdate`: um JSON `{ campo: "fonte:ts" }`
 * gravado por `upsertPorPolitica` (`lib/backoffice/upsert-cliente.ts:91-96`) a
 * cada campo que ele escreve.
 *
 * O detalhe que transforma isso em resposta: **os dois escritores da receita da
 * Onix NÃO passam por `upsertPorPolitica`.** Os dois chamam
 * `prisma.clienteBackoffice.update` direto (linhas 159 e 108 acima), então NÃO
 * deixam procedência. A sync diária do BTG, ao contrário, passa
 * (`btg-api-sync.ts:143` e `:305`).
 *
 * Logo a partição é limpa:
 *
 *   COM `fonteUltimoUpdate.receitaAnual`  → escrito pelo caminho da política,
 *                                            e o valor diz por qual fonte.
 *   SEM a chave, mas com valor > 0        → escrito por um caminho que ignora
 *                                            a política: btg-enrich, o recompute
 *                                            da receita, ou uma escrita legada
 *                                            anterior à própria procedência.
 *
 * ── O QUE ESTA MEDIÇÃO NÃO CONSEGUE SEPARAR ──────────────────────────────
 * Dentro do grupo SEM procedência, não há carimbo que distinga btg-enrich de
 * recompute de legado. O que existe é a ORDEM DE GRANDEZA: comissão anual de um
 * cliente fica na casa de 0,5% a 1,5% do patrimônio dele; renda declarada não
 * guarda relação fixa com o saldo e costuma ser múltiplos dele. Por isso a
 * última seção classifica por razão `receitaAnual / saldo` — é indício forte,
 * não carimbo, e está rotulado como tal.
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

const n = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const pct = (parte: number, todo: number) => (todo === 0 ? "—" : `${((parte / todo) * 100).toFixed(1)}%`);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exitCode = 2;
    return;
  }

  console.log("receitaAnual — quantos clientes cada escritor contaminou?");
  console.log("Somente leitura. Sem nome de cliente, sem linha individual.");
  console.log(`Destino: ${descreverDestino(url)}\n`);

  const { prisma } = await import("../src/lib/prisma");
  aberto = prisma;

  /* ── 1. A PARTIÇÃO PRINCIPAL ─────────────────────────────────────────── */

  const [parte] = await prisma.$queryRaw<
    Array<{
      total: bigint;
      com_valor: bigint;
      com_procedencia: bigint;
      sem_procedencia: bigint;
      soma_com: unknown;
      soma_sem: unknown;
    }>
  >`
    SELECT count(*)                                                     AS total,
           count(*) FILTER (WHERE "receitaAnual" > 0)                   AS com_valor,
           count(*) FILTER (WHERE "receitaAnual" > 0
                              AND "fonteUltimoUpdate" ? 'receitaAnual') AS com_procedencia,
           count(*) FILTER (WHERE "receitaAnual" > 0
                              AND NOT ("fonteUltimoUpdate" ? 'receitaAnual')) AS sem_procedencia,
           coalesce(sum("receitaAnual") FILTER (WHERE "receitaAnual" > 0
                              AND "fonteUltimoUpdate" ? 'receitaAnual'), 0)   AS soma_com,
           coalesce(sum("receitaAnual") FILTER (WHERE "receitaAnual" > 0
                              AND NOT ("fonteUltimoUpdate" ? 'receitaAnual')), 0) AS soma_sem
    FROM "ClienteBackoffice"
  `;

  const comValor = Number(parte.com_valor);
  const comProc = Number(parte.com_procedencia);
  const semProc = Number(parte.sem_procedencia);

  console.log("── A PARTIÇÃO ──");
  console.log(`  clientes na base                      ${Number(parte.total)}`);
  console.log(`  com receitaAnual > 0                  ${comValor}`);
  console.log(
    `  ├─ COM procedência registrada        ${comProc}  (${pct(comProc, comValor)})  ${dinheiro(n(parte.soma_com))}`,
  );
  console.log(
    `  └─ SEM procedência (fora da política) ${semProc}  (${pct(semProc, comValor)})  ${dinheiro(n(parte.soma_sem))}`,
  );
  console.log("\n  `upsertPorPolitica` carimba `fonteUltimoUpdate.receitaAnual` a cada");
  console.log("  escrita. `btg-enrich` e o recompute da receita chamam `update` direto e");
  console.log("  NÃO carimbam — então 'sem procedência' é o teto da contaminação.");

  if (comValor === 0) {
    console.log("\n  Nenhum cliente com valor. Nada a decidir.");
    return;
  }

  /* ── 2. QUEM ESCREVEU, ENTRE OS QUE TÊM CARIMBO ──────────────────────── */

  const fontes = await prisma.$queryRaw<Array<{ fonte: string; clientes: bigint; soma: unknown }>>`
    SELECT split_part("fonteUltimoUpdate"->>'receitaAnual', ':', 1) AS fonte,
           count(*)                                                 AS clientes,
           coalesce(sum("receitaAnual"), 0)                          AS soma
    FROM "ClienteBackoffice"
    WHERE "receitaAnual" > 0 AND "fonteUltimoUpdate" ? 'receitaAnual'
    GROUP BY 1
    ORDER BY 2 DESC
  `;

  console.log("\n── ENTRE OS CARIMBADOS, QUAL FONTE ──");
  if (fontes.length === 0) {
    console.log("  nenhum — todo valor veio de fora da política.");
  } else {
    console.log("  fonte            clientes            soma");
    for (const f of fontes) {
      console.log(
        `  ${(f.fonte || "(vazio)").padEnd(15)} ${String(Number(f.clientes)).padStart(8)}  ${dinheiro(n(f.soma)).padStart(18)}`,
      );
    }
    console.log("\n  `base_btg` aqui é a renda declarada — o significado legítimo do campo.");
  }

  /* ── 3. INDÍCIO DE GRANDEZA, PARA OS SEM CARIMBO ─────────────────────── */

  /* Comissão anual costuma ficar entre 0,5% e 1,5% do patrimônio; renda
   * declarada não guarda relação fixa com o saldo. A razão separa os dois
   * mundos com folga de uma ordem de grandeza — é indício, não carimbo. */
  const [faixas] = await prisma.$queryRaw<
    Array<{ sem_saldo: bigint; parece_comissao: bigint; parece_renda: bigint; meio: bigint }>
  >`
    SELECT count(*) FILTER (WHERE "saldo" IS NULL OR "saldo" <= 0)              AS sem_saldo,
           count(*) FILTER (WHERE "saldo" > 0
                              AND "receitaAnual" / "saldo" < 0.05)             AS parece_comissao,
           count(*) FILTER (WHERE "saldo" > 0
                              AND "receitaAnual" / "saldo" >= 0.05
                              AND "receitaAnual" / "saldo" < 0.5)              AS meio,
           count(*) FILTER (WHERE "saldo" > 0
                              AND "receitaAnual" / "saldo" >= 0.5)             AS parece_renda
    FROM "ClienteBackoffice"
    WHERE "receitaAnual" > 0 AND NOT ("fonteUltimoUpdate" ? 'receitaAnual')
  `;

  console.log("\n── OS SEM CARIMBO, POR ORDEM DE GRANDEZA (indício, não prova) ──");
  console.log(`  razão receitaAnual / saldo:`);
  console.log(`    abaixo de 5%    ${String(Number(faixas.parece_comissao)).padStart(6)}  cheira a comissão (receita da Onix)`);
  console.log(`    entre 5% e 50%  ${String(Number(faixas.meio)).padStart(6)}  ambíguo`);
  console.log(`    50% ou mais     ${String(Number(faixas.parece_renda)).padStart(6)}  cheira a renda declarada`);
  console.log(`    sem saldo       ${String(Number(faixas.sem_saldo)).padStart(6)}  indeterminável por esta régua`);

  /* ── VEREDITO ────────────────────────────────────────────────────────── */

  console.log("\n── VEREDITO ──");
  if (semProc === 0) {
    console.log("  Contaminação ZERO: todo cliente com valor tem carimbo da política.");
    console.log("  `btg-enrich` e o recompute nunca escreveram nesta base — o campo é,");
    console.log("  hoje, só renda declarada. A decisão de titularidade fica sobre");
    console.log("  risco futuro, não sobre estrago existente.");
  } else {
    console.log(`  Até ${semProc} cliente(s) (${pct(semProc, comValor)}) podem estar com receita`);
    console.log("  da Onix no campo de renda declarada. É TETO, não medida exata: escrita");
    console.log("  legada anterior à procedência cai no mesmo balde.");
  }
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exitCode = 1;
  })
  .finally(() => aberto?.$disconnect());
