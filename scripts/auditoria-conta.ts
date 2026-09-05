/**
 * Auditoria de contas do Cockpit — SOMENTE LEITURA.
 *
 * Responde, com número em vez de estrutura, quatro perguntas sobre a conta de
 * suporte cuja senha ficou num repositório público de maio a agosto de 2026:
 *
 *   1. a conta existe em produção, e com que papel?
 *   2. quando foi o último login?
 *   3. ela é dona de algum dado que quebraria ou ficaria órfão?
 *   4. quantas contas existem no total, e há alguma que o Eduardo não conhece?
 *
 * ── POR QUE UM SCRIPT, E NÃO "roda um SELECT aí" ────────────────────────
 * As sessões de agente não alcançam o banco de produção (`CONNECT 403`).
 * Mesmo motivo e mesmo molde do `promover-master`: o passo que ninguém
 * consegue executar é o passo que fica para depois.
 *
 * ── SÓ LEITURA, POR CONSTRUÇÃO ──────────────────────────────────────────
 * Não existe `--aplicar` aqui. Diferente do `promover-master`, este script
 * NÃO TEM caminho de escrita nenhum: só `$queryRaw`/`$queryRawUnsafe` com
 * `SELECT` e `count(*)`. `scripts/auditoria-conta.test.ts` quebra o `npm test`
 * se um `UPDATE`, `INSERT`, `DELETE` ou `$executeRaw` aparecer neste arquivo.
 *
 * ── NUNCA IMPRIME SEGREDO, NEM DADO PESSOAL INTEIRO ─────────────────────
 * O campo `password` não é selecionado em consulta nenhuma — nem para
 * descartar depois; ele simplesmente não sai do banco.
 *
 * E-mail e CPF saem MASCARADOS. O motivo é concreto: este repositório é
 * PÚBLICO, o resumo do job do Actions também é, e o Eduardo pediu para
 * reconhecer contas estranhas — não para publicar a lista de quem tem acesso.
 * Mascarado ele reconhece o que é dele; quem passa os olhos de fora, não.
 *
 * ── USO ─────────────────────────────────────────────────────────────────
 *   DATABASE_URL=... npx tsx scripts/auditoria-conta.ts
 *   DATABASE_URL=... npx tsx scripts/auditoria-conta.ts --email=alguem@dominio
 *
 * Sem `--email`, audita a conta de suporte do seed. O e-mail é INPUT, nunca
 * constante — pelo mesmo motivo do `promover-master`.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const OK = 0;
const ERRO = 1;

/** Alvo padrão: a conta que o seed cria com papel de suporte. */
const EMAIL_PADRAO = "suporte@onixcapital.com.br";

/**
 * As 22 relações que apontam para `User`, extraídas do `schema.prisma`.
 *
 * Lista LITERAL, de propósito: os nomes vão para `$queryRawUnsafe` (não dá
 * para parametrizar identificador em SQL), então nenhum deles pode vir de
 * `argv` nem do ambiente. O teste trava isso.
 *
 * `cascata` diz o que aconteceria num DELETE do usuário — é a informação que
 * decide entre desativar e apagar, e por isso vem junto da contagem.
 */
