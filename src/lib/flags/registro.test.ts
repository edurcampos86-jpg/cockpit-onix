import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAVES_REGISTRADAS,
  FLAGS_REGISTRADAS,
  flagAlternavel,
  flagLigada,
  intencaoProvavel,
  valorParaGravar,
  valorReconhecido,
  valoresAceitos,
} from "./registro";

test("chave de flag não se repete", () => {
  assert.equal(new Set(CHAVES_REGISTRADAS).size, CHAVES_REGISTRADAS.length);
});

test("toda booleana declara dialeto e impacto; nenhuma 'valor' declara", () => {
  // Sem o dialeto explícito, `flagLigada` cairia no default "amplo" e passaria
  // a mentir sobre as 4 flags estritas em silêncio. Sem o impacto, a tela
  // deixaria virar sem confirmação uma chave que abre caminho de escrita.
  for (const f of FLAGS_REGISTRADAS) {
    if (f.tipo === "booleana") {
      assert.ok(f.dialeto, `flag booleana sem dialeto: ${f.key}`);
      assert.ok(f.impacto, `flag booleana sem impacto: ${f.key}`);
    } else {
      assert.equal(f.dialeto, undefined, `flag de valor com dialeto: ${f.key}`);
      assert.equal(f.impacto, undefined, `flag de valor com impacto: ${f.key}`);
    }
  }
});

test("toda flag de impacto alto explica o que acontece", () => {
  // O aviso é o corpo do diálogo de confirmação. Sem texto, a tela pediria
  // confirmação de uma coisa sem dizer do quê — pior que não perguntar.
  for (const f of FLAGS_REGISTRADAS) {
    if (f.impacto === "alto") {
      assert.ok(f.aviso && f.aviso.length > 40, `aviso ausente ou raso em ${f.key}`);
    } else {
      assert.equal(f.aviso, undefined, `aviso em flag que não é de impacto alto: ${f.key}`);
    }
  }
});

test("são de impacto alto exatamente as de escrita, scheduler e controle de acesso", () => {
  assert.deepEqual(
    FLAGS_REGISTRADAS.filter((f) => f.impacto === "alto").map((f) => f.key).sort(),
    [
      "BACKFILL_CONVERSAS_ENABLED",
      "BTG_FRESHNESS_INPROCESS",
      "DATACRAZY_POLL_INPROCESS",
      "IMPORT_REUNIAO_IDEMPOTENTE",
      "PERFIL_FATO_RICO_WRITE",
      "PERFIL_FATO_WRITE",
      "RBAC_ENFORCEMENT",
    ],
  );
});

test("flagAlternavel recusa tudo que não é flag booleana registrada", () => {
  // Esta é a fronteira de segurança da rota de escrita: `Config` é a MESMA
  // tabela dos segredos. Sem a recusa, um POST com key "DATACRAZY_TOKEN"
  // sobrescreveria o token com "1".
  assert.equal(flagAlternavel("DATACRAZY_TOKEN"), null);
  assert.equal(flagAlternavel("ANTHROPIC_API_KEY"), null);
  assert.equal(flagAlternavel("PIXEL_CAC_MATRIX"), null);
  assert.equal(flagAlternavel(""), null);
  assert.equal(flagAlternavel("hub_ecossistema"), null, "a comparação é sensível a caixa");

  // Flags de VALOR também são recusadas: gravar "1" em LIMIAR_VACUO_DIAS
  // mudaria o teto de vácuo para 1 dia em vez de ligar coisa nenhuma.
  assert.equal(flagAlternavel("LIMIAR_VACUO_DIAS"), null);
  assert.equal(flagAlternavel("BACKFILL_CONVERSAS_LOCK_TTL_MIN"), null);

  assert.equal(flagAlternavel("HUB_ECOSSISTEMA")?.key, "HUB_ECOSSISTEMA");
});

