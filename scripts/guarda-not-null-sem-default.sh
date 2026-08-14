#!/usr/bin/env bash
#
# Guarda contra `ADD COLUMN ... NOT NULL` sem `DEFAULT` em migration.
#
# ── O caso concreto que motivou ───────────────────────────────────────────
# A PR #301 acrescenta
#
#     ALTER TABLE "Empresa" ADD COLUMN "tipo" "TipoNo" NOT NULL;
#
# sem DEFAULT, de propósito, como guarda contra rotular linhas por chute. A
# intenção é boa; o efeito, não — porque o start do serviço é
#
#     start: prisma migrate deploy && next start     (package.json)
#
# e o `&&` faz o `next start` NÃO rodar quando a migration falha. Numa tabela
# com linhas o Postgres recusa com 23502, e o desfecho não é "migration
# pendente": é o APP INTEIRO em loop de restart, até alguém perceber e
# corrigir. Foi medido: `Empresa` tem 6 linhas em produção.
#
# ── Por que vale para TODA migration, não só para a #301 ──────────────────
# O padrão se repete a cada `prisma migrate dev` que acrescenta campo
# obrigatório a modelo existente. É o erro mais fácil de cometer sem perceber,
# e o mais caro de descobrir em produção — exatamente o que uma guarda de CI
# pega de graça e uma revisão humana deixa passar.
#
# ── O que a guarda NÃO reprova, de propósito ──────────────────────────────
#   - `CREATE TABLE (... NOT NULL ...)` — a tabela nasce vazia, não há linha
#     para violar a constraint
#   - `ADD COLUMN ... NOT NULL DEFAULT x` — o DEFAULT preenche as existentes;
#     é justamente a saída recomendada
#   - linha iniciada por `--` — comentário passa, mesma regra da guarda do FTS
#
# ── Por que isto é script, e não shell inline no ci.yml ───────────────────
# Mesma razão de `guarda-drift-fts.sh`, e a #311 já pagou esse preço uma vez:
# regra embutida no workflow é regra que NADA exercita. Um reformat do AWK que
# parasse de casar deixaria o passo VERDE e a proteção sumiria em silêncio —
# falha do tipo exato que a guarda existe para impedir. Como script, ela tem
# teste (src/lib/guarda-not-null-sem-default.test.ts).
#
# Continua SEM depender de `npm ci`: é find + awk, disponíveis no runner. A
# guarda roda mesmo quando o install quebra.
#
# ── Limitação conhecida ───────────────────────────────────────────────────
# O awk analisa por LINHA. Uma cláusula `ADD COLUMN` quebrada em várias linhas
# (o `NOT NULL` numa linha e o `DEFAULT` na seguinte) escaparia. O Prisma não
# gera assim — cada `ADD COLUMN` sai numa linha, inclusive quando a mesma
# `ALTER TABLE` acrescenta várias colunas —, mas SQL editado à mão poderia.
# Declarado aqui em vez de descoberto depois.
#
# Uso:  scripts/guarda-not-null-sem-default.sh [diretório]  (default: prisma/migrations)
# Saída: 0 = limpo · 1 = ofensor encontrado · 2 = diretório inexistente
set -euo pipefail

DIR="${1:-prisma/migrations}"

if [ ! -d "$DIR" ]; then
  echo "guarda-not-null-sem-default: diretório não encontrado: $DIR" >&2
  exit 2
fi

# O estado `dentro` existe porque o Prisma quebra ALTER TABLE com várias
# colunas em uma linha por `ADD COLUMN`:
#
#     ALTER TABLE "X" ADD COLUMN     "a" TEXT NOT NULL DEFAULT '',
#     ADD COLUMN     "b" TEXT NOT NULL;
#
# A segunda linha não repete `ALTER TABLE` e precisa ser examinada mesmo assim.
# O `;` no fim fecha o statement e desarma o estado, para que um `NOT NULL`
# dentro de um CREATE TABLE posterior não seja lido como continuação.
OFENSORES=$(find "$DIR" -name '*.sql' -print0 \
  | xargs -0 --no-run-if-empty awk '
      /^[[:space:]]*--/ { next }
      toupper($0) ~ /ALTER[[:space:]]+TABLE/ { dentro=1 }
      dentro \
        && toupper($0) ~ /ADD[[:space:]]+COLUMN/ \
        && toupper($0) ~ /NOT[[:space:]]+NULL/ \
        && toupper($0) !~ /DEFAULT/ {
          print FILENAME ":" FNR ": " $0
        }
      /;[[:space:]]*$/ { dentro=0 }
    ')

if [ -n "$OFENSORES" ]; then
  echo "::error::Migration adiciona coluna NOT NULL sem DEFAULT em tabela existente."
  echo ""
  echo "Statements encontrados:"
  echo "$OFENSORES"
  echo ""
  echo "POR QUE ISSO DERRUBA O APP, e não só a migration:"
  echo "  1. a tabela tem linhas → Postgres recusa com 23502"
  echo "     (column \"x\" of relation \"T\" contains null values)"
  echo "  2. o start do serviço é: prisma migrate deploy && next start"
  echo "  3. o && faz o next start NÃO rodar quando a migration falha"
  echo "  4. resultado: app em loop de restart, não migration pendente"
  echo ""
  echo "O QUE FAZER — duas saídas:"
  echo "  (a) dar um DEFAULT à coluna:"
  echo "      ADD COLUMN \"x\" TEXT NOT NULL DEFAULT 'valor';"
  echo "  (b) backfill em três passos, quando não há default sensato:"
  echo "      1. ADD COLUMN \"x\" TEXT;              -- nullable"
  echo "      2. UPDATE \"T\" SET \"x\" = ...;         -- popular"
  echo "      3. ALTER COLUMN \"x\" SET NOT NULL;    -- travar"
  echo ""
  echo "Se a coluna NOT NULL sem DEFAULT for INTENCIONAL como guarda"
  echo "(falhar caso a tabela não esteja vazia), ela ainda derruba o"
  echo "app pelo mesmo && — confirme a tabela vazia ANTES do deploy e"
  echo "trate como faixa vermelha, com parada obrigatória."
  exit 1
fi

echo "OK: nenhuma coluna NOT NULL sem DEFAULT em $DIR."
