/**
 * Ensaio do motor de importação da Corretora, ponta a ponta, contra um banco
 * DESCARTÁVEL.
 *
 * ── O QUE ELE VERIFICA, QUE TESTE UNITÁRIO NÃO ALCANÇA ───────────────────
 * Os testes de `src/lib/**` provam as regras sobre estruturas em memória. Este
 * ensaio prova a coisa que só o banco responde: que rodar o MESMO arquivo três
 * vezes não duplica nada.
 *
 *     dry-run → aplicar → aplicar
 *
 * A terceira execução tem de sair com ZERO criações. Se a idempotência por
 * chave de negócio estivesse errada, é aqui — e só aqui — que apareceria.
 *
 * O conjunto sintético cobre, de propósito, os sete casos que quebram import:
 * CPF novo, CPF já existente, CNPJ, rótulo desconhecido, contrato cancelado
 * que um arquivo antigo tentaria ressuscitar, linha duplicada, e variação de
 * grafia de atendente.
 *
 * ── SEGURANÇA: NUNCA CONTRA UM BANCO QUE NÃO SEJA DESCARTÁVEL ────────────
 * Segue a régua de `ensaio-hierarquia.ts`: recusa URL que não seja localhost e
 * exige nome de banco começando com `ensaio_`. As duas checagens são
 * redundantes de propósito — a primeira barra o host errado, a segunda barra
 * apontar para o banco de dev local por engano.
 *
 * ── PDF E WORD ───────────────────────────────────────────────────────────
 * A extração deles depende da API da Anthropic. Sem `ANTHROPIC_API_KEY` no
 * ambiente, o ensaio roda a parte offline dos dois (a descompactação do .docx e
 * o caminho de linhas com `origem: "ia"` atravessando perfil, plano e
 * gravação) e DIZ que não chamou a rede, em vez de fingir que chamou.
 *
 * Uso:
 *   DATABASE_URL=postgresql://…/ensaio_import_corretora npx tsx scripts/ensaio-import-corretora.ts
 */
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";

import { executarImportacao } from "@/lib/corretora/executar-importacao";
import { planejar } from "@/lib/corretora/importar-contratos";
import { aplicarPerfil } from "@/lib/importacao/aplicar-perfil";
import { textoDoDocx } from "@/lib/importacao/extracao-ia";
import type { PerfilImportacaoConfig } from "@/lib/importacao/perfil";
import { prisma } from "@/lib/prisma";

// ── Guarda ────────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL ?? "";
const host = /@([^/:?]+)/.exec(url)?.[1] ?? "";
const banco = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? "";
if (!/^(localhost|127\.0\.0\.1)$/.test(host)) {
  throw new Error(`ensaio só roda em localhost — DATABASE_URL aponta para ${JSON.stringify(host)}`);
}
if (!banco.startsWith("ensaio_")) {
  throw new Error(`o banco precisa começar com "ensaio_" — veio ${JSON.stringify(banco)}`);
}

// ── O conjunto sintético ──────────────────────────────────────────────────

const CPF_EXISTENTE = "09714600510";
const CPF_NOVO = "39053344705";
const CNPJ = "12345678000195";

/** Colunas na ordem em que a corretora manda. */
const CABECALHO = [
  "CPF/CNPJ",
  "Nome",
  "Ramo",
  "Apólice",
  "Parceiro",
  "Situação",
  "Início",
  "Prêmio",
  "Atendente",
  "Capital Segurado",
];

