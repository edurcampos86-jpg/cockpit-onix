# RESTORE-DB — Recuperação manual do Postgres a partir do backup cifrado

Runbook de **recuperação manual** de um backup do Cockpit Onix. Os backups
vivem no Cloudflare R2, cifrados client-side com **age** (X25519). Este
documento cobre o caminho manual (humano, fora de CI). O teste automático
semanal é o `restore-drill.yml`.

> **Regra de ouro:** **NUNCA** restaure direto em produção. Sempre restaure
> num banco de **SCRATCH** (descartável), valide, e só então decida o que
> promover. Restaurar por cima da prod pode destruir dados bons.

---

## 0. Pré-requisitos

- **Chave privada age** (`AGE-SECRET-KEY-1...`). É o que decifra o backup.
  Sem ela, o `.age` é inútil. Veja a seção "Guarda da chave" abaixo.
- Ferramentas locais: `age` (≥ v1.2.1), `gunzip`, `pg_restore`/`psql`
  (cliente **PostgreSQL 16**, mesma major do servidor), e um cliente S3
  (`aws` CLI ou `rclone`) com credenciais de **leitura** do R2.
- Credenciais R2 (somente leitura basta): `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

Instalar o age (Linux):

```bash
AGE_VERSION=v1.2.1
curl -fsSL -o /tmp/age.tar.gz \
  "https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-amd64.tar.gz"
tar -C /tmp -xzf /tmp/age.tar.gz
sudo install -m 0755 /tmp/age/age /usr/local/bin/age
age --version
```

(macOS: `brew install age`.)

---

## 1. Achar e baixar um backup do R2

Os objetos ficam em três prefixos: `daily/`, `weekly/`, `monthly/`. Nome:
`cockpit-onix-YYYYMMDD-HHMMSS.dump.gz.age` (os `.dump.gz` sem `.age` são
backups legados pré-cifra, ainda dentro da retenção).

```bash
export AWS_ACCESS_KEY_ID="<R2_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<R2_SECRET_ACCESS_KEY>"
export AWS_DEFAULT_REGION=auto
ENDPOINT="https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com"
BUCKET="<R2_BUCKET>"

# Listar os mais recentes do daily/
aws s3 ls "s3://$BUCKET/daily/" --endpoint-url "$ENDPOINT" | sort | tail -10

# Baixar o escolhido
KEY="daily/cockpit-onix-20260602-095734.dump.gz.age"
aws s3 cp "s3://$BUCKET/$KEY" ./backup.dump.gz.age --endpoint-url "$ENDPOINT"
```

---

## 2. Decifrar OFFLINE com a chave privada

Faça isto numa máquina de confiança. A chave privada **não** deve ser
digitada em histórico de shell nem deixada em texto plano em disco.

```bash
# Opção A — chave num arquivo protegido (recomendado p/ uso manual)
#   guarde a chave em ~/.age/cockpit-onix.key com permissão 600
chmod 600 ~/.age/cockpit-onix.key
age -d -i ~/.age/cockpit-onix.key -o ./backup.dump.gz ./backup.dump.gz.age

# Opção B — sem tocar o disco (process substitution)
#   cole a chave quando o gerenciador de segredos a fornecer
age -d -i <(printf '%s\n' "$AGE_PRIVATE_KEY") -o ./backup.dump.gz ./backup.dump.gz.age

# Apague o cifrado/claro intermediário quando terminar
gunzip -f ./backup.dump.gz        # → ./backup.dump (formato custom pg_dump)
ls -lh ./backup.dump
```

> Se for um backup **legado** `.dump.gz` (sem `.age`), pule o `age -d` e vá
> direto pro `gunzip`.

---

## 3. Restaurar num banco de SCRATCH

Suba um Postgres 16 descartável (Docker é o mais simples):

```bash
docker run -d --name scratch-pg \
  -e POSTGRES_USER=scratch -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=scratch \
  -p 5433:5432 postgres:16-alpine

# Espera ficar pronto
until docker exec scratch-pg pg_isready -U scratch; do sleep 1; done

# Restaura. --no-owner/--no-acl: o role do Railway não existe aqui.
# --exit-on-error: qualquer erro estrutural aborta (não aceite restore parcial).
pg_restore \
  --no-owner --no-acl --exit-on-error --verbose \
  --dbname="postgresql://scratch:scratch@localhost:5433/scratch" \
  ./backup.dump
```

---

## 4. Validar antes de confiar

Rode a mesma validação do drill semanal:

```bash
psql "postgresql://scratch:scratch@localhost:5433/scratch" \
  -v ON_ERROR_STOP=1 -f scripts/validate-restore.sql
```

Confira manualmente o essencial:

```bash
psql "postgresql://scratch:scratch@localhost:5433/scratch" -c \
  'SELECT (SELECT count(*) FROM "User")              AS users,
          (SELECT count(*) FROM "ClienteBackoffice") AS clientes,
          (SELECT count(*) FROM "MovimentacaoBtg")   AS movimentacoes;'
```

Critérios mínimos: ≥ 1 `User`, contagem de `ClienteBackoffice` coerente com
o esperado, e dados recentes presentes. Se algo não bate, **não promova** —
teste o backup do dia anterior.

---

## 5. Promover para produção (só com revisão humana)

Não há atalho automático de propósito. Depois de validar no scratch e
decidir conscientemente o que recuperar:

- **Restore total** (catástrofe): coordene janela, faça um backup do estado
  atual de prod ANTES, e restaure num banco novo que vira o primary — nunca
  por cima do banco vivo sem snapshot prévio.
- **Restore parcial** (ex.: recuperar linhas apagadas por cascade-delete):
  exporte só as tabelas/linhas necessárias do scratch
  (`pg_dump -t "MovimentacaoBtg" ...` ou `COPY ... TO`) e aplique em prod
  com revisão, sem dropar o resto.

Procedimento de catástrofe completo: `docs/DISASTER_RECOVERY.md`.

---

## 6. Limpeza

```bash
docker rm -f scratch-pg
shred -u ./backup.dump ./backup.dump.gz.age 2>/dev/null || rm -f ./backup.dump ./backup.dump.gz.age
```

---

## Guarda da chave privada age — leia isto

**Um backup que você não consegue decifrar não é um backup.** A chave
privada age é o ponto único de falha desta estratégia:

- Guarde a chave privada em **pelo menos dois lugares offline e separados**
  (ex.: um gerenciador de senhas + um cofre/HD criptografado guardado em
  local físico distinto). Não dependa só do GitHub Secret.
- O GitHub Secret `AGE_PRIVATE_KEY` serve ao `restore-drill.yml` — não é
  backup da chave. Se a conta do GitHub cair, você ainda precisa da cópia
  offline.
- **Nunca** comite a chave privada no repositório nem a cole em chat/log.
- Se a chave vazar, gere um novo par (`age-keygen`), atualize
  `AGE_PUBLIC_KEY` (backups novos passam a usar o novo par) e mantenha a
  chave antiga só para decifrar backups antigos até saírem da retenção.
- Teste a recuperação de verdade ao menos **uma vez** após o setup, e
  confie no drill semanal para o resto. **Backup não testado não é backup.**
