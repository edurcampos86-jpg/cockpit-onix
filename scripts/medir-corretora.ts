/**
 * As cinco medições que precisam existir ANTES da primeira linha de UI da
 * Corretora — Carteira, Ficha 360 e Radar de renovação.
 *
 * SOMENTE LEITURA. Só `SELECT`: nenhum INSERT/UPDATE/DELETE/DDL. Rodar dez
 * vezes seguidas não muda nada, é seguro apontar para produção.
 *
 * ── A LÓGICA NÃO MORA AQUI ───────────────────────────────────────────────
 * `lib/corretora/medicoes.ts` tem as consultas e as leituras. Este arquivo
 * decide o destino, chama a coleta e IMPRIME — nada mais. A rota
 * `api/backoffice/medir-corretora` consome o mesmo módulo e devolve JSON.
 *
 * Duas cópias das consultas divergiriam no primeiro ajuste e passariam a dar
 * respostas diferentes para a mesma pergunta, que é exatamente o defeito que
 * estas medições existem para evitar.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * O desenho das três telas foi feito duas vezes e reprovado duas vezes, e nas
 * duas o motivo foi o mesmo: decisão de produto apoiada em suposição sobre o
 * dado, quando um `count(*)` responderia. É a mesma família de erro que a #301
 * cometeu ("`Empresa` está vazia", e havia 6 linhas) e que a #410 quase
 * repetiu — a diferença é que aqui a suposição decidiria TELA, não catálogo.
 *
 * Cada medição existe porque uma decisão concreta muda de resposta conforme o
 * número. Não há medição "para saber": se o resultado não muda nada, ela não
 * deveria estar lá. O que cada número decide está em `LEITURAS`, no módulo.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * Mesma razão de `contagem-tabelas.ts`: o cliente é gerado do schema da
 * BRANCH, e a pergunta é sobre o BANCO. Aqui pesa mais ainda, porque duas das
 * cinco perguntas são sobre `jsonb` e sobre `regexp_replace`, que o cliente
 * tipado não expressa.
 *
 * ── POR QUE ISTO NÃO VIRA WORKFLOW DE CI ─────────────────────────────────
 * A medição 2 cruza os documentos com `regexp_replace` sobre
 * `ClienteBackoffice.cpfCnpj`, que é nullable e admite máscara. Isso INUTILIZA
 * o índice daquela coluna e o `EXISTS` correlacionado tende a reexecutar por
 * titular. Com a Corretora na escala de hoje o produto é pequeno e o custo é
 * irrelevante; em dezenas de milhares de contratos vira varredura.
 *
 * Rodar à mão, quando alguém vai decidir algo, é barato. Pendurar num
 * workflow que dispara em toda PR seria pagar essa conta a cada push — e o
 * conserto certo, antes de pensar nisso, é uma coluna canônica de dígitos no
 * `ClienteBackoffice`, como `PessoaGrupo` já tem.
 *
 * ── CÓDIGOS DE SAÍDA ─────────────────────────────────────────────────────
 *   0  mediu tudo
 *   2  não consegui perguntar — sem DATABASE_URL, tabela ausente ou erro de
 *      conexão
 *
 * Não há código de saída para "resultado ruim". Nenhum número aqui é falha:
 * são todos insumo de decisão, e transformar insumo em vermelho de CI faria o
 * script mentir sobre a própria natureza.
 *
 * Como rodar:
 *   npx tsx scripts/medir-corretora.ts
 *   railway run npx tsx scripts/medir-corretora.ts
 *
 * Ou, sem terminal: GET /api/backoffice/medir-corretora (admin).
 */

import "dotenv/config";
import {
  LEITURAS,
  TABELAS_NECESSARIAS,
  coletarMedicoes,
  tabelasAusentes,
} from "../src/lib/corretora/medicoes";

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

/** `12 de 34 (35,3%)`, ou `12 de 0` sem divisão por zero. */
function fatia(parte: number, total: number): string {
  if (total === 0) return `${parte} de 0`;
  return `${parte} de ${total} (${((parte / total) * 100).toFixed(1)}%)`;
}

function titulo(n: number, texto: string): void {
  console.log(`\n=== ${n}. ${texto} ===`);
}

/** A leitura sai indentada, para não se confundir com os números acima dela. */
function leitura(texto: string): void {
  for (const linha of quebrar(texto, 72)) console.log(`  ${linha}`);
}

