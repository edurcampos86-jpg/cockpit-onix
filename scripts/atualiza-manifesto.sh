#!/usr/bin/env bash
#
# Regenera `.claude/skills/MANIFESTO.md` a partir dos SKILL.md em disco.
#
# ── Por que existe ────────────────────────────────────────────────────────
# O manifesto é a única coisa que impede subir um `version: 2.2` com o
# conteúdo da 2.0 — a guarda de frontmatter, sozinha, só vê se o campo
# EXISTE. Mas manifesto que se atualiza à mão apodrece: é exatamente o que
# aconteceu com `docs/onix-co-estado.md`, que listava como pendentes três
# itens já entregues pelas #316, #322 e #324.
#
# Então a regra é: NINGUÉM edita o MANIFESTO.md à mão. Mudou uma skill, roda
# este script e commita o resultado junto. São dois comandos, e é isso que
# mantém o manifesto vivo em vez de decorativo.
#
#   ./scripts/atualiza-manifesto.sh
#   git add .claude/skills/MANIFESTO.md
#
# ── O que ele NÃO faz, de propósito ───────────────────────────────────────
# Não sobe `version` nem mexe em `updated`. Esses dois são DECISÃO — a seção
# 10 da onix-entrega-segura diz quando cada um sobe (regra de faixa ou alçada
# ⇒ maior; redação ou fato de ambiente ⇒ menor). Um script que os
# incrementasse sozinho transformaria a decisão em efeito colateral.
#
# Uso:
#   ./scripts/atualiza-manifesto.sh [diretorio]    # padrão: .claude/skills
set -euo pipefail

RAIZ="${1:-.claude/skills}"
DESTINO="$RAIZ/MANIFESTO.md"

if [ ! -d "$RAIZ" ]; then
  echo "atualiza-manifesto: '$RAIZ' não existe." >&2
  exit 1
fi

# sha256sum no Linux (e no runner), shasum -a 256 no macOS.
hash_de() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

campo() {
  # Lê um campo SÓ de dentro do frontmatter, mesma regra da guarda: `version:`
  # citado no corpo do markdown não é declaração.
  local arquivo="$1" nome="$2" fim
  fim=$(awk 'NR > 1 && $0 == "---" { print NR; exit }' "$arquivo")
  [ -n "$fim" ] || return 0
  awk -v fim="$fim" -v campo="^$nome: *" \
    'NR > 1 && NR < fim && $0 ~ campo { sub(campo, ""); print; exit }' "$arquivo"
}

linhas=""
total=0
for dir in "$RAIZ"/*/; do
  [ -d "$dir" ] || continue
  skill=$(basename "$dir")
  arquivo="$dir/SKILL.md"
  [ -f "$arquivo" ] || { echo "atualiza-manifesto: $skill sem SKILL.md" >&2; exit 1; }
  linhas="${linhas}| \`$skill\` | $(campo "$arquivo" version) | $(campo "$arquivo" updated) | \`$(hash_de "$arquivo")\` |
"
  total=$((total + 1))
done

if [ "$total" -eq 0 ]; then
  echo "atualiza-manifesto: nenhuma skill em '$RAIZ'." >&2
  exit 1
fi

cat > "$DESTINO" <<CABECALHO
# Manifesto das skills do método Onix

> **Arquivo GERADO. Não editar à mão.**
> Mudou uma skill? Rode \`./scripts/atualiza-manifesto.sh\` e commite o
> resultado junto com ela.

O \`sha256\` de cada \`SKILL.md\` é conferido em toda PR por
\`scripts/guarda-skills.sh\` (step no \`ci.yml\`). Divergência reprova.

**Por que o hash, e não só o \`version\`:** o campo \`version\` prova que
alguém escreveu um número; o hash prova QUAL conteúdo esse número nomeia. A
#327 ficou 25,1 h publicando a v2 no lugar da v2.2 — com o manifesto, aquele
arquivo teria reprovado no primeiro CI, e não 25 horas depois.

| skill | version | updated | sha256 do SKILL.md |
|---|---|---|---|
CABECALHO

printf '%s' "$linhas" >> "$DESTINO"

echo "atualiza-manifesto: $total skill(s) gravadas em $DESTINO"
