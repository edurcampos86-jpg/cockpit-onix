/**
 * As cinco medições que decidem o desenho das telas da Corretora.
 *
 * SOMENTE LEITURA. Só `SELECT`, `count` e `GROUP BY`. Nenhum
 * INSERT/UPDATE/DELETE/DDL em nenhum caminho.
 *
 * ── POR QUE ESTE MÓDULO EXISTE ───────────────────────────────────────────
 * As medições nasceram em `scripts/medir-corretora.ts` (#418), que exige
 * terminal. Quem decide não usa terminal. Em vez de reescrever as consultas
 * numa rota — duas cópias que divergem no primeiro ajuste e passam a dar
 * respostas diferentes para a mesma pergunta —, a lógica mora aqui e os dois
 * consumidores a chamam:
 *
 *   • `scripts/medir-corretora.ts`      → imprime no terminal
 *   • `api/backoffice/medir-corretora`  → devolve JSON
 *
 * É o mesmo arranjo de `backoffice/backfill-pessoa-grupo.ts`, e pela mesma
 * razão: o ensaio só prova algo sobre a rota se rodar o MESMO código.
 *
 * ── NADA AQUI IMPORTA `@/lib/prisma` ─────────────────────────────────────
 * Só o TIPO. O script precisa checar `DATABASE_URL` e imprimir uma mensagem
 * útil antes de qualquer conexão; `@/lib/prisma` instancia no import
 * (`process.env.DATABASE_URL!`), e um import estático nosso quebraria essa
 * ordem. Mesma nota de `backoffice/recon-identidade.ts`.
 *
 * ── NENHUM DADO PESSOAL SAI DAQUI ────────────────────────────────────────
 * Só contagens agregadas e NOMES DE COLUNA de relatório. Nem documento, nem
 * nome de pessoa, nem e-mail, nem telefone — inclusive na medição 3, que
 * devolve as CHAVES do Json de origem e nunca os valores. A regra é
 * verificável lendo os tipos abaixo: não há campo de string livre vindo de
 * dado de cliente, com a única exceção de `atendenteCorretora`, que é nome de
 * quem atende e não do cliente, e é o objeto da medição 4.
 *
 * ── NOTA SOBRE AS REGEX NO SQL ───────────────────────────────────────────
 * A classe é `[^0-9]`, nunca `\D`. Em template literal do JavaScript, `\D`
 * não é escape reconhecido e o backslash é engolido: a string que chegaria ao
 * Postgres seria `D`, e o `regexp_replace` passaria a apagar a letra D em vez
 * dos não-dígitos — em silêncio. Mesma trava de `recon-identidade.ts:43-46`.
 */
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * O contrato mínimo que a coleta usa. Aceita o `PrismaClient` inteiro, mas não
 * exige — deixa explícito que só leitura é usada.
 */
export type ClienteLeitura = Pick<PrismaClient, "$queryRaw" | "$transaction">;

/** As tabelas que as cinco medições tocam. Sem uma delas, não dá para medir. */
export const TABELAS_NECESSARIAS = [
  "ContratoCorretora",
  "PessoaGrupo",
  "ClienteBackoffice",
] as const;

/* ── 1. Fim de vigência ─────────────────────────────────────────────────── */

/**
 * `fimVigencia` é opcional (`prisma/schema.prisma:3326`) e o próprio schema
 * (`:3323-3325`) registra que `null` é "vigência contínua" OU "fim desconhecido
 * no relatório", sem distinguir os dois. Contrato sem fim é invisível em
 * qualquer janela de 30/60/90 dias — é essa fatia que decide se o radar de
 * renovação é radar de datas ou uma tela cega para parte da base.
 */
export type MedicaoVigencia = {
  readonly contratos: number;
  readonly semFim: number;
  readonly ativos: number;
  /** O número que decide. Invisível em qualquer janela de data. */
  readonly ativosSemFim: number;
};

/* ── 2. Nome do titular ─────────────────────────────────────────────────── */

