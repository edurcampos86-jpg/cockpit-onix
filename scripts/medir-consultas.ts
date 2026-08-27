/**
 * Mede o TEMPO das consultas que as telas lentas fazem — em produção, sem
 * expor credencial a ninguém.
 *
 * SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE/DDL. Roda `EXPLAIN ANALYZE`,
 * que EXECUTA a consulta para medir — mas todas aqui são `SELECT`.
 *
 * ── POR QUE ESTE SCRIPT EXISTE ───────────────────────────────────────────
 * A medição de fora (Railway) diz que a mediana das requisições é ~10 ms e a
 * cauda vai a 30 s, com CPU do banco em zero e 327 MB no disco. Isso descarta
 * falta de índice como causa geral, mas NÃO diz quanto custa cada consulta.
 *
 * Quem tem a credencial é você. Então o script roda aí e imprime só duração,
 * linhas e o plano — nunca a connection string.
 *
 * ── COMO RODAR ───────────────────────────────────────────────────────────
 *   railway run npx tsx scripts/medir-consultas.ts
 *
 * E me mande a saída. Ela não contém credencial: o destino sai mascarado
 * (host e nome do banco, sem usuário nem senha), igual aos outros scripts.
 *
 * ── O QUE ELE MEDE, E POR QUE ESTAS ──────────────────────────────────────
 * As consultas da tela de Saldo & Relacionamento (p90 medido de ~650 ms) e as
 * duas que tocam a maior tabela do banco (`Mensagem`, 82.759 linhas). São as
 * candidatas plausíveis; o resto do tempo, se sobrar, é fila de round-trip e
 * não consulta lenta — e é isso que a soma no fim mostra.
 */

import "dotenv/config";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/** Host e banco, SEM usuário e senha — para a saída poder ser colada. */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

type Medida = { nome: string; ms: number; linhas: number | null; plano: string[] };

const CONSULTAS: { nome: string; sql: string }[] = [
  {
    nome: "clientes: lista da tela (findMany + orderBy)",
    sql: `SELECT * FROM "ClienteBackoffice" ORDER BY "saldoConta" DESC NULLS LAST LIMIT 200`,
  },
  {
    nome: "clientes: contagem de interações por cliente (groupBy)",
    sql: `SELECT "clienteId", count(*) FROM "InteracaoCliente" GROUP BY "clienteId"`,
  },
  {
    nome: "conversas por cliente (índice clienteId+lastMessageAt)",
    sql: `SELECT id, "clienteId", "lastMessageAt" FROM "Conversa"
          WHERE "clienteId" IS NOT NULL ORDER BY "lastMessageAt" DESC LIMIT 500`,
  },
  {
    nome: "mensagens: groupBy por conversa — a MAIOR tabela (82k)",
    sql: `SELECT "conversaId", max("sentAt") FROM "Mensagem" GROUP BY "conversaId"`,
  },
  {
    nome: "config: uma leitura de flag (o que a tela faz 4x, em série)",
    sql: `SELECT value FROM "Config" WHERE key = 'RBAC_ENFORCEMENT'`,
  },
];

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL não está definida.\n" +
        "  Rode assim, da raiz do projeto:  railway run npx tsx scripts/medir-consultas.ts",
    );
    return 2;
  }
  console.log(`Destino: ${descreverDestino(url)}`);
  console.log("(esta saída não contém usuário nem senha — pode colar no chat)\n");

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  // Latência do round-trip, medida antes de tudo. É a régua que separa
  // "consulta lenta" de "muitas consultas rápidas em fila": se cada ida custa
  // 2 ms e a tela faz 11, o piso dela é 22 ms — e o resto é trabalho de fato.
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) await prisma.$queryRaw`SELECT 1`;
  const idaEVolta = (Date.now() - t0) / 10;
  console.log(`Round-trip vazio (média de 10): ${idaEVolta.toFixed(2)} ms\n`);

  const medidas: Medida[] = [];

  for (const c of CONSULTAS) {
    try {
      const saida = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${c.sql}`,
      );
      const linhasPlano = saida.map((l) => Object.values(l)[0]);
      const execucao = linhasPlano.find((l) => l.startsWith("Execution Time:"));
      const ms = execucao ? parseFloat(execucao.replace(/[^\d.]/g, "")) : NaN;

      // "Seq Scan" numa tabela grande é o sintoma clássico de índice faltando.
      // Fica em destaque para não se perder no meio do plano.
      const varreduras = linhasPlano.filter((l) => l.includes("Seq Scan on"));

      medidas.push({
        nome: c.nome,
        ms,
        linhas: null,
        plano: [...varreduras, execucao ?? "(sem Execution Time)"],
      });

      console.log(`${ms.toFixed(2).padStart(9)} ms  ${c.nome}`);
      for (const v of varreduras) console.log(`             ⚠ ${v.trim()}`);
    } catch (e) {
      console.log(`      erro  ${c.nome}`);
      console.log(`             ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  const soma = medidas.reduce((t, m) => t + (Number.isNaN(m.ms) ? 0 : m.ms), 0);
  console.log(`\nSoma das consultas medidas: ${soma.toFixed(2)} ms`);
  console.log(
    `Piso de rede da tela (11 idas × ${idaEVolta.toFixed(2)} ms): ${(11 * idaEVolta).toFixed(2)} ms`,
  );
  console.log(
    "\nSe a soma for pequena e a tela mede ~650 ms, o tempo NÃO está nas consultas —\n" +
      "está na fila de idas ao banco e no que roda entre elas.",
  );

  console.log("\n--- planos completos, para conferência ---");
  for (const m of medidas) {
    console.log(`\n# ${m.nome}`);
    for (const l of m.plano) console.log(`  ${l.trim()}`);
  }

  return 0;
}

main()
  .then((c) => {
    process.exitCode = c;
  })
  .catch((e) => {
    console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}`);
    console.error("(a mensagem acima PODE conter credencial — revise antes de colar)");
    process.exitCode = 2;
  })
  .finally(async () => {
    await clienteAberto?.$disconnect().catch(() => {});
  });
