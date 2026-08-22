-- Departamento consolidador da holding.
--
-- ADITIVA E SEM BACKFILL. Uma coluna booleana com DEFAULT false, que é o valor
-- CORRETO para as 20 linhas existentes: nenhuma delas consolida nada. Não há
-- UPDATE, não há SET NOT NULL em coluna preenchida depois, não há DELETE.
--
-- Por que isto não repete o risco da 20260810181603: lá a coluna nascia NOT
-- NULL sem default numa tabela com dados, e o backfill tinha de acontecer no
-- meio da migration. Aqui o default JÁ é a resposta certa para todas as linhas
-- de hoje, e o Postgres 11+ resolve `ADD COLUMN ... DEFAULT` sem reescrever a
-- tabela — tempo constante, sem lock de dado.
--
-- Quem passa a ser `true` são 4 linhas que ainda NÃO EXISTEM (os consolidadores
-- da holding). Elas entram pelo seed, como INSERT, não por UPDATE aqui.
ALTER TABLE "Empresa" ADD COLUMN "consolida" BOOLEAN NOT NULL DEFAULT false;

-- Mesma razão do índice de `transversal`: a pergunta "quem consolida?" é uma
-- consulta de tela, e sem índice ela varre a tabela inteira.
CREATE INDEX "Empresa_consolida_idx" ON "Empresa"("consolida");
