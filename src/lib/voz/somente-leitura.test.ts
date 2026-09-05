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
import { reuniaoEhDaPessoa } from "../reunioes/escopo-reuniao";
import { segmentarTurnos, atribuirEduardo, falasDoEduardo } from "./turnos";

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

/**
 * O extrator não pode ter a PRÓPRIA definição de "reunião do Eduardo".
 *
 * Desde o #363 a régua de titularidade de `Meeting` mora em
 * `src/lib/reunioes/escopo-reuniao.ts` e é a que a rota /api/meetings aplica.
 * Se o extrator voltar a comparar `vendedor` com `===`, passa a existir uma
 * segunda definição — e a que divergir primeiro é a que ninguém olha.
 *
 * O script chama `main()` no topo do módulo, então importá-lo aqui abriria
 * conexão com o banco. Por isso a inspeção é do FONTE, como nas guardas acima.
 */
test("a titularidade da reunião vem do gate canônico, não de `===`", () => {
  const fonte = readFileSync(SCRIPT, "utf8");

  assert.match(
    fonte,
    /import \{ reuniaoEhDaPessoa \} from "\.\.\/src\/lib\/reunioes\/escopo-reuniao"/,
    "o extrator deve reusar reuniaoEhDaPessoa",
  );
  assert.ok(
    !/m\.vendedor\s*===/.test(fonte),
    "comparação direta de `vendedor` com === reintroduz a régua duplicada",
  );

  // A lista de nomes declarada no script tem de casar com o gate de verdade.
  const bloco = fonte.match(/const NOMES_EDUARDO = \[([^\]]+)\]/);
  assert.ok(bloco, "NOMES_EDUARDO não encontrado no extrator");
  const nomes = [...bloco![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(nomes.length >= 1);

  assert.equal(reuniaoEhDaPessoa("Eduardo Campos", nomes), true);
  for (const outro of ["Thiago Vergal", "Rose Oliveira", "Adriely", ""]) {
    assert.equal(
      reuniaoEhDaPessoa(outro, nomes),
      false,
      `${outro || "(vazio)"} não pode contar como reunião do Eduardo`,
    );
  }
});

test("reunião órfã entra contada à parte, nunca somada ao titular", () => {
  const fonte = readFileSync(SCRIPT, "utf8");
  // Sem vendedor, o #363 não libera para escopo restrito. O extrator só admite
  // com evidência no texto — e precisa reportar quantas foram.
  assert.match(fonte, /const orfas = meetings\.filter/);
  assert.match(fonte, /ASSINA_EDUARDO\.test/);
  assert.match(fonte, /semTitular:\s*\{\s*total:/);
});

/**
 * Resumo do Plaud NÃO é fala.
 *
 * `ReuniaoEstruturada.textoBruto` é o "resumo original colado (Plaud)"
 * (`prisma/schema.prisma:1090`) — escrito pelo resumidor, não dito pelo
 * Eduardo. `docs/plaud-caminhos-de-entrada.md` registra que o import manual,
 * que é "o caminho que entrega mais", grava exatamente aí.
 *
 * Se esse texto entrar no corpus, o guia descreve a voz do resumidor e sai
 * plausível — o modo de falha mais caro que existe aqui.
 */
test("resumo sem rótulo de falante não produz nenhuma fala atribuída", () => {
  const resumo =
    "Reuniao com o cliente para revisar a carteira. Foram discutidos os objetivos " +
    "de longo prazo e ficou acordado um novo aporte mensal. Eduardo apresentou as " +
    "opcoes de protecao e o cliente pediu tempo para pensar.";

  const seg = segmentarTurnos(resumo);
  assert.equal(seg.semDiarizacao, true, "resumo não tem rótulo de falante");

  const atribuido = atribuirEduardo(seg, { vendedorEhEduardo: true, participantes: [] });
  assert.deepEqual(
    falasDoEduardo(atribuido),
    [],
    "resumo jamais pode virar fala do Eduardo, nem citando o nome dele",
  );
});

test("o extrator descarta material sem fala e diz onde a fala entra", () => {
  const fonte = readFileSync(SCRIPT, "utf8");

  // Corpus e lotes só com o que tem fala.
  assert.match(fonte, /const comFala = reunioes\.filter\(\(r\) => r\.diarizada\)/);
  assert.match(fonte, /montarCorpus\(comFala, denylist\)/);
  assert.match(fonte, /lotear\(comFala\)/);
  assert.ok(
    !/montarCorpus\(reunioes,/.test(fonte),
    "o corpus não pode ser montado sobre o acervo inteiro",
  );

  // Falha alto, e aponta o caminho certo em vez de gerar arquivo vazio.
  assert.match(fonte, /Nenhuma reunião com FALA diarizada/);
  assert.match(fonte, /plaud-caminhos-de-entrada\.md/);
});
