#!/usr/bin/env bash
#
# AVISO (nunca bloqueio) do contador de revisão da `onix-entrega-segura`:
# já fecharam 10 PRs desde a última revisão da skill?
#
# ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────
# A seção 10 da skill manda revisá-la **a cada 10 PRs fechadas, não por
# acúmulo de dor** — revisão por gatilho de dor sempre chega tarde e sempre
# corrige demais de uma vez. Só que a regra estava escrita em prosa e o
# contador era uma linha à mão em `docs/onix-co-estado.md`.
#
# Linha à mão apodrece. O MESMO arquivo listava como pendentes três itens já
# entregues pelas #316, #322 e #324. Uma regra calendarizada que depende de
# alguém lembrar de contar não é calendarizada — é intenção.
#
# ── POR QUE AVISO, E NÃO GATE ─────────────────────────────────────────────
# "Está na hora de revisar o método" não é motivo para reprovar a PR de
# outra pessoa, que não tem nada a ver com isso. Gate aqui empurraria quem
# está no meio de outra tarefa a fazer a revisão às pressas — que é
# exatamente o defeito que a revisão por calendário existe para evitar.
#
# Então este script SEMPRE sai 0.
#
# ── COMO ELE CONTA ────────────────────────────────────────────────────────
# Commits na `main` desde o MARCO ZERO. A `main` é linear e todo merge é
# squash desde a #256, então 1 commit ≈ 1 PR fechada. É aproximação
# declarada: um commit empurrado direto para a `main` contaria como PR, e
# está tudo bem — o número é gatilho de revisão, não métrica.
#
# ── FONTE ÚNICA DO MARCO ZERO ─────────────────────────────────────────────
# O sha vem de `.claude/skills/MARCO-ZERO`, não de argumento nem de constante
# no ci.yml. Antes ele vivia em dois lugares (o step e a doc) e nada os
# amarrava — e um sha desatualizado não seria relido por ninguém: o contador
# passaria a contar do ponto errado, em silêncio. Passar o sha por argumento
# continua possível, para teste.
#
# Uso:
#   ./scripts/aviso-revisao-skill.sh [ref-atual] [limite]
#   ./scripts/aviso-revisao-skill.sh --marco <sha> <ref-atual> [limite]
set -euo pipefail

ARQUIVO_MARCO="${ARQUIVO_MARCO:-.claude/skills/MARCO-ZERO}"

if [ "${1:-}" = "--marco" ]; then
  MARCO="${2:-}"
  REF="${3:-HEAD}"
  LIMITE="${4:-10}"
  if [ -z "$MARCO" ]; then
    echo "uso: $0 --marco <sha> <ref-atual> [limite]" >&2
    exit 2
  fi
else
  REF="${1:-HEAD}"
  LIMITE="${2:-10}"
  if [ ! -f "$ARQUIVO_MARCO" ]; then
    # Erro de configuração, não "nada a avisar": sair 0 aqui esconderia um
    # contador que parou de contar.
    echo "$ARQUIVO_MARCO não existe — sem fonte para o marco zero." >&2
    exit 2
  fi
  # Primeira linha não vazia e não comentada.
  # `|| true` porque grep sem casamento sai 1, e com `set -e` isso mataria o
  # script antes da mensagem — arquivo só com comentário tem de virar erro
  # explicado, não fim silencioso.
  MARCO=$(grep -v '^[[:space:]]*#' "$ARQUIVO_MARCO" 2> /dev/null | grep -v '^[[:space:]]*$' | head -n 1 | tr -d '[:space:]' || true)
  if [ -z "$MARCO" ]; then
    echo "$ARQUIVO_MARCO não tem nenhuma linha de sha." >&2
    exit 2
  fi
fi

if ! git cat-file -e "$MARCO^{commit}" 2> /dev/null; then
  echo "::warning::Marco zero '$MARCO' não existe neste clone — o contador de revisão da skill não está protegendo nada. (Checkout raso? o ci.yml usa fetch-depth: 0 justamente por isto.)"
  exit 0
fi

if ! git cat-file -e "$REF^{commit}" 2> /dev/null; then
  echo "::warning::Ref '$REF' não existe neste clone — contador de revisão da skill não avaliado."
  exit 0
fi

fechadas=$(git rev-list --count "$MARCO..$REF")

if [ "$fechadas" -lt "$LIMITE" ]; then
  echo "Contador de revisão da skill: $fechadas/$LIMITE PRs desde o marco zero ($MARCO). Nada a fazer."
  exit 0
fi

echo "::warning::onix-entrega-segura: $fechadas PRs fechadas desde a última revisão (limite $LIMITE). A seção 10 da skill pede revisão agora — responda as 3 perguntas fixas no relatório de lote."

# O summary é onde o aviso sobrevive: anotação de warning some da aba de
# checks depois de alguns runs; o summary fica preso ao run.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## ⏰ Revisão da \`onix-entrega-segura\` — $fechadas PRs desde o marco zero"
    echo ""
    echo "Marco zero: \`$MARCO\`. Limite: **$LIMITE**."
    echo ""
    echo "A seção 10 da skill pede revisão **por calendário, não por dor**. Responda as três perguntas fixas:"
    echo ""
    echo "1. Alguma regra desta skill **atrasou uma entrega** sem ter evitado risco real?"
    echo "2. Algum incidente aconteceu por uma regra que **não existe** aqui?"
    echo "3. A **faixa declarada bateu com a faixa real** em todas as $LIMITE? (se não, quantas escalaram)"
    echo ""
    echo "Se as três respostas forem \"nada a mudar\", **não altere o arquivo** — skill que muda toda semana não é processo, é ruído."
    echo ""
    echo "Ao alterar: subir \`version\` e \`updated\` no frontmatter, rodar \`./scripts/atualiza-manifesto.sh\`, e atualizar o marco zero em \`docs/onix-co-estado.md\` e no step do \`ci.yml\`."
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit 0
