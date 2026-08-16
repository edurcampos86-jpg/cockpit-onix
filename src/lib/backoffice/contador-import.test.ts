import assert from "node:assert/strict";
import { test } from "node:test";
import { apurarImport, frasePraTela, type EntradaContagem } from "./contador-import";

/**
 * POR QUE ESTE TESTE EXISTE: de 30/07 a 15/08 o Eduardo subiu o Saldo D0 em
 * ~11 dias úteis e o banco registrou UMA escrita. Todo dia a tela dizia
 * "importado". O caso que este arquivo trava é exatamente esse — ler linhas,
 * escrever zero e chamar de sucesso.
 */

function entrada(over: Partial<EntradaContagem> = {}): EntradaContagem {
  return { lidas: 1190, criadas: 0, atualizadas: 1188, semMudanca: 2, descartes: {}, ...over };
}

test("import saudável fecha a conta e é ok", () => {
  const v = apurarImport(entrada());
  assert.equal(v.escritas, 1188);
  assert.equal(v.descartadas, 0);
  assert.equal(v.fecha, true);
  assert.equal(v.ok, true);
  assert.equal(v.ramo, null);
});

test("leu linhas e escreveu ZERO não é sucesso", () => {
  // O caso do incidente. Antes disto, a rota devolvia 200.
  const v = apurarImport(
    entrada({ atualizadas: 0, semMudanca: 0, descartes: { sem_numero_conta: 1190 } }),
  );
  assert.equal(v.ok, false);
  assert.equal(v.escritas, 0);
  assert.equal(v.ramo, "sem_numero_conta");
});

test("arquivo vazio NÃO é erro — não leu nada, não tinha o que escrever", () => {
  // "0 de 0" é um não-evento; tratar como falha treinaria a ignorar o alarme.
  const v = apurarImport({ lidas: 0, criadas: 0, atualizadas: 0, semMudanca: 0, descartes: {} });
  assert.equal(v.ok, true);
  assert.equal(v.fecha, true);
});

test("noop em massa também é zero escrita — e aponta o ramo certo", () => {
  // O mais silencioso dos três: a linha chega ao banco e nada muda. Hoje não
  // aparece nem na resposta HTTP.
  const v = apurarImport(entrada({ atualizadas: 0, semMudanca: 1190 }));
  assert.equal(v.ok, false);
  assert.equal(v.ramo, "sem_mudanca");
  assert.equal(v.descartadas, 0);
});

test("órfão em massa aponta orfao_sem_cliente", () => {
  const v = apurarImport(
    entrada({ atualizadas: 0, semMudanca: 0, descartes: { orfao_sem_cliente: 1190 } }),
  );
  assert.equal(v.ramo, "orfao_sem_cliente");
});

test("uma escrita basta para NÃO ser erro — o alarme é sobre zero", () => {
  const v = apurarImport(
    entrada({ atualizadas: 1, semMudanca: 0, descartes: { orfao_sem_cliente: 1189 } }),
  );
  assert.equal(v.ok, true);
  assert.equal(v.escritas, 1);
  assert.equal(v.descartadas, 1189);
});

test("a conta TEM de fechar — contador que não fecha é pior que nenhum", () => {
  const bom = apurarImport(entrada({ atualizadas: 1000, semMudanca: 100, descartes: { orfao_sem_cliente: 90 } }));
  assert.equal(bom.fecha, true);

  const ruim = apurarImport(entrada({ atualizadas: 10, semMudanca: 0, descartes: {} }));
  assert.equal(ruim.fecha, false); // 1190 != 10
});

test("motivo com zero não polui o relatório", () => {
  const v = apurarImport(entrada({ descartes: { orfao_sem_cliente: 0, erro_no_upsert: 0 } }));
  assert.deepEqual(v.motivos, {});
});

test("com vários motivos, o ramo é o que engoliu mais linhas", () => {
  const v = apurarImport(
    entrada({
      atualizadas: 0,
      semMudanca: 0,
      descartes: { sem_numero_conta: 100, orfao_sem_cliente: 1090 },
    }),
  );
  assert.equal(v.ramo, "orfao_sem_cliente");
});

test("empate resolve pelo ramo mais CEDO no caminho", () => {
  // Linha sem conta nem chega a ser testada como órfã — dizer "órfã" mandaria
  // consertar a base quando o problema é o cabeçalho.
  const v = apurarImport(
    entrada({
      atualizadas: 0,
      semMudanca: 0,
      descartes: { sem_numero_conta: 595, orfao_sem_cliente: 595 },
    }),
  );
  assert.equal(v.ramo, "sem_numero_conta");
});

test("a frase da tela NUNCA sai sem número", () => {
  const ok = frasePraTela(apurarImport(entrada()), "Saldo em CC");
  assert.match(ok, /1188 de 1190/);

  const erro = frasePraTela(
    apurarImport(entrada({ atualizadas: 0, semMudanca: 0, descartes: { sem_numero_conta: 1190 } })),
    "Saldo em CC",
  );
  assert.match(erro, /NADA foi gravado/);
  assert.match(erro, /1190 linhas lidas, 0 escritas/);
  assert.match(erro, /cabeçalho da coluna Conta/);
});

test("a frase de erro do órfão manda importar a Base BTG antes", () => {
  const f = frasePraTela(
    apurarImport(entrada({ atualizadas: 0, semMudanca: 0, descartes: { orfao_sem_cliente: 1190 } })),
    "Saldo em CC",
  );
  assert.match(f, /Base BTG/);
});

test("o resumo do log carrega o ramo quando deu zero", () => {
  const v = apurarImport(entrada({ atualizadas: 0, semMudanca: 1190 }));
  assert.match(v.resumo, /RAMO:sem_mudanca/);
  assert.match(v.resumo, /lidas:1190/);
  assert.match(v.resumo, /escritas:0/);
});
