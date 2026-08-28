/**
 * Quem veria o quê na sidebar filtrada — medido no banco, antes de filtrar.
 *
 * SOMENTE LEITURA. `SELECT` agregados, nenhum INSERT/UPDATE/DELETE/DDL, e
 * NENHUM nome de pessoa na saída: só contagens por papel.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * A sidebar filtrada tem duas réguas: uma por CARGO (`Pessoa.teamRole`) e uma
 * por NÓ do organograma (`PessoaEmpresa`). As duas dependem de dado que só
 * existe em produção, e as duas mudam o que a régua SIGNIFICA:
 *
 *   • se ninguém tem `teamRole = 'lideranca'`, a regra "admin + líder" é a
 *     mesma coisa que "admin" — e prometer duas faixas onde só existe uma é
 *     desenhar uma tela para um mundo que não é este;
 *   • se `PessoaEmpresa` está vazia, o filtro por nó não recorta NADA: todo
 *     mundo vê todos os itens que dependem dele, exatamente como hoje. A tela
 *     "funciona" e não se distingue da atual — o que é fácil confundir com
 *     "não implementei".
 *
 * Medir antes é o que impede as duas confusões.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * Mesmo motivo de `quem-le-reuniao.ts`: o cliente Prisma é gerado do schema da
 * BRANCH, e a pergunta é sobre o BANCO.
 *
 * ── CÓDIGOS DE SAÍDA ─────────────────────────────────────────────────────
 *   0  respondeu (mesmo que a resposta seja "ninguém")
 *   2  não sei dizer — sem DATABASE_URL, tabela ausente ou erro de conexão
 *
 * Como rodar:
 *   npx tsx scripts/quem-ve-a-sidebar.ts
 *   DATABASE_URL="postgresql://..." npx tsx scripts/quem-ve-a-sidebar.ts
 */

import "dotenv/config";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

const OK = 0;
const INDETERMINADO = 2;

/** Host de destino SEM credencial — a URL do Postgres carrega usuário e senha. */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

