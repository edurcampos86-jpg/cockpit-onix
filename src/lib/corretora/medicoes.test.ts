/**
 * Guardas do módulo de medições da Corretora.
 *
 * O que dá para testar sem banco é pouco, e é de propósito: as cinco consultas
 * são SQL, e SQL só se prova contra Postgres. O que estes testes travam é o
 * CONTRATO — as duas coisas que quebram em silêncio quando alguém mexe aqui:
 *
 *  1. medição sem leitura. Um número solto na tela é interpretação de quem lê,
 *     e a interpretação errada é o defeito que estas medições existem para
 *     evitar. A #418 errou exatamente aí: publicou um número rotulado "é este
 *     que decide" que somava errado.
 *  2. a heurística de contato virar mais permissiva ou mais estreita sem
 *     ninguém decidir. Ela responde "alguma companhia manda telefone?", e a
 *     resposta decide se um campo novo nasceria vazio.
 *
 * O guarda de (1) não procura frase no fonte: compara as CHAVES do objeto de
 * leituras com as chaves do tipo, via um valor que o compilador obriga a estar
 * completo. Grep passaria verde com a leitura viva num comentário.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LEITURAS, TABELAS_NECESSARIAS, pareceContato, type Medicoes } from "./medicoes";

/**
 * A lista de medições, tipada como `Record<keyof Medicoes, true>`.
 *
 * É o truque que faz o teste falhar no COMPILADOR quando alguém soma uma
 * medição ao tipo e não a lista aqui — e falhar em execução quando ela existe
 * aqui e não em `LEITURAS`. Duas travas para o mesmo esquecimento, porque uma
 * delas só aparece no `tsc` e a outra só no `node --test`.
 */
const MEDICOES_ESPERADAS: Record<keyof Medicoes, true> = {
  vigencia: true,
  nome: true,
  colunasExtras: true,
  atendente: true,
  crossSell: true,
};

test("toda medição tem uma leitura, e nenhuma leitura sobra", () => {
  const medicoes = Object.keys(MEDICOES_ESPERADAS).sort();
  const leituras = Object.keys(LEITURAS).sort();
  assert.deepEqual(
    leituras,
    medicoes,
    "medição sem leitura (ou leitura órfã): o consumidor mostraria número sem dizer o que ele decide",
  );
});

test("nenhuma leitura é vazia ou de encher linguiça", () => {
  for (const [chave, texto] of Object.entries(LEITURAS)) {
    // 40 não é número mágico com pretensão de rigor: é o piso abaixo do qual a
    // frase não cabe "o que este número decide", que é o único conteúdo que
    // justifica o campo existir.
    assert.ok(
      texto.trim().length >= 40,
      `leitura de "${chave}" curta demais para dizer o que o número decide`,
    );
  }
});

test("a leitura do nome aponta o campo que decide a coluna nova", () => {
  // Esta é a leitura mais cara de errar: ela é a que separa "empresta o nome
  // de Investimentos" de "migration de faixa vermelha". Se alguém reescrever o
  // texto e tirar o nome do campo, o leitor fica com a conclusão sem saber de
  // qual número ela veio.
  assert.match(LEITURAS.nome, /semContraparteEmInvestimentos/);
});

test("as tabelas necessárias são as que as consultas realmente tocam", () => {
  // `PerfilImportacao` esteve nesta lista e nenhuma das cinco consultas a
  // usava: exigir tabela que não se lê faz a medição recusar-se a rodar num
  // banco onde ela funcionaria. A lista é curta de propósito.
  assert.deepEqual([...TABELAS_NECESSARIAS].sort(), [
    "ClienteBackoffice",
    "ContratoCorretora",
    "PessoaGrupo",
  ]);
});

test("pareceContato reconhece os rótulos que as companhias usam", () => {
  for (const rotulo of [
    "Telefone",
    "TELEFONE",
    "telefone celular",
    "Celular",
    "Fone",
    "DDD/Telefone",
    "WhatsApp",
    "Contato",
    "E-mail",
    "email",
    "Tel",
  ]) {
    assert.ok(pareceContato(rotulo), `"${rotulo}" deveria parecer contato`);
  }
});

test("pareceContato não confunde com rótulo de seguro", () => {
  // O falso positivo custa uma conferida à toa. Vale checar mesmo assim: uma
  // heurística que casa com meio relatório deixa de responder a pergunta.
  for (const rotulo of [
    "Prêmio",
    "Comissão",
    "Vigência",
    "Apólice",
    "Placa",
    "Chassi",
    "Modelo",
    "Corretor",
    "Seguradora",
    "Situação",
  ]) {
    assert.ok(!pareceContato(rotulo), `"${rotulo}" não deveria parecer contato`);
  }
});