const RELACOES: ReadonlyArray<{ tabela: string; coluna: string; cascata: boolean }> = [
  { tabela: "AcaoPainel", coluna: "userId", cascata: true },
  { tabela: "ContratoAcessoLog", coluna: "usuarioId", cascata: false },
  { tabela: "ContratoArquivo", coluna: "uploadedById", cascata: false },
  { tabela: "ContratoExtracao", coluna: "revisadoPorId", cascata: false },
  { tabela: "EmpresaBootstrapLog", coluna: "usuarioId", cascata: false },
  { tabela: "Implementacao", coluna: "userId", cascata: true },
  { tabela: "Lead", coluna: "assignedToId", cascata: false },
  { tabela: "PainelCacheExterno", coluna: "userId", cascata: true },
  { tabela: "PainelEmailAI", coluna: "userId", cascata: true },
  { tabela: "PainelPrioridade", coluna: "userId", cascata: true },
  { tabela: "PainelRetrospectiva", coluna: "userId", cascata: true },
  { tabela: "PainelSugestao", coluna: "userId", cascata: true },
  { tabela: "Pessoa", coluna: "userId", cascata: false },
  { tabela: "Post", coluna: "authorId", cascata: false },
  { tabela: "ReuniaoCliente", coluna: "userId", cascata: true },
  { tabela: "Script", coluna: "authorId", cascata: false },
  { tabela: "SugestaoRiceLog", coluna: "usuarioId", cascata: false },
  { tabela: "SyncRequest", coluna: "userId", cascata: true },
  { tabela: "Task", coluna: "assigneeId", cascata: false },
  { tabela: "UserGoogleAuth", coluna: "userId", cascata: true },
  { tabela: "UserMicrosoftAuth", coluna: "userId", cascata: true },
  { tabela: "UsuarioPermissao", coluna: "userId", cascata: true },
];

/** `eduardo@onixcapital.com.br` → `edu…@onixcapital.com.br`. */
function mascararEmail(email: string): string {
  const [local, dominio] = email.split("@");
  if (!dominio) return "«e-mail malformado»";
  const visivel = local.slice(0, 3);
  return `${visivel}${local.length > 3 ? "…" : ""}@${dominio}`;
}

