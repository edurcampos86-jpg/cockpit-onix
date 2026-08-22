/**
 * Guarda: o extrator do guia de voz é SOMENTE LEITURA.
 *
 * O pedido do Eduardo foi explícito ("nenhuma escrita no banco") e a promessa
 * está no cabeçalho do script — mas comentário não impede ninguém de colar um
 * `update` ali daqui a seis meses. Este teste transforma a promessa em gate:
 * se um método de escrita do Prisma aparecer no arquivo, o `npm test` cai.
 *
 * Mesmo espírito das guardas que já existem no repo (guarda-drift-fts,
 * guarda-not-null-sem-default).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "scripts", "guia-voz-eduardo.ts");

const METODOS_DE_ESCRITA = [
  "create", "createMany", "createManyAndReturn",
  "update", "updateMany", "upsert",
  "delete", "deleteMany",
  "$executeRaw", "$executeRawUnsafe", "$transaction",
];

test("o extrator não chama nenhum método de escrita do Prisma", () => {
  const fonte = readFileSync(SCRIPT, "utf8");

  // Só o que sai do client do Prisma. `client.messages.create` (Anthropic) é
  // outra coisa — casar por nome de método solto acusaria falso positivo.
  const chamadasPrisma = [...fonte.matchAll(/\bprisma\.(\w+)(?:\.(\w+))?\s*\(/g)].map(
    (m) => (m[2] ? `${m[1]}.${m[2]}` : m[1]!),
  );
  const escritas = chamadasPrisma.filter((c) => {
    const metodo = c.includes(".") ? c.split(".")[1]! : c;
    return METODOS_DE_ESCRITA.includes(metodo);
  });
  assert.deepEqual(
    escritas,
    [],
    `escrita no banco em scripts/guia-voz-eduardo.ts: ${escritas.join(", ")}`,
  );

  // Raw SQL de escrita nunca aparece, venha de onde vier.
  for (const raw of ["$executeRaw", "$executeRawUnsafe"]) {
    assert.ok(!fonte.includes(raw), `raw de escrita no extrator: ${raw}`);
  }
  // Só os métodos de leitura do Prisma são usados.
  const metodosUsados = [...new Set(chamadasPrisma.map((c) => c.split(".")[1] ?? c))];
  const leitura = new Set(["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy", "$disconnect"]);
  const fora = metodosUsados.filter((m) => !leitura.has(m));
  assert.deepEqual(fora, [], `método não-leitura no extrator: ${fora.join(", ")}`);
});

test("o extrator só consulta as tabelas declaradas no pedido", () => {
  const fonte = readFileSync(SCRIPT, "utf8");
  const modelos = [...fonte.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]!);
  const permitidos = new Set([
    "meeting",             // transcription, summary, insights, vendedor, date
    "reuniaoEstruturada",  // textoBruto
    "clienteBackoffice",   // só nome — alimenta a denylist da anonimização
    "lead",                // só name — idem
  ]);
  const fora = [...new Set(modelos)].filter((m) => m !== "$disconnect" && !permitidos.has(m));
  assert.deepEqual(fora, [], `tabela fora do escopo do pedido: ${fora.join(", ")}`);
});

test("toda anonimização passa pelo módulo — o script não redige na mão", () => {
  const fonte = readFileSync(SCRIPT, "utf8");
  assert.match(fonte, /import \{[\s\S]*anonimizar[\s\S]*\} from "\.\.\/src\/lib\/voz\/anonimizar"/);
  // Gravação sempre depois da auditoria de vazamento.
  const iAuditoria = fonte.indexOf("auditarVazamento");
  const iWrite = fonte.indexOf("await writeFile(destino");
  assert.ok(iAuditoria > 0 && iWrite > iAuditoria, "writeFile do guia antes da auditoria");
});
