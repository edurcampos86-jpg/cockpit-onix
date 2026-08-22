import assert from "node:assert/strict";
import { test } from "node:test";
import type { PerfilAcesso } from "@/lib/rbac-papeis";
import {
  CHAVES_CONFIG_DB,
  CHAVES_GRAVAVEIS,
  decidirEscritaConfig,
  projetarConfig,
} from "./config-acesso";

/** Sessão válida com a role/teamRole pedidos. */
function ctx(role: string, teamRole?: string): PerfilAcesso {
  return { role, pessoa: teamRole ? { teamRole } : null };
}

const TOKEN = "sk-ant-api03-SEGREDOsuperlongo-9f2aQ7Zx";

// ── (a) escrita: só admin ────────────────────────────────────────────────

test("sessão support NÃO pode gravar chave de integração", () => {
  const v = decidirEscritaConfig(ctx("support"), "ANTHROPIC_API_KEY");
  assert.equal(v.permitido, false);
  assert.equal(v.permitido === false && v.status, 403);
});

test("sessão support com Pessoa colaborador também NÃO pode", () => {
  const v = decidirEscritaConfig(ctx("support", "colaborador"), "GITHUB_TOKEN");
  assert.equal(v.permitido, false);
  assert.equal(v.permitido === false && v.status, 403);
});

test("liderança NÃO é admin para efeito de chave de integração", () => {
  // isLideranca existe no projeto, mas segredo do sistema é régua de admin.
  const v = decidirEscritaConfig(ctx("support", "lideranca"), "GITHUB_TOKEN");
  assert.equal(v.permitido, false);
});

test("sem sessão nenhuma é 403, não 401 nem 500", () => {
  const v = decidirEscritaConfig(null, "ANTHROPIC_API_KEY");
  assert.equal(v.permitido, false);
  assert.equal(v.permitido === false && v.status, 403);
});

// ── (c) admin continua funcionando ───────────────────────────────────────

test("admin por User.role grava normalmente", () => {
  assert.deepEqual(decidirEscritaConfig(ctx("admin"), "ANTHROPIC_API_KEY"), {
    permitido: true,
  });
});

test("admin por Pessoa.teamRole grava normalmente", () => {
  // Mesma régua do isAdmin() do resto do RBAC — as duas portas valem.
  assert.deepEqual(decidirEscritaConfig(ctx("support", "admin"), "GITHUB_TOKEN"), {
    permitido: true,
  });
});

test("toda chave oferecida pela tela é gravável por admin", () => {
  for (const k of CHAVES_GRAVAVEIS) {
    assert.deepEqual(
      decidirEscritaConfig(ctx("admin"), k),
      { permitido: true },
      `chave ${k} deveria ser gravável`,
    );
  }
});

// ── allowlist de chaves (defesa em profundidade) ─────────────────────────

test("admin não grava chave desconhecida", () => {
  const v = decidirEscritaConfig(ctx("admin"), "CHAVE_INVENTADA");
  assert.equal(v.permitido, false);
  assert.equal(v.permitido === false && v.status, 400);
});

test("segredo de OAuth que só vive em env não é gravável pela rota", () => {
  for (const k of ["GOOGLE_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"]) {
    assert.equal(decidirEscritaConfig(ctx("admin"), k).permitido, false, k);
  }
});

test("key não-string não passa (e a role é checada antes)", () => {
  // A ordem importa: não-admin recebe 403 mesmo mandando lixo, e não um 400
  // que confirmaria o formato esperado.
  assert.equal(
    (decidirEscritaConfig(ctx("support"), { a: 1 }) as { status: number }).status,
    403,
  );
  assert.equal(
    (decidirEscritaConfig(ctx("admin"), null) as { status: number }).status,
    400,
  );
});

// ── (b) leitura: não-admin não recebe fragmento ──────────────────────────

