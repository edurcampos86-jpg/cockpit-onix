import assert from "node:assert/strict";
import { test } from "node:test";
import { resumirAuditoria, type LinhaAuditoria } from "./integracoes-auditadas";

/**
 * Teste do resumo do auditor de integrações — src/lib/integracoes-auditadas.ts.
 *
 * POR QUE ESTE TESTE EXISTE: o campo publicado no `/api/health` vira base de
 * decisão ("a integração BTG está sã?"). Um `ok: true` errado é pior que
 * campo nenhum — foi um rótulo errado (`com_erros` contando payloads) que
 * quase fez o webhook parecer quebrado em 15/08.
 */

const AGORA = new Date("2026-08-15T12:00:00.000Z");

function linha(over: Partial<LinhaAuditoria> = {}): LinhaAuditoria {
  return {
    iniciado: new Date("2026-08-15T11:30:00.000Z"),
    finalizado: new Date("2026-08-15T11:30:05.000Z"),
    sucesso: true,
    contasProcessadas: 2,
    contasComErro: 0,
    resumo: "2 integr. · ok:2 recuperado:0 reconectar:0 transitorio:0 · alertas:0",
    ...over,
  };
}

test("auditoria saudável vira ok com idade em minutos", () => {
  const e = resumirAuditoria(linha(), AGORA);
  assert.equal(e.ok, true);
  assert.equal(e.auditadas, 2);
  assert.equal(e.comErro, 0);
  assert.equal(e.idadeMinutos, 30);
  assert.match(e.resumo ?? "", /ok:2/);
});

test("nunca rodou é null, e null não é sucesso", () => {
  // "não perguntei" é diferente de "perguntei e deu certo".
  const e = resumirAuditoria(null, AGORA);
  assert.equal(e.ultima, null);
  assert.equal(e.ok, false);
  assert.equal(e.idadeMinutos, null);
});

test("execução não terminada NÃO conta como ok", () => {
  // O cron cria a linha antes de auditar e só depois a fecha: `finalizado`
  // nulo é o auditor que morreu no meio.
  const e = resumirAuditoria(linha({ finalizado: null }), AGORA);
  assert.equal(e.ok, false);
  // A idade passa a valer do início — é o que diz há quanto tempo travou.
  assert.equal(e.idadeMinutos, 30);
});

test("sucesso: false não é ok", () => {
  assert.equal(resumirAuditoria(linha({ sucesso: false }), AGORA).ok, false);
});

test("contasComErro > 0 não é ok, mesmo com sucesso true", () => {
  // `sucesso` é do processo; `contasComErro` é do resultado. Uma auditoria
  // que rodou inteira e achou uma integração quebrada não é "ok".
  const e = resumirAuditoria(linha({ contasComErro: 1 }), AGORA);
  assert.equal(e.ok, false);
  assert.equal(e.comErro, 1);
});

test("auditoria velha continua ok, mas a idade denuncia", () => {
  // O cron é de 30 em 30 min. `ok: true` de anteontem diz que ESTAVA são.
  const e = resumirAuditoria(
    linha({
      iniciado: new Date("2026-08-13T11:30:00.000Z"),
      finalizado: new Date("2026-08-13T11:30:05.000Z"),
    }),
    AGORA,
  );
  assert.equal(e.ok, true);
  assert.equal(e.idadeMinutos, 2910); // ~48 h
});

test("idade nunca é negativa", () => {
  // Relógio do app à frente do banco não pode virar número absurdo.
  const e = resumirAuditoria(
    linha({ finalizado: new Date("2026-08-15T12:05:00.000Z") }),
    AGORA,
  );
  assert.equal(e.idadeMinutos, 0);
});

test("não publica a coluna `erros` — nem por acidente", () => {
  // `erros` carrega { conta, motivo }, e `conta` é identificador de cliente.
  // O health é colado dentro de issue de incidente.
  const e = resumirAuditoria(linha({ contasComErro: 3 }), AGORA);
  assert.deepEqual(Object.keys(e).sort(), [
    "auditadas",
    "comErro",
    "idadeMinutos",
    "ok",
    "resumo",
    "ultima",
  ]);
});
