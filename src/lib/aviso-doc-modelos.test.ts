import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste do aviso de doc desatualizada — scripts/aviso-doc-modelos.sh.
 *
 * ── O QUE PRECISA SER TESTADO AQUI É DIFERENTE ───────────────────────────
 * As outras guardas do CI provam que REPROVAM o caso ruim. Esta não reprova
 * nada, por decisão explícita: doc desatualizada não pode bloquear PR de
 * código. O código de saída é SEMPRE 0.
 *
 * Isso inverte o risco. Numa guarda que reprova, o modo de falha é o falso
 * negativo silencioso — e o CI vermelho denuncia o falso positivo. Aqui não há
 * vermelho nenhum: se o script parar de detectar, ninguém descobre, e se ele
 * passar a avisar demais o aviso vira ruído e as pessoas param de ler.
 *
 * Então os testes cobrem as três coisas em pé de igualdade:
 *   1. avisa quando deve      (detecção)
 *   2. NÃO avisa quando não deve (o ruído que mataria o sinal)
 *   3. sai 0 em TODOS os casos, inclusive nos de erro (o contrato)
 */

const SCRIPT = join(process.cwd(), "scripts", "aviso-doc-modelos.sh");

function rodar(doc: string | null, schema: string | null): { code: number; saida: string } {
  const raiz = mkdtempSync(join(tmpdir(), "aviso-doc-"));
  try {
    const docPath = join(raiz, "estado.md");
    const schemaPath = join(raiz, "schema.prisma");
    if (doc !== null) writeFileSync(docPath, doc);
    if (schema !== null) writeFileSync(schemaPath, schema);
    try {
      const saida = execFileSync(SCRIPT, [docPath, schemaPath], { encoding: "utf8" });
      return { code: 0, saida };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? -1, saida: (err.stdout ?? "") + (err.stderr ?? "") };
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

const DOC_OK = `# Estado

## Modelos existentes

### \`Empresa\` — desde a #288
campos aqui.

### \`ClienteBackoffice.pessoaGrupoId\`
o elo cliente → titular.

---

## Outra seção

### \`ModeloQueNaoExiste\`
Fora da seção de modelos — não deve ser conferido.
`;

const SCHEMA_OK = `model Empresa {
  id       String  @id
  parentId String?
}

model ClienteBackoffice {
  id            String  @id
  pessoaGrupoId String?
}
`;

// ── O contrato que não pode quebrar: nunca reprova ───────────────────────

test("sai 0 quando está tudo em dia", () => {
  const { code, saida } = rodar(DOC_OK, SCHEMA_OK);
  assert.equal(code, 0);
  assert.match(saida, /^OK:/m);
});

test("sai 0 MESMO quando encontra divergência", () => {
  // O ponto inteiro do script. Se isto virar 1 um dia, foi sem querer — e uma
  // doc velha passa a bloquear PR de código, que é exatamente o que o Eduardo
  // decidiu que não pode acontecer.
  const { code, saida } = rodar(DOC_OK, "model Empresa {\n  id String @id\n}\n");
  assert.equal(code, 0);
  assert.match(saida, /::warning::/);
});

test("sai 0 quando a doc não existe", () => {
  // Branch anterior à criação da doc não pode ficar vermelha por causa dela.
  const { code, saida } = rodar(null, SCHEMA_OK);
  assert.equal(code, 0);
  assert.match(saida, /::warning::.*não existe/);
});

test("sai 0 quando o schema não existe", () => {
  const { code, saida } = rodar(DOC_OK, null);
  assert.equal(code, 0);
  assert.match(saida, /::warning::/);
});

// ── Detecção ─────────────────────────────────────────────────────────────

test("avisa quando o modelo citado sumiu do schema", () => {
  const { saida } = rodar(DOC_OK, "model Empresa {\n  id String @id\n}\n");
  assert.match(saida, /ClienteBackoffice/);
  assert.match(saida, /Renomeado ou removido\?/);
});

test("avisa quando o modelo existe mas o CAMPO citado sumiu", () => {
  // O caso mais provável na prática: ninguém remove `ClienteBackoffice`, mas
  // um campo citado na doc é renomeado numa PR de schema.
  const { saida } = rodar(
    DOC_OK,
    `model Empresa {\n  id String @id\n}\n\nmodel ClienteBackoffice {\n  id String @id\n}\n`,
  );
  assert.match(saida, /não tem o campo `pessoaGrupoId`/);
});

test("o aviso diz o que fazer e onde", () => {
  const { saida } = rodar(DOC_OK, "model Empresa {\n  id String @id\n}\n");
  assert.match(saida, /Modelos existentes/);
  assert.match(saida, /NESTA PR/);
});

test("avisa quando a extração não achou nada — silêncio não pode virar 'tudo em dia'", () => {
  // A guarda da própria guarda. Como o script nunca reprova, um regex que
  // parasse de casar seria indistinguível de "está tudo certo" para sempre.
  const { code, saida } = rodar("# Doc sem a seção esperada\n", SCHEMA_OK);
  assert.equal(code, 0);
  assert.match(saida, /Não extraí nenhum modelo/);
  assert.doesNotMatch(saida, /^OK:/m);
});

// ── O ruído que mataria o sinal ──────────────────────────────────────────

test("NÃO avisa sobre os modelos do schema que a doc não cita", () => {
  // O schema tem 89 modelos e a doc cita 5. Avisar sobre os outros 84 seria
  // ruído garantido no primeiro run, e aviso que ninguém lê não é aviso.
  const { code, saida } = rodar(
    DOC_OK,
    SCHEMA_OK + "\nmodel Post {\n  id String @id\n}\n\nmodel Script {\n  id String @id\n}\n",
  );
  assert.equal(code, 0);
  assert.doesNotMatch(saida, /::warning::/);
  assert.doesNotMatch(saida, /Post|Script/);
});

test("NÃO confere títulos fora da seção 'Modelos existentes'", () => {
  // `ModeloQueNaoExiste` está em DOC_OK, numa seção posterior. Conferir a doc
  // inteira transformaria cada frase reescrita em falso positivo.
  const { saida } = rodar(DOC_OK, SCHEMA_OK);
  assert.doesNotMatch(saida, /ModeloQueNaoExiste/);
});

test("campo de mesmo nome em OUTRO modelo não faz a conferência passar", () => {
  // A busca do campo é dentro do corpo do modelo citado. Sem isso, um
  // `pessoaGrupoId` em qualquer outro modelo silenciaria o aviso.
  const { saida } = rodar(
    DOC_OK,
    `model Empresa {\n  id String @id\n}\n\nmodel ClienteBackoffice {\n  id String @id\n}\n\nmodel Outro {\n  pessoaGrupoId String?\n}\n`,
  );
  assert.match(saida, /não tem o campo `pessoaGrupoId`/);
});

test("espaçamento do `model X {` do Prisma não escapa", () => {
  const { code, saida } = rodar(
    "## Modelos existentes\n\n### `Empresa`\n",
    "model    Empresa   {\n  id String @id\n}\n",
  );
  assert.equal(code, 0);
  assert.match(saida, /^OK:/m);
});

// ── Contra o repositório real ────────────────────────────────────────────

test("a doc e o schema REAIS estão em dia", () => {
  const saida = execFileSync(SCRIPT, ["docs/onix-co-estado.md", "prisma/schema.prisma"], {
    encoding: "utf8",
  });
  assert.match(saida, /^OK:/m);
});
