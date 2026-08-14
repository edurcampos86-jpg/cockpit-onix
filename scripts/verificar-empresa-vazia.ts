/**
 * Pré-checagem de tier vermelho: a tabela `Empresa` está VAZIA?
 *
 * SOMENTE LEITURA. Três `SELECT`, nenhum INSERT/UPDATE/DELETE/DDL. Rodar dez
 * vezes seguidas não muda nada no banco — é seguro apontar para produção.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * A migration `20260810181603_empresa_tipo_e_transversal` acrescenta
 * `Empresa.tipo` como `NOT NULL` SEM DEFAULT. O Postgres rejeita isso em
 * tabela não-vazia, o que é o guard desejado: o papel de cada nó (holding,
 * empresa, departamento) é decisão, e um DEFAULT faria toda linha
 * preexistente nascer com um papel que ninguém escolheu.
 *
 * O guard funciona, mas descobre tarde: a falha aparece no meio do
 * `migrate deploy`, com o deploy já em curso. Este script antecipa a mesma
 * resposta ANTES de autorizar o merge, e transforma uma conferência manual
 * ("roda um SELECT count(*) no banco de produção") em algo que qualquer
 * sessão futura executa por prompt.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * `prisma.empresa.count()` seria mais curto e está ERRADO para este uso: o
 * cliente é gerado a partir do `schema.prisma` da BRANCH ATUAL, então o
 * script deixaria de rodar (ou passaria a mentir) conforme a branch em que
 * está. A pergunta é sobre o BANCO, não sobre o schema — e o banco pode estar
 * antes ou depois da migration. `information_schema` + `count(*)` respondem
 * igual nos dois estados.
 *
 * ── CÓDIGOS DE SAÍDA ─────────────────────────────────────────────────────
 *   0  vazia          → a migration de tier vermelho pode ser aplicada
 *   1  TEM LINHAS     → PARE; decida o `tipo` de cada linha antes
 *   2  não sei dizer  → sem DATABASE_URL, tabela ausente, ou erro de conexão
 *
 * O 2 é separado do 1 de propósito. Os dois são não-zero (encadear com `&&`
 * continua seguro), mas "não consegui perguntar" não é "está sujo": tratar os
 * dois como o mesmo faria uma falha de rede parecer um achado.
 *
 * Como rodar:
 *   npx tsx scripts/verificar-empresa-vazia.ts
 *
 *   # apontando para outro banco, sem tocar no .env:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/verificar-empresa-vazia.ts
 *
 *   # no Railway, sem copiar credencial para lugar nenhum:
 *   railway run npx tsx scripts/verificar-empresa-vazia.ts
 */

/*
 * Só `dotenv/config` é import estático. O cliente entra por import DINÂMICO
 * dentro de main(), depois do guard de DATABASE_URL: `src/lib/prisma.ts:10`
 * constrói o PrismaClient no momento do import usando `process.env.DATABASE_URL!`,
 * então um import estático faria a falta da variável estourar como erro do
 * driver antes da nossa mensagem. Mesmo padrão de `scripts/seed-empresas.ts`.
 */
import "dotenv/config";

/** Só o contrato de desconexão, para o `finally` não exigir import do tipo. */
let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

const VAZIA = 0;
const TEM_LINHAS = 1;
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

