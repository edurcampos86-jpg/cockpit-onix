/**
 * Ensaio do backfill de `PessoaGrupo`, ponta a ponta, contra Postgres real.
 *
 * Roda contra um banco DESCARTÁVEL a mesma sequência que produção vai ver:
 *
 *     migrate deploy → semear sintético → dry-run → aplicar → aplicar de novo
 *
 * e falha se qualquer passo divergir do esperado.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────
 * Backfill de faixa VERMELHA toca milhares de linhas de cliente, e as
 * garantias que importam não são verificáveis sem banco: que o dry-run não
 * escreve, que a transação por lote confirma de verdade, que o `upsert` sobre
 * a UNIQUE de `cpfCnpj` não duplica, e que reexecutar é zero mudança. Os
 * testes unitários provam a REGRA (sem banco); este ensaio prova a ESCRITA.
 *
 * O conjunto sintético cobre, de propósito, os seis casos que a régua
 * distingue: documento único, documento duplicado (2+ contas), nulo, vazio,
 * CPF e CNPJ — mais os malformados, que caem no mesmo balde do vazio.
 *
 * ── SEGURANÇA: NUNCA CONTRA UM BANCO QUE NÃO SEJA DESCARTÁVEL ────────────
 * Este script APAGA e recria o banco de destino. Recusa qualquer URL que não
 * seja localhost E cujo nome de banco não comece com `ensaio_`. As duas
 * checagens são redundantes de propósito: a primeira barra o host errado, a
 * segunda barra apontar para o banco de dev local por engano. Mesmas barreiras
 * de `scripts/ensaio-hierarquia.ts`.
 *
 * ── DOCUMENTOS SINTÉTICOS ────────────────────────────────────────────────
 * Nenhum documento de pessoa real aparece aqui. Os CPFs e CNPJs são gerados
 * por contador, e os poucos fixos são os mesmos já usados em
 * `empresas/pessoa-grupo.test.ts`.
 *
 * ── NÃO É TESTE UNITÁRIO ─────────────────────────────────────────────────
 * Fica fora de `npm test` (que roda `src/**​/*.test.ts` sem banco).
 *
 * Como rodar:
 *   createdb ensaio_pessoa_grupo
 *   DATABASE_URL="postgresql://.../ensaio_pessoa_grupo" \
 *     npx tsx scripts/ensaio-backfill-pessoa-grupo.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import {
  TAMANHO_DO_LOTE,
  planejarBackfill,
  planejarEscrita,
  resumirPlano,
  somarLotes,
} from "../src/lib/backoffice/backfill-pessoa-grupo";
import {
  aplicarBackfill,
  carregarLinhas,
  carregarPessoasExistentes,
  diagnosticar,
} from "../src/lib/backoffice/backfill-pessoa-grupo-exec";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/** Falha o ensaio com uma mensagem que diz o que se esperava e o que veio. */
function conferir(condicao: boolean, oQue: string, detalhe: string): void {
  if (condicao) {
    console.log(`  ok    ${oQue}`);
    return;
  }
  throw new Error(`FALHOU: ${oQue}\n  ${detalhe}`);
}

