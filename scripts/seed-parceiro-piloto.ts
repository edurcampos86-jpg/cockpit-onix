/**
 * Piloto de UM parceiro real, ponta a ponta — Michel.
 *
 * Cria a primeira linha de cada tabela da Fase 1 de Parceiros e prova que o
 * modelo aguenta o caso concreto ANTES de existir UI:
 *
 *     Parceiro  →  AcordoComercialParceiro  →  ParceiroCliente
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────
 * Cinco tabelas estão em produção desde a Fase 1 e todas estão VAZIAS. As
 * garantias foram provadas em shadow-DB com dado sintético; o que ainda não
 * foi provado é que a modelagem serve ao caso real — que o Michel cabe em
 * `Parceiro` sem campo faltando, que 20% em assessoria cabe em
 * `AcordoComercialParceiro`, e que o cliente dele entra por `ParceiroCliente`
 * sem esbarrar na exclusividade da #310.
 *
 * Estrutura sem uso não recebe correção da realidade. Este script é o menor
 * uso possível.
 *
 * ── DRY-RUN É O PADRÃO ───────────────────────────────────────────────────
 * Sem `--aplicar`, NADA é escrito: o script lê, resolve o cliente, monta o
 * plano e imprime o que faria. É o mesmo desenho de
 * `scripts/ensaio-backfill-pessoa-grupo.ts` e do backfill da #299 — dry-run
 * primeiro porque um seed que já nasce escrevendo é indistinguível de um
 * acidente.
 *
 * Com `--aplicar`, escreve dentro de UMA transação e é IDEMPOTENTE: rodar de
 * novo não duplica nada (ver `jaExiste` em cada etapa). Reexecução é o caso
 * comum de um seed — alguém roda, o terminal fecha, ninguém sabe se passou.
 *
 * ── O QUE ELE NÃO FAZ ────────────────────────────────────────────────────
 * Não cria cliente. O cliente tem de existir, e é identificado por
 * `numeroConta` — inventar um cliente para o piloto testaria o script, não a
 * modelagem.
 *
 * Como rodar:
 *   # dry-run (padrão, não escreve)
 *   DATABASE_URL="postgresql://..." npx tsx scripts/seed-parceiro-piloto.ts --conta 123456
 *
 *   # aplicar de verdade
 *   DATABASE_URL="postgresql://..." npx tsx scripts/seed-parceiro-piloto.ts --conta 123456 --aplicar
 *
 *   # ajustar o piloto
 *   ... --nome "Michel" --tipo contabil --produto assessoria --percentual 20
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  normalizarTipoParceiro,
  normalizarTipoProduto,
  ehTipoParceiroConhecido,
  ehTipoProdutoConhecido,
} from "../src/lib/parceiros/vocabulario";

// Import relativo e adapter explícito seguem o padrão dos scripts existentes
// (scripts/backfill-ultima-reuniao.ts:21-25): `tsx` roda fora do resolvedor de
// paths do Next, então `@/` não resolve aqui.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Argumentos ───────────────────────────────────────────────────────────

function arg(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : null;
}

const APLICAR = process.argv.includes("--aplicar");
const CONTA = arg("conta");
const NOME = arg("nome") ?? "Michel";
const TIPO_BRUTO = arg("tipo") ?? "contabil";
const PRODUTO_BRUTO = arg("produto") ?? "assessoria";
const PERCENTUAL_BRUTO = arg("percentual") ?? "20";

// ── Saída ────────────────────────────────────────────────────────────────

const linha = (s = "") => console.log(s);
const passo = (n: number, s: string) => console.log(`\n${n}. ${s}`);
const ok = (s: string) => console.log(`   ✓ ${s}`);
const aviso = (s: string) => console.log(`   ⚠ ${s}`);
const plano = (s: string) => console.log(`   → ${s}`);

async function main() {
  linha("═".repeat(72));
  linha(`Piloto de parceiro — ${APLICAR ? "APLICAR (escreve)" : "DRY-RUN (não escreve)"}`);
  linha("═".repeat(72));

  // ── Validação de entrada, antes de tocar o banco ───────────────────────
  if (!CONTA) {
    throw new Error(
      "Falta --conta <numeroConta>. O cliente a vincular tem de existir; o script não cria cliente.",
    );
  }

  const tipo = normalizarTipoParceiro(TIPO_BRUTO);
  const produto = normalizarTipoProduto(PRODUTO_BRUTO);
  if (!tipo) throw new Error(`--tipo inválido: ${JSON.stringify(TIPO_BRUTO)}`);
  if (!produto) throw new Error(`--produto inválido: ${JSON.stringify(PRODUTO_BRUTO)}`);

  // Decimal e não Number: o percentual é DECIMAL(7,4) no banco, e converter
  // por float aqui derrotaria a escolha da #318 na própria porta de entrada.
  let percentual: Prisma.Decimal;
  try {
    percentual = new Prisma.Decimal(PERCENTUAL_BRUTO);
  } catch {
    throw new Error(`--percentual não é número: ${JSON.stringify(PERCENTUAL_BRUTO)}`);
  }
  if (percentual.lessThan(0) || percentual.greaterThan(100)) {
    // O CHECK do banco também barra, mas falhar aqui dá uma mensagem que diz
    // o que fazer em vez de um erro de constraint.
    throw new Error(`--percentual fora de 0–100: ${percentual.toString()}`);
  }

  passo(1, "Entrada normalizada");
  ok(`nome:      ${NOME}`);
  ok(`tipo:      ${TIPO_BRUTO} → ${tipo}`);
  ok(`produto:   ${PRODUTO_BRUTO} → ${produto}`);
  ok(`percentual: ${percentual.toString()}%`);
  if (!ehTipoParceiroConhecido(tipo)) aviso(`tipo "${tipo}" fora da lista de referência (permitido)`);
  if (!ehTipoProdutoConhecido(produto)) aviso(`produto "${produto}" fora da lista de referência (permitido)`);

  // ── Cliente alvo ───────────────────────────────────────────────────────
  passo(2, `Cliente da conta ${CONTA}`);
  // findMany e não findFirst: numeroConta NÃO é @unique no schema (ver
  // upsert-cliente.ts:10-11). Duas contas com o mesmo número é situação real,
  // e escolher em silêncio a primeira vincularia o parceiro ao cliente errado.
  const clientes = await prisma.clienteBackoffice.findMany({
    where: { numeroConta: CONTA },
    select: { id: true, nome: true, numeroConta: true, saldo: true },
  });
  if (clientes.length === 0) throw new Error(`Nenhum cliente com numeroConta=${CONTA}.`);
  if (clientes.length > 1) {
    throw new Error(
      `${clientes.length} clientes com numeroConta=${CONTA}: ${clientes.map((c) => `${c.id} (${c.nome})`).join(", ")}. ` +
        `Desambigue antes de rodar o piloto.`,
    );
  }
  const cliente = clientes[0];
  ok(`${cliente.nome} — id ${cliente.id}, PL ${cliente.saldo.toLocaleString("pt-BR")}`);

  // ── Estado atual ───────────────────────────────────────────────────────
  passo(3, "Estado atual (o que já existe)");
  const parceiroExistente = await prisma.parceiro.findFirst({
    where: { nome: NOME },
    select: { id: true, nome: true, tipo: true },
  });
  ok(parceiroExistente ? `Parceiro "${NOME}" já existe (${parceiroExistente.id})` : `Parceiro "${NOME}" não existe`);

  const vinculoVigenteDoCliente = await prisma.parceiroCliente.findFirst({
    where: { clienteId: cliente.id, dataFim: null },
    select: { id: true, parceiroId: true },
  });
  if (vinculoVigenteDoCliente) {
    // A #310 garante no banco no máximo um vínculo vigente POR CLIENTE. Se já
    // houver outro parceiro, o INSERT falharia com unique_violation — melhor
    // dizer isso agora, com o nome do parceiro, do que devolver o código do erro.
    const dono = await prisma.parceiro.findUnique({
      where: { id: vinculoVigenteDoCliente.parceiroId },
      select: { nome: true },
    });
    aviso(`cliente já tem parceiro vigente: ${dono?.nome ?? vinculoVigenteDoCliente.parceiroId}`);
  } else {
    ok("cliente sem parceiro vigente");
  }

  // ── Plano ──────────────────────────────────────────────────────────────
  passo(4, "Plano");
  const criaParceiro = !parceiroExistente;
  plano(criaParceiro ? `CRIAR Parceiro "${NOME}" (tipo ${tipo})` : `REUSAR Parceiro ${parceiroExistente!.id}`);
  plano(`GARANTIR acordo vigente ${percentual.toString()}% em "${produto}"`);
  plano(
    vinculoVigenteDoCliente
      ? `PULAR vínculo — cliente já tem parceiro vigente (a #310 rejeitaria um segundo)`
      : `VINCULAR cliente ${cliente.nome} ao parceiro`,
  );

  if (!APLICAR) {
    linha();
    linha("─".repeat(72));
    linha("DRY-RUN: nada foi escrito. Para aplicar, repita com --aplicar.");
    linha("─".repeat(72));
    return;
  }

  // ── Aplicação, em transação e idempotente ──────────────────────────────
  passo(5, "Aplicando");
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    const parceiro =
      parceiroExistente ??
      (await tx.parceiro.create({
        data: { nome: NOME, tipo, criadoPor: "seed-parceiro-piloto" },
        select: { id: true, nome: true, tipo: true },
      }));
    ok(`Parceiro ${parceiro.id}`);

    // Acordo: idempotente pelo par (parceiro, produto) vigente. Se já houver um
    // vigente com OUTRO percentual, NÃO sobrescreve — alterar percentual é
    // fechar-e-abrir (regra (b) da #318), e um seed não deve tomar essa decisão.
    const acordoVigente = await tx.acordoComercialParceiro.findFirst({
      where: { parceiroId: parceiro.id, tipoProduto: produto, dataFim: null },
      select: { id: true, percentual: true },
    });
    if (acordoVigente) {
      if (acordoVigente.percentual.equals(percentual)) {
        ok(`Acordo já vigente com ${percentual.toString()}% — nada a fazer`);
      } else {
        aviso(
          `Acordo vigente tem ${acordoVigente.percentual.toString()}%, pedido ${percentual.toString()}%. ` +
            `NÃO alterado: mudar percentual é fechar-e-abrir, decisão de negócio.`,
        );
      }
    } else {
      const novo = await tx.acordoComercialParceiro.create({
        data: {
          parceiroId: parceiro.id,
          tipoProduto: produto,
          percentual,
          dataInicio: agora,
          criadoPor: "seed-parceiro-piloto",
        },
        select: { id: true },
      });
      ok(`Acordo ${novo.id} — ${percentual.toString()}% em ${produto}`);
    }

    if (vinculoVigenteDoCliente) {
      ok("Vínculo pulado (cliente já tem parceiro vigente)");
    } else {
      const v = await tx.parceiroCliente.create({
        data: {
          parceiroId: parceiro.id,
          clienteId: cliente.id,
          dataInicio: agora,
          vinculadoPor: "seed-parceiro-piloto",
        },
        select: { id: true },
      });
      ok(`Vínculo ${v.id} — ${cliente.nome}`);
    }
  });

  // ── Conferência: o que a modelagem responde agora ──────────────────────
  passo(6, "Conferência — as perguntas que a Fase 1 existe para responder");
  const parceiro = await prisma.parceiro.findFirstOrThrow({
    where: { nome: NOME },
    select: {
      id: true,
      nome: true,
      tipo: true,
      acordos: { where: { dataFim: null }, select: { tipoProduto: true, percentual: true } },
      clientes: {
        where: { dataFim: null },
        select: { cliente: { select: { nome: true, saldo: true } } },
      },
    },
  });
  ok(`"${parceiro.nome}" (${parceiro.tipo})`);
  for (const a of parceiro.acordos) ok(`  acordo vigente: ${a.percentual.toString()}% em ${a.tipoProduto}`);
  const aum = parceiro.clientes.reduce((s, c) => s + c.cliente.saldo, 0);
  ok(`  clientes vigentes: ${parceiro.clientes.length} · AUM ${aum.toLocaleString("pt-BR")}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
    await prisma.$disconnect();
    process.exit(1);
  });
