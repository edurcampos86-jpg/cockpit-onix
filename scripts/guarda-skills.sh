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
#   6. sha256 de TODO arquivo da pasta batendo com
#      `.claude/skills/MANIFESTO.md`
#      — as cinco regras acima provam que o arquivo é BEM-FORMADO; nenhuma
#        prova que ele é o arquivo CERTO. `version: 2.2` com o conteúdo da
#        2.0 passa em todas elas. O hash é o que fecha esse buraco, e é a
#        regra que teria pego a #327 no primeiro CI em vez de 25 h depois
#      — a pasta INTEIRA, não só o SKILL.md: `story-fitness-onix` traz
#        `scripts/retoque_story.py`, e um script de 115 linhas de OpenCV é
#        exatamente o arquivo cuja troca ninguém percebe numa revisão de PR
#      — vale nos dois sentidos: arquivo no disco que o manifesto não declara,
#        e arquivo declarado que sumiu do disco
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

MANIFESTO="$RAIZ/MANIFESTO.md"

falhas=0

# sha256sum no Linux (e no runner), shasum -a 256 no macOS.
hash_de() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# A tabela "Arquivos" do manifesto tem 3 colunas (skill, arquivo, sha256); a
# tabela "Skills" tem 3 também (skill, version, updated), e as duas casariam
# no mesmo padrão de linha. O que separa uma da outra é o sha256: 64 hexa na
# terceira coluna. Distinguir por posição no arquivo seria frágil a qualquer
# reordenação do cabeçalho.
LINHA_DE_ARQUIVO='
  /^\| *`/ {
    skill = $2; rel = $3; sha = $4
    gsub(/[` ]/, "", skill); gsub(/`/, "", rel); gsub(/^ +| +$/, "", rel)
    gsub(/[` ]/, "", sha)
    if (sha ~ /^[0-9a-f]{64}$/) { print skill "|" rel "|" sha }
  }'

# Lê o hash declarado para um arquivo. Vazio = não declarado.
hash_no_manifesto() {
  [ -f "$MANIFESTO" ] || return 0
  awk -F'|' -v alvo_skill="$1" -v alvo_rel="$2" "$LINHA_DE_ARQUIVO" "$MANIFESTO" \
    | awk -F'|' -v s="$1" -v r="$2" '$1 == s && $2 == r { print $3; exit }'
}

# Lista "skill|arquivo" de tudo que o manifesto declara.
arquivos_no_manifesto() {
  [ -f "$MANIFESTO" ] || return 0
  awk -F'|' "$LINHA_DE_ARQUIVO" "$MANIFESTO" | awk -F'|' '{ print $1 "|" $2 }'
}

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

  # ── regra 6 · sha256 de TODO arquivo da pasta bate com o manifesto ──────
  # Só cobra quando o manifesto existe: repositório sem MANIFESTO.md continua
  # passando pelas cinco regras anteriores, mesma razão da ausência do
  # diretório sair 0.
  if [ -f "$MANIFESTO" ]; then
    while IFS= read -r caminho; do
      rel="${caminho#"$dir"}"
      esperado=$(hash_no_manifesto "$skill" "$rel")
      encontrado=$(hash_de "$caminho")
      if [ -z "$esperado" ]; then
        reprovar "$skill" "'$rel' não está declarado em $MANIFESTO — rode ./scripts/atualiza-manifesto.sh"
      elif [ "$esperado" != "$encontrado" ]; then
        reprovar "$skill" "sha256 de '$rel' diverge do manifesto — o arquivo NÃO é o que o manifesto nomeia"
        echo "      esperado:   $esperado"
        echo "      encontrado: $encontrado"
        echo "      se a mudança é intencional: ./scripts/atualiza-manifesto.sh"
      fi
    done <<< "$(find "$dir" -type f | LC_ALL=C sort)"
  fi
done

# Arquivo declarado no manifesto mas ausente do disco é o outro lado do mesmo
# erro: alguém apagou o arquivo e o manifesto seguiu prometendo que ele existe.
if [ -f "$MANIFESTO" ]; then
  while IFS='|' read -r declarada rel; do
    [ -n "$declarada" ] || continue
    if [ ! -f "$RAIZ/$declarada/$rel" ]; then
      reprovar "$declarada" "'$rel' declarado em $MANIFESTO mas não existe em $RAIZ/$declarada"
    fi
  done <<< "$(arquivos_no_manifesto)"
fi

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
