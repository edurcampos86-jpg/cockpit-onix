/**
 * Reparenting da tabela `Empresa` — pendura as empresas do grupo na raiz.
 *
 * FERRAMENTA DE REPARO, não etapa do bootstrap. Desde a PR-B4 o seed já cria
 * cada filha com `parentId = "onix-co"`, então num banco semeado do zero este
 * script não tem o que mover — e é assim que se espera que ele rode: "Movidas:
 * 0". Ele existe para o caso em que uma linha aparece com o pai errado (SQL
 * manual, banco antigo semeado antes da B4, importação), e é o único caminho
 * que corrige `parentId` de linha existente, sempre com conferência antes.
 *
 * ── ONDE MORA A LÓGICA ───────────────────────────────────────────────────
 * Não aqui. A régua, as guardas de pré-condição e a auditoria vivem em
 * `src/lib/empresas/reparent.ts`, compartilhado com
 * `POST /api/empresas/hierarquia` (`acao: "reparent"`). Este arquivo é só a
 * camada de terminal: argumentos, impressão e código de saída.
 *
 * ── DRY-RUN POR PADRÃO ───────────────────────────────────────────────────
 * Sem `--aplicar` este script NÃO escreve nada. E não é "o aplicar com um if no
 * fim": o planejamento é função PURA (`planejarReparent`) e a escrita
 * (`aplicarPlano`) simplesmente não é chamada. Não há caminho pelo qual um
 * dry-run escreva.
 *
 * ── RASTRO ───────────────────────────────────────────────────────────────
 * Com `--aplicar`, cada movimento vira uma linha em `EmpresaBootstrapLog`.
 * Por isso `--aplicar` EXIGE `--como <email|userId>`: o log tem FK obrigatória
 * para `User`, e autor inventado é pior que log nenhum.
 *
 * Como rodar:
 *   npx tsx scripts/reparent-empresas.ts                              # só mostra o plano
 *   npx tsx scripts/reparent-empresas.ts --aplicar --como eduardo@... # executa
 */
import "dotenv/config";
import { RAIZ_DO_GRUPO } from "../src/lib/empresas/catalogo";
import {
  PreCondicaoReparent,
  aplicarPlano,
  carregarArvore,
  conferirContraCatalogo,
  planejarReparent,
  resolverAutor,
} from "../src/lib/empresas/reparent";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/** A raiz. Mesmo id de `scripts/seed-empresas.ts` e do catálogo. */
const RAIZ = RAIZ_DO_GRUPO;

/**
 * Quem passa a pendurar na raiz. É a lista do catálogo MENOS a própria raiz —
 * repetida aqui de propósito em vez de só importada: este script move dado de
 * produção, e a lista do que vai ser movido tem de estar VISÍVEL no arquivo que
 * move, não a um import de distância. Ler o import não é ler a lista.
 *
 * O que impede a cópia envelhecer é `conferirContraCatalogo`, que aborta antes
 * de qualquer UPDATE se as duas divergirem. Visibilidade e verdade única deixam
 * de ser escolha — dá para ter as duas.
 */
const FILHAS = [
  "investimentos",
  "corretora",
  "corporate",
  "imobiliaria",
  "tech",
] as const;

/** Lê `--flag valor` do argv. `undefined` se ausente ou sem valor. */
function lerArgumento(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const valor = process.argv[i + 1];
  // Um `--como` seguido de outra flag é engano de digitação, não valor.
  if (!valor || valor.startsWith("--")) return undefined;
  return valor;
}