/**
 * `PessoaGrupo` não tem coluna de nome (`prisma/schema.prisma:923-946`) e o
 * import lê o nome e o descarta (`executar-importacao.ts:348-352`).
 *
 * A carteira de Investimentos, essa sim, tem nome, documento, e-mail e
 * telefone. Então, para quem é cliente das DUAS casas, o nome (e o contato) já
 * é alcançável por `PessoaGrupo.clientes` — sem migration nenhuma.
 *
 * O número que decide, portanto, não é "quantos têm nome": é o COMPLEMENTO —
 * quantas pessoas com contrato na Corretora NÃO têm contraparte em
 * Investimentos por caminho nenhum. Só essas ficam sem nome em lugar algum, e
 * são só elas que justificam (ou não) a coluna nova.
 *
 * Dois caminhos INDEPENDENTES levam à contraparte, e é por isso que o
 * complemento não é uma subtração:
 *
 *   • o VÍNCULO — `ClienteBackoffice.pessoaGrupoId`, que hoje nasce null em
 *     toda linha (`schema.prisma:919-921`) e só é preenchido pelo backfill;
 *   • o CASAMENTO POR DOCUMENTO — que não depende de o backfill ter rodado.
 *
 * Como `ClienteBackoffice.cpfCnpj` é NULLABLE, existe titular já vinculado —
 * contraparte alcançável pela relação — que não casa por documento. Subtrair
 * `casaPorDocumento` do total contaria essa pessoa como perdida.
 */
export type MedicaoNome = {
  /** Pessoas com pelo menos um contrato na Corretora. */
  readonly titulares: number;
  /** Já ligados a `ClienteBackoffice` pela FK. */
  readonly comVinculo: number;
  /** Casariam por documento normalizado, mesmo sem o backfill ter rodado. */
  readonly casaPorDocumento: number;
  /**
   * O NÚMERO QUE DECIDE: `NOT (vínculo OR documento)`. É o cliente exclusivo
   * da Corretora — a razão de existir da regra 2 do import
   * (`importar-contratos.ts:22-24`). Para ele não há nome, e-mail nem telefone
   * em lugar nenhum do sistema, e nenhum join o alcança.
   */
  readonly semContraparteEmInvestimentos: number;
};

/* ── 3. Colunas que as companhias mandam e o sistema não usa ────────────── */

/**
 * `dadosProduto` guarda toda coluna do relatório que não tem campo próprio
 * (`importar-contratos.ts:300-304`), então as chaves do Json são o inventário
 * do que as companhias mandam e o sistema não sabe usar.
 *
 * Só as CHAVES saem daqui. Os valores ficam no banco.
 */
export type MedicaoColunasExtras = {
  readonly colunas: readonly { readonly coluna: string; readonly contratos: number }[];
  /** Subconjunto de `colunas` cujo nome sugere contato. Heurística, não prova. */
  readonly parecemContato: readonly string[];
};

/* ── 4. Atendente ───────────────────────────────────────────────────────── */

/**
 * `@@index([atendenteCorretora, status])` (`schema.prisma:3445`) foi criado
 * para "meus contratos ativos". Com o campo vazio, ou com uma grafia por
 * relatório, filtrar por atendente é promessa falsa.
 *
 * `atendente` é `null` para vazio em vez de uma sentinela de texto: o campo é
 * livre, e um atendente gravado literalmente como "(vazio)" colidiria com a
 * sentinela e seria contado como ausência.
 */
export type MedicaoAtendente = {
  readonly grupos: readonly { readonly atendente: string | null; readonly contratos: number }[];
  readonly semAtendente: number;
  readonly contratosAtivos: number;
};

/* ── 5. Cross-sell ──────────────────────────────────────────────────────── */

/**
 * Só existe oportunidade de venda cruzada se houver gente com mais de um
 * produto. Com base pequena o número pode ser zero, e um bloco de
 * "oportunidades" sempre vazio ensina o usuário a ignorar a área.
 */
export type MedicaoCrossSell = {
  readonly distribuicao: readonly {
    readonly produtosDistintos: number;
    readonly pessoas: number;
  }[];
  readonly comMaisDeUmProduto: number;
  readonly pessoasComContratoAtivo: number;
};

export type Medicoes = {
  readonly vigencia: MedicaoVigencia;
  readonly nome: MedicaoNome;
  readonly colunasExtras: MedicaoColunasExtras;
  readonly atendente: MedicaoAtendente;
  readonly crossSell: MedicaoCrossSell;
};

/**
 * A leitura de cada número — o que ele muda na decisão.
 *
 * Mora aqui, e não em cada consumidor, porque terminal e tela precisam contar
 * a MESMA história: número sem leitura vira interpretação de quem lê, e a
 * interpretação errada é o defeito que estas medições existem para evitar.
 */
