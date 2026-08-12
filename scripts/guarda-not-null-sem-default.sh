#!/usr/bin/env bash
#
# Guarda contra `ADD COLUMN ... NOT NULL` sem `DEFAULT` em migration.
#
# ── O QUE ACONTECE SEM ELA ────────────────────────────────────────────────
# Uma coluna obrigatória acrescentada a tabela que JÁ TEM LINHAS é recusada
# pelo Postgres com 23502:
#
#     ERROR: column "tipo" of relation "Empresa" contains null values
#
# Isso sozinho seria só uma migration que não aplica. O problema é onde a
# falha acontece — o start do serviço é:
#
#     start: prisma migrate deploy && next start          (package.json)
#
# O `&&` faz o `next start` NÃO rodar quando a migration falha. O desfecho
# não é "migration pendente": é o APP INTEIRO em loop de restart, até alguém
# perceber e corrigir. Uma constraint recusada derruba o site.
#
# ── NÃO É HIPÓTESE ────────────────────────────────────────────────────────
# A PR #301 acrescenta exatamente isso:
#
#     ALTER TABLE "Empresa" ADD COLUMN "tipo" "TipoNo" NOT NULL;
#
# sem DEFAULT, de propósito, como guarda contra rotular linhas por chute. A
# intenção é boa e o efeito colateral não foi percebido por ninguém — nem por
# quem escreveu, nem na revisão. `Empresa` tem 6 linhas em produção (medido).
#
# ── POR QUE VALE PARA TODA MIGRATION ──────────────────────────────────────
# O padrão se repete a cada `prisma migrate dev` que acrescenta campo
# obrigatório a modelo existente. É o erro mais fácil de cometer sem perceber
# e o mais caro de descobrir — porque só aparece no deploy, e derrubando tudo.
#
# ── SEGUE O PADRÃO DE `guarda-drift-fts.sh` ───────────────────────────────
# Script com teste (src/lib/guarda-not-null-sem-default.test.ts), e não regra
# inline no ci.yml, pelo motivo que aquele arquivo documenta: guarda embutida
# no workflow não é exercitada por nada, então pode parar de casar — um awk
# reformatado, um espaçamento diferente — e o passo segue VERDE. A proteção
# some em silêncio, que é exatamente o modo de falha contra o qual ela existe.
#
# Continua SEM depender de `npm ci`: é find + awk, disponíveis no runner. A
# guarda roda mesmo quando o install quebra.
#
# Uso:  scripts/guarda-not-null-sem-default.sh [diretório]  (default: prisma/migrations)
# Saída: 0 = limpo · 1 = ofensor encontrado · 2 = diretório inexistente
set -euo pipefail

DIR="${1:-prisma/migrations}"

if [ ! -d "$DIR" ]; then
  echo "guarda-not-null-sem-default: diretório não encontrado: $DIR" >&2
  exit 2
fi

# O que NÃO reprova, de propósito:
#
#   CREATE TABLE (... NOT NULL ...)     tabela nasce vazia; não há linha para
#                                       violar a constraint
#   ADD COLUMN ... NOT NULL DEFAULT x   é justamente a saída recomendada
#   linha iniciada por `--`             comentário passa, mesma regra da
#                                       guarda do FTS
#
# O `dentro` rastreia se estamos dentro de um ALTER TABLE: é ele que separa
# o ADD COLUMN perigoso do NOT NULL inofensivo de um CREATE TABLE.
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
  echo "Se o NOT NULL sem DEFAULT for INTENCIONAL como guarda (falhar caso a"
  echo "tabela não esteja vazia), ele AINDA derruba o app pelo mesmo && —"
  echo "confirme a tabela vazia ANTES do deploy e trate como faixa vermelha,"
  echo "com parada obrigatória."
  exit 1
fi

echo "OK: nenhuma coluna NOT NULL sem DEFAULT em $DIR."
