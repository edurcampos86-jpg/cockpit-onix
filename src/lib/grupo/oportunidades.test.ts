/**
 * Guardas do cálculo de oportunidades do grupo.
 *
 * Tudo aqui é puro, então tudo é testável — e o que se testa é o que erra em
 * silêncio: uma lacuna que não devia existir manda o atendente oferecer o que
 * o cliente já tem, e uma que some deixa dinheiro na mesa sem ninguém saber.
 *
 * O caso mais caro tem teste próprio: afirmar "não possui" sobre uma empresa
 * do grupo que não tem fonte de dado. Ninguém verificou, e a ligação sai
 * errada.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATALOGO_DO_GRUPO,
  calcularOportunidades,
  type OfertaDoGrupo,
  type PossePessoa,
} from "./oportunidades.ts";
import { CATALOGO_PRODUTOS, tiposProdutoValidos } from "@/lib/corretora/catalogo-produtos.ts";

const VAZIA: PossePessoa = { posse: {}, saldoInvestimentos: null };

/** Açúcar dos testes: lista de produtos da Corretora vira mapa de posse. */
const posseDe = (...ids: string[]): PossePessoa["posse"] => {
  const m: Record<string, number> = {};
  for (const id of ids) m[id] = (m[id] ?? 0) + 1;
  return m;
};

// ── O catálogo do grupo ───────────────────────────────────────────────────

test("as onze ofertas da Corretora vêm do catálogo, não de uma cópia", () => {
  // Copiar criaria a segunda lista que ninguém lembra de atualizar. Se alguém
  // acrescentar produto ao catálogo da Corretora, ele aparece aqui sozinho —
  // e este teste é o que garante que continue assim.
  const daCorretora = CATALOGO_DO_GRUPO.filter((o) => o.empresaId === "corretora").map((o) => o.id);
  assert.deepEqual([...daCorretora].sort(), [...tiposProdutoValidos()].sort());
  assert.equal(daCorretora.length, CATALOGO_PRODUTOS.length);
});

test("nenhum id repetido no catálogo do grupo", () => {
  // Id repetido faria a mesma oferta aparecer em `possui` e em `lacunas`.
  const ids = CATALOGO_DO_GRUPO.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("toda oferta declara uma empresa do grupo", () => {
  const empresas = new Set([
    "investimentos",
    "corretora",
    "planejamento",
    "imobiliaria",
    "educacao",
    "corporate",
    "tech",
  ]);
  for (const o of CATALOGO_DO_GRUPO) {
    assert.ok(empresas.has(o.empresaId), `oferta "${o.id}" aponta para empresa desconhecida`);
  }
});

// ── possui × não possui ───────────────────────────────────────────────────

test("o que a pessoa tem entra em possui, com a contagem", () => {
  // Duas apólices de auto são dois carros, e isso muda a conversa.
  const r = calcularOportunidades({
    posse: { ...posseDe("auto", "auto", "vida"), "conta-investimentos": 1 },
    saldoInvestimentos: 2_000_000,
  });
  const auto = r.possui.find((o) => o.id === "auto");
  assert.equal(auto?.quantidade, 2);
  assert.equal(r.possui.find((o) => o.id === "vida")?.quantidade, 1);
  assert.equal(r.possui.find((o) => o.id === "conta-investimentos")?.quantidade, 1);
});

test("o que ela não tem entra em lacunas", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  assert.equal(r.lacunas.some((o) => o.id === "residencial"), true);
  assert.equal(r.lacunas.some((o) => o.id === "auto"), false);
});

test("sem conta de investimentos, ela é lacuna e não some", () => {
  const r = calcularOportunidades(VAZIA);
  assert.equal(r.lacunas.some((o) => o.id === "conta-investimentos"), true);
});

test("possui e lacunas são disjuntos e cobrem tudo que é rastreado", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("vida") });
  const rastreadas = CATALOGO_DO_GRUPO.filter((o) => o.rastreada).length;
  assert.equal(r.possui.length + r.lacunas.length, rastreadas);
  const idsPossui = new Set(r.possui.map((o) => o.id));
  assert.equal(r.lacunas.some((o) => idsPossui.has(o.id)), false);
});

test("a ordem segue o catálogo, não o volume nem o alfabeto", () => {
  // Ordem que muda de ficha para ficha obriga a reler tudo toda vez.
  const r = calcularOportunidades(VAZIA);
  const esperada = CATALOGO_DO_GRUPO.filter((o) => o.rastreada).map((o) => o.id);
  assert.deepEqual(r.lacunas.map((o) => o.id), esperada);
});

