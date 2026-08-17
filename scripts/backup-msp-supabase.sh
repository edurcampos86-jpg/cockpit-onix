#!/usr/bin/env bash
# ==============================================================================
# backup-msp-supabase.sh — backup manual VERIFICADO do Postgres MSP (Supabase)
#
# Faixa VERMELHA. Contrato desta ferramenta, sem exceção:
#   - No banco de ORIGEM: SOMENTE LEITURA. A sessão abre com
#     default_transaction_read_only=on, então nem um UPDATE acidental passa.
#   - A connection string vem de $MSP_DB_URL e NUNCA é impressa: nem em log,
#     nem em mensagem de erro, nem em nome de arquivo, nem em `ps`.
#     (Ela é decomposta em PGHOST/PGUSER/PGPASSWORD/... — variáveis de ambiente
#     não aparecem na linha de comando; a URL inteira apareceria.)
#   - Host sempre mascarado na saída.
#   - `set -x` é desligado à força: xtrace vazaria a senha.
#
# Etapas: versões → dump custom → contagens na origem → restore de teste em
# Postgres descartável (Docker) → comparação linha a linha → cifra age →
# apaga o .dump em claro.
#
# Uso:
#   export MSP_DB_URL='postgresql://...'          # nunca commitar, nunca ecoar
#   export MSP_AGE_RECIPIENT='age1...'            # chave PÚBLICA age
#   scripts/backup-msp-supabase.sh [--outdir DIR] [--keep-plain] [--no-restore-test]
#
# Saída (default em ~/msp-backups):
#   msp-AAAAMMDD.dump.age          backup cifrado
#   msp-AAAAMMDD-relatorio.md      relatório da comparação origem × restore
# ==============================================================================

set -euo pipefail
set +x                      # xtrace vazaria segredo. Nunca ligar.
umask 077                   # nada que este script escreve nasce legível pra outros

# ------------------------------------------------------------------ parâmetros
OUTDIR="${MSP_OUTDIR:-$HOME/msp-backups}"
KEEP_PLAIN=0
RESTORE_TEST=1
SCHEMAS_PEDIDOS=(public auth)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --outdir)          OUTDIR="$2"; shift 2 ;;
    --keep-plain)      KEEP_PLAIN=1; shift ;;
    --no-restore-test) RESTORE_TEST=0; shift ;;
    -h|--help)         sed -n '1,30p' "$0"; exit 0 ;;
    *) echo "erro: argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

STAMP="$(date +%Y%m%d)"
BASENAME="msp-${STAMP}"
DUMP="${OUTDIR}/${BASENAME}.dump"
CIFRADO="${DUMP}.age"
RELATORIO="${OUTDIR}/${BASENAME}-relatorio.md"
TMPDIR="$(mktemp -d)"
CONTAINER="msp-restore-test-${STAMP}-$$"

log()  { printf '  %s\n' "$*"; }
head1() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n[FALHA] %s\n' "$*" >&2; exit 1; }

SCRATCH_LOCAL=0
SCRATCH_DATA=""
RUNAS=()

limpeza() {
  local rc=$?
  # o banco de teste é descartável por definição — some sempre
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if (( SCRATCH_LOCAL )) && [[ -n "$SCRATCH_DATA" ]]; then
    "${RUNAS[@]}" "${PGBIN:-/usr/bin}/pg_ctl" -D "$SCRATCH_DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  # rastros com credencial derivada
  find "$TMPDIR" -type f -exec shred -u {} + 2>/dev/null \
    || find "$TMPDIR" -type f -delete 2>/dev/null || true
  rm -rf "$TMPDIR" 2>/dev/null || true
  exit $rc
}
trap limpeza EXIT INT TERM

# ------------------------------------------------------------------ pré-checks
[[ -n "${MSP_DB_URL:-}" ]] || fail "MSP_DB_URL não está definida no ambiente.
  Exporte-a nesta MESMA sessão de shell:  export MSP_DB_URL='postgresql://...'"

RECIPIENT="${MSP_AGE_RECIPIENT:-}"
[[ -n "$RECIPIENT" ]] || fail "MSP_AGE_RECIPIENT (chave PÚBLICA age) não definida.
  export MSP_AGE_RECIPIENT='age1...'"
