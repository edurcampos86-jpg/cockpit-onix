-- Validação de restore drill — executado pelo workflow restore-drill.yml.
--
-- Saída em formato chave=valor (pipe-separated) para o workflow parsear
-- com awk/grep sem precisar de jq. Cada linha começa com prefixo SECTION:
-- pra facilitar grep -E '^TABLES_COUNT:' etc.
--
-- Critérios validados:
--   1. Existem tabelas no schema public (sanity check)
--   2. As 5 tabelas mais importantes têm contagem de registros conhecida
--   3. Pelo menos 1 User existe (sem isso a app não loga)
--   4. Existe pelo menos UMA linha com updated_at / updatedAt / createdAt
--      nos últimos 7 dias — confirma que o dump não é fóssil

\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'

\echo === RESTORE_VALIDATION_BEGIN ===

-- 1. Lista de tabelas do schema public
\echo
\echo --- TABLES_LIST ---
SELECT 'TABLE:' || table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. Contagem das 5 tabelas mais importantes
--    (User, ClienteBackoffice, ReceitaItem, MovimentacaoBtg, Pessoa)
--    Identificadores em camelCase do Prisma → quoted, case-sensitive no Postgres.
\echo
\echo --- TOP_TABLES_COUNT ---
SELECT 'COUNT:User=' || COUNT(*)::text                FROM "User";
SELECT 'COUNT:ClienteBackoffice=' || COUNT(*)::text   FROM "ClienteBackoffice";
SELECT 'COUNT:ReceitaItem=' || COUNT(*)::text         FROM "ReceitaItem";
SELECT 'COUNT:MovimentacaoBtg=' || COUNT(*)::text     FROM "MovimentacaoBtg";
SELECT 'COUNT:Pessoa=' || COUNT(*)::text              FROM "Pessoa";

-- 3. Tabela crítica: User precisa ter >= 1 (sem usuário não tem login)
\echo
\echo --- CRITICAL_TABLES ---
SELECT 'CRITICAL_OK:User' WHERE (SELECT COUNT(*) FROM "User") >= 1;
SELECT 'CRITICAL_FAIL:User_empty' WHERE (SELECT COUNT(*) FROM "User") = 0;

-- 4. Frescor: alguma updatedAt/createdAt nas últimas 168h?
--    Verifica nas tabelas mais movimentadas — basta UMA ter timestamp recente
--    para considerar que o backup não é antigo.
\echo
\echo --- FRESHNESS ---
WITH recencias AS (
    SELECT MAX("updatedAt") AS u FROM "ClienteBackoffice"
    UNION ALL
    SELECT MAX("updatedAt") FROM "AcaoPainel"
    UNION ALL
    SELECT MAX("createdAt") FROM "ReceitaItem"
    UNION ALL
    SELECT MAX("createdAt") FROM "MovimentacaoBtg"
    UNION ALL
    SELECT MAX("updatedAt") FROM "Pessoa"
)
SELECT 'FRESHNESS:max_ts=' || COALESCE(MAX(u)::text, 'NULL') ||
       '|recent_7d=' || (CASE WHEN MAX(u) >= NOW() - INTERVAL '7 days' THEN 'yes' ELSE 'no' END)
FROM recencias;

\echo
\echo === RESTORE_VALIDATION_END ===
