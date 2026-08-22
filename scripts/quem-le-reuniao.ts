/**
 * Quantas pessoas hoje leem transcrição de reunião fora do escopo delas?
 *
 * SOMENTE LEITURA. Quatro `SELECT` agregados, nenhum INSERT/UPDATE/DELETE/DDL,
 * nenhuma linha de cliente e nenhum trecho de transcrição na saída.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * `/api/meetings` não fazia nenhuma checagem além de "existe sessão": qualquer
 * pessoa logada lia a transcrição inteira de qualquer reunião, enquanto a ficha
 * do mesmo cliente já era gateada pelo RBAC. Antes de fechar o buraco, medir o
 * tamanho dele — "quantos" é o número que decide se isto é urgência ou higiene.
 *
 * ── O QUE "FORA DO ESCOPO" SIGNIFICA AQUI ────────────────────────────────
 * Uma pessoa lê fora do escopo quando ela NÃO veria aquele cliente na ficha
 * (papel restrito) mas vê a reunião dele na caixa de entrada. Isso depende de
 * duas coisas, e as duas são consultadas:
 *
 *   1. a flag `RBAC_ENFORCEMENT` — com ela DESLIGADA ninguém é restrito em
 *      lugar nenhum, e a resposta honesta é "todo mundo vê tudo, em toda
 *      parte"; o vazamento existe, mas não é uma assimetria entre telas;
 *   2. o papel de cada Pessoa — `adminGlobal` ou escopo "todas" enxergam tudo
 *      por desenho.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * Mesmo motivo de `verificar-empresa-vazia.ts`: o cliente Prisma é gerado do
 * schema da BRANCH, e a pergunta é sobre o BANCO.
 *
 * ── CÓDIGOS DE SAÍDA ─────────────────────────────────────────────────────
 *   0  respondeu (mesmo que a resposta seja "ninguém")
 *   2  não sei dizer — sem DATABASE_URL, tabela ausente ou erro de conexão
 *
 * Como rodar:
 *   npx tsx scripts/quem-le-reuniao.ts
 *   DATABASE_URL="postgresql://..." npx tsx scripts/quem-le-reuniao.ts
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

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    return INDETERMINADO;
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const tabela = await prisma.$queryRaw<Array<{ existe: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Meeting'
    ) AS existe
  `;
  if (!tabela[0]?.existe) {
    console.error('\nA tabela "Meeting" não existe neste banco. Confira o destino.');
    return INDETERMINADO;
  }

  // 1. A flag de enforcement. Guardada no Config DB, não em env.
  const flag = await prisma.$queryRaw<Array<{ value: string | null }>>`
    SELECT "value" FROM "Config" WHERE "key" = 'RBAC_ENFORCEMENT' LIMIT 1
  `;
  const valorFlag = flag[0]?.value ?? null;
  const ligada = ["1", "true", "on", "sim", "yes"].includes(
    (valorFlag ?? "").trim().toLowerCase(),
  );

  // 2. Quem tem login e está ativo — é quem consegue abrir a tela.
  const pessoas = await prisma.$queryRaw<
    Array<{ total: bigint; restritas: bigint; irrestritas: bigint }>
  >`
    SELECT
      count(*)                                                       AS total,
      count(*) FILTER (
        WHERE p."papelId" IS NOT NULL
          AND pa."adminGlobal" = false
          AND coalesce(pa."escopoOperacional", 'todas') <> 'todas'
      )                                                              AS restritas,
      count(*) FILTER (
        WHERE p."papelId" IS NULL
           OR pa."adminGlobal" = true
           OR coalesce(pa."escopoOperacional", 'todas') = 'todas'
      )                                                              AS irrestritas
    FROM "Pessoa" p
    LEFT JOIN "Papel" pa ON pa."id" = p."papelId"
    WHERE p."status" = 'ativo'
  `;
  // `?? BigInt(0)` e não `?? 0n`: literal BigInt exige target >= ES2020, e o
  // tsconfig do projeto é anterior. O construtor faz o mesmo e compila.
  const zero = BigInt(0);
  const { total, restritas, irrestritas } = pessoas[0] ?? {
    total: zero,
    restritas: zero,
    irrestritas: zero,
  };

  // 3. O acervo exposto, e quanto dele sequer tem dono declarado.
  const reunioes = await prisma.$queryRaw<
    Array<{ total: bigint; com_transcricao: bigint; sem_vendedor: bigint }>
  >`
    SELECT
      count(*)                                                AS total,
      count(*) FILTER (WHERE "transcription" IS NOT NULL)     AS com_transcricao,
      count(*) FILTER (WHERE "vendedor" IS NULL
                          OR btrim("vendedor") = '')          AS sem_vendedor
    FROM "Meeting"
  `;
  const r = reunioes[0] ?? { total: zero, com_transcricao: zero, sem_vendedor: zero };

  console.log("");
  console.log(`RBAC_ENFORCEMENT: ${valorFlag ?? "(não configurada)"} → ${ligada ? "LIGADA" : "DESLIGADA"}`);
  console.log("");
  console.log(`Pessoas ativas:            ${total}`);
  console.log(`  com escopo restrito:     ${restritas}`);
  console.log(`  que enxergam tudo:       ${irrestritas}  (admin, escopo "todas" ou sem papel)`);
  console.log("");
  console.log(`Reuniões (Meeting):        ${r.total}`);
  console.log(`  com transcrição:         ${r.com_transcricao}`);
  console.log(`  SEM vendedor declarado:  ${r.sem_vendedor}`);
  console.log("");

  if (!ligada) {
    console.log(
      `RESPOSTA: ${total} pessoa(s) ativa(s) leem qualquer transcrição hoje.\n` +
        "Com RBAC_ENFORCEMENT desligada ninguém é restrito em lugar nenhum — nem na\n" +
        "ficha, nem aqui. O gate novo não muda nada até a flag ser ligada; o que ele\n" +
        "muda é que, quando ela for, a caixa de entrada deixa de ser a exceção.",
    );
  } else {
    console.log(
      `RESPOSTA: ${restritas} pessoa(s) com escopo restrito leem hoje reunião fora dele.\n` +
        "São pessoas que a ficha do cliente já barra e que a caixa de entrada não barrava.",
    );
  }

  if (r.sem_vendedor > zero) {
    console.log(
      `\nATENÇÃO: ${r.sem_vendedor} reunião(ões) sem vendedor declarado. Com o gate ligado\n` +
        "elas somem da lista de quem tem escopo restrito (não há como afirmar de quem são)\n" +
        "e continuam visíveis para quem enxerga tudo.",
    );
  }

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
