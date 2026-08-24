import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ETAPAS,
  montarEsteira,
  etapasConcluidasPor,
  type PassoDaEsteira,
} from "./esteira";

/** A data de publicação usada nos casos. Sexta, 2026-03-06. */
const SEXTA = new Date(2026, 2, 6);

/**
 * A implementação ANTIGA, copiada literalmente de `api/posts/route.ts:78-88`
 * antes desta refatoração.
 *
 * Ela existe só aqui, e só para uma coisa: provar que a esteira nova produz
 * exatamente o mesmo payload que as rotas gravavam. Refatoração sem esse
 * confronto é fé, não verificação — e o `Task` gerado vai para a lista do dia
 * do Eduardo, então errar a data é errar a rotina dele.
 */
function esteiraAntiga(titulo: string, pubDate: Date) {
  const taskDefinitions = [
    { title: `Escrever roteiro: ${titulo}`, type: "roteiro", dayOffset: -3 },
    { title: `Gravar: ${titulo}`, type: "gravacao", dayOffset: -2 },
    { title: `Editar: ${titulo}`, type: "edicao", dayOffset: -1 },
    { title: `Publicar: ${titulo}`, type: "publicacao", dayOffset: 0 },
  ];
  return taskDefinitions.map((def) => {
    const dueDate = new Date(pubDate);
    dueDate.setDate(pubDate.getDate() + def.dayOffset);
    return { title: def.title, type: def.type, dueDate };
  });
}

const comparavel = (p: PassoDaEsteira | { title: string; type: string; dueDate: Date }) => ({
  title: p.title,
  type: p.type,
  dueDate: p.dueDate.toISOString(),
});

test("a esteira nova produz o MESMO payload que o código antigo", () => {
  const titulo = "Patrimônio sem Mimimi — o custo de não decidir";
  assert.deepEqual(
    montarEsteira({ tituloDoPost: titulo, publicacaoEm: SEXTA }).map(comparavel),
    esteiraAntiga(titulo, SEXTA).map(comparavel),
  );
});

test("a igualdade com o código antigo vale na virada de mês", () => {
  // Publicação em 01/03: roteiro cai em fevereiro. É onde aritmética de data
  // costuma divergir, então o confronto tem que cobrir esse caso.
  const primeiroDeMarco = new Date(2026, 2, 1);
  const titulo = "Virada de mês";
  assert.deepEqual(
    montarEsteira({ tituloDoPost: titulo, publicacaoEm: primeiroDeMarco }).map(comparavel),
    esteiraAntiga(titulo, primeiroDeMarco).map(comparavel),
  );
  // E o roteiro realmente caiu em fevereiro.
  const roteiro = montarEsteira({ tituloDoPost: titulo, publicacaoEm: primeiroDeMarco })[0]!;
  assert.equal(roteiro.dueDate.getMonth(), 1, "fevereiro");
  assert.equal(roteiro.dueDate.getDate(), 26);
});

test("variante completa: as 4 etapas, na ordem, com a antecedência de sempre", () => {
  const passos = montarEsteira({ tituloDoPost: "X", publicacaoEm: SEXTA });
  assert.deepEqual(
    passos.map((p) => p.type),
    ["roteiro", "gravacao", "edicao", "publicacao"],
  );
  assert.deepEqual(
    passos.map((p) => p.dueDate.getDate()),
    [3, 4, 5, 6], // ter, qua, qui, sex
  );
});

test("variante sem-roteiro: 3 etapas, e a publicação continua no dia", () => {
  const passos = montarEsteira({
    tituloDoPost: "X",
    publicacaoEm: SEXTA,
    variante: "sem-roteiro",
  });
  assert.deepEqual(
    passos.map((p) => p.type),
    ["gravacao", "edicao", "publicacao"],
  );
  assert.equal(passos.at(-1)!.dueDate.getDate(), 6);
});

test("as duas variantes concordam nas etapas que compartilham", () => {
  // Se um dia a antecedência de `gravacao` mudar só numa delas, isto quebra.
  const completa = montarEsteira({ tituloDoPost: "X", publicacaoEm: SEXTA });
  const semRoteiro = montarEsteira({
    tituloDoPost: "X",
    publicacaoEm: SEXTA,
    variante: "sem-roteiro",
  });
  assert.deepEqual(
    semRoteiro.map(comparavel),
    completa.filter((p) => p.type !== "roteiro").map(comparavel),
  );
});

test("o título sai no formato que as rotas já gravavam", () => {
  const passos = montarEsteira({ tituloDoPost: "Alerta da semana", publicacaoEm: SEXTA });
  assert.deepEqual(
    passos.map((p) => p.title),
    [
      "Escrever roteiro: Alerta da semana",
      "Gravar: Alerta da semana",
      "Editar: Alerta da semana",
      "Publicar: Alerta da semana",
    ],
  );
});

test("montarEsteira não altera a data recebida", () => {
  // As rotas reaproveitam `pubDate` depois de montar as tarefas; mutar a data
  // do chamador seria um bug silencioso e caro.
  const original = new Date(2026, 2, 6);
  const copia = new Date(original);
  montarEsteira({ tituloDoPost: "X", publicacaoEm: original });
  assert.equal(original.getTime(), copia.getTime());
});

// ── Ordem cumulativa ────────────────────────────────────────────────────

test("etapasConcluidasPor reproduz o mapa antigo, status por status", () => {
  const antigo: Record<string, string[]> = {
    roteiro_pronto: ["roteiro"],
    gravado: ["roteiro", "gravacao"],
    editado: ["roteiro", "gravacao", "edicao"],
    agendado: ["roteiro", "gravacao", "edicao"],
    publicado: ["roteiro", "gravacao", "edicao", "publicacao"],
  };
  for (const [status, esperado] of Object.entries(antigo)) {
    assert.deepEqual(etapasConcluidasPor(status), esperado, status);
  }
});

test("agendado não conclui a publicação", () => {
  assert.ok(!etapasConcluidasPor("agendado")!.includes("publicacao"));
});

test("status sem etapa concluída devolve null, não lista vazia", () => {
  // `null` e `[]` levam a comportamentos diferentes em quem chama: um não
  // toca em tarefa nenhuma, o outro faria um updateMany com `in: []`.
  assert.equal(etapasConcluidasPor("rascunho"), null);
  assert.equal(etapasConcluidasPor("qualquer_coisa"), null);
});

test("ETAPAS é a ordem da esteira, e é ela que define o cumulativo", () => {
  assert.deepEqual([...ETAPAS], ["roteiro", "gravacao", "edicao", "publicacao"]);
  assert.deepEqual(etapasConcluidasPor("publicado"), [...ETAPAS]);
});