/** Recusa destino que não seja descartável. Ver o cabeçalho. */
function exigirBancoDescartavel(url: string): { banco: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("DATABASE_URL não é uma URL válida.");
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname)) {
    throw new Error(
      `Destino "${u.hostname}" não é local. Este ensaio APAGA o banco — ele só roda\n` +
        "  contra localhost. Nunca aponte para Railway nem para qualquer host remoto.",
    );
  }

  const banco = u.pathname.replace(/^\//, "");
  if (!banco.startsWith("ensaio_")) {
    throw new Error(
      `O banco "${banco}" não começa com "ensaio_". Este script APAGA dados do destino;\n` +
        "  o prefixo é o que impede apontar para o seu banco de dev por engano.",
    );
  }

  return { banco };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Conjunto sintético
 * ────────────────────────────────────────────────────────────────────── */

/** CPF sintético de 11 dígitos, estável por índice. DV não é validado. */
function cpfSintetico(n: number): string {
  return String(10000000000 + n).slice(0, 11);
}

/** CNPJ sintético de 14 dígitos, estável por índice. */
function cnpjSintetico(n: number): string {
  return String(10000000000000 + n).slice(0, 14);
}

type Semente = { nome: string; cpfCnpj: string | null };

/**
 * O conjunto que o ensaio semeia, com os números esperados calculados aqui —
 * não à mão no meio das asserções. Se o conjunto mudar, os esperados mudam
 * junto e o ensaio continua conferindo a mesma coisa.
 */
function montarConjunto(): {
  sementes: Semente[];
  esperado: {
    linhas: number;
    documentosDistintos: number;
    duplicados: number;
    linhasDuplicadas: number;
    maiorAgrupamento: number;
    semLink: number;
    cpfs: number;
    cnpjs: number;
    linksAGravar: number;
  };
} {
  const sementes: Semente[] = [];

  // 1. CPFs únicos — uma conta cada. Passa de 200 para forçar 2+ lotes.
  const CPF_UNICOS = 260;
  for (let i = 0; i < CPF_UNICOS; i++) {
    sementes.push({ nome: `Único CPF ${i}`, cpfCnpj: cpfSintetico(i) });
  }

  // 2. CNPJs únicos.
  const CNPJ_UNICOS = 40;
  for (let i = 0; i < CNPJ_UNICOS; i++) {
    sementes.push({ nome: `Único CNPJ ${i}`, cpfCnpj: cnpjSintetico(i) });
  }

  // 3. CPFs duplicados: 12 documentos com 2, 3 ou 4 contas cada. Metade das
  //    repetições entra COM MÁSCARA, que é o caso que a UNIQUE sozinha não
  //    pegaria — é o motivo de a normalização existir.
  const dupCpf = [2, 2, 2, 2, 3, 3, 3, 4, 4, 2, 3, 4];
  let linhasDuplicadas = 0;
  dupCpf.forEach((contas, i) => {
    const doc = cpfSintetico(9000 + i);
    for (let c = 0; c < contas; c++) {
      const comMascara = c % 2 === 1;
      sementes.push({
        nome: `Dup CPF ${i}/${c}`,
        cpfCnpj: comMascara
          ? `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`
          : doc,
      });
      linhasDuplicadas++;
    }
  });

  // 4. CNPJs duplicados: 3 documentos com 2 contas cada.
  const dupCnpj = [2, 2, 2];
  dupCnpj.forEach((contas, i) => {
    const doc = cnpjSintetico(9000 + i);
    for (let c = 0; c < contas; c++) {
      sementes.push({ nome: `Dup CNPJ ${i}/${c}`, cpfCnpj: doc });
      linhasDuplicadas++;
    }
  });

  // 5. Sem documento: nulo, vazio, só espaço, curto demais, com letras, e um
  //    de 12 dígitos (comprimento plausível que NÃO é documento).
  const semDoc: (string | null)[] = [null, "", "   ", "123", "abc.def.ghi-jk", "123456789012"];
  semDoc.forEach((v, i) => sementes.push({ nome: `Sem doc ${i}`, cpfCnpj: v }));

  // 6. Um CPF e um CNPJ que começam com os mesmos 11 dígitos — a prova de que
  //    o tamanho separa os tipos e CPF↔CNPJ nunca une.
  const base = cpfSintetico(7777);
  sementes.push({ nome: "Sócio (CPF)", cpfCnpj: base });
  sementes.push({ nome: "Empresa dele (CNPJ)", cpfCnpj: `${base}000` });

  const documentosDistintos =
    CPF_UNICOS + CNPJ_UNICOS + dupCpf.length + dupCnpj.length + 2; // +2 do caso 6

  return {
    sementes,
    esperado: {
      linhas: sementes.length,
      documentosDistintos,
      duplicados: dupCpf.length + dupCnpj.length,
      linhasDuplicadas,
      maiorAgrupamento: Math.max(...dupCpf, ...dupCnpj),
      semLink: semDoc.length,
      cpfs: CPF_UNICOS + dupCpf.length + 1, // +1 do sócio
      cnpjs: CNPJ_UNICOS + dupCnpj.length + 1, // +1 da empresa
      linksAGravar: sementes.length - semDoc.length,
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Ex.:\n" +
        '  DATABASE_URL="postgresql://postgres@localhost:5432/ensaio_pessoa_grupo" \\\n' +
        "    npx tsx scripts/ensaio-backfill-pessoa-grupo.ts",
    );
  }

  const { banco } = exigirBancoDescartavel(url);
  console.log(`Ensaio do backfill de PessoaGrupo — banco descartável "${banco}"\n`);

  // ── 1. Schema do zero ──────────────────────────────────────────────────
  console.log("1. migrate deploy");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env: process.env });
  console.log("  ok    chain de migrations aplicada\n");

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  // ── 2. Conjunto sintético ──────────────────────────────────────────────
  console.log("2. semear conjunto sintético");
  await prisma.clienteBackoffice.deleteMany({});
  await prisma.pessoaGrupo.deleteMany({});

  const { sementes, esperado } = montarConjunto();
  await prisma.clienteBackoffice.createMany({
    // `numeroConta` é obrigatório no model e NÃO participa da régua de união —
    // entra só para a linha existir. Sequencial para ser único e legível no
    // banco de ensaio.
    data: sementes.map((s, i) => ({
      nome: s.nome,
      numeroConta: `ENSAIO-${String(i).padStart(5, "0")}`,
      cpfCnpj: s.cpfCnpj,
    })),
  });

  const totalSemeado = await prisma.clienteBackoffice.count();
  conferir(
    totalSemeado === esperado.linhas,
    `${esperado.linhas} clientes semeados`,
    `veio ${totalSemeado}`,
  );
  conferir(
    (await prisma.pessoaGrupo.count()) === 0,
    "PessoaGrupo começa vazia",
    "havia linha em PessoaGrupo antes do backfill",
  );
  console.log(
    `        cobertura: CPF único, CNPJ único, duplicado (2–${esperado.maiorAgrupamento} contas),\n` +
      "        com e sem máscara, nulo, vazio, espaço, curto, com letras, 12 dígitos,\n" +
      "        e um par CPF/CNPJ com os mesmos 11 primeiros dígitos\n",
  );

  // ── 3. DRY-RUN: zero escrita ───────────────────────────────────────────
  console.log("3. dry-run");
  const antesDoDry = {
    clientes: await prisma.clienteBackoffice.count(),
    pessoas: await prisma.pessoaGrupo.count(),
    ligados: await prisma.clienteBackoffice.count({ where: { pessoaGrupoId: { not: null } } }),
  };

  const dry = await diagnosticar(prisma);

  conferir(
    dry.resumo.totalLinhas === esperado.linhas,
    `dry-run vê as ${esperado.linhas} linhas`,
    `viu ${dry.resumo.totalLinhas}`,
  );
  conferir(
    dry.resumo.documentosDistintos === esperado.documentosDistintos,
    `${esperado.documentosDistintos} documentos distintos`,
    `veio ${dry.resumo.documentosDistintos}`,
  );
  conferir(
    dry.resumo.pessoasACriar === esperado.documentosDistintos,
    `${esperado.documentosDistintos} pessoas a criar`,
    `veio ${dry.resumo.pessoasACriar}`,
  );
  conferir(
    dry.resumo.linksAGravar === esperado.linksAGravar,
    `${esperado.linksAGravar} links a gravar`,
    `veio ${dry.resumo.linksAGravar}`,
  );
  conferir(
    dry.resumo.semLink === esperado.semLink,
    `${esperado.semLink} linhas ficarão SEM link (não é erro)`,
    `veio ${dry.resumo.semLink}`,
  );
  conferir(
    dry.resumo.duplicatas.documentos === esperado.duplicados &&
      dry.resumo.duplicatas.linhas === esperado.linhasDuplicadas &&
      dry.resumo.duplicatas.maiorAgrupamento === esperado.maiorAgrupamento,
    `duplicatas: ${esperado.duplicados} documentos / ${esperado.linhasDuplicadas} linhas ` +
      `(maior: ${esperado.maiorAgrupamento})`,
    JSON.stringify(dry.resumo.duplicatas),
  );
  conferir(
    dry.resumo.porTipo.CPF === esperado.cpfs && dry.resumo.porTipo.CNPJ === esperado.cnpjs,
    `por tipo: ${esperado.cpfs} CPF / ${esperado.cnpjs} CNPJ`,
    JSON.stringify(dry.resumo.porTipo),
  );
  conferir(
    dry.resumo.amostraDuplicatas.length === 5,
    "amostra traz 5 agrupamentos",
    `veio ${dry.resumo.amostraDuplicatas.length}`,
  );

  // O contrato de PII: nem documento, nem id de cliente na resposta.
  const serializado = JSON.stringify(dry.resumo);
  const documentosSemeados = sementes
    .map((s) => (s.cpfCnpj ?? "").replace(/[^0-9]/g, ""))
    .filter((d) => d.length >= 11);
  conferir(
    !documentosSemeados.some((d) => serializado.includes(d)),
    "nenhum documento vaza para o resumo",
    "um dos documentos semeados apareceu no JSON do resumo",
  );

  const depoisDoDry = {
    clientes: await prisma.clienteBackoffice.count(),
    pessoas: await prisma.pessoaGrupo.count(),
    ligados: await prisma.clienteBackoffice.count({ where: { pessoaGrupoId: { not: null } } }),
  };
  conferir(
    JSON.stringify(antesDoDry) === JSON.stringify(depoisDoDry) && depoisDoDry.pessoas === 0,
    "dry-run NÃO escreveu nada",
    `antes=${JSON.stringify(antesDoDry)} depois=${JSON.stringify(depoisDoDry)}`,
  );

  // ── 4. APLICAR ─────────────────────────────────────────────────────────
  console.log("\n4. aplicar");
  const lotesVistos: number[] = [];
  const primeira = await aplicarBackfill(prisma, dry.escrita, async (r) => {
    lotesVistos.push(r.lote);
  });
  const somaPrimeira = somarLotes(primeira.lotes);

  conferir(
    primeira.lotes.length === Math.ceil(esperado.documentosDistintos / TAMANHO_DO_LOTE),
    `dividiu em ${Math.ceil(esperado.documentosDistintos / TAMANHO_DO_LOTE)} lote(s) de ` +
      `${TAMANHO_DO_LOTE} documentos`,
    `veio ${primeira.lotes.length}`,
  );
  conferir(
    lotesVistos.length === primeira.lotes.length,
    "o progresso foi reportado uma vez por lote",
    `${lotesVistos.length} callbacks para ${primeira.lotes.length} lotes`,
  );
  conferir(
    somaPrimeira.pessoasCriadas === esperado.documentosDistintos,
    `criou ${esperado.documentosDistintos} PessoaGrupo`,
    `criou ${somaPrimeira.pessoasCriadas}`,
  );
  conferir(
    somaPrimeira.linksGravados === esperado.linksAGravar,
    `gravou ${esperado.linksAGravar} links`,
    `gravou ${somaPrimeira.linksGravados}`,
  );

  // Conferência contra o BANCO, não contra os contadores do próprio código.
  const pessoasNoBanco = await prisma.pessoaGrupo.count();
  const ligadosNoBanco = await prisma.clienteBackoffice.count({
    where: { pessoaGrupoId: { not: null } },
  });
  const soltosNoBanco = await prisma.clienteBackoffice.count({ where: { pessoaGrupoId: null } });
  conferir(
    pessoasNoBanco === esperado.documentosDistintos,
    `banco tem ${esperado.documentosDistintos} linhas em PessoaGrupo`,
    `tem ${pessoasNoBanco}`,
  );
  conferir(
    ligadosNoBanco === esperado.linksAGravar && soltosNoBanco === esperado.semLink,
    `banco: ${esperado.linksAGravar} ligados, ${esperado.semLink} sem link`,
    `ligados=${ligadosNoBanco} soltos=${soltosNoBanco}`,
  );

  // A regra de negócio central: duplicata = MESMA PessoaGrupo.
  const porPessoa = await prisma.clienteBackoffice.groupBy({
    by: ["pessoaGrupoId"],
    where: { pessoaGrupoId: { not: null } },
    _count: { _all: true },
  });
  const agrupadas = porPessoa.filter((p) => p._count._all > 1);
  conferir(
    agrupadas.length === esperado.duplicados,
    `${esperado.duplicados} PessoaGrupo com 2+ contas (duplicata unificada)`,
    `veio ${agrupadas.length}`,
  );
  conferir(
    agrupadas.reduce((n, p) => n + p._count._all, 0) === esperado.linhasDuplicadas,
    `${esperado.linhasDuplicadas} contas dentro dos agrupamentos`,
    `veio ${agrupadas.reduce((n, p) => n + p._count._all, 0)}`,
  );

  // CPF↔CNPJ nunca uniu: o par do caso 6 tem pessoas distintas.
  const socio = await prisma.clienteBackoffice.findFirst({
    where: { nome: "Sócio (CPF)" },
    select: { pessoaGrupoId: true },
  });
  const empresa = await prisma.clienteBackoffice.findFirst({
    where: { nome: "Empresa dele (CNPJ)" },
    select: { pessoaGrupoId: true },
  });
  conferir(
    socio?.pessoaGrupoId != null &&
      empresa?.pessoaGrupoId != null &&
      socio.pessoaGrupoId !== empresa.pessoaGrupoId,
    "CPF e CNPJ com os mesmos 11 primeiros dígitos NÃO uniram",
    `socio=${socio?.pessoaGrupoId} empresa=${empresa?.pessoaGrupoId}`,
  );

  // Nenhum documento com máscara sobreviveu em PessoaGrupo.
  const comMascara = await prisma.pessoaGrupo.count({
    where: { OR: [{ cpfCnpj: { contains: "." } }, { cpfCnpj: { contains: "-" } }] },
  });
  conferir(comMascara === 0, "PessoaGrupo guarda só dígitos", `${comMascara} com máscara`);

  const tiposErrados = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM "PessoaGrupo"
     WHERE ("tipoDocumento" = 'CPF'  AND LENGTH("cpfCnpj") <> 11)
        OR ("tipoDocumento" = 'CNPJ' AND LENGTH("cpfCnpj") <> 14)`,
  );
  conferir(
    Number(tiposErrados[0].n) === 0,
    "tipoDocumento bate com o tamanho do documento em toda linha",
    `${tiposErrados[0].n} linha(s) inconsistentes`,
  );

  // ── 5. REEXECUTAR: zero mudança ────────────────────────────────────────
  console.log("\n5. aplicar de novo (idempotência)");
  const antesDaSegunda = {
    pessoas: await prisma.pessoaGrupo.count(),
    ligados: await prisma.clienteBackoffice.count({ where: { pessoaGrupoId: { not: null } } }),
  };
  const idsAntes = await prisma.clienteBackoffice.findMany({
    select: { id: true, pessoaGrupoId: true },
    orderBy: { id: "asc" },
  });

  const linhas2 = await carregarLinhas(prisma);
  const existentes2 = await carregarPessoasExistentes(prisma);
  const plano2 = planejarBackfill(linhas2);
  const escrita2 = planejarEscrita(plano2, linhas2, existentes2);
  const resumo2 = resumirPlano(plano2, escrita2);

  conferir(
    resumo2.pessoasACriar === 0 && resumo2.linksAGravar === 0,
    "o plano da 2ª execução não tem nada a fazer",
    `pessoasACriar=${resumo2.pessoasACriar} linksAGravar=${resumo2.linksAGravar}`,
  );
  conferir(
    resumo2.jaLigadas === esperado.linksAGravar && resumo2.divergentes === 0,
    `${esperado.linksAGravar} contas reconhecidas como já ligadas, 0 divergentes`,
    `jaLigadas=${resumo2.jaLigadas} divergentes=${resumo2.divergentes}`,
  );

  const segunda = await aplicarBackfill(prisma, escrita2);
  const somaSegunda = somarLotes(segunda.lotes);
  conferir(
    somaSegunda.pessoasCriadas === 0 && somaSegunda.linksGravados === 0,
    "a 2ª execução escreveu ZERO",
    `criou=${somaSegunda.pessoasCriadas} ligou=${somaSegunda.linksGravados}`,
  );

  const depoisDaSegunda = {
    pessoas: await prisma.pessoaGrupo.count(),
    ligados: await prisma.clienteBackoffice.count({ where: { pessoaGrupoId: { not: null } } }),
  };
  conferir(
    JSON.stringify(antesDaSegunda) === JSON.stringify(depoisDaSegunda),
    "contagens idênticas antes e depois da 2ª execução",
    `antes=${JSON.stringify(antesDaSegunda)} depois=${JSON.stringify(depoisDaSegunda)}`,
  );

  const idsDepois = await prisma.clienteBackoffice.findMany({
    select: { id: true, pessoaGrupoId: true },
    orderBy: { id: "asc" },
  });
  conferir(
    JSON.stringify(idsAntes) === JSON.stringify(idsDepois),
    "nenhum vínculo mudou de valor na 2ª execução",
    "algum pessoaGrupoId foi reescrito",
  );

  // ── 6. Terceira execução, para descartar efeito de paridade ────────────
  const terceira = await aplicarBackfill(prisma, escrita2);
  const somaTerceira = somarLotes(terceira.lotes);
  conferir(
    somaTerceira.pessoasCriadas === 0 && somaTerceira.linksGravados === 0,
    "a 3ª execução também escreveu ZERO",
    JSON.stringify(somaTerceira),
  );

  console.log("\n═══ ENSAIO COMPLETO — todos os contratos verificados ═══");
  console.log(
    `\nNúmeros: ${esperado.linhas} clientes → ${esperado.documentosDistintos} PessoaGrupo, ` +
      `${esperado.linksAGravar} links, ${esperado.semLink} sem link, ` +
      `${esperado.duplicados} agrupamentos com 2+ contas (${esperado.linhasDuplicadas} contas).`,
  );
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await clienteAberto?.$disconnect().catch(() => {});
  });
