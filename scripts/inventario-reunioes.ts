/**
 * Onde estão, de fato, as reuniões do Plaud? E como está a `Empresa` hoje?
 *
 * SOMENTE LEITURA. Contagens agregadas e `information_schema`. Nenhum
 * INSERT/UPDATE/DELETE/DDL. NENHUM texto de transcrição, nome de cliente ou
 * conteúdo de reunião sai na saída — só nomes de tabela e números.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * A tabela `Meeting` está VAZIA em produção (medido em 16/08/2026), e ao mesmo
 * tempo existem 192 reuniões e 133 clientes catalogados via Plaud. As duas
 * coisas não podem ser verdade no mesmo lugar: ou o dado entrou por outro
 * caminho, ou não está neste banco. Adivinhar qual das duas foi o que produziu
 * a premissa errada da #301; este script pergunta.
 *
 * Responde quatro coisas de uma vez, para gastar uma execução só:
 *
 *   1. `Empresa` — a coluna `tipo` existe? as 6 linhas estão classificadas?
 *      `imobiliaria` virou "Onix Imob"? (estado da #301 em produção — a PR
 *      foi fundida em 17/08 06:17 UTC, então esta consulta agora serve de
 *      CONFERÊNCIA do que a migration fez, não de pré-checagem)
 *   2. CENSO — contagem de linhas de TODAS as tabelas, em ordem decrescente.
 *      É a rede de arrasto: onde quer que as 192 reuniões estejam, elas
 *      aparecem como uma tabela com ~192 linhas.
 *   3. As tabelas candidatas a guardar reunião, uma a uma.
 *   4. Sinais de que o webhook do Zapier já foi chamado alguma vez.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * Mesmo motivo de `verificar-empresa-vazia.ts`: o cliente Prisma é gerado do
 * schema da BRANCH, e a pergunta é sobre o BANCO — que pode estar antes ou
 * depois da migration da #301.
 *
 * ── CÓDIGOS DE SAÍDA ─────────────────────────────────────────────────────
 *   0  respondeu
 *   2  não sei dizer — sem DATABASE_URL ou erro de conexão
 */

import "dotenv/config";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

const OK = 0;
const INDETERMINADO = 2;

function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