test("não-admin recebe só o booleano, sem nenhum pedaço do token", () => {
  const visao = projetarConfig({ ANTHROPIC_API_KEY: TOKEN }, { admin: false });
  assert.deepEqual(visao.ANTHROPIC_API_KEY, { configurada: true });
  assert.equal("mascara" in visao.ANTHROPIC_API_KEY, false);
});

test("nenhum sufixo do token aparece na resposta de não-admin", () => {
  // Teste pelo resultado, não pela forma: serializa tudo e procura o sufixo.
  const serial = JSON.stringify(
    projetarConfig(
      { ANTHROPIC_API_KEY: TOKEN, GITHUB_TOKEN: "ghp_outroSEGREDO_1a2b" },
      { admin: false },
    ),
  );
  assert.equal(serial.includes(TOKEN.slice(-4)), false, serial);
  assert.equal(serial.includes("1a2b"), false, serial);
  assert.equal(serial.includes("••••••"), false, serial);
});

test("não-admin ainda distingue configurada de não configurada", () => {
  // O gate não pode cegar a tela: sem isto o card não sabe o que mostrar.
  const visao = projetarConfig(
    { ANTHROPIC_API_KEY: TOKEN, META_ACCESS_TOKEN: "" },
    { admin: false },
  );
  assert.equal(visao.ANTHROPIC_API_KEY.configurada, true);
  assert.equal(visao.META_ACCESS_TOKEN.configurada, false);
});

test("admin mantém a máscara com os 4 últimos (rotação de credencial)", () => {
  const visao = projetarConfig({ ANTHROPIC_API_KEY: TOKEN }, { admin: true });
  assert.equal(visao.ANTHROPIC_API_KEY.configurada, true);
  assert.equal(visao.ANTHROPIC_API_KEY.mascara, "••••••" + TOKEN.slice(-4));
});

test("chave vazia não ganha máscara nem para admin", () => {
  // "••••••" sozinho passaria a impressão de chave configurada onde não há.
  const visao = projetarConfig({ META_ACCESS_TOKEN: "" }, { admin: true });
  assert.deepEqual(visao.META_ACCESS_TOKEN, { configurada: false });
});

test("a máscara nunca revela o começo do token", () => {
  const visao = projetarConfig({ ANTHROPIC_API_KEY: TOKEN }, { admin: true });
  assert.equal(visao.ANTHROPIC_API_KEY.mascara!.includes("sk-ant"), false);
});

test("config vazia não quebra a projeção", () => {
  assert.deepEqual(projetarConfig({}, { admin: false }), {});
  assert.deepEqual(projetarConfig({}, { admin: true }), {});
});

test("token curtíssimo não vira máscara que é o token inteiro", () => {
  // slice(-4) de "ab" devolve "ab" — o valor completo. Improvável em token
  // real, mas o custo de checar é zero e o custo de errar é vazar a chave.
  const visao = projetarConfig({ GITHUB_REPO: "ab" }, { admin: true });
  assert.equal(visao.GITHUB_REPO.mascara, "••••••ab");
});

/* ── Onde cada chave é GUARDADA ───────────────────────────────────────── */

test("toda chave do Config DB é gravável pela tela", () => {
  // Chave que o banco guarda mas o endpoint recusa gravar é config morta: o
  // valor só entraria por env, e a tela ofereceria um campo que sempre falha.
  for (const chave of CHAVES_CONFIG_DB) {
    assert.equal(
      CHAVES_GRAVAVEIS.has(chave),
      true,
      `${chave} está em CHAVES_CONFIG_DB mas não em CHAVES_GRAVAVEIS`,
    );
  }
});

test("o segredo do webhook do Zapier é guardado no banco, não no arquivo", () => {
  // O `.integrations.json` some no redeploy do Railway. Este segredo é a
  // credencial de uma rota PÚBLICA — some ele, some a autenticação dela.
  // Tirar daqui reabre exatamente o buraco descrito em src/lib/proxy-rotas.ts.
  assert.equal(CHAVES_CONFIG_DB.has("ZAPIER_WEBHOOK_SECRET"), true);
});