const LINHAS: string[][] = [
  // 1. CPF que JÁ tem PessoaGrupo → casa, não cria.
  [CPF_EXISTENTE, "Fulano de Tal", "SEGURO DE VIDA", "AP-001", "Porto Seguro", "EM VIGOR", "01/09/2026", "1.234,56", "Ana Paula", "500.000,00"],
  // 2. CPF novo → cliente exclusivo da Corretora, é CRIADO.
  [CPF_NOVO, "Beltrana Souza", "AUTO FÁCIL", "AP-002", "Porto Seguro", "EM VIGOR", "15/07/2026", "890,00", "ANA PAULA", ""],
  // 3. CNPJ → mesma trilha, documento de 14 dígitos.
  [CNPJ, "Empresa Exemplo LTDA", "SEGURO DE VIDA", "AP-003", "Porto Seguro", "EM VIGOR", "03/04/2026", "12.000,00", "Bruno Lima", "2.000.000,00"],
  // 4. Rótulo desconhecido → PENDENTE, linha rejeitada, nada chutado.
  [CPF_NOVO, "Beltrana Souza", "SEGURO VIAGEM", "AP-004", "Porto Seguro", "EM VIGOR", "10/01/2026", "150,00", "Ana  Paula", ""],
  // 5. Contrato já CANCELADO no banco, e o arquivo diz "EM VIGOR".
  [CPF_EXISTENTE, "Fulano de Tal", "SEGURO DE VIDA", "AP-900", "Porto Seguro", "EM VIGOR", "01/01/2025", "300,00", "Bruno  Lima", ""],
  // 6. Linha duplicada — a mesma apólice de novo, com prêmio diferente.
  [CPF_EXISTENTE, "Fulano de Tal", "SEGURO DE VIDA", "ap 001", "porto seguro", "EM VIGOR", "01/09/2026", "1.234,56", "Ana Paula", "500.000,00"],
];

const MAPEAMENTO = {
  "CPF/CNPJ": "cpfCnpj",
  Nome: "nome",
  Ramo: "tipoProduto",
  "Apólice": "numeroContrato",
  Parceiro: "parceiro",
  "Situação": "status",
  "Início": "inicioVigencia",
  "Prêmio": "premio",
  Atendente: "atendenteCorretora",
  "Capital Segurado": "capitalSegurado",
};

const FORMATOS_VALOR = {
  cpfCnpj: "documento_digitos",
  premio: "decimal_ptbr",
  inicioVigencia: "data_ddmmaaaa",
  capitalSegurado: "decimal_ptbr",
} as const;

const DICIONARIOS = {
  tipoProduto: { "SEGURO DE VIDA": "vida", "AUTO FÁCIL": "auto" },
  status: { "EM VIGOR": "ativo", CANCELADA: "cancelado", ENCERRADA: "encerrado" },
};

function perfilConfig(formato: "xlsx" | "csv" | "pdf" | "docx"): PerfilImportacaoConfig {
  const extracao =
    formato === "xlsx"
      ? { tipo: "xlsx" as const, aba: "Apólices", linhaCabecalho: 1 }
      : formato === "csv"
        ? { tipo: "csv" as const, delimitador: ";", linhaCabecalho: 1 }
        : formato === "docx"
          ? { tipo: "docx" as const, indiceTabela: 0 }
          : { tipo: "pdf" as const, estrategia: "tabela" as const };
  return {
    formato,
    extracao,
    mapeamentoColunas: MAPEAMENTO,
    formatosValor: FORMATOS_VALOR,
    dicionarios: DICIONARIOS,
  };
}

function planilhaXlsx(): Buffer {
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet([CABECALHO, ...LINHAS]), "Apólices");
  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function planilhaCsv(): Buffer {
  const escapa = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const texto = [CABECALHO, ...LINHAS].map((l) => l.map(escapa).join(";")).join("\r\n");
  return Buffer.from(`﻿${texto}\r\n`, "utf8");
}

/** Um .docx de verdade: zip com `word/document.xml` e uma tabela dentro. */
function documentoDocx(): Buffer {
  const celula = (t: string) =>
    `<w:tc><w:p><w:r><w:t>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p></w:tc>`;
  const linha = (l: string[]) => `<w:tr>${l.map(celula).join("")}</w:tr>`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    `<w:tbl>${[CABECALHO, ...LINHAS].map(linha).join("")}</w:tbl>` +
    `</w:body></w:document>`;
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(xml, "utf8"));
  return zip.toBuffer();
}

// ── Preparo do banco ──────────────────────────────────────────────────────