export const LEITURAS: Readonly<Record<keyof Medicoes, string>> = {
  vigencia:
    "`ativosSemFim` é invisível em qualquer janela de 30/60/90 dias. Se a fatia " +
    "for grande, o radar de renovação não é radar de datas e o desenho muda.",
  nome:
    "`semContraparteEmInvestimentos` é o número que decide. A carteira de " +
    "Investimentos tem nome, documento, e-mail e telefone, então quem é das duas " +
    "casas já tem o nome alcançável por `PessoaGrupo.clientes`, sem migration. " +
    "Só o cliente EXCLUSIVO da Corretora fica sem nome em lugar nenhum — e é só " +
    "ele que justifica (ou não) a coluna `PessoaGrupo.nome`.",
  colunasExtras:
    "São os rótulos que as companhias mandam e o sistema não sabe usar. Se " +
    "nenhum parecer contato, criar campo de telefone hoje nasceria vazio: não há " +
    "escrita de ContratoCorretora nem de PessoaGrupo fora do import.",
  atendente:
    "Grafias distintas da MESMA pessoa dividem a carteira dela em duas linhas. " +
    "A lista precisa ser conferida com os olhos antes de prometer filtro por " +
    "atendente.",
  crossSell:
    "Co-ocorrência entre produtos só é afirmável com massa. Se `comMaisDeUmProduto` " +
    "for baixo, o bloco de oportunidade fica em um slot só e a estatística espera " +
    "a base crescer.",
};

