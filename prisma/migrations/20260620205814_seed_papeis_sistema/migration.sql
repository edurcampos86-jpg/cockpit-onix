-- RBAC Fase 2 — SEED dos papéis-semente (migration de DADOS, idempotente).
--
-- Cria SÓ os 7 papéis de sistema + 15 PapelPermissao (membro/admin). NÃO atribui
-- papel a nenhuma Pessoa, NÃO cria carteiras, sem enforcement, sem UI.
-- Toca SOMENTE Papel e PapelPermissao (INSERT). Sem alteração de schema.
-- IDs determinísticos: Papel 'sys_<slug>'; PapelPermissao 'sys_<slug>__<area>'.
-- Idempotente: ON CONFLICT DO NOTHING (re-rodar não duplica).
--
-- NOTA: o `migrate dev` gerou aqui o drift recorrente do FTS de PainelEmailAI
-- (DROP INDEX tsv + ALTER tsv DROP DEFAULT) — REMOVIDO; esta é uma migration de
-- dados pura. Ver 20260613120000_painel_email_fts_index_recreate.

-- 7 Papéis de sistema (id | nome | escopoOperacional | adminGlobal)
INSERT INTO "Papel" ("id", "nome", "isSistema", "escopoOperacional", "adminGlobal", "createdAt", "updatedAt") VALUES
  ('sys_administrador',        'Administrador',        true, 'todas',              true,  now(), now()),
  ('sys_assessor',             'Assessor',             true, 'propria_mais_apoio', false, now(), now()),
  ('sys_backoffice',           'Backoffice',           true, 'propria_mais_apoio', false, now(), now()),
  ('sys_qualidade',            'Qualidade',            true, 'todas',              false, now(), now()),
  ('sys_corretora',            'Corretora',            true, 'todas',              false, now(), now()),
  ('sys_imobiliaria_admin',    'Imobiliária Admin',    true, 'todas',              false, now(), now()),
  ('sys_imobiliaria_corretor', 'Imobiliária Corretor', true, 'propria',            false, now(), now())
ON CONFLICT ("nome") DO NOTHING;

-- 15 PapelPermissao (papelId | area | nivel). Áreas sem linha = "nenhum" (default).
INSERT INTO "PapelPermissao" ("id", "papelId", "area", "nivel") VALUES
  ('sys_administrador__investimentos',      'sys_administrador',        'investimentos', 'admin'),
  ('sys_administrador__corretora',          'sys_administrador',        'corretora',     'admin'),
  ('sys_administrador__imobiliaria',        'sys_administrador',        'imobiliaria',   'admin'),
  ('sys_administrador__qualidade',          'sys_administrador',        'qualidade',     'admin'),
  ('sys_administrador__configuracoes',      'sys_administrador',        'configuracoes', 'admin'),
  ('sys_assessor__investimentos',           'sys_assessor',             'investimentos', 'membro'),
  ('sys_assessor__corretora',               'sys_assessor',             'corretora',     'membro'),
  ('sys_assessor__imobiliaria',             'sys_assessor',             'imobiliaria',   'membro'),
  ('sys_backoffice__investimentos',         'sys_backoffice',           'investimentos', 'membro'),
  ('sys_backoffice__corretora',             'sys_backoffice',           'corretora',     'membro'),
  ('sys_backoffice__imobiliaria',           'sys_backoffice',           'imobiliaria',   'membro'),
  ('sys_qualidade__qualidade',              'sys_qualidade',            'qualidade',     'admin'),
  ('sys_corretora__corretora',              'sys_corretora',            'corretora',     'membro'),
  ('sys_imobiliaria_admin__imobiliaria',    'sys_imobiliaria_admin',    'imobiliaria',   'admin'),
  ('sys_imobiliaria_corretor__imobiliaria', 'sys_imobiliaria_corretor', 'imobiliaria',   'membro')
ON CONFLICT ("papelId", "area") DO NOTHING;
