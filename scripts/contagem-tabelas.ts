/**
 * Quantas linhas há em CADA tabela do banco — e quais o relatório não viu.
 *
 * SOMENTE LEITURA. `information_schema` + `count(*)`. Nenhum
 * INSERT/UPDATE/DELETE/DDL: rodar dez vezes seguidas não muda nada, é seguro
 * apontar para produção.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * O workflow `estado-do-banco.yml` nasceu de um erro específico: a #301
 * apostou em "`Empresa` está vazia" e a tabela tinha 6 linhas. A resposta foi
 * `verificar-empresa-vazia.ts` — que responde bem, e sobre UMA tabela.
 *
 * Em ago/2026 o mesmo erro quase aconteceu de novo, uma tabela ao lado: a #410
 * redividiu o catálogo de produtos da Corretora apostando em
 * "`ContratoCorretora` está vazia". O workflow DISPAROU naquela PR (ela tocou
 * `prisma/schema.prisma`), passou verde, e não citava aquela tabela nenhuma
 * vez. Detector ligado olhando para o lado errado dá falsa segurança — que é
 * pior do que não ter detector, porque o verde é lido como resposta.
 *
 * ── POR QUE NÃO UMA LISTA DE TABELAS DE INTERESSE ────────────────────────
 * Seria o conserto óbvio e reintroduziria o defeito: a lista não acompanha o
 * schema, e a PRÓXIMA tabela nova fica de fora em silêncio — exatamente o que
 * acabou de acontecer.
 *
 * Então não há lista. A fonte é o `schema.prisma`: todo `model` declarado é
 * contado, e o relatório diz explicitamente quantos foram. Uma tabela nova
 * entra na contagem no mesmo commit em que nasce, sem ninguém lembrar.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * Mesma razão de `verificar-empresa-vazia.ts`: o cliente é gerado do schema da
 * BRANCH, e a pergunta é sobre o BANCO. `information_schema` responde igual
 * antes e depois de qualquer migration — e é o que permite este script dizer
 * "o schema declara, o banco não tem", que é o diagnóstico mais útil aqui.
 *
 * ── CÓDIGOS DE SAÍDA ─────────────────────────────────────────────────────
 *   0  contou tudo que o schema declara
 *   1  há divergência entre schema e banco (tabela declarada que não existe)
 *   2  não consegui perguntar — sem DATABASE_URL ou erro de conexão
 *
 * O 1 NÃO é "achado grave": tabela declarada e ausente no banco costuma ser
 * migration pendente, que é informação e não incidente. É não-zero para
 * aparecer, não para bloquear.
 *
 * Como rodar:
 *   npx tsx scripts/contagem-tabelas.ts
 *   railway run npx tsx scripts/contagem-tabelas.ts
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

const OK = 0;
const DIVERGENTE = 1;
const INDETERMINADO = 2;

/**
 * Tabelas cuja contagem responde a uma pergunta que alguém já fez errado.
 *
 * NÃO é a lista do que se conta — conta-se tudo. É a lista do que ganha
 * destaque no topo do relatório, para a resposta não se perder entre cem
 * linhas. Entrar aqui é barato e sair também.
 *
 * ── ELA É O SEGUNDO DESTAQUE, NÃO O PRIMEIRO ─────────────────────────────
 * Esta lista é escrita à mão e envelhece — é o defeito que o cabeçalho deste
 * arquivo já recusa para a CONTAGEM. Por isso, quando a execução informa
 * `--tocadas`, o destaque principal passa a ser derivado do SQL de migration
 * da própria PR (`src/lib/ci/tabelas-tocadas.ts`), e esta lista vira o
 * segundo bloco: serve à execução local, sem PR, onde não há diff para ler.
 */
const EM_DESTAQUE: readonly string[] = [
  "Empresa", // #301 apostou em "vazia" e havia 6 linhas
  "ContratoCorretora", // #410 apostou em "vazia" — a aposta desta rodada
  "PerfilImportacao", // sem perfil não há importação: é o gate da anterior
  "PessoaEmpresa", // filtro de acesso: vazia = todo mundo vê tudo
];