/** As tabelas de `TABELAS_NECESSARIAS` que NÃO existem neste banco. */
export async function tabelasAusentes(db: ClienteLeitura): Promise<string[]> {
  const alvos = [...TABELAS_NECESSARIAS];
  const linhas = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name = ANY(${alvos})
  `;
  const existe = new Set(linhas.map((l) => l.table_name));
  return alvos.filter((t) => !existe.has(t));
}

/** Nome de coluna que sugere um canal de contato. Heurística declarada. */
const PARECE_CONTATO = /fone|celul|whats|contato|tel\b|e-?mail/i;

/**
 * A coluna do relatório parece um canal de contato?
 *
 * É HEURÍSTICA, e está exportada para ser testável e para ficar explícito que
 * é palpite sobre o RÓTULO, não leitura do conteúdo. O `\b` depois de `tel`
 * existe para "tel" casar e "telefonema" também, mas não palavras que só
 * começam com as mesmas letras por acidente — o falso positivo aqui custa uma
 * checagem à toa; o falso negativo custa concluir que não há contato quando
 * havia.
 */
export function pareceContato(coluna: string): boolean {
  return PARECE_CONTATO.test(coluna);
}

/**
 * Coleta as cinco medições numa transação de LEITURA, em `RepeatableRead`.
 *
 * A transação não é cerimônia: o import da Corretora pode estar rodando
 * enquanto isto mede. Sem ela, a contagem de contratos e a de titulares viriam
 * de instantes diferentes, e a inconsistência apareceria como "bug" na hora de
 * decidir.
 *
 * O NÍVEL É EXPLÍCITO, e precisa ser. Sem `isolationLevel`, o Prisma abre a
 * transação e deixa o Postgres no default — `READ COMMITTED`, cujo snapshot é
 * por STATEMENT e não por transação. Ou seja: envolver as cinco consultas num
 * `BEGIN` não daria instantâneo nenhum, e o comentário prometeria uma garantia
 * que o código não entrega. `RepeatableRead` tira um snapshot só, no primeiro
 * statement, e as cinco leem dele.
 *
 * Custo: nenhum bloqueio (leitura pura não conflita) e nenhum risco de
 * serialization failure, que é problema de `Serializable` — este nível não
 * precisa ser tentado de novo.
 */
export async function coletarMedicoes(db: ClienteLeitura): Promise<Medicoes> {
  const [vigRows, nomeRows, colunaRows, atendenteRows, cruzRows] = await db.$transaction([
    db.$queryRaw<
      Array<{ contratos: number; sem_fim: number; ativos: number; ativos_sem_fim: number }>
    >`
      SELECT count(*)::int                                                            AS contratos,
             count(*) FILTER (WHERE "fimVigencia" IS NULL)::int                       AS sem_fim,
             count(*) FILTER (WHERE "status" = 'ativo')::int                          AS ativos,
             count(*) FILTER (WHERE "status" = 'ativo' AND "fimVigencia" IS NULL)::int AS ativos_sem_fim
        FROM "ContratoCorretora"
    `,

    // Os dois caminhos viram booleanos POR TITULAR numa CTE, e só depois são
    // agregados. É o que permite `sem_contraparte` ser o complemento da UNIÃO
    // dos caminhos, e não uma subtração que ignoraria um deles.
    db.$queryRaw<
      Array<{
        titulares: number;
        com_vinculo: number;
        casa_por_documento: number;
        sem_contraparte: number;
      }>
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
      SELECT count(*)::int                                                  AS titulares,
             count(*) FILTER (WHERE por_vinculo)::int                       AS com_vinculo,
             count(*) FILTER (WHERE por_documento)::int                     AS casa_por_documento,
             count(*) FILTER (WHERE NOT (por_vinculo OR por_documento))::int AS sem_contraparte
        FROM caminhos
    `,

    // `jsonb_typeof(...) = 'object'` e não `IS NOT NULL`: `jsonb_object_keys`
    // LANÇA em escalar, array e no `'null'::jsonb` que `Prisma.JsonNull`
    // grava. O `IS NOT NULL` não protegeria — a função é strict, SQL NULL já
    // devolve zero linhas, e a cláusula não cobria o caso que estoura.
    db.$queryRaw<Array<{ coluna: string; contratos: number }>>`
      SELECT k AS coluna, count(*)::int AS contratos
        FROM "ContratoCorretora" c, LATERAL jsonb_object_keys(c."dadosProduto") AS k
       WHERE jsonb_typeof(c."dadosProduto") = 'object'
       GROUP BY k
       ORDER BY 2 DESC, 1
    `,

    db.$queryRaw<Array<{ atendente: string | null; contratos: number }>>`
      SELECT nullif(trim("atendenteCorretora"), '') AS atendente,
             count(*)::int AS contratos
        FROM "ContratoCorretora"
       WHERE "status" = 'ativo'
       GROUP BY 1
       ORDER BY 2 DESC
    `,

    db.$queryRaw<Array<{ produtos_distintos: number; pessoas: number }>>`
      SELECT produtos_distintos, count(*)::int AS pessoas
        FROM (SELECT "pessoaGrupoId", count(DISTINCT "tipoProduto")::int AS produtos_distintos
                FROM "ContratoCorretora"
               WHERE "status" = 'ativo'
               GROUP BY 1) t
       GROUP BY 1
       ORDER BY 1
    `,
    // `Prisma.TransactionIsolationLevel.RepeatableRead` seria o import do
    // client gerado; a união é de strings e o literal evita puxar o namespace
    // de runtime para um módulo que só importa TIPO do Prisma — é a nota do
    // topo do arquivo.
  ], { isolationLevel: "RepeatableRead" });

  const v = vigRows[0] ?? { contratos: 0, sem_fim: 0, ativos: 0, ativos_sem_fim: 0 };
  const n = nomeRows[0] ?? {
    titulares: 0,
    com_vinculo: 0,
    casa_por_documento: 0,
    sem_contraparte: 0,
  };

  const colunas = colunaRows.map((c) => ({ coluna: c.coluna, contratos: c.contratos }));
  const grupos = atendenteRows.map((a) => ({ atendente: a.atendente, contratos: a.contratos }));
  const distribuicao = cruzRows.map((c) => ({
    produtosDistintos: c.produtos_distintos,
    pessoas: c.pessoas,
  }));

  return {
    vigencia: {
      contratos: v.contratos,
      semFim: v.sem_fim,
      ativos: v.ativos,
      ativosSemFim: v.ativos_sem_fim,
    },
    nome: {
      titulares: n.titulares,
      comVinculo: n.com_vinculo,
      casaPorDocumento: n.casa_por_documento,
      semContraparteEmInvestimentos: n.sem_contraparte,
    },
    colunasExtras: {
      colunas,
      parecemContato: colunas.filter((c) => pareceContato(c.coluna)).map((c) => c.coluna),
    },
    atendente: {
      grupos,
      semAtendente: grupos.find((g) => g.atendente === null)?.contratos ?? 0,
      contratosAtivos: grupos.reduce((s, g) => s + g.contratos, 0),
    },
    crossSell: {
      distribuicao,
      comMaisDeUmProduto: distribuicao
        .filter((d) => d.produtosDistintos > 1)
        .reduce((s, d) => s + d.pessoas, 0),
      pessoasComContratoAtivo: distribuicao.reduce((s, d) => s + d.pessoas, 0),
    },
  };
}
