import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAVES_REGISTRADAS,
  FLAGS_REGISTRADAS,
  flagLigada,
  valoresAceitos,
} from "./registro";

test("chave de flag não se repete", () => {
  assert.equal(new Set(CHAVES_REGISTRADAS).size, CHAVES_REGISTRADAS.length);
});

test("toda booleana declara o dialeto; nenhuma 'valor' declara", () => {
  // Sem o dialeto explícito, `flagLigada` cairia no default "amplo" e passaria
  // a mentir sobre as 4 flags estritas em silêncio.
  for (const f of FLAGS_REGISTRADAS) {
    if (f.tipo === "booleana") {
      assert.ok(f.dialeto, `flag booleana sem dialeto: ${f.key}`);
    } else {
      assert.equal(f.dialeto, undefined, `flag de valor com dialeto: ${f.key}`);
    }
  }
});

test("todo registro aponta um arquivo do repo", () => {
  for (const f of FLAGS_REGISTRADAS) {
    assert.match(f.onde, /^src\/.+\.tsx?$/, `caminho inválido em ${f.key}: ${f.onde}`);
    assert.ok(f.rotulo.length > 0, `rótulo vazio em ${f.key}`);
  }
});

test("nenhum segredo ou estado interno entrou na allowlist", () => {
  // A tabela Config guarda segredos na mesma estrutura das flags. Se uma dessas
  // chaves entrar aqui, o endpoint de diagnóstico passa a devolvê-la.
  const proibidas = [
    "DATACRAZY_TOKEN",
    "ANTHROPIC_API_KEY",
    "DATACRAZY_WEBHOOK_SECRET",
    "PLAUD_TOKEN",
    "OUTLOOK_ICS_URL",
    "PIXEL_CAC_MATRIX",
    "PIXEL_LAST_SYNC_AT",
    "BACKFILL_CONVERSAS_CHECKPOINT",
    "BACKFILL_CONVERSAS_MANIFEST",
    "BACKFILL_CONVERSAS_LOCK",
  ];
  for (const chave of proibidas) {
    assert.ok(!CHAVES_REGISTRADAS.includes(chave), `chave proibida no registro: ${chave}`);
  }
});

test("nenhuma chave com cara de segredo, mesmo que ainda não exista", () => {
  // Rede de proteção para a chave que ninguém previu.
  for (const key of CHAVES_REGISTRADAS) {
    assert.doesNotMatch(
      key,
      /TOKEN|SECRET|API_KEY|PASSWORD|SENHA/,
      `chave com cara de segredo no registro: ${key}`,
    );
  }
});

test("dialeto amplo aceita as 5 formas de 'sim'", () => {
  for (const v of ["1", "true", "on", "yes", "sim"]) {
    assert.equal(flagLigada(v, "amplo"), true, `amplo devia aceitar "${v}"`);
  }
});

test("dialeto estrito NÃO aceita yes nem sim — e é essa a diferença", () => {
  // Não é detalhe: gravar "sim" em PERFIL_FATO_WRITE deixa a flag DESLIGADA,
  // enquanto o mesmo "sim" em HUB_ECOSSISTEMA a liga. Se este teste passar a
  // falhar porque os dialetos foram unificados no código, o registro tem de
  // ser atualizado junto.
  for (const v of ["1", "true", "on"]) {
    assert.equal(flagLigada(v, "estrito"), true);
  }
  for (const v of ["yes", "sim"]) {
    assert.equal(flagLigada(v, "estrito"), false, `estrito NÃO devia aceitar "${v}"`);
    assert.equal(flagLigada(v, "amplo"), true);
  }
});

test("os dois dialetos toleram espaço e maiúscula igual ao código dono", () => {
  assert.equal(flagLigada("  TRUE  ", "amplo"), true);
  assert.equal(flagLigada("  On  ", "estrito"), true);
});

test("ausente, vazio e lixo desligam — default OFF em toda flag", () => {
  for (const dialeto of ["amplo", "estrito"] as const) {
    assert.equal(flagLigada(undefined, dialeto), false);
    assert.equal(flagLigada("", dialeto), false);
    assert.equal(flagLigada("0", dialeto), false);
    assert.equal(flagLigada("off", dialeto), false);
    assert.equal(flagLigada("talvez", dialeto), false);
  }
});

test("dialeto omitido cai no amplo", () => {
  assert.equal(flagLigada("sim"), true);
});

test("estrito é subconjunto próprio do amplo", () => {
  const amplo = valoresAceitos("amplo");
  const estrito = valoresAceitos("estrito");
  assert.ok(estrito.every((v) => amplo.includes(v)));
  assert.ok(estrito.length < amplo.length);
});

test("as 4 flags de dialeto estrito são exatamente as escritas inline no código", () => {
  assert.deepEqual(
    FLAGS_REGISTRADAS.filter((f) => f.dialeto === "estrito").map((f) => f.key),
    [
      "PERFIL_FATO_WRITE",
      "PERFIL_FATO_RICO_WRITE",
      "DATACRAZY_POLL_INPROCESS",
      "BTG_FRESHNESS_INPROCESS",
    ],
  );
});

test("HUB_ECOSSISTEMA está registrada e é booleana ampla", () => {
  const hub = FLAGS_REGISTRADAS.find((f) => f.key === "HUB_ECOSSISTEMA");
  assert.ok(hub);
  assert.equal(hub.tipo, "booleana");
  assert.equal(hub.dialeto, "amplo");
  assert.equal(hub.onde, "src/lib/hub-ecossistema/flag.ts");
});