type Prisma = {
  $queryRaw<T>(q: TemplateStringsArray, ...v: unknown[]): Promise<T>;
  $queryRawUnsafe<T>(q: string): Promise<T>;
  $disconnect(): Promise<void>;
};

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    return INDETERMINADO;
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const mod = await import("../src/lib/prisma");
  const prisma = mod.prisma as unknown as Prisma;
  clienteAberto = prisma;

  /* ── 1. Estado da Empresa (a pergunta da #301) ───────────────────────── */
  console.log("\n══ 1. EMPRESA — estado da #301 em produção ══");

  const colTipo = await prisma.$queryRaw<Array<{ existe: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Empresa' AND column_name = 'tipo'
    ) AS existe
  `;
  const temTipo = colTipo[0]?.existe === true;
  console.log(`Coluna "tipo": ${temTipo ? "EXISTE" : "NÃO existe"}`);

  const linhas = temTipo
    ? await prisma.$queryRawUnsafe<
        Array<{ id: string; nome: string; parentId: string | null; tipo: string | null }>
      >(
        `SELECT "id", "nome", "parentId", "tipo"::text AS tipo FROM "Empresa" ORDER BY "id"`,
      )
    : await prisma.$queryRawUnsafe<
        Array<{ id: string; nome: string; parentId: string | null; tipo: string | null }>
      >(`SELECT "id", "nome", "parentId", NULL::text AS tipo FROM "Empresa" ORDER BY "id"`);

  console.log(`Linhas em "Empresa": ${linhas.length}`);
  for (const l of linhas) {
    const pai = l.parentId ?? "(raiz)";
    const tipo = l.tipo ?? "(sem tipo)";
    console.log(`  ${l.id.padEnd(24)} pai=${pai.padEnd(18)} ${tipo.padEnd(14)} ${l.nome}`);
  }

  /* ── 2. Censo de TODAS as tabelas ────────────────────────────────────── */
  console.log("\n══ 2. CENSO — linhas por tabela (só as não-vazias) ══");

  const tabelas = await prisma.$queryRaw<Array<{ nome: string }>>`
    SELECT table_name AS nome
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `;

  const censo: Array<{ nome: string; linhas: number }> = [];
  for (const t of tabelas) {
    // Nome vem do catálogo do próprio Postgres, não de entrada do usuário; ainda
    // assim, aspas duplicadas antes de interpolar.
    const seguro = t.nome.replace(/"/g, '""');
    try {
      const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM "${seguro}"`,
      );
      censo.push({ nome: t.nome, linhas: Number(r[0]?.n ?? 0) });
    } catch {
      censo.push({ nome: t.nome, linhas: -1 }); // -1 = não consegui contar
    }
  }

  censo.sort((a, b) => b.linhas - a.linhas);
  const naoVazias = censo.filter((c) => c.linhas !== 0);
  console.log(`Tabelas: ${censo.length} · com linhas: ${naoVazias.length} · vazias: ${censo.length - naoVazias.length}`);
  for (const c of naoVazias) {
    console.log(`  ${String(c.linhas).padStart(8)}  ${c.nome}`);
  }

  /* ── 3. As candidatas a guardar reunião ──────────────────────────────── */
  console.log("\n══ 3. CANDIDATAS a guardar reunião do Plaud ══");
  const CANDIDATAS = [
    "Meeting",
    "ReuniaoCliente",
    "ReuniaoEstruturada",
    "ReuniaoImport",
    "ReuniaoTime",
    "InteracaoCliente",
    "ClienteFato",
    "ClienteBackoffice",
  ];
  for (const nome of CANDIDATAS) {
    const achou = censo.find((c) => c.nome === nome);
    console.log(
      `  ${nome.padEnd(20)} ${achou ? String(achou.linhas).padStart(8) : "   (tabela não existe)"}`,
    );
  }

  // Fontes declaradas, onde o modelo tiver a coluna. Diz por QUAL caminho o
  // dado entrou — que é a pergunta por trás de "o Zapier já foi chamado?".
  for (const [tabela, coluna] of [
    ["Meeting", "source"],
    ["ReuniaoCliente", "fonte"],
    ["ReuniaoImport", "fonte"],
  ] as const) {
    const temCol = await prisma.$queryRawUnsafe<Array<{ existe: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='${tabela}' AND column_name='${coluna}') AS existe`,
    );
    if (temCol[0]?.existe !== true) continue;
    const porFonte = await prisma.$queryRawUnsafe<Array<{ v: string | null; n: bigint }>>(
      `SELECT "${coluna}"::text AS v, count(*) AS n FROM "${tabela}" GROUP BY 1 ORDER BY 2 DESC`,
    );
    if (porFonte.length === 0) {
      console.log(`  ${tabela}.${coluna}: (tabela vazia)`);
      continue;
    }
    console.log(`  ${tabela}.${coluna}:`);
    for (const f of porFonte) console.log(`      ${String(f.n).padStart(6)}  ${f.v ?? "(null)"}`);
  }

  /* ── 4. O webhook do Zapier já foi chamado? ──────────────────────────── */
  console.log("\n══ 4. SINAIS do webhook do Zapier ══");
  console.log("A rota só escreve em `Meeting` e não registra chamada recusada.");
  console.log("Então a única evidência possível no banco é linha com source='plaud':");
  const plaud = censo.find((c) => c.nome === "Meeting");
  console.log(
    plaud && plaud.linhas > 0
      ? `  Meeting tem ${plaud.linhas} linha(s) — ver a quebra por source acima.`
      : "  Meeting está VAZIA — nenhuma chamada bem-sucedida jamais gravou nada.",
  );
  console.log(
    "  ATENÇÃO: ausência de linha NÃO distingue 'ninguém chamou' de 'chamou e\n" +
      "  falhou'. A rota não tem log de recebimento — é exatamente a lacuna da\n" +
      "  sugestão 'Provar que o cano tem água'.",
  );

  return OK;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error("\nErro ao consultar o banco:", erro instanceof Error ? erro.message : erro);
    process.exit(INDETERMINADO);
  })
  .finally(() => {
    void clienteAberto?.$disconnect();
  });
