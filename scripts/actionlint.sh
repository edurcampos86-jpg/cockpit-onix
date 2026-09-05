#!/usr/bin/env bash
# Roda o `actionlint` nos workflows deste repositório, localmente.
#
# ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
# Em 29/08/2026 a PR do ensaio de migration foi empurrada com a justificativa
# "actionlint não instalado localmente — o CI roda". O CI rodou e reprovou:
# SC2016, backtick de markdown dentro de aspas simples. Custou um ciclo
# inteiro por um erro que um binário de 5 MB pega em dois segundos.
#
# ── POR QUE NÃO O PACOTE DO npm ──────────────────────────────────────────
# Existe `actionlint` no npm (2.0.6, "Actionlint as wasm"). Ele NÃO entra
# aqui: não declara repositório nem homepage no registro, e dependência de
# desenvolvimento sem procedência é porta de entrada de supply chain — num
# repositório PÚBLICO, com segredo de produção no CI.
#
# O caminho é o binário oficial do release do `rhysd/actionlint`, com VERSÃO
# FIXA e CHECKSUM CONFERIDO. Baixar sem conferir seria o mesmo problema com
# outra roupa.
#
# ── ONDE ELE FICA ────────────────────────────────────────────────────────
# `.actionlint/` na raiz, fora do git. Baixa uma vez e reusa; apagar a pasta
# força o download de novo.
set -euo pipefail

VERSAO="1.7.7"

# Checksums oficiais de
# https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_checksums.txt
# Trocar a VERSAO acima SEM trocar estes valores faz o script recusar o
# download — que é o comportamento desejado, e não um transtorno.
SOMA_linux_amd64="023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757"
SOMA_linux_arm64="401942f9c24ed71e4fe71b76c7d638f66d8633575c4016efd2977ce7c28317d0"
SOMA_darwin_amd64="28e5de5a05fc558474f638323d736d822fff183d2d492f0aecb2b73cc44584f5"
SOMA_darwin_arm64="2693315b9093aeacb4ebd91a993fea54fc215057bf0da2659056b4bc033873db"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${RAIZ}/.actionlint"
BINARIO="${DESTINO}/actionlint"

case "$(uname -s)" in
  Linux)  SO="linux" ;;
  Darwin) SO="darwin" ;;
  *) echo "Sistema não suportado por este script: $(uname -s)" >&2; exit 2 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARQ="amd64" ;;
  arm64|aarch64) ARQ="arm64" ;;
  *) echo "Arquitetura não suportada: $(uname -m)" >&2; exit 2 ;;
esac

ALVO="${SO}_${ARQ}"
SOMA_VAR="SOMA_${ALVO}"
SOMA_ESPERADA="${!SOMA_VAR:-}"
if [ -z "$SOMA_ESPERADA" ]; then
  echo "Sem checksum registrado para ${ALVO}. Acrescente-o antes de usar." >&2
  exit 2
fi

if [ ! -x "$BINARIO" ]; then
  echo "Baixando actionlint ${VERSAO} (${ALVO})..."
  mkdir -p "$DESTINO"
  TGZ="${DESTINO}/actionlint.tar.gz"
  URL="https://github.com/rhysd/actionlint/releases/download/v${VERSAO}/actionlint_${VERSAO}_${ALVO}.tar.gz"

  if ! curl -fsSL -o "$TGZ" "$URL"; then
    echo "Não consegui baixar de ${URL}." >&2
    echo "Sem rede? Rode o gate no CI — o workflow actionlint.yml faz o mesmo." >&2
    exit 2
  fi

  # `sha256sum` no Linux, `shasum -a 256` no macOS. Conferir ANTES de extrair:
  # extrair um arquivo que não se confere é confiar nele.
  if command -v sha256sum >/dev/null 2>&1; then
    SOMA_OBTIDA="$(sha256sum "$TGZ" | cut -d' ' -f1)"
  else
    SOMA_OBTIDA="$(shasum -a 256 "$TGZ" | cut -d' ' -f1)"
  fi

  if [ "$SOMA_OBTIDA" != "$SOMA_ESPERADA" ]; then
    rm -f "$TGZ"
    echo "CHECKSUM NÃO CONFERE para ${ALVO}." >&2
    echo "  esperado: ${SOMA_ESPERADA}" >&2
    echo "  obtido:   ${SOMA_OBTIDA}" >&2
    echo "Não extraí nada. Ou a versão mudou e o checksum não, ou o download veio adulterado." >&2
    exit 2
  fi

  tar -xzf "$TGZ" -C "$DESTINO" actionlint
  rm -f "$TGZ"
  chmod +x "$BINARIO"
fi

# Sem argumento, o actionlint acha os workflows sozinho a partir da raiz do
# repositório. Argumentos passados aqui vão adiante (um arquivo só, por ex.).
cd "$RAIZ"
exec "$BINARIO" "$@"