// ── "não sabemos" nunca vira "não tem" ────────────────────────────────────

test("empresa sem fonte de dado NUNCA vira lacuna", () => {
  // É o caso mais caro do módulo: afirmar que a pessoa não tem imóvel pela
  // Onix Imob, quando ninguém tem como verificar, manda o atendente oferecer
  // o que o cliente talvez já tenha comprado.
  const r = calcularOportunidades(VAZIA);
  for (const id of ["imovel", "curso", "consultoria-corporate", "produto-tech", "plano-patrimonial"]) {
    assert.equal(r.lacunas.some((o) => o.id === id), false, `"${id}" não pode ser afirmado`);
    assert.equal(r.naoRastreado.some((o) => o.id === id), true, `"${id}" precisa aparecer à parte`);
    assert.equal(r.possui.some((o) => o.id === id), false);
  }
});

test("não rastreado tem quantidade zero e situação própria", () => {
  const r = calcularOportunidades(VAZIA);
  for (const o of r.naoRastreado) {
    assert.equal(o.situacao, "nao_rastreado");
    assert.equal(o.quantidade, 0);
  }
});

test("rastrear uma empresa nova exige as DUAS coisas, e a posse é uma delas", () => {
  // Este teste existia e afirmava o defeito como correto: com o catálogo
  // virado para `rastreada: true`, o módulo dizia que a pessoa NÃO tem imóvel
  // — sem que ninguém tivesse como informar que ela tem. A posse era um campo
  // com nome de empresa (`produtosCorretora`), então a Imobiliária não cabia.
  //
  // Agora a posse é `ofertaId → quantidade`, e o mesmo catálogo produz as duas
  // respostas conforme o chamador informe ou não a posse. É essa a diferença
  // entre "não tem" e "não sabemos".
  const catalogo: OfertaDoGrupo[] = [
    { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: true },
  ];

  const semInformar = calcularOportunidades(VAZIA, catalogo);
  assert.equal(semInformar.lacunas.length, 1, "sem posse informada, é lacuna");

  const informando = calcularOportunidades({ ...VAZIA, posse: { imovel: 2 } }, catalogo);
  assert.equal(informando.possui[0]?.quantidade, 2, "com posse informada, ela aparece");
  assert.equal(informando.lacunas.length, 0);
});

// ── O destaque: a frase que faz pegar o telefone ──────────────────────────

test("patrimônio investido sem seguro de vida vira a frase do produto", () => {
  // É o exemplo que originou esta aba.
  const r = calcularOportunidades({
    posse: { ...posseDe("auto"), "conta-investimentos": 1 },
    saldoInvestimentos: 2_000_000,
  });
  assert.ok(r.destaque?.includes("nenhum seguro de vida"), r.destaque ?? "sem destaque");
  assert.ok(r.destaque?.includes("2.000.000"), r.destaque ?? "");
});

test("com vida, o destaque desce para a próxima ausência de proteção", () => {
  const r = calcularOportunidades({
    posse: { ...posseDe("vida"), "conta-investimentos": 1 },
    saldoInvestimentos: 500_000,
  });
  assert.ok(r.destaque?.includes("plano de saúde"), r.destaque ?? "sem destaque");
});

test("com toda a proteção, não há destaque — silêncio é melhor que obviedade", () => {
  const r = calcularOportunidades({
    posse: { ...posseDe("vida", "saude", "dit"), "conta-investimentos": 1 },
    saldoInvestimentos: 1_000_000,
  });
  assert.equal(r.destaque, null);
});

test("sem saldo conhecido, a frase não inventa número", () => {
  // Saldo null é "não sei", e a régua deste repositório é não citar número que
  // o motor não devolve.
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1 },
    saldoInvestimentos: null,
  });
  assert.ok(r.destaque?.includes("conta de investimentos na Onix"), r.destaque ?? "");
  assert.equal(/\d/.test(r.destaque ?? ""), false, "nenhum dígito sem saldo conhecido");
});

test("saldo zero também não vira número na frase", () => {
  // Conta aberta e zerada não é patrimônio; dizer "R$ 0 investidos" seria
  // usar como argumento de venda um número que enfraquece o argumento.
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1 },
    saldoInvestimentos: 0,
  });
  assert.equal(/\d/.test(r.destaque ?? ""), false);
});

test("cliente só da Corretora tem o destaque inverso", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  assert.ok(r.destaque?.includes("não tem conta de investimentos"), r.destaque ?? "");
});

