-- Validação de restore drill — schema-agnostic.
--
-- Saída em formato chave=valor (pipe-separated) para o workflow parsear
-- com grep/awk. Tudo via RAISE NOTICE em blocos DO — assim podemos
-- iterar sobre tabelas/colunas via information_schema sem quebrar quando
-- uma some, é renomeada, ou usa convenção diferente (createdAt vs criadoEm).
--
-- Critérios validados:
--   1. Existem tabelas no schema public (sanity check via TABLE:)
--   2. As 5 tabelas mais importantes têm contagem conhecida (MISSING se sumiu)
--   3. Pelo menos 1 User existe — gate no workflow via USER_COUNT >= 1
--   4. Pelo menos uma tabela com timestamp (createdAt/updatedAt/criadoEm/...)
--      tem registro nos últimos 7 dias — descobre tabelas e colunas via
--      information_schema, sobrevive a migrations sem manutenção neste arquivo.

\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'

\echo === RESTORE_VALIDATION_BEGIN ===

\echo
\echo --- TABLES_LIST ---
SELECT 'TABLE:' || table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

\echo
\echo --- TOP_TABLES_COUNT ---
DO $$
DECLARE
    n bigint;
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['User','ClienteBackoffice','ReceitaItem','MovimentacaoBtg','Pessoa'] LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'COUNT:%=MISSING', t;
        ELSE
            EXECUTE format('SELECT COUNT(*) FROM %I', t) INTO n;
            RAISE NOTICE 'COUNT:%=%', t, n;
        END IF;
    END LOOP;
END $$;

\echo
\echo --- FRESHNESS ---
DO $$
DECLARE
    rec record;
    latest timestamp;
    overall_max timestamp;
    has_recent boolean := false;
    scanned int := 0;
BEGIN
    FOR rec IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.column_name IN ('updatedAt','createdAt','criadoEm','updated_at','created_at')
          AND c.data_type LIKE 'timestamp%'
        ORDER BY c.table_name, c.column_name
    LOOP
        EXECUTE format('SELECT MAX(%I) FROM %I', rec.column_name, rec.table_name) INTO latest;
        scanned := scanned + 1;
        IF latest IS NOT NULL THEN
            IF overall_max IS NULL OR latest > overall_max THEN
                overall_max := latest;
            END IF;
            IF latest >= NOW() - INTERVAL '7 days' THEN
                has_recent := true;
            END IF;
        END IF;
    END LOOP;
    RAISE NOTICE 'FRESHNESS:scanned_cols=%|max_ts=%|recent_7d=%',
        scanned,
        COALESCE(overall_max::text, 'NULL'),
        CASE WHEN has_recent THEN 'yes' ELSE 'no' END;
END $$;

\echo
\echo === RESTORE_VALIDATION_END ===
