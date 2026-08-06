import assert from "node:assert/strict";
import { test } from "node:test";
import { ehEstaticoSemAuth, ehRotaPublica } from "./proxy-rotas";

// ── O furo que motivou esta PR ───────────────────────────────────────────

test("rota de API com ponto no path NÃO pula a autenticação", () => {
  // Era o furo: segmento dinâmico aceita ponto, então bastava um ponto na
  // conta para o middleware devolver next() antes de olhar o cookie.
  assert.equal(
    ehEstaticoSemAuth("/api/integracoes/btg/positions/1234.5"),
    false,
  );
});

test("nenhuma variação de ponto reabre a porta em /api/", () => {
  for (const p of [
    "/api/integracoes/btg/positions/1.",
    "/api/integracoes/btg/positions/.",
    "/api/backoffice/clientes/abc.def",
    "/api/admin/config.json",
    "/api/integracoes/config?x=.",
  ]) {
    assert.equal(ehEstaticoSemAuth(p), false, p);
  }
});

test("rota de API sem ponto seguia protegida — e segue", () => {
  assert.equal(ehEstaticoSemAuth("/api/integracoes/config"), false);
  assert.equal(ehEstaticoSemAuth("/api/admin/config"), false);
});

// ── O que a regra existe para servir continua servido ────────────────────

test("arquivo estático da raiz continua passando sem sessão", () => {
  for (const p of ["/logo.png", "/robots.txt", "/manifest.webmanifest", "/sw.js"]) {
    assert.equal(ehEstaticoSemAuth(p), true, p);
  }
});

test("internos do Next continuam passando", () => {
  assert.equal(ehEstaticoSemAuth("/_next/static/chunk.js"), true);
  assert.equal(ehEstaticoSemAuth("/favicon.ico"), true);
  // Sem ponto e fora de /api/ — o prefixo é o que vale, não a extensão.
  assert.equal(ehEstaticoSemAuth("/_next/image"), true);
});

test("página normal (sem ponto) continua exigindo sessão", () => {
  for (const p of ["/", "/integracoes", "/configuracoes/implementacoes"]) {
    assert.equal(ehEstaticoSemAuth(p), false, p);
  }
});

// ── Allowlist pública ────────────────────────────────────────────────────

test("as rotas públicas conhecidas são reconhecidas", () => {
  for (const p of [
    "/login",
    "/api/cron/boot-do-dia",
    "/api/health",
    "/api/webhooks/btg",
    "/api/integracoes/meta/ingest",
  ]) {
    assert.equal(ehRotaPublica(p), true, p);
  }
});

test("rota administrativa não é pública", () => {
  assert.equal(ehRotaPublica("/api/admin/config"), false);
  assert.equal(ehRotaPublica("/api/integracoes/config"), false);
});

test("prefixo parecido não vira rota pública por acidente", () => {
  // startsWith é prefixo: confere que não há vizinho perigoso na lista.
  assert.equal(ehRotaPublica("/api/integracoes/zapier/generate-script"), false);
  assert.equal(ehRotaPublica("/api/onix-corretora/analisar"), false);
});