[[ "$RECIPIENT" == age1* ]] || fail "MSP_AGE_RECIPIENT não parece uma chave pública age (esperado prefixo 'age1')."
[[ "$RECIPIENT" != AGE-SECRET-KEY-* ]] || fail "isso é uma chave PRIVADA. Passe a PÚBLICA (age1...)."

for bin in pg_dump pg_restore psql age python3; do
  command -v "$bin" >/dev/null || fail "binário ausente: $bin"
done
mkdir -p "$OUTDIR"

# sha256 e apagamento seguro: nomes diferentes em Linux e macOS
sha256() {
  if   command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum    >/dev/null; then shasum -a 256 "$1" | cut -d' ' -f1
  else echo "(sha256 indisponível)"; fi
}
apagar_seguro() {
  if   command -v shred  >/dev/null; then shred -u "$1" 2>/dev/null || rm -f "$1"
  elif command -v gshred >/dev/null; then gshred -u "$1" 2>/dev/null || rm -f "$1"
  else
    # APFS/SSD fazem copy-on-write: sobrescrever não garante nada mesmo.
    # O que protege de verdade é o disco cifrado (FileVault), não o shred.
    rm -f "$1"
    log "aviso: sem shred — usei rm. Em SSD/APFS o shred não garantiria mais que isso."
  fi
}

# ---------------------------------------------- decompor a URL sem jamais ecoar
# python3 lê a URL do AMBIENTE (não de argv) e devolve assignments já quotados.
# O eval acontece dentro deste shell: nada vai parar em `ps` nem em arquivo.
eval "$(python3 - <<'PY'
import os, shlex, sys
from urllib.parse import urlsplit, unquote, parse_qs

u = urlsplit(os.environ["MSP_DB_URL"])
if u.scheme not in ("postgres", "postgresql"):
    sys.stderr.write("erro: MSP_DB_URL não é uma URL postgres\n"); sys.exit(1)

host = u.hostname or ""
port = str(u.port or 5432)
user = unquote(u.username or "")
pwd  = unquote(u.password or "")
db   = unquote((u.path or "/postgres").lstrip("/")) or "postgres"
q    = parse_qs(u.query)
ssl  = (q.get("sslmode") or ["require"])[0]

# máscara do host: preserva o domínio, esconde o identificador do projeto
partes = host.split(".")
if len(partes) >= 3:
    p0 = partes[0]
    partes[0] = (p0[:3] + "*" * max(len(p0) - 3, 3)) if p0 else "***"
    host_mask = ".".join(partes)
else:
    host_mask = "***." + ".".join(partes[-2:]) if len(partes) == 2 else "***"

out = {
    "PGHOST": host, "PGPORT": port, "PGUSER": user, "PGPASSWORD": pwd,
    "PGDATABASE": db, "PGSSLMODE": ssl,
    "HOST_MASK": host_mask, "PGUSER_MASK": (user[:4] + "***") if user else "***",
}
print("export " + " ".join(f"{k}={shlex.quote(v)}" for k, v in out.items()))
PY
)"

# leitura pura na origem: qualquer escrita é rejeitada pelo próprio servidor
export PGOPTIONS='-c default_transaction_read_only=on'
export PGCONNECT_TIMEOUT=20
export PGAPPNAME='backup-msp-manual'

ORIGEM_DESC="${PGUSER_MASK}@${HOST_MASK}:${PGPORT}/${PGDATABASE}"

head1 "Origem"
log "host      ${HOST_MASK}"
log "porta     ${PGPORT}   usuário ${PGUSER_MASK}   database ${PGDATABASE}   sslmode ${PGSSLMODE}"
log "modo      default_transaction_read_only=on  (escrita impossível nesta sessão)"

if [[ "$PGPORT" == "6543" ]]; then
  fail "porta 6543 = pooler de TRANSAÇÃO do Supabase. pg_dump não funciona nele
  (precisa de sessão persistente e de temporary tables). Use a conexão direta
  na porta 5432 (Settings → Database → Connection string → Direct/Session)."
fi

# ============================================================ 1. versões
head1 "1. Versões"

CLI_FULL="$(pg_dump --version | grep -oE '[0-9]+(\.[0-9]+)*' | head -1)"
CLI_MAJOR="${CLI_FULL%%.*}"

