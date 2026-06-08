# syntax=docker/dockerfile:1
#
# Builder Dockerfile do Cockpit Onix.
#
# Motivo de existir: o módulo Jurídico precisa do binário `pg_dump` no runtime
# (backup diário do Postgres). O builder default do Railway (Railpack) não
# instala client do PostgreSQL, e forçar Nixpacks quebra o build (nixPkgs
# sobrescreve o node → `npm: command not found`). A saída estável é uma imagem
# Docker a partir de base Node LTS + postgresql-client-16 (mesma major do
# Postgres do Railway, pra `pg_dump` não falhar por "server version mismatch").
#
# Mantém o mesmo fluxo do Railpack: npm ci → prisma generate → next build →
# (no runtime) prisma migrate deploy && next start. Sem `output: standalone`,
# então a imagem carrega node_modules + .next completos.

FROM node:22-bookworm-slim

# --- postgresql-client-16 (pg_dump/pg_restore/psql) via repositório oficial PGDG ---
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# node_modules/.bin no PATH: o startCommand do Railway chama `prisma`/`next`
# direto (`prisma migrate deploy && next start`). Imagens Railpack/Nixpacks
# adicionam isso sozinhas; base node:22 NÃO — sem isto o container sai com
# `sh: prisma: not found` no boot (deploy "FAILED", build verde).
ENV PATH="/app/node_modules/.bin:$PATH"

# Dependências primeiro (cache de layer). postinstall = `prisma generate`,
# que precisa do schema presente → copia prisma/ antes do npm ci.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Código + build. NODE_ENV fica fora de "production" aqui pro next build
# enxergar as devDependencies (next, typescript, tailwind, prisma CLI).
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=8192 npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Default; no Railway o startCommand do railway.toml sobrepõe
# (prisma migrate deploy && next start).
CMD ["npm", "run", "start"]
