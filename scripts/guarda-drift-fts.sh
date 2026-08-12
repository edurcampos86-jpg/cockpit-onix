#!/usr/bin/env bash
#
# Guarda do drift do índice full-text de PainelEmailAI.
#
# A coluna gerada `tsv` vive em SQL bruto (20260519240000) e o schema a declara
# como Unsupported("tsvector"), então TODA rodada de `prisma migrate dev` injeta
# dois statements que ninguém pediu:
#
#     DROP INDEX "PainelEmailAI_tsv_idx";
#     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
#
# Isso não é hipótese: o índice JÁ sumiu de produção uma vez e precisou de
# migration própria para voltar (20260613120000_painel_email_fts_index_recreate,
# que documenta "Reconciliacao read-only de 13/06/2026 confirmou: coluna tsv
# presente, indice ausente").
#
# ── Por que isto virou script, e não segue inline no ci.yml ────────────────
# A regra estava embutida em .github/workflows/ci.yml, onde NADA a exercita: se
# alguém reformatasse o AWK e ele parasse de casar, o passo continuaria verde e
# a proteção sumiria em silêncio — falha exatamente do tipo que a guarda existe
# para impedir. Como script, ela tem teste (src/lib/guarda-drift-fts.test.ts).
#
# Continua SEM depender de `npm ci`: é find + awk, disponíveis no runner. Essa
# propriedade é deliberada — a guarda roda mesmo quando o install quebra.
#
# Uso:  scripts/guarda-drift-fts.sh [diretório]     (default: prisma/migrations)
# Saída: 0 = limpo · 1 = ofensor encontrado · 2 = diretório inexistente
set -euo pipefail

DIR="${1:-prisma/migrations}"

if [ ! -d "$DIR" ]; then
  echo "guarda-drift-fts: diretório não encontrado: $DIR" >&2
  exit 2
fi

# Linha iniciada por `--` é comentário SQL e é IGNORADA de propósito: as
# migrations documentam a remoção em comentário e precisam passar. O que
# reprova é o statement executável.
OFENSORES=$(find "$DIR" -name '*.sql' -print0 \
  | xargs -0 --no-run-if-empty awk '
      /^[[:space:]]*--/ { next }
      /DROP[[:space:]]+INDEX[^;]*PainelEmailAI_tsv_idx/ {
        print FILENAME ":" FNR ": " $0
      }
      /ALTER[[:space:]]+COLUMN[[:space:]]+"?tsv"?[[:space:]]+DROP[[:space:]]+DEFAULT/ {
        print FILENAME ":" FNR ": " $0
      }
    ')

if [ -n "$OFENSORES" ]; then
  echo "::error::Migration derruba o índice full-text de PainelEmailAI."
  echo ""
  echo "Statements executáveis encontrados:"
  echo "$OFENSORES"
  echo ""
  echo "O QUE FAZER: apague essas linhas do migration.sql à mão."
  echo "Elas são DRIFT — o \`prisma migrate dev\` as injeta sozinho porque"
  echo "a coluna gerada \`tsv\` vive em SQL bruto (20260519240000) e o"
  echo "schema a declara como Unsupported(\"tsvector\"). Não pertencem à"
  echo "sua mudança, e o DROP INDEX destrói o índice FTS de PRODUÇÃO —"
  echo "já aconteceu uma vez (ver 20260613120000_painel_email_fts_index_recreate)."
  echo ""
  echo "Deixe a explicação em COMENTÁRIO (linha começando com --), como"
  echo "fazem as migrations existentes: comentário passa nesta guarda."
  exit 1
fi

echo "OK: nenhum DROP executável do índice FTS em $DIR."