/** `01536247529` → `015…29`. Suficiente para reconhecer, insuficiente para usar. */
function mascararCpf(cpf: string): string {
  if (cpf.length < 5) return "«cpf curto»";
  return `${cpf.slice(0, 3)}…${cpf.slice(-2)}`;
}

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--email="));
  const emailAlvo = (flag ? flag.slice("--email=".length) : EMAIL_PADRAO).trim();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não setada.");
    return ERRO;
  }
  if (!emailAlvo) {
    console.error("--email veio vazio.");
    return ERRO;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("AUDITORIA DE CONTA — somente leitura, nenhuma escrita.\n");
    console.log(`  alvo                       ${mascararEmail(emailAlvo)}`);

    /* ── 1. A CONTA EXISTE? ───────────────────────────────────────────── */

    // `password` NÃO entra no SELECT. Nem para descartar depois.
    const candidatos = await prisma.$queryRaw<
      Array<{ id: string; role: string; email: string; cpf: string; name: string; createdAt: Date; updatedAt: Date }>
    >`
      SELECT "id", "role", "email", "cpf", "name", "createdAt", "updatedAt"
      FROM "User" WHERE lower("email") = lower(${emailAlvo})
    `;

    console.log("\n── 1. A CONTA ──");
    if (candidatos.length === 0) {
      console.log("  NÃO EXISTE no banco. Nada a desativar, nada a rotacionar.");
      console.log("  (o seed nunca rodou contra este banco, ou a linha já saiu)");
    } else if (candidatos.length > 1) {
      console.log(`  ATENÇÃO: ${candidatos.length} linhas com este e-mail.`);
      console.log("  O schema declara `email @unique` — se isto imprimir >1, o banco");
      console.log("  divergiu do schema, e isso é mais grave que a conta em si.");
    }

    const alvo = candidatos.length === 1 ? candidatos[0]! : null;
    if (alvo) {
      console.log(`  existe                     sim`);
      console.log(`  nome                       ${alvo.name}`);
      console.log(`  papel                      ${alvo.role}`);
      console.log(`  cpf                        ${mascararCpf(alvo.cpf)}`);
      console.log(`  criada em                  ${iso(alvo.createdAt)}`);
      console.log(`  alterada em                ${iso(alvo.updatedAt)}`);
      console.log("");
      console.log("  Leia `alterada em` com cuidado: ela muda a QUALQUER escrita na");
      console.log("  linha — troca de senha, mudança de papel, edição de nome. Não é");
      console.log("  sinal de uso da conta, e não deve ser lida como tal.");
    }

    /* ── 2. ÚLTIMO LOGIN ──────────────────────────────────────────────── */

    console.log("\n── 2. ÚLTIMO LOGIN ──");
    console.log("  NÃO EXISTE REGISTRO. Não é 'não achei' — é 'não há onde achar'.");
    console.log("");
    console.log("  A tabela `User` não tem coluna de último acesso, não existe");
    console.log("  tabela de sessão, e o login não grava nada: a sessão é um JWT");
    console.log("  em cookie (`src/lib/session.ts`). Nenhuma consulta responderia");
    console.log("  esta pergunta, com ou sem este script.");
    console.log("");
    console.log("  Consequência: se alguém usou esta conta com a senha que ficou");
    console.log("  pública, não há como descobrir — nem agora, nem depois.");

    /* ── 3. DO QUE ELA É DONA ─────────────────────────────────────────── */

    console.log("\n── 3. DADOS DA CONTA ──");
    if (!alvo) {
      console.log("  (pulado: a conta não existe)");
    } else {
      let total = 0;
      let totalCascata = 0;
      const comLinhas: Array<{ tabela: string; n: number; cascata: boolean }> = [];

      for (const rel of RELACOES) {
        // Identificador não é parametrizável em SQL. Os nomes vêm da constante
        // LITERAL acima — nunca de argv nem do ambiente. O valor comparado, sim,
        // é parâmetro ($1).
        const [linha] = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
          `SELECT count(*) AS total FROM "${rel.tabela}" WHERE "${rel.coluna}" = $1`,
          alvo.id,
        );
        const n = Number(linha?.total ?? 0);
        total += n;
        if (rel.cascata) totalCascata += n;
        if (n > 0) comLinhas.push({ tabela: rel.tabela, n, cascata: rel.cascata });
      }

      console.log(`  relações conferidas        ${RELACOES.length}`);
      console.log(`  linhas no total            ${total}`);
      console.log(`  dessas, em CASCATA         ${totalCascata}  ← sumiriam num DELETE`);

      if (comLinhas.length === 0) {
        console.log("\n  NADA DEPENDE DELA no banco. Nenhuma das 22 relações tem linha.");
      } else {
        console.log("\n  onde há linha:");
        for (const c of comLinhas.sort((a, b) => b.n - a.n)) {
          const marca = c.cascata ? "CASCATA — some no DELETE" : "restrict — barra o DELETE";
          console.log(`    ${String(c.n).padStart(6)}  ${c.tabela.padEnd(24)} ${marca}`);
        }
      }
      console.log("");
      console.log("  Isto NÃO é recomendação de apagar. Apagar é a única opção sem");
      console.log("  volta, e as linhas em cascata somem sem aviso.");
    }

    /* ── 4. O CENSO DE CONTAS ─────────────────────────────────────────── */

    console.log("\n── 4. TODAS AS CONTAS ──");
    const usuarios = await prisma.$queryRaw<
      Array<{ role: string; email: string; cpf: string; name: string; createdAt: Date }>
    >`
      SELECT "role", "email", "cpf", "name", "createdAt"
      FROM "User" ORDER BY "createdAt" ASC
    `;

    console.log(`  total de contas            ${usuarios.length}`);
    const porPapel = new Map<string, number>();
    for (const u of usuarios) porPapel.set(u.role, (porPapel.get(u.role) ?? 0) + 1);
    for (const [papel, n] of [...porPapel].sort()) {
      console.log(`    ${papel.padEnd(24)} ${n}`);
    }

    console.log("\n  criada em          papel      nome / e-mail (mascarado)");
    for (const u of usuarios) {
      console.log(
        `  ${iso(u.createdAt).padEnd(18)} ${u.role.padEnd(10)} ${u.name} · ${mascararEmail(u.email)} · ${mascararCpf(u.cpf)}`,
      );
    }
    console.log("");
    console.log("  E-mail e CPF saem mascarados de propósito: este repositório é");
    console.log("  público e o resumo do job também. Dá para reconhecer quem é seu;");
    console.log("  não dá para usar a lista.");

    console.log("\nFIM. Nenhuma linha foi escrita.");
    return OK;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(ERRO);
  });