SRV_FULL="$(psql -Atqc 'SHOW server_version' 2>"$TMPDIR/err" || true)"
if [[ -z "$SRV_FULL" ]]; then
  # a mensagem do libpq pode conter host/usuário, então é filtrada antes de sair
  MOTIVO="$(sed -e "s#${PGHOST}#${HOST_MASK}#g" -e "s#${PGUSER}#${PGUSER_MASK}#g" "$TMPDIR/err" | head -5)"
  fail "não consegui conectar na origem. Detalhe (mascarado):
${MOTIVO}"
fi
SRV_MAJOR="$(printf '%s' "$SRV_FULL" | grep -oE '^[0-9]+')"

log "pg_dump local   ${CLI_FULL}   (major ${CLI_MAJOR})"
log "servidor        ${SRV_FULL}   (major ${SRV_MAJOR})"

if (( CLI_MAJOR < SRV_MAJOR )); then
  fail "INCOMPATÍVEL: pg_dump ${CLI_MAJOR} não consegue dumpar um servidor ${SRV_MAJOR}.
  O cliente precisa ser >= servidor. Instale e use o cliente ${SRV_MAJOR}:

    # Debian/Ubuntu
    sudo install -d /usr/share/postgresql-common/pgdg
    sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \\
      https://www.postgresql.org/media/keys/ACCCF7B0AA8C2AA6.asc
    echo \"deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \\
      https://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main\" \\
      | sudo tee /etc/apt/sources.list.d/pgdg.list
    sudo apt-get update && sudo apt-get install -y postgresql-client-${SRV_MAJOR}
    export PATH=/usr/lib/postgresql/${SRV_MAJOR}/bin:\$PATH

    # macOS
    brew install postgresql@${SRV_MAJOR}
    export PATH=\"\$(brew --prefix postgresql@${SRV_MAJOR})/bin:\$PATH\"

  Depois rode este script de novo. Não vou tentar contornar."
fi
if (( CLI_MAJOR > SRV_MAJOR )); then
  log "aviso: cliente mais novo que o servidor — suportado pelo pg_dump, segue."
else
  log "compatível: mesma major."
fi

# ============================================ 2. schemas acessíveis + pg_dump
head1 "2. Dump (formato custom, --no-owner --no-privileges)"

SCHEMAS=()
IGNORADOS=()
for s in "${SCHEMAS_PEDIDOS[@]}"; do
  existe="$(psql -Atqc "SELECT 1 FROM information_schema.schemata WHERE schema_name='${s}'" || true)"
  usavel="$(psql -Atqc "SELECT has_schema_privilege(current_user,'${s}','USAGE')" 2>/dev/null || echo f)"
  if [[ "$existe" == "1" && "$usavel" == "t" ]]; then
    SCHEMAS+=("$s")
  else
    IGNORADOS+=("$s")
  fi