test("a tela grava 1/0, que os DOIS dialetos entendem", () => {
  // Gravar "sim" ligaria uma flag ampla e deixaria uma estrita desligada.
  assert.equal(valorParaGravar(true), "1");
  assert.equal(valorParaGravar(false), "0");
  for (const dialeto of ["amplo", "estrito"] as const) {
    assert.equal(flagLigada(valorParaGravar(true), dialeto), true);
    assert.equal(flagLigada(valorParaGravar(false), dialeto), false);
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

/* ── O contrato que a anotação ON/OFF do histórico consome ────────────────
 *
 * `ValorAuditado` (flags-tabela.tsx) recebe só a CHAVE e o valor cru gravado —
 * a linha de `ConfigAudit` não guarda dialeto. Ela resolve o dialeto por
 * `flagAlternavel(key)?.dialeto` e chama `flagLigada`. Os testes abaixo travam
 * essa resolução: se ela quebrar, a tela passa a anotar "(ON)" numa flag que o
 * runtime lê como desligada, que é pior do que não anotar nada. */

test("o dialeto é resolvível a partir da chave sozinha, para toda flag booleana", () => {
  for (const flag of FLAGS_REGISTRADAS.filter((f) => f.tipo === "booleana")) {
    const achada = flagAlternavel(flag.key);
    assert.ok(achada, `"${flag.key}" é booleana e flagAlternavel não achou`);
    assert.equal(achada.dialeto, flag.dialeto);
  }
});

test('anotar "sim" pela chave: OFF nas estritas, ON nas amplas', () => {
  // É a divergência que a tela precisa mostrar. Sem a anotação, as duas linhas
  // aparecem idênticas no histórico — mesmo texto, efeitos opostos.
  const efeito = (key: string, valor: string) =>
    flagLigada(valor, flagAlternavel(key)?.dialeto) ? "ON" : "OFF";

  assert.equal(efeito("PERFIL_FATO_WRITE", "sim"), "OFF");
  assert.equal(efeito("HUB_ECOSSISTEMA", "sim"), "ON");
  // "1" é o que a tela grava, e vale ON nos dois — por isso `valorParaGravar`
  // nunca usa "sim".
  assert.equal(efeito("PERFIL_FATO_WRITE", "1"), "ON");
  assert.equal(efeito("HUB_ECOSSISTEMA", "1"), "ON");
});

test("flag de VALOR não recebe anotação — não há ON/OFF a dizer", () => {
  // `flagAlternavel` devolve null, e `ValorAuditado` só anota quando ela acha.
  for (const flag of FLAGS_REGISTRADAS.filter((f) => f.tipo === "valor")) {
    assert.equal(flagAlternavel(flag.key), null, `"${flag.key}" é de valor e virou alternável`);
  }
});

test("chave fora do registro aparece crua, sem anotação inventada", () => {
  // Mudança antiga de uma flag já removida continua no ConfigAudit.
  assert.equal(flagAlternavel("FLAG_QUE_NAO_EXISTE_MAIS"), null);
});

/* ── `valorReconhecido`: o selo da tela ───────────────────────────────────
 *
 * `flagLigada` responde SE está ligada; esta responde se dá para confiar na
 * resposta. As duas divergem exatamente no caso perigoso. */

test("valor que liga é reconhecido, em cada dialeto", () => {
  for (const v of ["1", "true", "on", "yes", "sim", " SIM ", "\tTrue\n"]) {
    assert.equal(valorReconhecido(v, "amplo"), true, `amplo recusou "${v}"`);
  }
  for (const v of ["1", "true", "on", "ON", " true "]) {
    assert.equal(valorReconhecido(v, "estrito"), true, `estrito recusou "${v}"`);
  }
});

test("valor que desliga é reconhecido — 0 deliberado não vira alarme", () => {
  // A tela grava "0" (`valorParaGravar`); acusar isso marcaria metade da lista.
  for (const v of ["0", "false", "off", "no", "nao", "não", "FALSE"]) {
    assert.equal(valorReconhecido(v, "amplo"), true, `"${v}" virou alarme`);
    assert.equal(valorReconhecido(v, "estrito"), true, `"${v}" virou alarme`);
  }
});

test("ausente e vazio são o estado NORMAL, não um valor errado", () => {
  // Default de todas é OFF. Sem isto, dia zero acusaria as 18 linhas.
  for (const v of [undefined, "", "   ", "\n"]) {
    assert.equal(valorReconhecido(v, "amplo"), true);
    assert.equal(valorReconhecido(v, "estrito"), true);
  }
});

test('"sim" no dialeto ESTRITO é o caso que o selo existe para pegar', () => {
  // Quem gravou quis LIGAR. A flag ficou desligada. `ligada` devolve false,
  // indistinguível de um "0" deliberado — só este campo separa os dois.
  for (const v of ["sim", "yes", "SIM", " Yes "]) {
    assert.equal(flagLigada(v, "estrito"), false, `"${v}" deveria estar OFF no estrito`);
    assert.equal(valorReconhecido(v, "estrito"), false, `"${v}" passou batido no estrito`);
    // No amplo a mesma grafia LIGA, e por isso é reconhecida.
    assert.equal(flagLigada(v, "amplo"), true);
    assert.equal(valorReconhecido(v, "amplo"), true);
  }
});

test("lixo é não reconhecido nos dois dialetos", () => {
  for (const v of ["tru", "ligado", "S", "enabled", "2", "-1"]) {
    assert.equal(valorReconhecido(v, "amplo"), false, `"${v}" passou batido`);
    assert.equal(valorReconhecido(v, "estrito"), false, `"${v}" passou batido`);
  }
});

test("o que a tela grava nunca dispara o selo", () => {
  for (const flag of FLAGS_REGISTRADAS.filter((f) => f.tipo === "booleana")) {
    for (const ligada of [true, false]) {
      assert.equal(
        valorReconhecido(valorParaGravar(ligada), flag.dialeto),
        true,
        `${flag.key} acusaria o próprio valor da tela`,
      );
    }
  }
});

/* ── `intencaoProvavel`: para que lado o conserto de um clique vira ───────
 *
 * Só é consultada quando `valorReconhecido` já disse `false`. O `null` é
 * resposta legítima: a tela não oferece o clique quando não sabe, e oferecer
 * o lado errado numa flag que abre ledger append-only é pior que não oferecer. */

test('"sim"/"yes" numa estrita: a intenção era LIGAR', () => {
  // O caso que motiva tudo. `flagLigada` diz OFF; a pessoa quis ON.
  for (const v of ["sim", "yes", "SIM", " Yes "]) {
    assert.equal(valorReconhecido(v, "estrito"), false);
    assert.equal(intencaoProvavel(v, "estrito"), true, `"${v}" deveria ler como LIGAR`);
  }
});

test("grafias de desligar são lidas como DESLIGAR", () => {
  for (const v of ["desligado", "inativo", "desativado", "disabled", "falso", "N"]) {
    assert.equal(intencaoProvavel(v, "amplo"), false, `"${v}" deveria ler como DESLIGAR`);
  }
});

test("grafias de ligar fora do dialeto são lidas como LIGAR", () => {
  for (const v of ["ligado", "ativo", "habilitado", "enabled", "verdadeiro", "S"]) {
    assert.equal(valorReconhecido(v, "amplo"), false);
    assert.equal(intencaoProvavel(v, "amplo"), true, `"${v}" deveria ler como LIGAR`);
  }
});

test("valor sem intenção legível devolve null — a tela não oferece clique", () => {
  for (const v of ["tru", "2", "-1", "xyz", "??"]) {
    assert.equal(intencaoProvavel(v, "amplo"), null, `"${v}" virou palpite`);
    assert.equal(intencaoProvavel(v, "estrito"), null, `"${v}" virou palpite`);
  }
});

test("ausente e vazio não têm intenção a adivinhar", () => {
  for (const v of [undefined, "", "  "]) {
    assert.equal(intencaoProvavel(v, "amplo"), null);
  }
});

test("o conserto proposto sempre produz um valor RECONHECIDO", () => {
  // A ação do selo grava `valorParaGravar(intencao)`. Se isso pudesse gerar um
  // valor que o dialeto recusa, o selo consertaria para dentro do próprio bug.
  const suspeitos = ["sim", "yes", "ligado", "desligado", "inativo", "enabled"];
  for (const flag of FLAGS_REGISTRADAS.filter((f) => f.tipo === "booleana")) {
    for (const v of suspeitos) {
      const intencao = intencaoProvavel(v, flag.dialeto);
      if (intencao === null) continue;
      assert.equal(
        valorReconhecido(valorParaGravar(intencao), flag.dialeto),
        true,
        `${flag.key}: consertar "${v}" geraria outro valor inválido`,
      );
      assert.equal(flagLigada(valorParaGravar(intencao), flag.dialeto), intencao);
    }
  }
});