const zero = BigInt(0);

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    return INDETERMINADO;
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const tabelas = await prisma.$queryRaw<Array<{ nome: string }>>`
    SELECT table_name AS nome
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('Pessoa', 'PessoaEmpresa', 'Empresa', 'User')
  `;
  const presentes = new Set(tabelas.map((t) => t.nome));
  for (const obrigatoria of ["Pessoa", "PessoaEmpresa", "Empresa"]) {
    if (!presentes.has(obrigatoria)) {
      console.error(`\nA tabela "${obrigatoria}" não existe neste banco. Confira o destino.`);
      return INDETERMINADO;
    }
  }

  /* ── 1. CARGO — a régua que não depende do organograma ────────────────── */

  const porCargo = await prisma.$queryRaw<Array<{ team_role: string; total: bigint }>>`
    SELECT coalesce("teamRole", '(nulo)') AS team_role, count(*) AS total
    FROM "Pessoa"
    WHERE "status" = 'ativo'
    GROUP BY 1
    ORDER BY 2 DESC, 1
  `;

  console.log("\n── CARGO (Pessoa.teamRole, só quem está ativo) ──");
  if (porCargo.length === 0) {
    console.log("  (nenhuma Pessoa ativa)");
  }
  for (const linha of porCargo) {
    console.log(`  ${linha.team_role.padEnd(14)} ${String(linha.total).padStart(4)}`);
  }

  const lideranca = porCargo.find((l) => l.team_role === "lideranca")?.total ?? zero;
  const admins = porCargo.find((l) => l.team_role === "admin")?.total ?? zero;
  console.log(
    lideranca === zero
      ? `\n  ⚠ NINGUÉM com teamRole 'lideranca'. Hoje "admin + líder" recorta exatamente\n` +
          `    o mesmo conjunto que "admin" (${admins}) — a faixa existe no schema e está vazia\n` +
          "    no dado. Time e Insights do Time apareceriam só para admin."
      : `\n  ✓ ${lideranca} pessoa(s) em 'lideranca': a faixa "admin + líder" recorta um\n` +
          `    conjunto MAIOR que "admin" (${admins}).`,
  );

  /* ── 2. NÓ — a régua que depende do organograma ───────────────────────── */

  const concessoes = await prisma.$queryRaw<Array<{ total: bigint; pessoas: bigint }>>`
    SELECT count(*) AS total, count(DISTINCT "pessoaId") AS pessoas
    FROM "PessoaEmpresa"
  `;
  const { total: totalConc, pessoas: pessoasComConc } = concessoes[0] ?? {
    total: zero,
    pessoas: zero,
  };

  const nos = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT count(*) AS total FROM "Empresa"
  `;
  const totalNos = nos[0]?.total ?? zero;

  console.log("\n── NÓ (PessoaEmpresa × Empresa) ──");
  console.log(`  nós cadastrados      ${String(totalNos).padStart(4)}`);
  console.log(`  concessões           ${String(totalConc).padStart(4)}`);
  console.log(`  pessoas com alguma   ${String(pessoasComConc).padStart(4)}`);

  if (totalConc === zero) {
    console.log(
      "\n  ⚠ NENHUMA concessão. Sem linha em PessoaEmpresa ninguém é restrito\n" +
        "    (acesso-core.ts: sem concessão ⇒ null ⇒ vê tudo). O filtro por nó\n" +
        "    da sidebar NÃO recorta nada hoje: Jurídico, Importar Jurídico,\n" +
        "    Parceiros e Mídias Sociais continuam visíveis para todo mundo,\n" +
        "    exatamente como na sidebar atual. Isso é o comportamento CORRETO\n" +
        "    do estado vazio — não é filtro que deixou de funcionar.",
    );
  } else {
    const porNo = await prisma.$queryRaw<Array<{ empresa_id: string; pessoas: bigint }>>`
      SELECT pe."empresaId" AS empresa_id, count(DISTINCT pe."pessoaId") AS pessoas
      FROM "PessoaEmpresa" pe
      WHERE pe."empresaId" IN (
        'onix-co-juridico', 'corretora-juridico', 'investimentos-juridico',
        'imobiliaria-juridico', 'educacao-juridico', 'contabil-juridico',
        'tech-juridico', 'investimentos', 'onix-co-marketing'
      )
      GROUP BY 1
      ORDER BY 1
    `;
    console.log("\n  Nós que a sidebar consulta:");
    if (porNo.length === 0) console.log("    (nenhum deles concedido a ninguém)");
    for (const linha of porNo) {
      console.log(`    ${linha.empresa_id.padEnd(26)} ${String(linha.pessoas).padStart(3)} pessoa(s)`);
    }
  }

  /* ── 3. Quem consegue abrir a tela ────────────────────────────────────── */

  const semPessoa = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT count(*) AS total
    FROM "User" u
    LEFT JOIN "Pessoa" p ON p."userId" = u."id"
    WHERE p."id" IS NULL
  `;
  const usuariosSemPessoa = semPessoa[0]?.total ?? zero;
  console.log("\n── LOGIN SEM PESSOA ──");
  console.log(`  usuários sem Pessoa vinculada  ${String(usuariosSemPessoa).padStart(4)}`);
  if (usuariosSemPessoa > zero) {
    console.log(
      "    Estes não têm teamRole NEM concessão. A sidebar precisa decidir o que\n" +
        "    mostrar para eles — e o default seguro é o mínimo comum (GERAL).",
    );
  }

  return OK;
}

main()
  .then(async (codigo) => {
    await clienteAberto?.$disconnect().catch(() => {});
    process.exit(codigo);
  })
  .catch(async (erro) => {
    console.error("\nErro ao consultar:", erro instanceof Error ? erro.message : erro);
    await clienteAberto?.$disconnect().catch(() => {});
    process.exit(INDETERMINADO);
  });
