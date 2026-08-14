#!/usr/bin/env bash
#
# Guarda de integridade das skills do método Onix em `.claude/skills/`.
#
# ── O caso concreto que motivou ───────────────────────────────────────────
# A PR #327 ficou 25,1 h no ar versionando a skill ERRADA — a v2 (129 linhas)
# no lugar da v2.2 (155 linhas) — e nada acusou. Não havia como acusar: skill
# quebrada não derruba build, não reprova teste e não aparece em lint. Ela
# simplesmente NÃO CARREGA, em silêncio, na próxima sessão do Claude Code.
#
# É a pior classe de falha para uma metodologia: quem depende dela continua
# achando que está seguindo o método, enquanto a sessão trabalha sem ele.
#
# ── O que esta guarda tranca ──────────────────────────────────────────────
# Para CADA pasta em `.claude/skills/`, o SKILL.md precisa de:
#
#   1. nome da pasta idêntico ao campo `name` do frontmatter
#      — é por este par que a skill é resolvida; divergir = skill invisível
#   2. frontmatter abrindo em `---` na LINHA 1 e fechando em `---` depois
#      — `---` na linha 2 (por uma linha em branco no topo) já não é
#        frontmatter, é um separador horizontal no meio do markdown
#   3. `name`, `description`, `version` e `updated` presentes
#      — os dois primeiros são o contrato de carregamento; os dois últimos
#        são o que teria mostrado, na #327, que o arquivo era o antigo
#   4. UTF-8 válido e sem caractere de controle
#      — o método é escrito em português; um arquivo recodificado errado
#        transforma "não" em "nÃ£o" e a instrução vira ruído
#   5. arquivo terminando em quebra de linha
#      — a última linha sem `\n` some de `wc -l` e de vários parsers, o que
#        faz a própria conferência de tamanho mentir
#
# ── Por que isto é script, e não shell inline no ci.yml ───────────────────
# Mesma razão de `guarda-drift-fts.sh` e `guarda-not-null-sem-default.sh`, e a
# #311 já pagou esse preço uma vez: regra embutida no workflow é regra que
# NADA exercita. Como script, ela tem teste (src/lib/guarda-skills.test.ts).
#
# Continua SEM depender de `npm ci`: bash, awk, iconv e tr, todos presentes no
# runner. A guarda roda mesmo quando o install quebra.
#
# ── Ausência do diretório NÃO é falha, de propósito ───────────────────────
# Sai 0 quando `.claude/skills/` não existe. A guarda entra no repositório na
# PR seguinte à que traz as skills, então na sua PRÓPRIA execução o diretório
# ainda não está na base — e uma guarda que reprova a si mesma não entra.
# O mesmo vale para qualquer branch anterior às skills.
#
# Uso:
#   ./scripts/guarda-skills.sh [diretorio]     # padrão: .claude/skills
set -euo pipefail

RAIZ="${1:-.claude/skills}"

if [ ! -d "$RAIZ" ]; then
  echo "guarda-skills: '$RAIZ' não existe — nada a validar."
  exit 0
fi

falhas=0

# Acumula TODAS as violações antes de sair. Reprovar na primeira esconderia as
# outras, e quem estivesse subindo um lote de skills consertaria uma por
# execução de CI.
reprovar() {
  echo "  ✗ [$1] $2"
  falhas=$((falhas + 1))
}

encontradas=0

for dir in "$RAIZ"/*/; do
  [ -d "$dir" ] || continue
  skill=$(basename "$dir")
  arquivo="$dir/SKILL.md"
  encontradas=$((encontradas + 1))

  if [ ! -f "$arquivo" ]; then
    reprovar "$skill" "não tem SKILL.md"
    continue
  fi

  # ── regra 2 · frontmatter abre na linha 1 e fecha ───────────────────────
  if [ "$(head -n 1 "$arquivo")" != "---" ]; then
    reprovar "$skill" "frontmatter não abre com '---' na linha 1"
    continue
  fi
  fim=$(awk 'NR > 1 && $0 == "---" { print NR; exit }' "$arquivo")
  if [ -z "$fim" ]; then
    reprovar "$skill" "frontmatter aberto na linha 1 nunca fecha com '---'"
    continue
  fi

  # Os campos são lidos SÓ dentro do frontmatter: `version:` citado no corpo
  # do markdown não vale como declaração.
  fm=$(awk -v fim="$fim" 'NR > 1 && NR < fim' "$arquivo")

  # ── regra 3 · campos obrigatórios ───────────────────────────────────────
  for campo in name description version updated; do
    if ! printf '%s\n' "$fm" | grep -q "^$campo:"; then
      reprovar "$skill" "frontmatter sem o campo obrigatório '$campo'"
    fi
  done

  # ── regra 1 · pasta == name ─────────────────────────────────────────────
  nome=$(printf '%s\n' "$fm" | awk -F': *' '/^name:/ { sub(/^name: */, ""); print; exit }')
  if [ -n "$nome" ] && [ "$nome" != "$skill" ]; then
    reprovar "$skill" "pasta '$skill' ≠ name '$nome' — a skill não é resolvida"
  fi

  # ── regra 4 · UTF-8 válido, sem caractere de controle ───────────────────
  if ! iconv -f UTF-8 -t UTF-8 "$arquivo" > /dev/null 2>&1; then
    reprovar "$skill" "não é UTF-8 válido"
  fi
  # Tab e quebra de linha são caracteres de controle legítimos: removidos
  # antes da checagem para não acusarem o arquivo inteiro.
  if tr -d '\t\n' < "$arquivo" | LC_ALL=C grep -q '[[:cntrl:]]'; then
    reprovar "$skill" "contém caractere de controle além de tab/quebra de linha"
  fi

  # ── regra 5 · termina em quebra de linha ────────────────────────────────
  if [ -n "$(tail -c 1 "$arquivo")" ]; then
    reprovar "$skill" "não termina em quebra de linha"
  fi
done

if [ "$encontradas" -eq 0 ]; then
  echo "guarda-skills: nenhuma skill em '$RAIZ' — nada a validar."
  exit 0
fi

if [ "$falhas" -gt 0 ]; then
  echo ""
  echo "🛑 guarda-skills: $falhas violação(ões) em '$RAIZ'."
  echo ""
  echo "Skill que não passa por estas regras não carrega no Claude Code — e não"
  echo "carrega EM SILÊNCIO. Corrija o arquivo apontado acima antes de mergear."
  exit 1
fi

echo "guarda-skills: $encontradas skill(s) em '$RAIZ', todas íntegras."
