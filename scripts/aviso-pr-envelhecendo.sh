#!/usr/bin/env bash
#
# AVISO (nunca bloqueio) de PR envelhecendo: esta PR já passou do tempo
# típico da faixa dela?
#
# ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────
# A #326 mediu o tempo de ciclo das 40 PRs mais recentes e o resultado mudou
# o diagnóstico: a mediana geral é **1,2 h** — 🟢 1,0 h, 🟡 1,0 h, 🔴 2,8 h.
# O gargalo NÃO é velocidade de execução. É a **cauda longa**: #303 com
# 47,4 h e #286 com 41,7 h sozinhas puxam a média para 6,1 h, cinco vezes a
# mediana.
#
# E a cauda é invisível. A #327 ficou **25,1 h** publicando a versão errada
# da skill — 21× a mediana da faixa dela — com **CI verde o tempo todo**.
# Nada avisa que uma PR parou, porque "aberta" e "esquecida" têm exatamente
# a mesma cara na lista.
#
# ── OS LIMIARES, E DE ONDE VIERAM ─────────────────────────────────────────
# Calibrados nos números medidos, não em intuição:
#
#   🟢 verde      8 h   ≈  8× a mediana da faixa (1,0 h)
#   🟡 amarela   12 h   ≈ 12× a mediana da faixa (1,0 h)
#   🔴 vermelha  48 h   ≈ 17× a mediana da faixa (2,8 h)
#
# Todos com folga generosa sobre o p90 de cada faixa, porque avisar cedo
# demais ensina a ignorar o aviso — que é como um alarme morre.
#
# O aviso reporta o MÚLTIPLO da mediana, não só as horas: "12 h" não diz
# nada sozinho; "12× o tempo típico desta faixa" diz que algo travou.
#
# ── POR QUE AVISO, E NÃO GATE ─────────────────────────────────────────────
# PR demorada não é PR errada. Uma 🔴 esperando decisão do Eduardo DEVE
# esperar — travá-la seria punir o processo funcionando. O alarme existe
# para tornar a espera VISÍVEL, não para encurtá-la à força.
#
# Então este script SEMPRE sai 0.
#
# ── A FAIXA É INFERIDA, e isso é declarado ────────────────────────────────
# Mesma heurística de `scripts/metricas-ciclo.mjs`: `prisma/**` ⇒ vermelha;
# só docs, testes ou CI ⇒ verde; resto ⇒ amarela. É aproximação — a faixa de
# verdade é declarada no prompt e conferida pelo auditor. Para escolher um
# limiar de aviso, aproximação basta; para decidir alçada, não.
#
# Uso:
#   ./scripts/aviso-pr-envelhecendo.sh <criada-em-iso> <base-sha> <head-sha>
set -euo pipefail

CRIADA="${1:-}"
BASE_SHA="${2:-}"
HEAD_SHA="${3:-}"

if [ -z "$CRIADA" ]; then
  echo "uso: $0 <criada-em-iso> <base-sha> <head-sha>" >&2
  exit 2
fi

# GNU date (runner) e BSD date (macOS do Eduardo) têm sintaxes diferentes.
epoch_de() {
  date -u -d "$1" +%s 2> /dev/null \
    || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2> /dev/null \
    || echo ""
}

inicio=$(epoch_de "$CRIADA")
if [ -z "$inicio" ]; then
  echo "::warning::Não consegui interpretar a data de criação da PR ('$CRIADA') — alarme de envelhecimento não avaliado."
  exit 0
fi

agora=$(date -u +%s)
horas=$(awk -v a="$agora" -v i="$inicio" 'BEGIN { printf "%.1f", (a - i) / 3600 }')

# ── Faixa inferida pelos arquivos tocados ────────────────────────────────
faixa="amarela"
origem="heurística de caminho"
arquivos=""
if [ -n "$BASE_SHA" ] && [ -n "$HEAD_SHA" ]; then
  base=$(git merge-base "$BASE_SHA" "$HEAD_SHA" 2> /dev/null || echo "")
  if [ -n "$base" ]; then
    arquivos=$(git diff --name-only --diff-filter=d "$base" "$HEAD_SHA" 2> /dev/null || echo "")
  fi
fi

if [ -z "$arquivos" ]; then
  origem="sem lista de arquivos — assumida amarela"
elif printf '%s\n' "$arquivos" | grep -q '^prisma/'; then
  faixa="vermelha"
elif ! printf '%s\n' "$arquivos" | grep -qvE '^docs/|^\.github/|\.md$|\.test\.[jt]sx?$|(^|/)__tests__/'; then
  faixa="verde"
fi

case "$faixa" in
  verde)    limite=8;  mediana=1.0; emoji="🟢" ;;
  amarela)  limite=12; mediana=1.0; emoji="🟡" ;;
  vermelha) limite=48; mediana=2.8; emoji="🔴" ;;
esac

multiplo=$(awk -v h="$horas" -v m="$mediana" 'BEGIN { printf "%.0f", h / m }')

if awk -v h="$horas" -v l="$limite" 'BEGIN { exit !(h < l) }'; then
  echo "Alarme de envelhecimento: $emoji $faixa, aberta há ${horas} h (limite ${limite} h, mediana da faixa ${mediana} h). Dentro do esperado."
  exit 0
fi

echo "::warning::$emoji PR $faixa aberta há ${horas} h — ${multiplo}× a mediana de ${mediana} h desta faixa (limite ${limite} h). Não é reprovação: é a cauda longa ficando visível."

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## $emoji PR envelhecendo — ${horas} h abertas, ${multiplo}× a mediana da faixa"
    echo ""
    echo "| | |"
    echo "|---|---|"
    echo "| faixa inferida | **$faixa** ($origem) |"
    echo "| aberta há | **${horas} h** |"
    echo "| mediana da faixa (medida na #326) | ${mediana} h |"
    echo "| múltiplo | **${multiplo}×** |"
    echo "| limiar desta faixa | ${limite} h |"
    echo ""
    if [ "$faixa" = "vermelha" ]; then
      echo "**Faixa vermelha: NOMEIE O BLOQUEIO.** PR 🔴 esperando decisão deve"
      echo "esperar — o que não pode é ninguém saber o que ela espera. Comente na"
      echo "PR qual das três está valendo:"
      echo ""
      echo "1. **aguardando \"ok\" do Eduardo** — diga desde quando e o que ele precisa ler"
      echo "2. **conflito de merge ou base desatualizada** — resolva ou diga por que não dá"
      echo "3. **depende de outra PR** — nomeie o número e a ordem"
      echo ""
      echo "Se nenhuma das três descreve a situação, a PR não está bloqueada: está esquecida."
    else
      echo "A #327 ficou **25,1 h** com a versão errada da skill publicada, com CI"
      echo "verde o tempo todo — 21× a mediana. \"Aberta\" e \"esquecida\" têm a mesma"
      echo "cara na lista de PRs, e é essa diferença que este aviso existe para mostrar."
      echo ""
      echo "Fechar, congelar ou dizer o que falta — as três resolvem. Deixar como está, não."
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit 0
