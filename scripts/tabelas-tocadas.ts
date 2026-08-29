/**
 * Imprime, uma por linha, as tabelas que os arquivos de migration passados
 * como argumento mexem. Casca de IO — a regra está em
 * `src/lib/ci/tabelas-tocadas.ts`, com testes.
 *
 * Uso, dentro do workflow:
 *   git diff --name-only "$BASE_SHA" "$HEAD_SHA" \
 *     | xargs -r npx tsx scripts/tabelas-tocadas.ts
 *
 * Recebe TODOS os caminhos alterados e filtra sozinho os que são
 * `migration.sql` — assim o chamador não precisa repetir a regra do que é
 * migration, e ela fica num lugar só, testada.
 *
 * SOMENTE LEITURA de arquivo. Não abre banco, não escreve nada.
 *
 * Arquivo que sumiu no diff (uma migration REVERTIDA na PR) é ignorado em
 * silêncio: ele não existe no checkout, e uma migration que a PR remove não é
 * uma tabela que a PR toca.
 */

import { readFileSync } from "node:fs";
import { tabelasDeMigrations, ehMigrationSql } from "../src/lib/ci/tabelas-tocadas";

const sqls: string[] = [];

for (const caminho of process.argv.slice(2)) {
  if (!ehMigrationSql(caminho)) continue;
  try {
    sqls.push(readFileSync(caminho, "utf8"));
  } catch {
    // Ver o comentário do cabeçalho: arquivo ausente é resposta, não falha.
  }
}

for (const tabela of tabelasDeMigrations(sqls)) console.log(tabela);