/**
 * As tabelas que ESTA execução recebeu como "tocadas pela PR".
 *
 * `--tocadas=A,B,C`, vazio quando a PR não traz migration. Fora do CI o
 * argumento não é passado e o relatório cai no destaque fixo acima.
 */
function tocadasDoArgumento(): string[] {
  const bruto = process.argv
    .slice(2)
    .find((a) => a.startsWith("--tocadas="))
    ?.slice("--tocadas=".length);
  if (!bruto) return [];
  return [...new Set(bruto.split(",").map((t) => t.trim()).filter(Boolean))].sort();
}

/**
 * Sobe uma linha para o TOPO da execução do GitHub, como anotação.
 *
 * O resumo do job já recebe o relatório inteiro, e é onde ele foi se perder:
 * em 28/08/2026 tentei recuperar uma contagem no log de uma execução três
 * vezes, por `tail` crescente, e desisti. Anotação aparece acima de tudo, na
 * própria PR, sem abrir log — é o único lugar onde "está vazia?" é lida antes
 * de alguém decidir.
 *
 * `::warning::` e não `::error::` de propósito: tabela cheia NÃO reprova nada.
 * A PR pode ser exatamente sobre mexer numa tabela cheia. O que ela não pode é
 * ser mergeada por alguém que ACHAVA que estava vazia.
 *
 * Silencioso fora do CI, para não sujar a saída local com sintaxe de runner.
 */
function anotar(nivel: "warning" | "notice", mensagem: string): void {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  console.log(`::${nivel}::${mensagem.replace(/\n/g, " ")}`);
}

/** Host de destino SEM credencial — a URL do Postgres carrega usuário e senha. */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

/**
 * Os nomes de TABELA que o schema declara.
 *
 * `@@map("x")` renomeia a tabela sem renomear o model, e ignorar isso faria o
 * script acusar ausência de tabela que existe com outro nome. Por isso o
 * parser olha o corpo do bloco, não só a linha do `model`.
 */