async function preparar() {
  await prisma.contratoCorretora.deleteMany({});
  await prisma.perfilImportacao.deleteMany({});
  await prisma.pessoaGrupo.deleteMany({});
  await prisma.importJob.deleteMany({ where: { tipo: "corretora_contratos" } });
  await prisma.empresa.upsert({
    where: { id: "corretora" },
    update: {},
    // `tipo` não tem default no schema de propósito — o papel do nó é decisão.
    create: { id: "corretora", nome: "Onix Corretora", tipo: "empresa" },
  });

  const pessoa = await prisma.pessoaGrupo.create({
    data: { cpfCnpj: CPF_EXISTENTE, tipoDocumento: "CPF" },
  });

  // O contrato cancelado que a linha 5 do arquivo tentaria trazer de volta.
  await prisma.contratoCorretora.create({
    data: {
      pessoaGrupoId: pessoa.id,
      empresaId: "corretora",
      tipoProduto: "vida",
      parceiro: "Porto Seguro",
      numeroContrato: "AP-900",
      inicioVigencia: new Date("2025-01-01T12:00:00Z"),
      status: "cancelado",
    },
  });

  const perfis: Record<string, string> = {};
  for (const formato of ["xlsx", "csv", "docx", "pdf"] as const) {
    const cfg = perfilConfig(formato);
    const criado = await prisma.perfilImportacao.create({
      data: {
        nome: `Porto Seguro — ${formato}`,
        empresaId: "corretora",
        fonte: "Porto Seguro",
        formato,
        extracao: cfg.extracao,
        mapeamentoColunas: cfg.mapeamentoColunas,
        formatosValor: cfg.formatosValor,
        dicionarios: cfg.dicionarios,
      },
      select: { id: true },
    });
    perfis[formato] = criado.id;
  }
  return perfis;
}

// ── O ensaio ──────────────────────────────────────────────────────────────

/** Competências dos relatórios. Regra 5: é o que ordena dois arquivos. */
const AGOSTO = new Date(Date.UTC(2026, 7, 1, 12, 0, 0));
const SETEMBRO = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));

let lote = 0;
function opcoes(
  formato: "xlsx" | "csv",
  perfilId: string,
  modo: "dry-run" | "aplicar",
  dataReferencia: Date = AGOSTO,
) {
  lote += 1;
  return {
    modo,
    empresaId: "corretora",
    perfil: perfilConfig(formato),
    perfilImportacaoId: perfilId,
    parceiroPadrao: "Porto Seguro",
    iniciadoPorId: "ensaio",
    loteImportacao: `ensaio-${lote}`,
    dataReferencia,
  } as const;
}

async function contar() {
  return {
    pessoas: await prisma.pessoaGrupo.count(),
    contratos: await prisma.contratoCorretora.count(),
    jobs: await prisma.importJob.count({ where: { tipo: "corretora_contratos" } }),
  };
}

function imprimir(rotulo: string, r: Awaited<ReturnType<typeof executarImportacao>>) {
  console.log(
    `\n── ${rotulo} ───────────────────────────────────────────\n` +
      `  linhas lidas .............. ${r.linhasLidas}\n` +
      `  pessoas a criar ........... ${r.pessoasACriar}\n` +
      `  pessoas casadas ........... ${r.pessoasACasar}\n` +
      `  contratos a criar ......... ${r.contratosACriar}\n` +
      `  contratos a atualizar ..... ${r.contratosAAtualizar}\n` +
      `  histórico preservado ...... ${r.historicoPreservado.length}\n` +
      `  duplicadas no lote ........ ${r.duplicadasNoLote.length}\n` +
      `  ignoradas (mais antigas) .. ${r.ignoradasPorAntiguidade.length}` +
      (r.ignoradasPorAntiguidade.length
        ? ` (${r.ignoradasPorAntiguidade
            .map(
              (x) =>
                `linha ${x.linha}: lote ${x.referenciaDoLote.toISOString().slice(0, 10)} < gravado ${x.referenciaGravada.toISOString().slice(0, 10)}`,
            )
            .join("; ")})`
        : "") +
      "\n" +
      `  rejeitadas ................ ${r.rejeitadas.length}` +
      (r.rejeitadas.length ? ` (${r.rejeitadas.map((x) => `linha ${x.numero}`).join(", ")})` : "") +
      "\n" +
      `  rótulos não mapeados ...... ${r.rotulosNaoMapeados.map((g) => `${g.campo}=${JSON.stringify(g.rotulo)}×${g.linhas}`).join(", ") || "—"}\n` +
      `  grafias de atendente ...... ${r.grafiasAtendente.map((g) => `${g.normalizado}[${g.grafias.length} grafia(s)]×${g.linhas}`).join(", ") || "—"}\n` +
      `  custo de IA ............... ${r.custoIa ? `US$ ${r.custoIa.usd} (${r.custoIa.tokensEntrada}/${r.custoIa.tokensSaida} tokens)` : "US$ 0 — extração determinística"}\n` +
      `  GRAVADO: pessoas ${r.pessoasCriadas} · contratos criados ${r.contratosCriados} · atualizados ${r.contratosAtualizados}`,
  );
}