done
(( ${#SCHEMAS[@]} > 0 )) || fail "nenhum dos schemas pedidos (${SCHEMAS_PEDIDOS[*]}) está acessível."

log "schemas incluídos: ${SCHEMAS[*]}"
(( ${#IGNORADOS[@]} > 0 )) && log "schemas fora (inexistentes ou sem permissão): ${IGNORADOS[*]}"

ARGS_SCHEMA=()
for s in "${SCHEMAS[@]}"; do ARGS_SCHEMA+=(-n "$s"); done

log "gerando ${BASENAME}.dump ..."
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
        "${ARGS_SCHEMA[@]}" --file="$DUMP" 2>"$TMPDIR/dump.err" || {
  sed -e "s#${PGHOST}#${HOST_MASK}#g" -e "s#${PGUSER}#${PGUSER_MASK}#g" "$TMPDIR/dump.err" >&2
  fail "pg_dump falhou (detalhe acima, mascarado)."
}
[[ -s "$DUMP" ]] || fail "pg_dump gerou arquivo vazio."

TAMANHO="$(du -h "$DUMP" | cut -f1)"
TAMANHO_B="$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")"
SHA_DUMP="$(sha256 "$DUMP")"
N_OBJ="$(pg_restore --list "$DUMP" | grep -cv '^;' || true)"

log "arquivo   ${TAMANHO}  (${TAMANHO_B} bytes)"
log "sha256    ${SHA_DUMP}"
log "objetos   ${N_OBJ} no índice do dump"

# ================================================= 3. contagens na origem
head1 "3. Contagem de linhas na origem"

IN_LIST="$(printf "'%s'," "${SCHEMAS[@]}")"; IN_LIST="${IN_LIST%,}"
cat > "$TMPDIR/contagens.sql" <<SQL
SELECT t.table_schema || '.' || t.table_name AS tabela,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.table_schema, t.table_name),
                           false, true, '')))[1]::text::bigint AS linhas
FROM information_schema.tables t
WHERE t.table_schema IN (${IN_LIST}) AND t.table_type = 'BASE TABLE'
ORDER BY 1;
SQL

psql -Atq -F$'\t' -f "$TMPDIR/contagens.sql" > "$TMPDIR/origem.tsv"
TOTAL_ORIGEM="$(awk -F'\t' '{s+=$2} END {print s+0}' "$TMPDIR/origem.tsv")"
N_TAB_ORIGEM="$(wc -l < "$TMPDIR/origem.tsv" | tr -d ' ')"

printf '\n  %-46s %14s\n' "TABELA" "LINHAS"
printf '  %-46s %14s\n' "----------------------------------------------" "--------------"
awk -F'\t' '{printf "  %-46s %14s\n", $1, $2}' "$TMPDIR/origem.tsv"
printf '  %-46s %14s\n' "TOTAL (${N_TAB_ORIGEM} tabelas)" "$TOTAL_ORIGEM"

# ================================================ 4. restore de teste + diff
STATUS_RESTORE="não executado (--no-restore-test)"
DIVERGENTES=0
LINHAS_MD=""

if (( RESTORE_TEST )); then
  head1 "4. Restore de teste em Postgres descartável"

  # A origem já foi lida por inteiro (etapas 1–3). Daqui pra frente NADA fala
  # com ela: derrubar as PG* evita tanto vazar credencial para o container
  # quanto levar o read-only da origem para o destino, que precisa escrever.
  unset PGOPTIONS PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGAPPNAME

  PORTA="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  IMAGEM="postgres:${SRV_MAJOR}"
  MODO_SCRATCH=""

  # Preferência: Docker (isolamento total). Fallback: cluster local descartável
  # via initdb — mesmo efeito quando o registry está bloqueado por egress.
  if docker info >/dev/null 2>&1 \
     && { docker image inspect "$IMAGEM" >/dev/null 2>&1 || docker pull -q "$IMAGEM" >/dev/null 2>&1; }; then
    MODO_SCRATCH="docker ${IMAGEM}"
    log "subindo ${IMAGEM} (container ${CONTAINER}, descartável)"
    docker run -d --name "$CONTAINER" \
      -e POSTGRES_USER=scratch -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=scratch \
      -p "127.0.0.1:${PORTA}:5432" "$IMAGEM" >/dev/null
    for _ in $(seq 60); do docker exec "$CONTAINER" pg_isready -U scratch -q && break; sleep 1; done
    docker exec "$CONTAINER" pg_isready -U scratch -q || fail "Postgres descartável (Docker) não subiu."
  else
    PGBIN="/usr/lib/postgresql/${SRV_MAJOR}/bin"
    [[ -x "$PGBIN/initdb" ]] || PGBIN="$(dirname "$(command -v pg_ctl 2>/dev/null || echo /nao/existe)")"
    [[ -x "$PGBIN/initdb" && -x "$PGBIN/pg_ctl" ]] || fail \
      "sem Docker utilizável e sem binários de servidor Postgres ${SRV_MAJOR} locais.
  Instale um dos dois — o restore de teste não é opcional: dump que não restaura não é backup."
    MODO_SCRATCH="cluster local initdb (${PGBIN})"
    log "Docker indisponível — subindo cluster local descartável em ${TMPDIR}/pgdata"
    SCRATCH_DATA="$TMPDIR/pgdata"
    ( umask 077; mkdir -p "$SCRATCH_DATA" )
    if [[ "$(id -u)" == "0" ]]; then
      # postgres se recusa a rodar como root: usa a conta 'postgres' se existir
      id postgres >/dev/null 2>&1 || fail "rodando como root e sem usuário 'postgres' para o cluster de teste."
      chown -R postgres "$TMPDIR"
      RUNAS=(setpriv --reuid=postgres --regid="$(id -g postgres)" --clear-groups)
    else
      RUNAS=()
    fi
    "${RUNAS[@]}" "$PGBIN/initdb" -D "$SCRATCH_DATA" -U scratch --auth=trust >/dev/null
    "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$SCRATCH_DATA" -l "$TMPDIR/pg.log" \
      -o "-p ${PORTA} -k ${TMPDIR} -h 127.0.0.1" -w start >/dev/null
    SCRATCH_LOCAL=1
    "${RUNAS[@]}" "$PGBIN/createdb" -h 127.0.0.1 -p "$PORTA" -U scratch scratch
  fi

  log "destino: ${MODO_SCRATCH}"
  DEST="postgresql://scratch:scratch@127.0.0.1:${PORTA}/scratch"

  log "restaurando ..."
  set +e
  pg_restore --no-owner --no-acl --dbname="$DEST" "$DUMP" 2>"$TMPDIR/restore.err"
  RC_RESTORE=$?
  set -e

  ERROS_TOTAL="$(grep -c '^pg_restore: error' "$TMPDIR/restore.err" || true)"
  ERROS_BENIGNOS="$(grep '^pg_restore: error' "$TMPDIR/restore.err" \
      | grep -cEi 'extension|(schema|type) .* already exists|role .* does not exist|must be owner|permission denied for schema (auth|extensions|graphql)' || true)"
  ERROS_REAIS=$(( ERROS_TOTAL - ERROS_BENIGNOS ))

  log "pg_restore rc=${RC_RESTORE}  erros=${ERROS_TOTAL}  (benignos: ${ERROS_BENIGNOS}, reais: ${ERROS_REAIS})"
  if (( ERROS_REAIS > 0 )); then
    log "primeiros erros NÃO-benignos:"
    grep '^pg_restore: error' "$TMPDIR/restore.err" \
      | grep -vEi 'extension|(schema|type) .* already exists|role .* does not exist|must be owner|permission denied for schema (auth|extensions|graphql)' \
      | head -8 | sed 's/^/    /'
  fi

  psql "$DEST" -Atq -F$'\t' -f "$TMPDIR/contagens.sql" > "$TMPDIR/destino.tsv"

  head1 "Comparação origem × restore"

  # comparacao.tsv: tabela \t origem \t restore \t diff \t veredito
  awk -F'\t' '
    NR==FNR { o[$1]=$2; next }
            { d[$1]=$2; visto[$1]=1 }
    END {
      for (t in o) {
        if (t in d) printf "%s\t%s\t%s\t%s\t%s\n", t, o[t], d[t], d[t]-o[t], (d[t]==o[t] ? "ok" : "DIVERGE")
        else        printf "%s\t%s\t%s\t%s\t%s\n", t, o[t], "AUSENTE", "-", "DIVERGE"
      }
      for (t in d) if (!(t in o)) printf "%s\t%s\t%s\t%s\t%s\n", t, "-", d[t], "-", "SO-NO-RESTORE"
    }' "$TMPDIR/origem.tsv" "$TMPDIR/destino.tsv" | sort > "$TMPDIR/comparacao.tsv"

  DIVERGENTES="$(awk -F'\t' '$5!="ok"' "$TMPDIR/comparacao.tsv" | wc -l | tr -d ' ')"
  TOTAL_DEST="$(awk -F'\t' '{s+=$2} END {print s+0}' "$TMPDIR/destino.tsv")"
  N_TAB_DEST="$(wc -l < "$TMPDIR/destino.tsv" | tr -d ' ')"

  printf '\n  %-42s %12s %12s %8s  %s\n' "TABELA" "ORIGEM" "RESTORE" "DIFF" ""
  printf '  %-42s %12s %12s %8s\n' "------------------------------------------" "------------" "------------" "--------"
  awk -F'\t' '{printf "  %-42s %12s %12s %8s  %s\n", $1, $2, $3, $4, ($5=="ok" ? "ok" : $5)}' "$TMPDIR/comparacao.tsv"
  printf '  %-42s %12s %12s\n' "TOTAL" "$TOTAL_ORIGEM" "$TOTAL_DEST"

  LINHAS_MD="$(awk -F'\t' '{
      sel = ($5=="ok" ? "✅" : ($5=="SO-NO-RESTORE" ? "⚠️ só no restore" : "❌"))
      printf "| `%s` | %s | %s | %s | %s |\n", $1, $2, $3, $4, sel
    }' "$TMPDIR/comparacao.tsv")"

  if (( DIVERGENTES == 0 && ERROS_REAIS == 0 )); then
    STATUS_RESTORE="✅ VÁLIDO — ${N_TAB_DEST}/${N_TAB_ORIGEM} tabelas, ${TOTAL_DEST}/${TOTAL_ORIGEM} linhas, zero divergência"
  else
    STATUS_RESTORE="❌ REPROVADO — ${DIVERGENTES} tabela(s) divergente(s), ${ERROS_REAIS} erro(s) real(is) de restore"
  fi
  log "$STATUS_RESTORE"
