/**
 * Quais TABELAS uma PR toca — lido do SQL das migrations que ela traz.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * O `contagem-tabelas.ts` conta todas as tabelas, e o relatório dele tem cem
 * linhas. A #410 apostou que `ContratoCorretora` estava vazia; o workflow
 * rodou, passou verde, e a resposta estava lá dentro — ninguém achou. Em
 * 28/08/2026 a mesma coisa aconteceu de novo, comigo: tentei recuperar essa
 * contagem três vezes no log de uma execução e desisti.
 *
 * Contar tudo e destacar nada é o mesmo que não contar. O que decide uma PR
 * de migration é uma pergunta só — **as tabelas que ESTA PR mexe estão
 * vazias?** — e é essa que precisa aparecer no topo.
 *
 * ── POR QUE O SQL DA MIGRATION, E NÃO O `schema.prisma` ──────────────────
 * Parece que a fonte natural seria o diff do schema. Não é, por duas razões.
 *
 * A primeira é de precisão: quem muda tabela no banco é a migration. Editar o
 * `schema.prisma` sem migration não toca em linha nenhuma de produção — seria
 * destaque para uma tabela que a PR não vai encostar, e destaque que erra
 * ensina a ignorar destaque.
 *
 * A segunda é de forma: mapear uma linha alterada do schema de volta ao
 * `model` que a contém exige reconstruir os blocos e cruzar com os números de
 * linha do diff. O SQL diz o nome da tabela na própria instrução, entre aspas.
 * Uma leitura simples e certa vale mais que uma sofisticada e aproximada.
 *
 * ── O QUE CONTA COMO "TOCAR" ─────────────────────────────────────────────
 * DDL e DML: `CREATE/ALTER/DROP TABLE`, `INSERT INTO`, `UPDATE`, `DELETE
 * FROM`, `TRUNCATE`. Um `CREATE INDEX` também nomeia a tabela (`ON "X"`) e
 * entra: índice em tabela grande trava escrita enquanto constrói, e saber que
 * ela tem 2,7 milhões de linhas ANTES é o ponto.
 *
 * `CREATE TABLE` de tabela que nasce agora vai aparecer como "não existe no
 * banco", e está certo: é a resposta, não um erro.
 *
 * ── E `REFERENCES`, QUE FALTAVA ──────────────────────────────────────────
 * Uma tabela NOVA que aponta para uma ANTIGA por chave estrangeira toca a
 * antiga: o Postgres pega `SHARE ROW EXCLUSIVE` nela e instala um gatilho de
 * verificação. Em tabela grande sob carga, isso é evento — e a linha
 * `REFERENCES "X"` é a única menção a X numa migration puramente aditiva.
 *
 * Descoberto usando a própria ferramenta, na PR da migration do
 * ADM/Financeiro: ela cria `ParcelaReceita` apontando para
 * `ContratoCorretora`, e a contagem daquela tabela era EXATAMENTE o número
 * que decidia a PR seguinte. Sem este padrão, ela não aparecia no destaque —
 * a ferramenta calava justamente sobre o caso que a motivou.
 */

/** Instruções que caracterizam "esta migration mexe nesta tabela". */
const PADROES: readonly RegExp[] = [
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi,
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"([^"]+)"/gi,
  /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi,
  /\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?"([^"]+)"/gi,
  /\bINSERT\s+INTO\s+"([^"]+)"/gi,
  /\bUPDATE\s+(?:ONLY\s+)?"([^"]+)"/gi,
  /\bDELETE\s+FROM\s+(?:ONLY\s+)?"([^"]+)"/gi,
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[^\s]+\s+ON\s+(?:ONLY\s+)?"([^"]+)"/gi,
  /\bREFERENCES\s+"([^"]+)"/gi,
];

/**
 * Tira comentários antes de casar os padrões.
 *
 * Sem isto, a linha `-- DROP TABLE "Cliente" (não faça isso)` — que toda
 * migration escrita com cuidado tem — colocaria `Cliente` na lista e o
 * destaque passaria a apontar uma tabela que ninguém encostou. O destaque
 * vive de ser confiável; um falso positivo custa mais que um silêncio.
 *
 * Ordem importa: o bloco `/* … *\/` sai primeiro, senão um `--` dentro dele
 * cortaria só até o fim daquela linha e deixaria o resto do bloco valendo.
 */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Nomes de tabela citados no SQL de migration, sem repetição e em ordem
 * alfabética — ordem estável para o relatório não mudar de forma entre
 * execuções idênticas.
 */
export function tabelasDeMigrations(arquivosSql: readonly string[]): string[] {
  const achadas = new Set<string>();

  for (const bruto of arquivosSql) {
    const sql = semComentarios(bruto);
    for (const padrao of PADROES) {
      /* `matchAll` com regex global não guarda `lastIndex` entre chamadas
       * porque cria seu próprio iterador — mas os padrões são constantes de
       * módulo e `exec` guardaria. É o motivo de usar `matchAll` aqui. */
      for (const achado of sql.matchAll(padrao)) {
        const nome = achado[1]?.trim();
        if (nome) achadas.add(nome);
      }
    }
  }

  return [...achadas].sort();
}

/** Só os caminhos que são SQL de migration do Prisma. */
export function ehMigrationSql(caminho: string): boolean {
  return /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(caminho);
}