type LinhaEmpresa = {
  id: string;
  nome: string;
  parentId: string | null;
  tipo: string | null;
};

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL não está definida.\n" +
        "  • local:   rode a partir da raiz do projeto, com o .env carregado\n" +
        "  • Railway: railway run npx tsx scripts/verificar-empresa-vazia.ts",
    );
    return INDETERMINADO;
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  // 1. A tabela existe? Perguntar antes evita confundir "banco novo, migration
  //    nunca rodou" com "erro de conexão" — são diagnósticos diferentes.
  const tabela = await prisma.$queryRaw<Array<{ existe: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Empresa'
    ) AS existe
  `;
  if (!tabela[0]?.existe) {
    console.error(
      '\nA tabela "Empresa" não existe neste banco. A cadeia de migrations não foi\n' +
        "aplicada aqui — confira o destino antes de concluir qualquer coisa.",
    );
    return INDETERMINADO;
  }

  // 2. A coluna `tipo` já existe? Diz, sem ambiguidade, se a migration de tier
  //    vermelho JÁ foi aplicada neste banco. Sem isso, "0 linhas" antes e
  //    depois da migration são a mesma saída, e quem lê não sabe em que estado
  //    está olhando.
  const coluna = await prisma.$queryRaw<Array<{ existe: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Empresa' AND column_name = 'tipo'
    ) AS existe
  `;
  const migrationAplicada = coluna[0]?.existe === true;

  // 3. A contagem. `::int` porque `count(*)` é bigint no Postgres e chegaria
  //    como BigInt no JS — que não serializa e não compara com número.
  const contagem = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT count(*)::int AS total FROM "Empresa"
  `;
  const total = contagem[0]?.total ?? 0;

  console.log(`Coluna "tipo":     ${migrationAplicada ? "JÁ existe" : "ainda não existe"}`);
  console.log(`Linhas em Empresa: ${total}`);

  if (total === 0) {
    console.log(
      migrationAplicada
        ? '\nVAZIA. A migration já está aplicada aqui e "Empresa" segue sem linhas —\n' +
            "falta rodar `npx tsx scripts/seed-empresas.ts`."
        : "\nVAZIA. A migration de tier vermelho pode ser aplicada: o `ADD COLUMN tipo\n" +
            "NOT NULL` sem default não tem linha para rejeitar.",
    );
    return VAZIA;
  }

  // Com linhas, o que importa não é o número: é QUAIS, para decidir o `tipo` de
  // cada uma antes.
  //
  // `to_jsonb(e) ->> 'tipo'` em vez de `e."tipo"`: a coluna pode não existir
  // ainda, e referenciá-la direto faria a consulta estourar com 42703 no banco
  // pré-migration — justamente o estado que este script precisa saber ler.
  // Sobre jsonb, chave ausente devolve NULL, então a MESMA consulta serve aos
  // dois estados.
  const linhas = await prisma.$queryRaw<LinhaEmpresa[]>`
    SELECT
      e."id",
      e."nome",
      e."parentId",
      to_jsonb(e) ->> 'tipo' AS "tipo"
    FROM "Empresa" e
    ORDER BY e."parentId" NULLS FIRST, e."id"
  `;

  const cabecalho = migrationAplicada
    ? `\nNÃO está vazia — "Empresa" tem ${total} linha(s):\n`
    : `\nPARE — "Empresa" tem ${total} linha(s):\n`;
  console.error(cabecalho);
  for (const l of linhas) {
    const papel = l.tipo ? `tipo=${l.tipo}` : "sem tipo";
    console.error(
      `  ${l.id.padEnd(24)} pai=${(l.parentId ?? "(raiz)").padEnd(16)} ${papel.padEnd(20)} ${l.nome}`,
    );
  }

  // A mesma contagem quer dizer coisas opostas conforme a coluna existir ou
  // não, e é por isso que a mensagem se divide. Com a migration JÁ aplicada,
  // 20 linhas é o estado desejado — dizer "PARE, a migration falharia" ali
  // seria alarme falso sobre algo que não pode mais acontecer.
  console.error(
    migrationAplicada
      ? "\nA migration de tier vermelho JÁ está aplicada aqui, então estas linhas não\n" +
          "bloqueiam nada — este é o estado esperado depois do seed. O código 1 diz\n" +
          '"não está vazia", que é a pergunta que este script responde.'
      : "\nA migration `20260810181603_empresa_tipo_e_transversal` FALHARIA aqui\n" +
          '(23502: column "tipo" contains null values), e é assim que ela foi\n' +
          "projetada. O conserto não é dar um DEFAULT: é decidir o papel (holding,\n" +
          "empresa ou departamento) de cada linha acima e gravá-lo num UPDATE\n" +
          "conferido à mão ANTES de aplicar.",
  );
  return TEM_LINHAS;
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((e) => {
    // A mensagem do driver pode conter a connection string, logo credencial.
    // Aqui é terminal do operador (não resposta de API), então ela aparece —
    // mas o aviso vai junto, para ninguém colar isto num chat sem olhar.
    console.error(`\nERRO ao consultar: ${e instanceof Error ? e.message : String(e)}`);
    console.error("(a mensagem acima pode conter credencial — não cole sem revisar)");
    process.exitCode = INDETERMINADO;
  })
  .finally(async () => {
    // null quando a falha foi antes do import dinâmico (ex.: DATABASE_URL ausente).
    await clienteAberto?.$disconnect().catch(() => {});
  });