function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Rode a partir da raiz do projeto, com o .env carregado.",
    );
  }
  const aplicar = process.argv.includes("--aplicar");
  const como = lerArgumento("--como");

  // Antes de abrir conexão: se a lista está errada, nem vale conectar.
  conferirContraCatalogo(FILHAS);

  // Autor obrigatório para escrever — checado ANTES de conectar, junto das
  // demais validações baratas, para o erro sair no primeiro segundo e não
  // depois de já ter aberto conexão com produção.
  if (aplicar && !como) {
    throw new Error(
      "--aplicar exige --como <email|userId>: cada movimento vira uma linha em\n" +
        "  EmpresaBootstrapLog, que tem FK obrigatória para User. Sem autor real o\n" +
        "  log não responde à pergunta que ele existe para responder.\n" +
        "  Ex.: npx tsx scripts/reparent-empresas.ts --aplicar --como voce@onix...",
    );
  }

  console.log(`Destino: ${descreverDestino(url)}`);
  console.log(`Modo:    ${aplicar ? "APLICAR (escreve no banco)" : "dry-run (não escreve nada)"}\n`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const empresas = await carregarArvore(prisma);

  // Resolve o autor ANTES do primeiro UPDATE. Se o identificador não casar
  // ninguém, é melhor parar com o banco intacto do que mover 5 empresas e só
  // então descobrir que o log não tem onde pendurar.
  let autorId: string | null = null;
  if (aplicar && como) {
    const autor = await resolverAutor(prisma, como);
    if (!autor) {
      throw new Error(
        `Nenhum User casa com "${como}" (nem por id, nem por email).\n` +
          "  O log tem FK obrigatória para User — corrija o --como antes de aplicar.",
      );
    }
    autorId = autor.id;
    console.log(`Autor:   ${autor.name} <${autor.email}>\n`);
  }

  const plano = planejarReparent(empresas, FILHAS, RAIZ);

  const rotulo: Record<string, string> = {
    mover: aplicar ? "MOVIDA  " : "moveria ",
    ja_ok: "ok      ",
    pulada: "pulada  ",
    recusada: "RECUSADA",
  };
  for (const m of plano.movimentos) {
    const detalhe =
      m.situacao === "mover"
        ? `parentId=null → "${RAIZ}"`
        : m.situacao === "ja_ok"
          ? `já pendurada em "${RAIZ}"`
          : (m.motivo ?? "");
    console.log(`  ${rotulo[m.situacao]} ${m.id.padEnd(16)} ${detalhe}`);
  }

  console.log(
    `\n${aplicar ? "Movidas" : "Moveria"}: ${plano.totais.mover}   ` +
      `Já corretas: ${plano.totais.jaOk}   ` +
      `Puladas: ${plano.totais.puladas + plano.totais.recusadas}`,
  );

  if (aplicar && autorId) {
    const r = await aplicarPlano(prisma, plano, {
      autorId,
      origem: "scripts/reparent-empresas.ts",
    });
    console.log(
      `Auditadas: ${r.auditadas} linha(s) em EmpresaBootstrapLog` +
        (r.falhasDeLog > 0 ? `   FALHAS DE LOG: ${r.falhasDeLog}` : ""),
    );
    if (r.falhasDeLog > 0) {
      console.log(
        "  ATENÇÃO: o reparenting foi aplicado, mas parte do rastro não gravou.\n" +
          "  O dado está correto; o histórico ficou incompleto.",
      );
    }
    if (r.problemas.length > 0) {
      console.log("\nÁRVORE FORA DA RÉGUA (relida do banco):");
      for (const p of r.problemas) console.log(`  ${p.id}: ${p.mensagem}`);
      throw new Error(`${r.problemas.length} empresa(s) fora da régua de hierarquia.`);
    }
  } else if (plano.problemas.length > 0) {
    console.log("\nÁRVORE FORA DA RÉGUA:");
    for (const p of plano.problemas) console.log(`  ${p.id}: ${p.mensagem}`);
    throw new Error(`${plano.problemas.length} empresa(s) fora da régua de hierarquia.`);
  }

  console.log("Árvore válida: nenhuma empresa fora da régua de 2 níveis.");

  if (!aplicar && plano.totais.mover > 0) {
    console.log(
      "\nNada foi escrito. Para aplicar:" +
        " npx tsx scripts/reparent-empresas.ts --aplicar --como <email|userId>",
    );
  }
}

main()
  .catch((e) => {
    // PreCondicaoReparent já vem com mensagem instrutiva; o resto sai como está.
    const msg = e instanceof PreCondicaoReparent || e instanceof Error ? e.message : String(e);
    console.error(`\nERRO: ${msg}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await clienteAberto?.$disconnect().catch(() => {});
  });