test("pessoa sem nada não tem destaque", () => {
  // Sem lado cheio da balança não há desequilíbrio a apontar — só uma lista de
  // produtos ainda não vendidos, que `lacunas` já mostra sem fingir insight.
  assert.equal(calcularOportunidades(VAZIA).destaque, null);
});

test("produto fora do catálogo é REPORTADO, não engolido", () => {
  // `catalogo-produtos.ts` registra quatro ids APOSENTADOS em ago/2026. Um
  // contrato antigo com um desses chega aqui, e antes produzia duas afirmações
  // erradas de uma vez: sumia de `possui` E as famílias que o substituíram
  // apareciam como lacuna, sem nada na tela dizendo que houve um contrato.
  const r = calcularOportunidades({ ...VAZIA, posse: { auto_residencial: 1 } });
  assert.equal(r.possui.length, 0);
  assert.equal(r.lacunas.some((o) => o.id === "auto_residencial"), false);
  assert.deepEqual(r.naoComputado, [{ id: "auto_residencial", motivo: "fora-do-catalogo" }]);
});

test("posse com quantidade zero ou negativa não vira possui", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: { auto: 0, vida: -1 } });
  assert.equal(r.possui.length, 0);
  assert.equal(r.lacunas.some((o) => o.id === "auto"), true, "zero é ausência afirmável");
  // Negativo NÃO é ausência afirmável: é valor que não dá para contar, e vai
  // para `naoComputado` em vez de virar lacuna.
  assert.deepEqual(r.naoComputado, [{ id: "vida", motivo: "quantidade-invalida" }]);
  assert.equal(r.lacunas.some((o) => o.id === "vida"), false);
});

test("`rastreada` como STRING não vira afirmação", () => {
  // O catálogo pode chegar de JSON, e ali `"false"` é uma string truthy. Com a
  // negação simples (`!oferta.rastreada`), esta oferta viraria lacuna — o
  // único caminho conhecido de "não sabemos" virar "não tem".
  const catalogo = [
    { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: "false" },
  ] as unknown as OfertaDoGrupo[];
  const r = calcularOportunidades(VAZIA, catalogo);
  assert.equal(r.naoRastreado.length, 1);
  assert.equal(r.lacunas.length, 0);
});

test("id repetido no catálogo não duplica a linha na tela", () => {
  const catalogo: OfertaDoGrupo[] = [
    { id: "auto", nome: "Auto", empresaId: "corretora", rastreada: true },
    { id: "auto", nome: "Auto (de novo)", empresaId: "imobiliaria", rastreada: true },
  ];
  const r = calcularOportunidades({ ...VAZIA, posse: { auto: 1 } }, catalogo);
  assert.equal(r.possui.length, 1, "a primeira declaração vence");
  assert.equal(r.possui[0].nome, "Auto");
});

test("saldo Infinity não vira 'R$ ∞' na frase", () => {
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1 },
    saldoInvestimentos: Number.POSITIVE_INFINITY,
  });
  assert.equal(r.destaque?.includes("∞"), false, r.destaque ?? "");
  assert.ok(r.destaque?.includes("conta de investimentos na Onix"), r.destaque ?? "");
});

test("toda frase do destaque é qualificada com 'pela Onix'", () => {
  // `saldoInvestimentos: null` DE PROPÓSITO. Com saldo, o prefixo da frase é
  // "Tem R$ 100.000 investidos pela Onix e …" — e a asserção passaria pelo
  // prefixo, nunca pelo qualificador sob teste. Foi exatamente assim que a
  // primeira versão deste guarda passou verde com "pela Onix" removido de dois
  // dos três produtos. Teste de frase que não falha quando a frase muda não é
  // teste, é decoração.
  for (const jaTem of [[], ["vida"], ["vida", "saude"]]) {
    const r = calcularOportunidades({
      posse: { ...posseDe(...jaTem), "conta-investimentos": 1 },
      saldoInvestimentos: null,
    });
    assert.ok(r.destaque, `sem destaque com ${JSON.stringify(jaTem)}`);
    assert.ok(
      r.destaque.includes("pela Onix"),
      `frase sem qualificador: ${r.destaque}`,
    );
  }
});

test("a frase inversa também é qualificada", () => {
  // Ela não passava pelo loop acima, e é a que o atendente lê para o cliente
  // que só tem seguro.
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  assert.ok(r.destaque?.includes("na Onix"), r.destaque ?? "sem destaque");
});

// ── Posse é conhecimento; `rastreada` governa só a negativa ───────────────

