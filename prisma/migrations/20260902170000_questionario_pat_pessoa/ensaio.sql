-- Fixture do ensaio B (.github/workflows/ensaio-migration.yml).
-- Exercita: escolha do mais recente, preservação de vigente existente e
-- descarte de PAT com erro.
INSERT INTO "Filial" ("id", "nome", "cidade", "estado", "isMatriz", "createdAt", "updatedAt")
VALUES ('fixture-filial-questionario', 'Fixture Questionário PAT', 'Salvador', 'BA', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Departamento" ("id", "nome", "createdAt", "updatedAt")
VALUES ('fixture-depto-questionario', 'Fixture Questionário PAT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Pessoa" (
  "id", "nomeCompleto", "cpf", "email", "dataEntrada", "status",
  "cargoFamilia", "teamRole", "filialId", "departamentoId", "createdAt", "updatedAt"
)
VALUES
  ('fixture-pessoa-sem-vigente', 'Fixture Sem Vigente', '90000000001', 'fixture-sem-vigente@onix.test', CURRENT_TIMESTAMP, 'ativo', 'administrativo', 'colaborador', 'fixture-filial-questionario', 'fixture-depto-questionario', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixture-pessoa-com-vigente', 'Fixture Com Vigente', '90000000002', 'fixture-com-vigente@onix.test', CURRENT_TIMESTAMP, 'ativo', 'administrativo', 'colaborador', 'fixture-filial-questionario', 'fixture-depto-questionario', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixture-pessoa-com-erro', 'Fixture Com Erro', '90000000003', 'fixture-com-erro@onix.test', CURRENT_TIMESTAMP, 'ativo', 'administrativo', 'colaborador', 'fixture-filial-questionario', 'fixture-depto-questionario', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Pat" (
  "id", "pessoaId", "dataPat", "vigente", "status", "uploadedAt", "updatedAt"
)
VALUES
  ('fixture-pat-antigo', 'fixture-pessoa-sem-vigente', '2025-01-01', false, 'extraido', '2025-01-02', '2025-01-02'),
  ('fixture-pat-recente', 'fixture-pessoa-sem-vigente', '2026-01-01', false, 'extraido', '2026-01-02', '2026-01-02'),
  ('fixture-pat-ja-vigente', 'fixture-pessoa-com-vigente', '2025-01-01', true, 'extraido', '2025-01-02', '2025-01-02'),
  ('fixture-pat-novo-nao-vigente', 'fixture-pessoa-com-vigente', '2026-01-01', false, 'extraido', '2026-01-02', '2026-01-02'),
  ('fixture-pat-extraido-anterior', 'fixture-pessoa-com-erro', '2025-01-01', false, 'extraido', '2025-01-02', '2025-01-02'),
  ('fixture-pat-erro-recente', 'fixture-pessoa-com-erro', '2026-01-01', false, 'erro', '2026-01-02', '2026-01-02');

-- Oráculos do ensaio B. Como são CHECKs carregados apenas no banco descartável,
-- a migration falha se escolher o PAT antigo, trocar um vigente já existente
-- ou promover o registro com erro. O tripwire da migration cobre a ausência de
-- promoção; estes três cobrem a identidade exata do registro escolhido.
ALTER TABLE "Pat" ADD CONSTRAINT "fixture_sem_vigente_escolhe_recente" CHECK (
  "pessoaId" <> 'fixture-pessoa-sem-vigente'
  OR "vigente" = false
  OR "id" = 'fixture-pat-recente'
);

ALTER TABLE "Pat" ADD CONSTRAINT "fixture_preserva_vigente_existente" CHECK (
  "pessoaId" <> 'fixture-pessoa-com-vigente'
  OR "vigente" = false
  OR "id" = 'fixture-pat-ja-vigente'
);

ALTER TABLE "Pat" ADD CONSTRAINT "fixture_ignora_erro_recente" CHECK (
  "pessoaId" <> 'fixture-pessoa-com-erro'
  OR "vigente" = false
  OR "id" = 'fixture-pat-extraido-anterior'
);