/** Quebra em palavras — a leitura é prosa, e prosa cortada no meio não lê. */
function quebrar(texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    if (atual === "") atual = palavra;
    else if (atual.length + 1 + palavra.length <= largura) atual += ` ${palavra}`;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual !== "") linhas.push(atual);
  return linhas;
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL não está definida.\n" +
        "  • local:   rode a partir da raiz do projeto, com o .env carregado\n" +
        "  • Railway: railway run npx tsx scripts/medir-corretora.ts",
    );
    return INDETERMINADO;
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  // As tabelas podem não existir (branch sem a migration, banco de outro
  // ambiente). Perguntar antes é mais honesto do que deixar as consultas
  // estourarem com erro de SQL e o operador adivinhar qual foi o motivo.
  const faltando = await tabelasAusentes(prisma);
  if (faltando.length > 0) {
    console.error(
      `\nNão existem neste banco: ${faltando.join(", ")}.\n` +
        `As medições precisam de ${TABELAS_NECESSARIAS.join(", ")}. Não dá para medir.`,
    );
    return INDETERMINADO;
  }

  const m = await coletarMedicoes(prisma);

  // ── 1 ───────────────────────────────────────────────────────────────────
  titulo(1, "Fim de vigência — o radar de renovação é viável?");
  if (m.vigencia.contratos === 0) {
    console.log("  Nenhum contrato gravado. As três telas nascem vazias — medir de novo");
    console.log("  depois do import.");
  } else {
    console.log(`  Contratos:              ${m.vigencia.contratos}`);
    console.log(`  Sem data de fim:        ${fatia(m.vigencia.semFim, m.vigencia.contratos)}`);
    console.log(`  Ativos:                 ${m.vigencia.ativos}`);
    console.log(
      `  Ativos sem data de fim: ${fatia(m.vigencia.ativosSemFim, m.vigencia.ativos)}` +
        "  <- é este que decide",
    );
    leitura(LEITURAS.vigencia);
  }

  // ── 2 ───────────────────────────────────────────────────────────────────
  titulo(2, "Nome do titular — quem NÃO tem contraparte em Investimentos?");
  const n = m.nome;
  console.log(`  Titulares com contrato na Corretora:   ${n.titulares}`);
  console.log(`  Já vinculados a ClienteBackoffice:     ${fatia(n.comVinculo, n.titulares)}`);
  console.log(`  Casariam por documento (pós-backfill): ${fatia(n.casaPorDocumento, n.titulares)}`);
  console.log(
    `  SEM contraparte em Investimentos:      ` +
      `${fatia(n.semContraparteEmInvestimentos, n.titulares)}  <- é este que decide`,
  );
  leitura(LEITURAS.nome);

  // ── 3 ───────────────────────────────────────────────────────────────────
  titulo(3, "Contato — alguma companhia manda telefone ou e-mail?");
  if (m.colunasExtras.colunas.length === 0) {
    console.log("  Nenhuma coluna extra em `dadosProduto` — nenhum relatório trouxe campo");
    console.log("  fora dos que têm coluna própria.");
  } else {
    for (const c of m.colunasExtras.colunas) {
      console.log(`  ${c.coluna.padEnd(32)} ${String(c.contratos).padStart(6)} contratos`);
    }
  }
  console.log(
    m.colunasExtras.parecemContato.length > 0
      ? `  Parecem contato: ${m.colunasExtras.parecemContato.join(", ")}`
      : "  Nenhuma chave parece contato.",
  );
  leitura(LEITURAS.colunasExtras);

  // ── 4 ───────────────────────────────────────────────────────────────────
  titulo(4, "Atendente — dá para filtrar por quem atende?");
  if (m.atendente.grupos.length === 0) {
    console.log("  Nenhum contrato ativo.");
  } else {
    for (const g of m.atendente.grupos) {
      console.log(
        `  ${(g.atendente ?? "(sem atendente)").padEnd(32)} ${String(g.contratos).padStart(6)}`,
      );
    }
    console.log(
      `  Sem atendente: ${fatia(m.atendente.semAtendente, m.atendente.contratosAtivos)}`,
    );
    leitura(LEITURAS.atendente);
  }

  // ── 5 ───────────────────────────────────────────────────────────────────
  titulo(5, "Cross-sell — quantas pessoas têm mais de um produto?");
  if (m.crossSell.distribuicao.length === 0) {
    console.log("  Nenhum contrato ativo.");
  } else {
    for (const d of m.crossSell.distribuicao) {
      console.log(
        `  ${d.produtosDistintos} produto(s) distinto(s): ${String(d.pessoas).padStart(5)} pessoas`,
      );
    }
    console.log(
      `  Com mais de um produto: ` +
        `${fatia(m.crossSell.comMaisDeUmProduto, m.crossSell.pessoasComContratoAtivo)}` +
        "  <- é este que decide",
    );
    leitura(LEITURAS.crossSell);
  }

  console.log("\nFim. Nada foi alterado: estas medições só fazem SELECT.");
  return OK;
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro) => {
    console.error("Erro ao medir:", erro instanceof Error ? erro.message : erro);
    // Erro de conexão do Prisma costuma trazer usuário e host na mensagem — e
    // este script existe para ter a saída colada em conversa. O aviso vem
    // junto do erro, não no cabeçalho, porque é ali que ele é lido.
    console.error("(a mensagem acima pode conter credencial — não cole sem revisar)");
    process.exitCode = INDETERMINADO;
  })
  .finally(async () => {
    // `catch` no disconnect: sem ele, uma rejeição aqui vira unhandled
    // rejection DEPOIS de `process.exitCode` já estar definido, e o Node sai
    // com 1 — um código que o cabeçalho declara não existir neste script.
    await clienteAberto?.$disconnect().catch(() => {});
  });