test("posse informada vence o catálogo — nem ausência nem `rastreada:false` a engolem", () => {
  // A correção anterior derivava tudo do catálogo, e com isso uma oferta
  // marcada como não rastreada ENGOLIA a posse que o chamador informou. Posse
  // informada é conhecimento: se o chamador diz que a pessoa tem, ela tem, e
  // nenhum campo de catálogo desmente isso.
  const catalogo: OfertaDoGrupo[] = [
    { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: false },
  ];
  const r = calcularOportunidades({ ...VAZIA, posse: { imovel: 2 } }, catalogo);
  assert.equal(r.possui[0]?.quantidade, 2);
  assert.equal(r.naoRastreado.length, 0);
});

test("id duplicado com `rastreada` conflitante não engole a posse informada", () => {
  const catalogo: OfertaDoGrupo[] = [
    { id: "auto", nome: "Auto", empresaId: "tech", rastreada: false },
    { id: "auto", nome: "Auto (de novo)", empresaId: "corretora", rastreada: true },
  ];
  const r = calcularOportunidades({ ...VAZIA, posse: { auto: 1 } }, catalogo);
  assert.equal(r.possui.length, 1, "a pessoa tem auto, e o chamador informou");
  assert.equal(r.naoRastreado.length, 0);
});

test("a conta de investimentos vem da POSSE, não do catálogo", () => {
  // O módulo afirmava "não tem conta de investimentos na Onix" quando a oferta
  // estava fora do catálogo — recebendo o saldo de R$ 5 milhões no MESMO
  // argumento. Catálogo é a régua do que dá para AFIRMAR; quem tem a
  // informação é o chamador.
  const semAOferta: OfertaDoGrupo[] = [
    { id: "auto", nome: "Auto", empresaId: "corretora", rastreada: true },
  ];
  const r = calcularOportunidades(
    { posse: { auto: 1, "conta-investimentos": 1 }, saldoInvestimentos: 5_000_000 },
    semAOferta,
  );
  assert.equal(
    (r.destaque ?? "").includes("não tem conta de investimentos"),
    false,
    r.destaque ?? "(sem destaque)",
  );
});

// ── Quantidade que não dá para contar ─────────────────────────────────────

test("BigInt do Postgres não vira lacuna silenciosa", () => {
  // `COUNT(*)` chega como BigInt neste repositório — é assim que o radar já lê
  // contrato. O cliente com duas apólices de auto viraria lacuna de auto, em
  // silêncio e na direção que afirma.
  const r = calcularOportunidades({
    ...VAZIA,
    // `BigInt(2)` e não `2n`: o literal exige target ES2020 e o projeto
    // compila em ES2017 — o teste passaria e o `tsc` acusaria.
    posse: { auto: BigInt(2) } as unknown as Record<string, number>,
  });
  assert.equal(r.lacunas.some((o) => o.id === "auto"), false, "não pode virar lacuna");
  assert.equal(r.naoRastreado.some((o) => o.id === "auto"), true, "vira 'não sabemos'");
  assert.deepEqual(r.naoComputado, [{ id: "auto", motivo: "quantidade-invalida" }]);
});

test("string, negativo e fracionário também são reportados", () => {
  const r = calcularOportunidades({
    ...VAZIA,
    posse: { auto: "2", vida: -1, saude: 1.5 } as unknown as Record<string, number>,
  });
  const porId = new Map(r.naoComputado.map((n) => [n.id, n.motivo]));
  assert.equal(porId.get("auto"), "quantidade-invalida");
  assert.equal(porId.get("vida"), "quantidade-invalida");
  assert.equal(porId.get("saude"), "quantidade-invalida", "Auto (1,5) não é contagem de apólice");
  assert.equal(r.possui.length, 0);
  // E nenhuma das três vira lacuna: valor ilegível não afirma ausência.
  for (const id of ["auto", "vida", "saude"]) {
    assert.equal(r.lacunas.some((o) => o.id === id), false, `${id} não pode virar lacuna`);
  }
});

test("chave desconhecida com quantidade inválida não desaparece", () => {
  // Antes: nem `possui`, nem lacuna, nem reportada — o oposto do que o campo
  // foi criado para fazer.
  const r = calcularOportunidades({
    ...VAZIA,
    posse: { seguro_de_dragao: "3" } as unknown as Record<string, number>,
  });
  assert.deepEqual(r.naoComputado, [{ id: "seguro_de_dragao", motivo: "quantidade-invalida" }]);
});