async function main() {
  const perfis = await preparar();
  const xlsx = { nome: "porto-agosto.xlsx", conteudo: planilhaXlsx() };
  const csv = { nome: "porto-agosto.csv", conteudo: planilhaCsv() };

  const antes = await contar();
  assert.deepEqual(antes, { pessoas: 1, contratos: 1, jobs: 0 });

  // 1) DRY-RUN — zero escrita, nem sequer o ImportJob.
  const ensaioSeco = await executarImportacao(prisma, xlsx, opcoes("xlsx", perfis.xlsx, "dry-run"));
  imprimir("XLSX · dry-run", ensaioSeco);
  assert.deepEqual(await contar(), antes, "o dry-run ESCREVEU alguma coisa");
  assert.equal(ensaioSeco.importJobId, null);
  assert.equal(ensaioSeco.linhasLidas, 6);
  assert.equal(ensaioSeco.contratosACriar, 3);
  assert.equal(ensaioSeco.pessoasACriar, 2);
  assert.equal(ensaioSeco.pessoasACasar, 1);
  assert.equal(ensaioSeco.rejeitadas.length, 1, "a linha do rótulo desconhecido tem de cair");
  assert.equal(ensaioSeco.historicoPreservado.length, 1, "o cancelado tem de resistir");
  assert.equal(ensaioSeco.duplicadasNoLote.length, 1);
  assert.ok(
    ensaioSeco.amostra.every((a) => !JSON.stringify(a).includes(CPF_NOVO)),
    "a amostra vazou documento",
  );

  // 2) APLICAR — os números do ensaio, agora medidos.
  const aplicado = await executarImportacao(prisma, xlsx, opcoes("xlsx", perfis.xlsx, "aplicar"));
  imprimir("XLSX · aplicar", aplicado);
  assert.equal(aplicado.contratosCriados, 3);
  assert.equal(aplicado.pessoasCriadas, 2);
  assert.equal(aplicado.contratosAtualizados, 0);
  assert.deepEqual(await contar(), { pessoas: 3, contratos: 4, jobs: 1 });
  const cancelado = await prisma.contratoCorretora.findFirst({ where: { numeroContrato: "AP-900" } });
  assert.equal(cancelado?.status, "cancelado", "o histórico foi sobrescrito");

  // 3) APLICAR DE NOVO — a prova da idempotência.
  const repetido = await executarImportacao(prisma, xlsx, opcoes("xlsx", perfis.xlsx, "aplicar"));
  imprimir("XLSX · aplicar (2ª vez)", repetido);
  assert.equal(repetido.contratosCriados, 0, "a segunda aplicação DUPLICOU contratos");
  assert.equal(repetido.pessoasCriadas, 0, "a segunda aplicação DUPLICOU pessoas");
  assert.equal(repetido.contratosAtualizados, 3);
  assert.deepEqual(await contar(), { pessoas: 3, contratos: 4, jobs: 2 });

  // 4) O MESMO conteúdo em CSV: outro formato, mesmo resultado, zero criação.
  const viaCsv = await executarImportacao(prisma, csv, opcoes("csv", perfis.csv, "aplicar"));
  imprimir("CSV · aplicar", viaCsv);
  assert.equal(viaCsv.contratosCriados, 0, "o CSV criou o que o XLSX já tinha criado");
  assert.deepEqual(await contar(), { pessoas: 3, contratos: 4, jobs: 3 });

  // 4.5) REGRA 5, contra o banco: setembro reajusta, agosto reprocessado NÃO
  //      desfaz o reajuste. Foi este cenário que revelou o bug.
  const SETEMBRO_LINHAS = LINHAS.map((l) =>
    l[3] === "AP-001" ? l.map((c, i) => (i === 7 ? "1.400,00" : c)) : l,
  );
  const livroSet = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    livroSet,
    XLSX.utils.aoa_to_sheet([CABECALHO, ...SETEMBRO_LINHAS]),
    "Apólices",
  );
  const setembro = {
    nome: "porto-setembro.xlsx",
    conteudo: XLSX.write(livroSet, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };

  const comSetembro = await executarImportacao(
    prisma,
    setembro,
    opcoes("xlsx", perfis.xlsx, "aplicar", SETEMBRO),
  );
  imprimir("XLSX · setembro (competência maior)", comSetembro);
  const premioSetembro = await prisma.contratoCorretora.findFirst({
    where: { numeroContrato: "AP-001" },
    select: { premio: true },
  });
  assert.equal(String(premioSetembro?.premio), "1400", "setembro não aplicou o reajuste");

  const agostoDeNovo = await executarImportacao(
    prisma,
    xlsx,
    opcoes("xlsx", perfis.xlsx, "aplicar", AGOSTO),
  );
  imprimir("XLSX · agosto REPROCESSADO (competência menor)", agostoDeNovo);
  const premioDepois = await prisma.contratoCorretora.findFirst({
    where: { numeroContrato: "AP-001" },
    select: { premio: true },
  });
  assert.equal(
    String(premioDepois?.premio),
    "1400",
    "REGRESSÃO: o arquivo de agosto reverteu o prêmio de setembro",
  );
  assert.equal(agostoDeNovo.contratosAtualizados, 0, "agosto sobrescreveu registro mais novo");
  assert.equal(agostoDeNovo.ignoradasPorAntiguidade.length, 3);

  // 5) Word: a descompactação real, sem rede.
  const texto = textoDoDocx(documentoDocx());
  assert.ok(texto.includes("SEGURO DE VIDA") && texto.includes(CPF_EXISTENTE));
  assert.equal(texto.split("\n").filter((l) => l.trim()).length, LINHAS.length + 1);
  console.log(`\n── DOCX · descompactação ──────────────────────────────\n  ${LINHAS.length + 1} linhas de tabela recuperadas do zip, sem chamada de rede`);

  // 6) O caminho de IA atravessando perfil e plano com `origem: "ia"`.
  const comoIa = aplicarPerfil(
    LINHAS.map((l, i) => ({
      numero: i + 1,
      celulas: Object.fromEntries(CABECALHO.map((c, j) => [c, l[j]])),
      origem: "ia" as const,
    })),
    perfilConfig("pdf"),
  );
  const planoIa = planejar(
    comoIa,
    {
      pessoasPorDocumento: new Map(
        (await prisma.pessoaGrupo.findMany({ select: { id: true, cpfCnpj: true } })).map((p) => [
          p.cpfCnpj,
          p.id,
        ]),
      ),
      contratosPorChave: new Map(),
    },
    {
      parceiroPadrao: "Porto Seguro",
      dicionarioProduto: DICIONARIOS.tipoProduto,
      dataReferenciaDoLote: SETEMBRO,
    },
  );
  assert.ok(planoIa.acoes.every((a) => a.registro.origemExtracao === "ia"));
  assert.equal(planoIa.rejeitadas.length, 1);
  console.log(
    `\n── PDF/IA · forma ─────────────────────────────────────\n` +
      `  ${planoIa.acoes.length} ações, todas com origem "ia" gravada linha a linha\n` +
      `  ${process.env.ANTHROPIC_API_KEY ? "com" : "SEM"} ANTHROPIC_API_KEY no ambiente — ` +
      `${process.env.ANTHROPIC_API_KEY ? "a extração real pode ser exercitada à parte" : "a chamada à API NÃO foi feita neste ensaio"}`,
  );

  const jobs = await prisma.importJob.findMany({
    where: { tipo: "corretora_contratos" },
    select: { status: true, totalArquivos: true, sucessos: true, pulados: true, erros: true },
    orderBy: { iniciadoEm: "asc" },
  });
  console.log(`\n── ImportJob (sem model novo) ─────────────────────────`);
  for (const j of jobs) {
    console.log(
      `  ${j.status} · total ${j.totalArquivos} · sucessos ${j.sucessos} · pulados ${j.pulados} · erros ${j.erros}`,
    );
  }

  console.log("\n✅ ensaio completo — dry-run sem escrita, aplicar idempotente, histórico intacto\n");
}

main()
  .catch((e) => {
    console.error("\n❌ ensaio FALHOU:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
