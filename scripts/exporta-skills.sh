#!/usr/bin/env bash
#
# Empacota `.claude/skills/` no formato de upload da conta: um ZIP por skill,
# contendo a PASTA da skill (não o conteúdo solto), mais o manifesto junto.
#
# ── Por que existe ────────────────────────────────────────────────────────
# O repositório é a fonte canônica das skills, mas a conta (Customize > Skills)
# é quem as carrega nas sessões de Chat. Se levar o repo para a conta for
# trabalho manual — zipar oito pastas à mão, uma a uma, sem errar o nível de
# diretório — ninguém leva, e a conta apodrece guardando a versão de meses
# atrás enquanto o repo evolui.
#
# Foi exatamente assim que a #327 publicou a v2 no lugar da v2.2: as duas
# versões existiam, e a que a sessão leu não era a que o repo tinha.
#
# ── O nível de diretório importa ──────────────────────────────────────────
# O ZIP tem de conter `onix-entrega-segura/SKILL.md`, e não `SKILL.md` na
# raiz. Zipar de dentro da pasta é o erro fácil, e o sintoma é uma skill que
# sobe sem erro e não carrega — a mesma falha silenciosa de sempre. Por isso
# o `zip` roda a partir de `.claude/skills/` com o caminho da pasta.
#
# ── Ordem certa ───────────────────────────────────────────────────────────
#   1. editar a skill
#   2. ./scripts/atualiza-manifesto.sh   (o hash muda)
#   3. ./scripts/guarda-skills.sh        (confere antes de subir)
#   4. ./scripts/exporta-skills.sh       (gera os ZIPs)
#   5. subir os ZIPs em Customize > Skills
#
# O passo 3 no meio não é cerimônia: subir para a conta um arquivo que a
# guarda reprovaria é publicar o defeito em vez de pegá-lo.
#
# Uso:
#   ./scripts/exporta-skills.sh [diretorio-de-skills] [diretorio-de-saida]
set -euo pipefail

RAIZ="${1:-.claude/skills}"
SAIDA="${2:-dist/skills}"

if [ ! -d "$RAIZ" ]; then
  echo "exporta-skills: '$RAIZ' não existe." >&2
  exit 1
fi

if ! command -v zip > /dev/null 2>&1; then
  echo "exporta-skills: 'zip' não encontrado. macOS já tem; no Linux: apt-get install zip" >&2
  exit 2
fi

# Roda a guarda antes de empacotar. Exportar um arquivo que o CI reprovaria
# é publicar o defeito na conta, onde nenhum CI olha.
if [ -x ./scripts/guarda-skills.sh ]; then
  if ! ./scripts/guarda-skills.sh "$RAIZ"; then
    echo "" >&2
    echo "exporta-skills: a guarda reprovou — nada foi empacotado." >&2
    exit 1
  fi
fi

mkdir -p "$SAIDA"
# Saída limpa: ZIP de skill que foi renomeada ou removida não pode sobreviver
# na pasta e ser subido por engano depois.
rm -f "$SAIDA"/*.zip

RAIZ_ABS=$(cd "$RAIZ" && pwd)
SAIDA_ABS=$(cd "$SAIDA" && pwd)

total=0
for dir in "$RAIZ"/*/; do
  [ -d "$dir" ] || continue
  skill=$(basename "$dir")
  # -r recursivo, -q silencioso, -X sem metadado de sistema de arquivos (o
  # ZIP fica byte-estável entre execuções, então regerar não vira diff).
  (cd "$RAIZ_ABS" && zip -qrX "$SAIDA_ABS/$skill.zip" "$skill")
  echo "  → $SAIDA/$skill.zip"
  total=$((total + 1))
done

if [ "$total" -eq 0 ]; then
  echo "exporta-skills: nenhuma skill em '$RAIZ'." >&2
  exit 1
fi

# O manifesto vai junto, fora dos ZIPs: é o que permite conferir, depois de
# subir, que a conta recebeu o mesmo conteúdo que o repo tem.
if [ -f "$RAIZ/MANIFESTO.md" ]; then
  cp "$RAIZ/MANIFESTO.md" "$SAIDA/MANIFESTO.md"
  echo "  → $SAIDA/MANIFESTO.md"
fi

echo "exporta-skills: $total ZIP(s) em $SAIDA — suba em Customize > Skills."
