/**
 * As cinco medições que precisam existir ANTES da primeira linha de UI da
 * Corretora — Carteira, Ficha 360 e Radar de renovação.
 *
 * SOMENTE LEITURA. Só `SELECT`: nenhum INSERT/UPDATE/DELETE/DDL. Rodar dez
 * vezes seguidas não muda nada, é seguro apontar para produção.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * O desenho das três telas foi feito duas vezes e reprovado duas vezes, e nas
 * duas o motivo foi o mesmo: decisão de produto apoiada em suposição sobre o
 * dado, quando um `count(*)` responderia. É a mesma família de erro que a #301
 * cometeu ("`Empresa` está vazia", e havia 6 linhas) e que a #410 quase
 * repetiu — a diferença é que aqui a suposição decidiria TELA, não catálogo.
 *
 * Cada bloco abaixo existe porque uma decisão concreta muda de resposta
 * conforme o número. Não há medição "para saber": se o resultado não muda
 * nada, ele não deveria estar aqui.
 *
 * ── AS CINCO PERGUNTAS ───────────────────────────────────────────────────
 *  1. `fimVigencia` — o Radar é radar de datas, ou é uma tela cega para boa
 *     parte da base? `fimVigencia` é opcional (`prisma/schema.prisma:3326`) e
 *     o próprio schema (`:3323-3325`) registra que `null` é "vigência
 *     contínua" OU "fim desconhecido no relatório", sem distinguir os dois.
 *     Contrato sem fim é invisível em qualquer janela de data.
 *  2. Nome do titular — `PessoaGrupo` não tem coluna de nome (`:923-946`) e o
 *     import lê o nome e o descarta (`executar-importacao.ts:348-352`). O
 *     único nome alcançável é `ClienteBackoffice.nome` (`:651`), por documento
 *     normalizado. A pergunta é a COBERTURA: se for alta, a tela empresta o
 *     nome e não há migration; se for baixa, coluna nova é inevitável — e a
 *     fatia descoberta é, por definição, o cliente exclusivo da Corretora, que
 *     é a razão de a regra 2 do import existir.
 *  3. Telefone — a fila de renovação existe para LIGAR. Se nenhum dos
 *     relatórios das companhias traz telefone, criar campo para ele não
 *     resolve nada: nasceria vazio, porque não existe escrita de
 *     `ContratoCorretora`/`PessoaGrupo` fora do import.
 *  4. Atendente — `@@index([atendenteCorretora, status])` (`:3445`) foi criado
 *     para "meus contratos ativos". Se o campo estiver majoritariamente vazio,
 *     ou com uma grafia por relatório, filtrar por atendente é promessa falsa.
 *  5. Cross-sell — só existe oportunidade de venda cruzada se houver gente com
 *     mais de um produto. Com base pequena o número pode ser zero, e um bloco
 *     de "oportunidades" sempre vazio ensina o usuário a ignorar a área.
 *
 * ── SQL CRU EM VEZ DO CLIENTE TIPADO ─────────────────────────────────────
 * Mesma razão de `contagem-tabelas.ts`: o cliente é gerado do schema da
 * BRANCH e a pergunta é sobre o BANCO. Aqui pesa mais ainda, porque duas das
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

/** `12 de 34 (35,3%)`, ou `12 de 0` sem divisão por zero. */
function fatia(parte: number, total: number): string {
  if (total === 0) return `${parte} de 0`;
  return `${parte} de ${total} (${((parte / total) * 100).toFixed(1)}%)`;
}

