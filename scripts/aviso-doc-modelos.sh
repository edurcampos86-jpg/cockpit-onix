#!/usr/bin/env bash
#
# AVISO (nunca bloqueio) de doc desatualizada: os modelos que
# `docs/onix-co-estado.md` cita ainda existem em `prisma/schema.prisma`?
#
# ── POR QUE AVISO, E NÃO GATE ─────────────────────────────────────────────
# Decisão do Eduardo, e ela é o desenho inteiro deste script: documentação
# desatualizada NÃO pode bloquear PR de código. Uma PR que renomeia um modelo
# está certa; a doc é que ficou para trás, e travar a PR por isso empurra a
# pessoa a "consertar" a doc às pressas no meio de outra tarefa — que é como
# documentação vira ficção com aparência de revisada.
#
# Então este script SEMPRE sai 0. O sinal é `::warning::`, que aparece na PR e
# no summary do run sem reprovar nada. Se um dia alguém quiser transformá-lo em
# gate, é decisão explícita — não um efeito colateral de mexer aqui.
#
# ── O QUE ELE COMPARA ─────────────────────────────────────────────────────
# Só a direção que significa "a doc está errada": modelo CITADO na doc que não
# existe mais no schema. A direção oposta (schema tem 89 modelos, a doc cita 5)
# NÃO é drift — a doc é sobre o projeto Onix Co, não um índice do schema, e
# avisar sobre os outros 84 seria ruído garantido no primeiro run.
#
# Entende as duas formas de citação da seção "Modelos existentes":
#   ### `Empresa` — desde a #288        → confere `model Empresa {`
#   ### `ClienteBackoffice.pessoaGrupoId` → confere o MODELO e o CAMPO dentro dele
#
# ── A GUARDA DA PRÓPRIA GUARDA ────────────────────────────────────────────
# Se a extração não achar nenhum modelo citado, o script avisa isso em vez de
# dizer "tudo em dia". Um aviso que nunca dispara é indistinguível de um regex
# que parou de casar — e como este script não pode reprovar, essa é a única
# forma de o silêncio dele significar alguma coisa.
#
# Uso:  scripts/aviso-doc-modelos.sh [doc] [schema]
# Saída: SEMPRE 0. O resultado é o texto, não o código de saída.
set -uo pipefail

DOC="${1:-docs/onix-co-estado.md}"
SCHEMA="${2:-prisma/schema.prisma}"

# Ausência de arquivo também é aviso, não erro: uma branch anterior à criação
# da doc não pode ficar vermelha por causa dela.
if [ ! -f "$DOC" ]; then
  echo "::warning::$DOC não existe — nada a conferir. (Se a doc foi removida de propósito, remova também este step do ci.yml.)"
  exit 0
fi
if [ ! -f "$SCHEMA" ]; then
  echo "::warning::$SCHEMA não existe — não dá para conferir os modelos citados em $DOC."
  exit 0
fi

# Títulos `### \`Algo\`` dentro da seção "## Modelos existentes", até o próximo
# `## ` de mesmo nível. Fora dessa seção a doc cita modelos em prosa e em
# tabela, e conferir prosa produziria falso positivo a cada frase reescrita.
CITADOS=$(awk '
    /^## Modelos existentes/ { dentro=1; next }
    dentro && /^## / { dentro=0 }
    dentro && /^### / {
      linha = $0
      # Primeiro trecho entre crases do título.
      if (match(linha, /`[^`]+`/)) {
        nome = substr(linha, RSTART + 1, RLENGTH - 2)
        print nome
      }
    }
  ' "$DOC")

if [ -z "$CITADOS" ]; then
  echo "::warning::Não extraí nenhum modelo da seção \"Modelos existentes\" de $DOC. Ou a seção sumiu, ou o formato dos títulos mudou (esperado: '### \`Modelo\`'). Enquanto isso, esta conferência não está protegendo nada."
  exit 0
fi

TOTAL=0
DIVERGENTES=""

while IFS= read -r citado; do
  [ -n "$citado" ] || continue
  TOTAL=$((TOTAL + 1))

  modelo="${citado%%.*}"
  campo=""
  case "$citado" in
    *.*) campo="${citado#*.}" ;;
  esac

  if ! grep -qE "^model[[:space:]]+${modelo}[[:space:]]*\{" "$SCHEMA"; then
    DIVERGENTES="$DIVERGENTES
  - \`$citado\`: o schema não tem \`model $modelo\`. Renomeado ou removido?"
    continue
  fi

  if [ -n "$campo" ]; then
    # Só o corpo do modelo: um campo de mesmo nome em OUTRO modelo não pode
    # fazer a conferência passar.
    if ! awk -v m="$modelo" -v c="$campo" '
          $0 ~ "^model[[:space:]]+" m "[[:space:]]*\\{" { dentro=1; next }
          dentro && /^\}/ { dentro=0 }
          dentro && $1 == c { achou=1 }
          END { exit(achou ? 0 : 1) }
        ' "$SCHEMA"; then
      DIVERGENTES="$DIVERGENTES
  - \`$citado\`: \`model $modelo\` existe, mas não tem o campo \`$campo\`."
    fi
  fi
done <<< "$CITADOS"

if [ -n "$DIVERGENTES" ]; then
  echo "::warning::$DOC cita modelo que não bate com $SCHEMA. Isto é AVISO, não reprovação — a PR segue."
  echo ""
  echo "Divergências:$DIVERGENTES"
  echo ""
  echo "A própria doc pede, na seção \"Como manter este arquivo\":"
  echo "  \"Mexeu em prisma/schema.prisma? → Modelos existentes\""
  echo ""
  echo "Se a mudança de schema foi de propósito, atualize $DOC — de preferência"
  echo "NESTA PR, que é quando o contexto ainda está na cabeça de quem mexeu."

  # O summary é onde o aviso sobrevive: anotação de warning some da aba de
  # arquivos quando a PR recebe push novo.
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### ⚠️ Doc de estado desatualizada"
      echo ""
      echo "\`$DOC\` cita modelo que não bate com \`$SCHEMA\`:"
      echo "$DIVERGENTES"
      echo ""
      echo "_Aviso, não reprovação — a PR segue._"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

echo "OK: os $TOTAL modelo(s) citados em $DOC existem em $SCHEMA."
exit 0
