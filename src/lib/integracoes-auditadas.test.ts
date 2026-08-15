import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resumirAuditoria,
  resumirPorIntegracao,
  type LinhaAuditoria,
  type LinhaIntegracao,
} from "./integracoes-auditadas";

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

/* ── Quebra por integração ───────────────────────────────────────────────── */

function li(
  integracao: string,
  status: string,
  updatedAt = "2026-08-15T11:30:00.000Z",
): LinhaIntegracao {
  return { integracao, status, updatedAt: new Date(updatedAt) };
}

test("agrega por integração, não por chave", () => {
  // 3 contas Google viram UMA linha "google" — a chave (`google:<userId>`)
  // nunca sai, porque carrega identificador de usuário.
  const r = resumirPorIntegracao(
    [li("google", "ok"), li("google", "ok"), li("google", "ok"), li("btg", "ok")],
    AGORA,
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].integracao, "btg");
  assert.equal(r[1].contas, 3);
  assert.equal(r[1].ok, 3);
});

test("o status publicado é o PIOR, não a maioria", () => {
  // 2 de 3 contas boas não fazem a integração boa: o que precisa de ação é o 1.
  const r = resumirPorIntegracao(
    [li("google", "ok"), li("google", "ok"), li("google", "precisa_reconectar")],
    AGORA,
  );
  assert.equal(r[0].status, "precisa_reconectar");
  assert.equal(r[0].ok, 2);
  assert.equal(r[0].contas, 3);
});

test("transitorio perde para precisa_reconectar e ganha de refresh_recuperado", () => {
  assert.equal(
    resumirPorIntegracao([li("x", "transitorio"), li("x", "refresh_recuperado")], AGORA)[0]
      .status,
    "transitorio",
  );
  assert.equal(
    resumirPorIntegracao([li("x", "transitorio"), li("x", "precisa_reconectar")], AGORA)[0]
      .status,
    "precisa_reconectar",
  );
});

test("a idade é a da conta MAIS VELHA — probe parado não se esconde atrás de vizinho novo", () => {
  const r = resumirPorIntegracao(
    [
      li("google", "ok", "2026-08-15T11:55:00.000Z"), // 5 min
      li("google", "ok", "2026-08-13T12:00:00.000Z"), // 2 dias
    ],
    AGORA,
  );
  assert.equal(r[0].idadeMinutos, 2880);
});

test("idade nunca é negativa na quebra por integração", () => {
  const r = resumirPorIntegracao([li("b2", "ok", "2026-08-15T12:05:00.000Z")], AGORA);
  assert.equal(r[0].idadeMinutos, 0);
});

test("ordem é estável por nome — health entra em diff de texto", () => {
  const r = resumirPorIntegracao(
    [li("zapi", "ok"), li("b2", "ok"), li("datacrazy", "ok"), li("microsoft", "ok")],
    AGORA,
  );
  assert.deepEqual(
    r.map((x) => x.integracao),
    ["b2", "datacrazy", "microsoft", "zapi"],
  );
});

test("a quebra por integração não publica chave, userId nem ultimoErro", () => {
  // Mesmo motivo do teste de `erros`: o health é colado em issue de incidente.
  const r = resumirPorIntegracao([li("datacrazy", "ok")], AGORA);
  assert.deepEqual(Object.keys(r[0]).sort(), [
    "contas",
    "idadeMinutos",
    "integracao",
    "ok",
    "status",
  ]);
});

test("sem nenhuma linha, a quebra é lista vazia (não erro)", () => {
  assert.deepEqual(resumirPorIntegracao([], AGORA), []);
});
