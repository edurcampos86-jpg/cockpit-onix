#!/usr/bin/env bash
#
# Guarda contra o termo "blindagem patrimonial" em prompt e conteúdo público.
#
# ── O caso concreto que motivou ───────────────────────────────────────────
# O Projeto Instagram v6.0 PROIBIU o termo, e não por gosto de redação:
#
#   1. "blindagem patrimonial" não é instituto jurídico. Não existe no Código
#      Civil, não existe na Lei 6.404, não existe em norma da CVM. É jargão
#      comercial;
#   2. o termo SUGERE GARANTIA — "blindado" é o que não é atingido. Nenhum
#      produto de assessoria entrega isso. Holding não impede execução,
#      seguro não impede inventário, offshore não impede tributação. Prometer
#      no material o que o produto não cumpre é exposição direta perante CVM
#      (Res. 179/2023, dever de informação adequada) e ANCORD;
#   3. e atrai o cliente errado — quem procura "blindagem" com frequência
#      procura ocultar de credor ou de cônjuge, não organizar sucessão.
#
# O termo correto, que descreve o que de fato é entregue, é PLANEJAMENTO
# PATRIMONIAL.
#
# O ponto que torna isto uma guarda, e não um "cuidado ao escrever": o termo
# tinha entrado no SYSTEM_PROMPT de produção (src/lib/integrations/claude-ai.ts),
# de onde saía em TODO roteiro gerado — legenda, hashtag, slide de carrossel.
# Um prompt errado não erra uma vez: erra em toda geração, silenciosamente, e
# o texto já publicado no Instagram não volta atrás.
#
# ── O que ela reprova ─────────────────────────────────────────────────────
# A EXPRESSÃO — "blindagem" seguida de "patrim" —, em qualquer caixa e em
# qualquer grafia que apareça na prática:
#
#     blindagem patrimonial · Blindagem Patrimonial · BLINDAGEM PATRIMONIAL
#     #blindagempatrimonial · blindagem-patrimonial · blindagem_patrimonial
#     blindagem patrimônio  · blindagem patrimoniais
#
# ── O que ela NÃO reprova, de propósito ───────────────────────────────────
#   - "blindagem" SOZINHA. A palavra tem uso corrente em português que nada
#     tem a ver com o posicionamento — há hoje em
#     `src/app/api/backoffice/clientes/[id]/reunioes/manual/route.ts` um
#     "// Blindagem adicional: se uma versão anterior..." que significa
#     apenas "proteção a mais" no código. Reprovar a palavra solta encheria
#     de vermelho PR que não tem nada com isso, e o sinal viraria ruído em
#     uma semana — o mesmo motivo pelo qual o lint desta CI é sobre o que a
#     PR TOCA, e não global (ver ci.yml).
#   - a TAG `BLINDAGEM` do ManyChat. É chave configurada FORA deste
#     repositório e já gravada nos subscribers; renomear no código não
#     renomeia lá, só faz o lead cair sem produto de interesse. A migração é
#     aditiva e está documentada em `src/lib/integrations/manychat.ts`.
#   - linha de COMENTÁRIO em código (`//`, `/* */`, `*`, `--`, `<!-- -->`).
#     Mesma regra das guardas do FTS e do NOT NULL, e pela mesma razão: a
#     nota que EXPLICA por que o termo é proibido precisa poder citar o
#     termo. Guarda que reprova a própria documentação é guarda que alguém
#     desliga.
#   - arquivo de TESTE (`*.test.ts`, `*.test.tsx`). Fixture de webhook
#     replica o que o LEAD escreveu — é texto de entrada de terceiro, não
#     cópia nossa, e não vai ao público. `src/lib/manychat-lead/mensagem.test.ts`
#     é exatamente esse caso.
#
# ── Por que isto é script, e não shell inline no ci.yml ───────────────────
# Mesma razão de `guarda-drift-fts.sh` e `guarda-not-null-sem-default.sh`, e a
# #311 já pagou esse preço: regra embutida no workflow é regra que NADA
# exercita. Um reformat do AWK que parasse de casar deixaria o passo VERDE e a
# proteção sumiria em silêncio — a falha exata que a guarda existe para
# impedir. Como script, ela tem teste (src/lib/guarda-blindagem-patrimonial.test.ts).
#
# Continua SEM depender de `npm ci`: é find + awk, disponíveis no runner. A
# guarda roda mesmo quando o install quebra.
#
# ── Limitação conhecida ───────────────────────────────────────────────────
# O awk analisa por LINHA. "blindagem" no fim de uma linha e "patrimonial" no
# começo da seguinte escaparia. Em prompt de template literal isso é possível,
# mas o par quebrado assim também não se lê como expressão no texto gerado —
# e cobrir multilinha exigiria carregar arquivo inteiro em memória, trocando
# uma falha rara por um script que ninguém revisa. Declarado aqui em vez de
# descoberto depois.
#
# Também não vê o que não está em disco: texto que venha de banco, de variável
# de ambiente ou digitado direto na tela passa longe desta guarda.
#
# Uso:  scripts/guarda-blindagem-patrimonial.sh [diretório...]
#       (default: src .claude/skills)
# Saída: 0 = limpo · 1 = ofensor encontrado · 2 = diretório inexistente
set -euo pipefail

