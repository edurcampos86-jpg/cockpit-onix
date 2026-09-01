import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SCRIPT = "scripts/auditoria-conta.ts";
const bruto = readFileSync(SCRIPT, "utf8");

/**
 * O fonte SEM comentários.
 *
 * Estas guardas varrem o texto do arquivo, e o cabeçalho do script explica
 * justamente o que ele NÃO faz — cita `$executeRaw` e `--aplicar` para dizer
 * que não os tem. Varrer o arquivo cru reprovaria a documentação em vez do
 * código, e o conserto seria apagar a explicação: guarda que pune quem
 * documenta ensina a não documentar.
 */
const src = bruto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !/^\s*\/\//.test(l))
  .join("\n");

// ── A guarda que sustenta a promessa "somente leitura" ──────────────────
//
// O script foi pedido como read-only. Promessa em comentário não é garantia:
// basta alguém acrescentar um `update` amanhã para ele deixar de ser o que o
// nome diz, e nada acusaria. Estes testes acusam.

test("nenhum método de escrita do Prisma aparece no script", () => {
  const escrita = /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
  assert.deepEqual(src.match(escrita) ?? [], []);
});

test("nenhum SQL de escrita, nem `$executeRaw`", () => {
  assert.equal(/\$executeRaw/.test(src), false, "$executeRaw não tem o que fazer aqui");
  for (const verbo of ["INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE", "ALTER TABLE", "DROP "]) {
    assert.equal(
      new RegExp(`\`[^\`]*${verbo}`, "i").test(src),
      false,
      `SQL de escrita no script: ${verbo}`,
    );
  }
});

test("o script não tem flag de aplicar — não há caminho de escrita a destravar", () => {
  // O `promover-master` tem `--aplicar` porque escreve. Este não escreve, e a
  // ausência da flag é a diferença que o torna auditável de fora.
  assert.equal(/--aplicar/.test(src), false);
});

// ── A senha nunca sai do banco ──────────────────────────────────────────

test("nenhuma consulta seleciona `password`", () => {
  // Não basta não imprimir: o campo não pode nem ser trazido. Um SELECT * o
  // traria, e o objeto acabaria num console.log de depuração algum dia.
  assert.equal(/SELECT\s+\*/i.test(src), false, "SELECT * traria o hash junto");
  assert.equal(/"password"/.test(src), false, "a coluna password não é selecionada");
});

// ── E-mail e CPF saem mascarados ────────────────────────────────────────

test("e-mail e CPF passam por máscara antes de imprimir", () => {
  assert.match(src, /function mascararEmail/);
  assert.match(src, /function mascararCpf/);
  // Nenhum `console.log` imprime o campo cru.
  const linhas = src.split("\n");
  const cruas = linhas.filter(
    (l) =>
      /console\.log/.test(l) &&
      /\$\{[^}]*\b(u|alvo)\.(email|cpf)\b/.test(l) &&
      !/mascarar(Email|Cpf)\(/.test(l),
  );
  assert.deepEqual(cruas, [], "console.log imprimindo e-mail ou CPF sem máscara");
});

// ── Os nomes de tabela nunca vêm de fora ────────────────────────────────

test("`$queryRawUnsafe` só recebe nome vindo da constante literal", () => {
  // Identificador não é parametrizável em SQL, então a interpolação é
  // inevitável — o que não pode é o nome vir de argv ou do ambiente.
  const chamadas = src.match(/\$queryRawUnsafe[\s\S]*?`[^`]*`/g) ?? [];
  assert.equal(chamadas.length, 1, "esperava exatamente uma chamada a $queryRawUnsafe");
  const sql = chamadas[0]!;
  assert.match(sql, /rel\.tabela/, "o nome deve vir de RELACOES");
  assert.match(sql, /rel\.coluna/);
  assert.equal(
    /\$\{(?!rel\.(tabela|coluna)).*?\}/.test(sql),
    false,
    "só `rel.tabela` e `rel.coluna` podem ser interpolados no SQL",
  );
  assert.match(sql, /\$1/, "o valor comparado tem de ser parâmetro, não interpolação");
});

test("as 22 relações do schema estão todas na lista", () => {
  // Se uma migration acrescentar relação para `User` e ninguém atualizar a
  // lista, a auditoria diria "nada depende dela" olhando para menos tabelas do
  // que existem — a resposta errada mais cara possível nesta pergunta.
  const schema = readFileSync("prisma/schema.prisma", "utf8").split("\n");
  const doSchema = new Set<string>();
  let modelo: string | null = null;
  for (const l of schema) {
    const m = /^model (\w+) \{/.exec(l);
    if (m) modelo = m[1]!;
    const rel = /^\s*\w+\s+User\??\s+@relation\((.*)\)/.exec(l);
    if (rel && modelo) {
      const campo = /fields:\s*\[(\w+)\]/.exec(rel[1]!);
      if (campo) doSchema.add(`${modelo}.${campo[1]}`);
    }
  }
  const naLista = new Set(
    [...src.matchAll(/\{ tabela: "(\w+)", coluna: "(\w+)"/g)].map((m) => `${m[1]}.${m[2]}`),
  );
  assert.deepEqual(
    [...doSchema].filter((r) => !naLista.has(r)).sort(),
    [],
    "relação para User existe no schema e falta em RELACOES",
  );
  assert.deepEqual(
    [...naLista].filter((r) => !doSchema.has(r)).sort(),
    [],
    "RELACOES cita relação que não existe mais no schema",
  );
});