function titulo(n: number, texto: string): void {
  console.log(`\n=== ${n}. ${texto} ===`);
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
  // ambiente). Perguntar antes é mais honesto do que deixar cinco blocos
  // estourarem com erro de SQL e o operador adivinhar qual foi o motivo.
  const tabelas = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name IN ('ContratoCorretora', 'PessoaGrupo', 'ClienteBackoffice', 'PerfilImportacao')
  `;
  const existe = new Set(tabelas.map((t) => t.table_name));
  const faltando = ["ContratoCorretora", "PessoaGrupo", "ClienteBackoffice", "PerfilImportacao"].filter(
    (t) => !existe.has(t),
  );
  if (faltando.length > 0) {
    console.error(`\nNão existem neste banco: ${faltando.join(", ")}. Não dá para medir.`);
    return INDETERMINADO;
  }

  // ── 1. O Radar é radar de datas? ────────────────────────────────────────
  titulo(1, "Fim de vigência — a frente C é viável?");
  const vig = await prisma.$queryRaw<
    Array<{ total: number; sem_fim: number; ativos: number; ativo_sem_fim: number }>
  >`
    SELECT count(*)::int                                                          AS total,
           count(*) FILTER (WHERE "fimVigencia" IS NULL)::int                     AS sem_fim,
           count(*) FILTER (WHERE "status" = 'ativo')::int                        AS ativos,
           count(*) FILTER (WHERE "status" = 'ativo' AND "fimVigencia" IS NULL)::int AS ativo_sem_fim
    FROM "ContratoCorretora"
  `;
  const v = vig[0] ?? { total: 0, sem_fim: 0, ativos: 0, ativo_sem_fim: 0 };
  if (v.total === 0) {
    console.log("  Nenhum contrato gravado. As três telas nascem vazias — medir de novo depois do import.");
  } else {
    console.log(`  Contratos:              ${v.total}`);
    console.log(`  Sem data de fim:        ${fatia(v.sem_fim, v.total)}`);
    console.log(`  Ativos:                 ${v.ativos}`);
    console.log(`  Ativos sem data de fim: ${fatia(v.ativo_sem_fim, v.ativos)}  <- é este que decide`);
    console.log(
      "  Leitura: esta fatia é INVISÍVEL em qualquer janela de 30/60/90 dias.\n" +
        "  Alta, o Radar deixa de ser radar de datas e o desenho muda.",
    );
  }

  // ── 2. De onde vem o nome do titular ────────────────────────────────────
  //
  // Duas contagens diferentes de propósito: o VÍNCULO (`pessoaGrupoId`, que
  // hoje nasce null em toda linha e só é preenchido pelo backfill) e o
  // CASAMENTO POR DOCUMENTO, que não depende do backfill ter rodado. A
  // distância entre os dois é exatamente o que o backfill entregaria.
  //
  // E o "sem nome" NÃO é `pessoas - casa_por_documento`. Os dois caminhos são
  // independentes, e `ClienteBackoffice.cpfCnpj` é NULLABLE: existe titular já
  // vinculado (nome alcançável pela relação) que não casa por documento, e a
  // subtração o contaria como perdido. Como este é justamente o número que
  // decide entre "empresta o nome" e "migration de faixa vermelha", ele é
  // calculado como o complemento de verdade — `NOT (vinculo OR documento)`.
  titulo(2, "Nome do titular — o join cobre quanto?");
  // `[^0-9]` e não `\D`: isto é uma template literal, e `\D` não é escape
  // reconhecido — o valor cozido chegaria ao Postgres como a letra `D`, e o
  // `regexp_replace` apagaria os "D" do documento em vez dos não-dígitos.
  // Silencioso e errado, que é a pior combinação.
  const nomes = await prisma.$queryRaw<
    Array<{ pessoas: number; com_vinculo: number; casa_por_documento: number; sem_nome: number }>
  >`
    WITH titulares AS (
      SELECT DISTINCT pg.id, pg."cpfCnpj"
        FROM "PessoaGrupo" pg
        JOIN "ContratoCorretora" c ON c."pessoaGrupoId" = pg.id
    ),
    caminhos AS (
      SELECT t.id,
             EXISTS (
               SELECT 1 FROM "ClienteBackoffice" cb WHERE cb."pessoaGrupoId" = t.id
             ) AS por_vinculo,
             EXISTS (
               SELECT 1 FROM "ClienteBackoffice" cb
                WHERE t."cpfCnpj" <> ''
                  AND regexp_replace(coalesce(cb."cpfCnpj", ''), '[^0-9]', '', 'g') = t."cpfCnpj"
             ) AS por_documento
        FROM titulares t
    )
    SELECT count(*)::int                                             AS pessoas,
           count(*) FILTER (WHERE por_vinculo)::int                  AS com_vinculo,
           count(*) FILTER (WHERE por_documento)::int                AS casa_por_documento,
           count(*) FILTER (WHERE NOT (por_vinculo OR por_documento))::int AS sem_nome
      FROM caminhos
  `;
  const n = nomes[0] ?? { pessoas: 0, com_vinculo: 0, casa_por_documento: 0, sem_nome: 0 };
  console.log(`  Titulares com contrato na Corretora: ${n.pessoas}`);
  console.log(`  Já vinculados a ClienteBackoffice:   ${fatia(n.com_vinculo, n.pessoas)}`);
  console.log(`  Casariam por documento (pós-backfill): ${fatia(n.casa_por_documento, n.pessoas)}`);
  console.log(`  SEM NOME por nenhum caminho:        ${fatia(n.sem_nome, n.pessoas)}  <- é este que decide`);
  console.log(
    "  Leitura: a última linha é o cliente EXCLUSIVO da Corretora. Se for\n" +
      "  pequena, a tela empresta o nome de Investimentos e não há migration.\n" +
      "  Se for grande, `PessoaGrupo.nome` é inevitável — e é faixa vermelha.",
  );

  // ── 3. Telefone existe em algum relatório? ──────────────────────────────
  //
  // `dadosProduto` guarda toda coluna do relatório que não tem campo próprio
  // (`importar-contratos.ts:300-304`), então as chaves do Json são o inventário
  // do que as companhias mandam e o sistema não sabe usar. É onde um telefone
  // apareceria, se aparecesse.
  titulo(3, "Telefone — alguma companhia manda?");
  // `jsonb_typeof(...) = 'object'` e não `IS NOT NULL`: `jsonb_object_keys`
  // LANÇA em escalar, array e no `'null'::jsonb` que `Prisma.JsonNull` grava —
  // e uma linha ruim derrubaria também os blocos 4 e 5. O `IS NOT NULL`
  // sozinho não protegeria: a função é strict, então SQL NULL já devolve zero
  // linhas e a cláusula não cobria justamente o caso que estoura.
  const chaves = await prisma.$queryRaw<Array<{ coluna: string; linhas: number }>>`
    SELECT k AS coluna, count(*)::int AS linhas
      FROM "ContratoCorretora" c, LATERAL jsonb_object_keys(c."dadosProduto") AS k
     WHERE jsonb_typeof(c."dadosProduto") = 'object'
     GROUP BY k
     ORDER BY 2 DESC, 1
  `;
  if (chaves.length === 0) {
    console.log("  Nenhuma coluna extra em `dadosProduto` — nenhum relatório trouxe campo fora dos 13.");
  } else {
    for (const c of chaves) console.log(`  ${c.coluna.padEnd(32)} ${String(c.linhas).padStart(6)} linhas`);
  }
  const pareceTelefone = chaves.filter((c) => /fone|celul|whats|contato|tel\b/i.test(c.coluna));
  console.log(
    pareceTelefone.length > 0
      ? `  Parecem contato: ${pareceTelefone.map((c) => c.coluna).join(", ")}`
      : "  Nenhuma chave parece telefone. Leitura: criar campo de telefone hoje\n" +
          "  nasceria vazio — não há import que o preencha nem tela que o digite.",
  );

  // ── 4. A visão por atendente existe? ────────────────────────────────────
  //
  // Duas coisas ao mesmo tempo: quanto está vazio (filtro que não filtra) e
  // quantas grafias distintas há. `atendenteCorretora` é texto livre, e o
  // próprio motor já diagnostica grafias repetidas — se "Ana", "ANA" e "Ana
  // Paula" forem a mesma pessoa, o filtro divide a carteira dela em três.
  titulo(4, "Atendente — dá para filtrar por quem atende?");
  // `atendente` volta NULL para vazio em vez de uma sentinela de texto: um
  // atendente gravado literalmente como "(vazio)" colidiria com a sentinela e
  // seria contado como ausência. Texto livre não dá garantia nenhuma sobre o
  // conteúdo, então a distinção mora no tipo, não na string.
  const atendentes = await prisma.$queryRaw<Array<{ atendente: string | null; linhas: number }>>`
    SELECT nullif(trim("atendenteCorretora"), '') AS atendente,
           count(*)::int AS linhas
      FROM "ContratoCorretora"
     WHERE "status" = 'ativo'
     GROUP BY 1
     ORDER BY 2 DESC
  `;
  if (atendentes.length === 0) {
    console.log("  Nenhum contrato ativo.");
  } else {
    for (const a of atendentes) {
      console.log(`  ${(a.atendente ?? "(sem atendente)").padEnd(32)} ${String(a.linhas).padStart(6)}`);
    }
    const vazio = atendentes.find((a) => a.atendente === null)?.linhas ?? 0;
    const total = atendentes.reduce((s, a) => s + a.linhas, 0);
    console.log(`  Sem atendente: ${fatia(vazio, total)}`);
    console.log(
      "  Leitura: grafias distintas da MESMA pessoa dividem a carteira dela.\n" +
        "  Confira a lista acima com os olhos antes de prometer filtro por atendente.",
    );
  }

  // ── 5. Cross-sell tem massa? ────────────────────────────────────────────
  titulo(5, "Cross-sell — quantas pessoas têm mais de um produto?");
  const cruz = await prisma.$queryRaw<Array<{ n_produtos: number; pessoas: number }>>`
    SELECT n_produtos, count(*)::int AS pessoas
      FROM (SELECT "pessoaGrupoId", count(DISTINCT "tipoProduto")::int AS n_produtos
              FROM "ContratoCorretora"
             WHERE "status" = 'ativo'
             GROUP BY 1) t
     GROUP BY 1
     ORDER BY 1
  `;
  if (cruz.length === 0) {
    console.log("  Nenhum contrato ativo.");
  } else {
    for (const c of cruz) {
      console.log(`  ${c.n_produtos} produto(s) distinto(s): ${String(c.pessoas).padStart(5)} pessoas`);
    }
    const multi = cruz.filter((c) => c.n_produtos > 1).reduce((s, c) => s + c.pessoas, 0);
    const todas = cruz.reduce((s, c) => s + c.pessoas, 0);
    console.log(`  Com mais de um produto: ${fatia(multi, todas)}  <- é este que decide`);
    console.log(
      "  Leitura: co-ocorrência entre produtos só é afirmável com massa. Baixa,\n" +
        "  o bloco de oportunidade fica em um slot só e a estatística espera a base crescer.",
    );
  }

  console.log("\nFim. Nada foi alterado: este script só faz SELECT.");
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