function tabelasDoSchema(): { model: string; tabela: string }[] {
  const fonte = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const achados: { model: string; tabela: string }[] = [];

  for (const bloco of fonte.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const model = bloco[1];
    const mapeado = /@@map\("([^"]+)"\)/.exec(bloco[2]);
    achados.push({ model, tabela: mapeado ? mapeado[1] : model });
  }
  return achados.sort((a, b) => (a.tabela < b.tabela ? -1 : 1));
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL não está definida.\n" +
        "  • local:   rode a partir da raiz do projeto, com o .env carregado\n" +
        "  • Railway: railway run npx tsx scripts/contagem-tabelas.ts",
    );
    return INDETERMINADO;
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const declaradas = tabelasDoSchema();
  if (declaradas.length === 0) {
    console.error("Não achei nenhum `model` em prisma/schema.prisma — o parser quebrou.");
    return INDETERMINADO;
  }
  console.log(`O schema declara ${declaradas.length} tabelas.\n`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const existentes = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const noBanco = new Set(existentes.map((t) => t.table_name));

  const faltando = declaradas.filter((d) => !noBanco.has(d.tabela));
  const contaveis = declaradas.filter((d) => noBanco.has(d.tabela));

  // Uma consulta só, em vez de N idas ao banco. Os nomes vêm do schema E são
  // filtrados por `information_schema`, então não há entrada de fora; ainda
  // assim passam por um regex, porque interpolar identificador em SQL merece
  // duas travas e não uma.
  const seguros = contaveis.filter((d) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(d.tabela));
  // O que o regex recusa NÃO some: some seria reproduzir, dentro do próprio
  // detector, o defeito que ele existe para acabar. `@@map("relatório")` é
  // nome válido de tabela no Postgres e inválido para interpolar sem aspas —
  // então ele fica de fora da contagem, e o relatório DIZ isso.
  const naoContadas = contaveis.filter((d) => !seguros.includes(d));
  const uniao = seguros
    .map((d) => `SELECT '${d.tabela}' AS tabela, count(*)::int AS linhas FROM "${d.tabela}"`)
    .join(" UNION ALL ");

  const contagens =
    seguros.length === 0
      ? []
      : await prisma.$queryRawUnsafe<Array<{ tabela: string; linhas: number }>>(uniao);
  const porTabela = new Map(contagens.map((c) => [c.tabela, c.linhas]));

  // ── DESTAQUE 1: as tabelas que ESTA PR toca ─────────────────────────────
  //
  // Primeiro bloco do relatório, e o único que também vira anotação. É a
  // pergunta que decide uma PR de migration — "o que eu vou mexer já tem
  // dado?" — e ela não pode depender de alguém achar a resposta no meio de
  // cem linhas de log.
  const tocadas = tocadasDoArgumento();
  if (tocadas.length > 0) {
    console.log("=== Tabelas que ESTA PR toca ===");

    const comDado: string[] = [];
    const nascendo: string[] = [];
    const semResposta: string[] = [];

    for (const nome of tocadas) {
      if (!noBanco.has(nome)) {
        // Tabela que a migration CRIA. Não existir é a resposta certa.
        nascendo.push(nome);
        console.log(`  ${nome.padEnd(30)} ${"—".padStart(9)}  não existe ainda (a migration cria)`);
        continue;
      }
      const linhas = porTabela.get(nome);
      if (linhas === undefined) {
        // Mesma distinção do bloco fixo: ausência de resposta não é zero.
        semResposta.push(nome);
        console.log(`  ${nome.padEnd(30)} ${"?".padStart(9)}  existe e ficou FORA da contagem`);
        continue;
      }
      if (linhas === 0) {
        console.log(`  ${nome.padEnd(30)} ${"0".padStart(9)}  VAZIA`);
        continue;
      }
      comDado.push(`${nome} (${linhas})`);
      console.log(`  ${nome.padEnd(30)} ${String(linhas).padStart(9)}  ⚠ TEM DADO`);
    }

    if (comDado.length > 0) {
      anotar(
        "warning",
        `Esta PR toca ${comDado.length} tabela(s) que NÃO estão vazias: ${comDado.join(", ")}. ` +
          "Confira se a migration prevê o dado que já está lá.",
      );
    } else {
      anotar(
        "notice",
        `As ${tocadas.length} tabela(s) que esta PR toca estão vazias ou nascem nesta migration` +
          (nascendo.length > 0 ? ` (${nascendo.length} nasce(m) agora)` : "") +
          ".",
      );
    }
    if (semResposta.length > 0) {
      anotar(
        "warning",
        `Não consegui contar ${semResposta.join(", ")} — isto NÃO é "está vazia".`,
      );
    }
    console.log("");
  } else {
    console.log("=== Tabelas que ESTA PR toca ===");
    console.log("  (nenhuma migration nesta PR — nada a destacar por diff)\n");
  }

  // ── DESTAQUE 2: a lista fixa ────────────────────────────────────────────
  console.log("=== Tabelas em destaque ===");
  for (const nome of EM_DESTAQUE) {
    if (!noBanco.has(nome)) {
      console.log(`  ${nome.padEnd(24)} (não existe neste banco)`);
      continue;
    }
    // NÃO usar `?? 0`. Zero-que-ninguém-contou impresso como "VAZIA" é
    // exatamente o erro da #301, agora com carimbo de CI em cima. Ausência de
    // resposta e resposta zero são coisas diferentes, e a tela precisa
    // distingui-las — é a razão de este script existir.
    const linhas = porTabela.get(nome);
    if (linhas === undefined) {
      console.log(`  ${nome.padEnd(24)} ${"NÃO CONTADA".padStart(12)} (existe no banco, ficou fora da contagem)`);
      continue;
    }
    console.log(`  ${nome.padEnd(24)} ${String(linhas).padStart(8)} ${linhas === 0 ? "VAZIA" : ""}`);
  }

  // ── A data que substitui memória por dado ───────────────────────────────
  //
  // A #410 dependeu de "o Eduardo nunca concluiu uma importação" num intervalo
  // de quatro dias. `min(importadoEm)` responde isso em um segundo — e
  // `null` significa que nunca houve importação, que é a resposta desejada.
  if (noBanco.has("ContratoCorretora")) {
    const datas = await prisma.$queryRaw<
      Array<{ primeira: Date | null; ultima: Date | null; total: number }>
    >`
      SELECT min("importadoEm") AS primeira, max("importadoEm") AS ultima, count(*)::int AS total
      FROM "ContratoCorretora"
    `;
    const primeira = datas[0]?.primeira ?? null;
    const total = datas[0]?.total ?? 0;

    // `min` nulo NÃO quer dizer "nunca houve importação": `importadoEm` é
    // opcional, então tabela vazia e tabela cheia de nulos dão a MESMA
    // resposta. É a contagem que separa os dois casos — e sem ela o relatório
    // afirmaria mais do que sabe, que é o defeito que esta PR persegue.
    console.log(
      total === 0
        ? "\n  Primeira importação da Corretora: NENHUM CONTRATO GRAVADO (tabela vazia)"
        : primeira === null
          ? `\n  Primeira importação da Corretora: ${total} contratos gravados, TODOS sem` +
            " competência — não dá para datar a primeira importação"
          : `\n  Primeira importação da Corretora: ${primeira.toISOString()}` +
            `\n  Última:                          ${datas[0]?.ultima?.toISOString() ?? "?"}` +
            `\n  Contratos:                       ${total}`,
    );
  }

  // ── Todas, para nada ficar de fora em silêncio ──────────────────────────
  const comLinhas = [...porTabela.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const vazias = [...porTabela.entries()].filter(([, n]) => n === 0).map(([t]) => t);

  console.log(`\n=== ${comLinhas.length} tabelas COM linhas ===`);
  for (const [tabela, linhas] of comLinhas) {
    console.log(`  ${tabela.padEnd(36)} ${String(linhas).padStart(9)}`);
  }

  console.log(`\n=== ${vazias.length} tabelas VAZIAS ===`);
  console.log(vazias.length === 0 ? "  (nenhuma)" : `  ${vazias.join(", ")}`);

  if (naoContadas.length > 0) {
    console.error(
      `\n=== ${naoContadas.length} tabelas NÃO CONTADAS (nome exige aspas no SQL) ===`,
    );
    for (const d of naoContadas) console.error(`  ${d.tabela} (model ${d.model})`);
    console.error(
      "\nElas existem no banco e ficaram de fora desta contagem. Some do relatório\n" +
        "em silêncio era o defeito que este script existe para acabar — por isso\n" +
        "aparecem aqui em vez de sumirem.",
    );
  }

  // ── A divergência, que é o defeito de fundo ─────────────────────────────
  if (faltando.length > 0) {
    console.error(
      `\n=== ${faltando.length} tabelas DECLARADAS no schema e AUSENTES no banco ===`,
    );
    for (const d of faltando) {
      const via = d.model === d.tabela ? "" : ` (model ${d.model})`;
      console.error(`  ${d.tabela}${via}`);
    }
    console.error(
      "\nCostuma ser migration pendente — informação, não incidente. Mas se uma\n" +
        "delas for a tabela sobre a qual esta PR está apostando, a aposta não foi\n" +
        "conferida: o banco não tem onde responder.",
    );
    return DIVERGENTE;
  }

  if (naoContadas.length > 0) {
    console.error(
      `\n${seguros.length} de ${contaveis.length} tabelas declaradas foram contadas.`,
    );
    return DIVERGENTE;
  }
  console.log(`\nTodas as ${contaveis.length} tabelas declaradas foram contadas.`);
  return OK;
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((e) => {
    console.error(`\nERRO ao consultar: ${e instanceof Error ? e.message : String(e)}`);
    console.error("(a mensagem acima pode conter credencial — não cole sem revisar)");
    process.exitCode = INDETERMINADO;
  })
  .finally(async () => {
    await clienteAberto?.$disconnect().catch(() => {});
  });