test("chave desconhecida com quantidade ZERO não é notícia", () => {
  // É o chamador dizendo que a pessoa não tem algo que o catálogo também não
  // conhece. Reportar isso seria ruído.
  const r = calcularOportunidades({ ...VAZIA, posse: { seguro_de_dragao: 0 } });
  assert.deepEqual(r.naoComputado, []);
});

test("chave não reconhecida NÃO afeta as lacunas", () => {
  // Asserção que a rodada anterior apagou sem querer.
  const r = calcularOportunidades({ ...VAZIA, posse: { auto_residencial: 1 } });
  assert.equal(r.lacunas.length, CATALOGO_DO_GRUPO.filter((o) => o.rastreada).length);
});

// ── A régua da conta é UMA só ─────────────────────────────────────────────

test("quantidade ilegível da conta NÃO vira 'não tem conta'", () => {
  // Terceira aparição do mesmo padrão: a frase lia a posse por um caminho e o
  // cálculo por outro. O mesmo retorno dizia "não consegui ler esse valor" e
  // "ela não tem conta" ao mesmo tempo.
  for (const ilegivel of [BigInt(2), "1", -1, NaN, Infinity, true, {}, []]) {
    const r = calcularOportunidades({
      ...VAZIA,
      posse: { auto: 1, "conta-investimentos": ilegivel } as unknown as Record<string, number>,
    });
    assert.equal(
      (r.destaque ?? "").includes("não tem conta de investimentos"),
      false,
      `com ${String(ilegivel)}: ${r.destaque}`,
    );
    assert.equal(
      r.naoComputado.some((n) => n.id === "conta-investimentos"),
      true,
      "e o valor ilegível precisa continuar reportado",
    );
  }
});

test("a frase e o cálculo concordam em 1,5 — um predicado só", () => {
  // As duas guardas divergiam exatamente aqui: `Number.isFinite` aceitava,
  // `ehQuantidade` recusava. A tela mostrava a conta como não computada
  // enquanto a frase dizia "Tem R$ 5.000.000 investidos pela Onix".
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1.5 },
    saldoInvestimentos: 5_000_000,
  });
  assert.equal((r.destaque ?? "").includes("investidos"), false, r.destaque ?? "");
  assert.equal(r.naoComputado.some((n) => n.id === "conta-investimentos"), true);
});

// ── O balde do "não sabemos" diz por quê ──────────────────────────────────

test("nao_rastreado distingue 'o grupo não mede' de 'valor ilegível'", () => {
  // Sem o motivo, a tela rotularia "ainda não medimos isto" um produto da
  // Corretora, que é medido.
  const r = calcularOportunidades({
    ...VAZIA,
    posse: { auto: BigInt(2) } as unknown as Record<string, number>,
  });
  const porId = new Map(r.naoRastreado.map((o) => [o.id, o.motivoNaoRastreado]));
  assert.equal(porId.get("auto"), "quantidade-invalida");
  assert.equal(porId.get("imovel"), "sem-fonte");
});

test("possui e lacunas não carregam motivo de não rastreado", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  for (const o of [...r.possui, ...r.lacunas]) {
    assert.equal(o.motivoNaoRastreado, undefined, `${o.id} não é não rastreada`);
  }
});

test("a invariante possui+lacunas === rastreadas vale SÓ com posse legível", () => {
  // Declarar a condição em vez de deixá-la implícita: com um valor ilegível, a
  // oferta sai dos dois baldes de propósito, e a soma passa a ser menor.
  const rastreadas = CATALOGO_DO_GRUPO.filter((o) => o.rastreada).length;
  const limpa = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  assert.equal(limpa.possui.length + limpa.lacunas.length, rastreadas);

  const suja = calcularOportunidades({
    ...VAZIA,
    posse: { auto: BigInt(1) } as unknown as Record<string, number>,
  });
  assert.equal(suja.possui.length + suja.lacunas.length, rastreadas - 1);
});

test("`__proto__` na posse não vira linha de produto na tela", () => {
  // Chave própria depois de `JSON.parse`, e ninguém consegue explicar
  // "__proto__: produto fora do catálogo" para o atendente.
  const daJson = JSON.parse('{"__proto__": 3, "auto": 1}') as Record<string, number>;
  const r = calcularOportunidades({ ...VAZIA, posse: daJson });
  assert.equal(r.naoComputado.some((n) => n.id === "__proto__"), false);
  assert.equal(r.possui.some((o) => o.id === "auto"), true);
  assert.equal(({} as Record<string, unknown>).x, undefined, "e nada polui o protótipo");
});