if [ "$#" -gt 0 ]; then
  DIRS=("$@")
else
  DIRS=(src .claude/skills)
fi

EXISTENTES=()
for d in "${DIRS[@]}"; do
  if [ ! -d "$d" ]; then
    echo "guarda-blindagem-patrimonial: diretório não encontrado: $d" >&2
    exit 2
  fi
  EXISTENTES+=("$d")
done

# Só os tipos que carregam texto para o público: código de UI, prompt, conteúdo
# e markdown de skill. `.test.ts`/`.test.tsx` saem pelo -not -name.
OFENSORES=$(find "${EXISTENTES[@]}" -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.mdx' -o -name '*.json' \) \
    -not -name '*.test.ts' -not -name '*.test.tsx' \
    -print0 \
  | xargs -0 --no-run-if-empty awk '
      # Comentário passa — a nota que explica a proibição precisa citar o termo.
      /^[[:space:]]*(\/\/|\/\*|\*|--|<!--)/ { next }
      {
        linha = tolower($0)
        # "blindagem" colada em "patrim" por espaço, hífen ou underscore (ou
        # por nada, que é a forma hashtag). O separador NÃO inclui "|", para
        # não casar a alternância do regex classificador de legendas antigas
        # em instagram-mcp.ts.
        if (linha ~ /blindagem[[:space:]_-]*patrim/) {
          print FILENAME ":" FNR ": " $0
        }
      }
    ')

if [ -n "$OFENSORES" ]; then
  echo "::error::Termo proibido \"blindagem patrimonial\" em prompt ou conteúdo público."
  echo ""
  echo "Ocorrências encontradas:"
  echo "$OFENSORES"
  echo ""
  echo "POR QUE ISTO REPROVA, e não é implicância de redação:"
  echo "  1. \"blindagem patrimonial\" NÃO é instituto jurídico — não existe"
  echo "     no Código Civil, na Lei 6.404 nem em norma da CVM"
  echo "  2. o termo sugere GARANTIA que o produto não cumpre: holding não"
  echo "     impede execução, seguro não impede inventário, offshore não"
  echo "     impede tributação. Isso é exposição perante CVM e ANCORD"
  echo "  3. e atrai o cliente errado — quem busca \"blindagem\" costuma"
  echo "     buscar ocultar de credor, não organizar sucessão"
  echo ""
  echo "O QUE FAZER: trocar por PLANEJAMENTO PATRIMONIAL, que descreve o"
  echo "que de fato é entregue. Decisão do Projeto Instagram v6.0."
  echo ""
  echo "A guarda NÃO reprova:"
  echo "  - \"blindagem\" sozinha (a palavra tem uso corrente no código)"
  echo "  - a tag BLINDAGEM do ManyChat, que é chave externa"
  echo "    (ver src/lib/integrations/manychat.ts)"
  echo "  - linha de comentário, nem arquivo *.test.ts"
  echo "Precisa citar o termo para explicá-lo? Deixe em COMENTÁRIO."
  exit 1
fi

echo "OK: termo \"blindagem patrimonial\" ausente de ${EXISTENTES[*]}."