fi

# ==================================================== 5. cifrar e apagar claro
head1 "5. Cifra (age) e descarte do texto claro"

age -r "$RECIPIENT" -o "$CIFRADO" "$DUMP"
[[ -s "$CIFRADO" ]] || fail "age gerou arquivo vazio — o .dump em claro foi mantido por segurança."

SHA_CIFRADO="$(sha256 "$CIFRADO")"
TAM_CIFRADO="$(du -h "$CIFRADO" | cut -f1)"

if (( KEEP_PLAIN )); then
  log "--keep-plain: ${DUMP} MANTIDO em claro (você pediu)."
else
  apagar_seguro "$DUMP"
  log "texto claro apagado."
fi

log "cifrado   ${CIFRADO}  (${TAM_CIFRADO})"
log "sha256    ${SHA_CIFRADO}"

# ==================================================================== relatório
{
  echo "# Backup MSP (Supabase) — ${STAMP}"
  echo
  echo "| item | valor |"
  echo "|---|---|"
  echo "| origem | \`${ORIGEM_DESC}\` (host mascarado) |"
  echo "| servidor | PostgreSQL ${SRV_FULL} |"
  echo "| pg_dump | ${CLI_FULL} |"
  echo "| modo de acesso | \`default_transaction_read_only=on\` — somente leitura |"
  echo "| schemas | ${SCHEMAS[*]}$( ((${#IGNORADOS[@]})) && echo " (fora: ${IGNORADOS[*]})" ) |"
  echo "| formato | custom, compress=9, \`--no-owner --no-privileges\` |"
  echo "| dump em claro | ${TAMANHO} (${TAMANHO_B} bytes) — apagado após cifra |"
  echo "| sha256 do .dump | \`${SHA_DUMP}\` |"
  echo "| arquivo cifrado | \`$(basename "$CIFRADO")\` (${TAM_CIFRADO}) |"
  echo "| sha256 do .age | \`${SHA_CIFRADO}\` |"
  echo "| destinatário age | \`${RECIPIENT}\` |"
  echo "| teste de restore | ${STATUS_RESTORE} |"
  echo "| banco de teste | ${MODO_SCRATCH:-—} (destruído ao fim) |"
  echo
  echo "## Contagem por tabela — origem × restore"
  echo
  echo "| tabela | origem | restore | diff | |"
  echo "|---|---:|---:|---:|:--:|"
  printf '%s\n' "$LINHAS_MD"
  echo
  echo "**Total:** ${TOTAL_ORIGEM} linhas em ${N_TAB_ORIGEM} tabelas na origem."
  echo
  echo "## Como restaurar"
  echo
  echo '```bash'
  echo "age -d -i ~/.age/msp.key -o ${BASENAME}.dump $(basename "$CIFRADO")"
  echo "pg_restore --no-owner --no-acl --exit-on-error --dbname=\"\$SCRATCH_URL\" ${BASENAME}.dump"
  echo '```'
} > "$RELATORIO"

head1 "Pronto"
log "cifrado    ${CIFRADO}"
log "relatório  ${RELATORIO}"
log "nenhum upload foi feito — os arquivos estão só nesta máquina."
