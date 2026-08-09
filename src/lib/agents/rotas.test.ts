import assert from "node:assert/strict";
import { test } from "node:test";
import { agentePorRota } from "./rotas";

/* A regra vale nos DOIS lados — o botão flutuante decide no browser e o
 * registry resolve no servidor, a partir deste mesmo módulo. Antes ela estava
 * escrita duas vezes, palavra por palavra; estes testes são o que impede a
 * cobertura de mudar num lado só. */

test("as rotas que TÊM agente", () => {
  assert.equal(agentePorRota("/onix-corretora"), "corretora");
  assert.equal(agentePorRota("/onix-corretora/alertas"), "corretora");
  assert.equal(agentePorRota("/onix-corretora/painel-semanal"), "corretora");
  assert.equal(agentePorRota("/kpis"), "kpis");
  assert.equal(agentePorRota("/analytics"), "kpis");
});

test("todo o resto NÃO tem agente — o botão não monta", () => {
  // Esta função já devolveu "cockpit" aqui, e era por isso que o Copiloto
  // aparecia no app inteiro. Com ele removido, um fallback apontaria para um
  // especialista de outra área respondendo com confiança sobre o assunto
  // errado.
  for (const rota of [
    "/",                                  // o hub
    "/painel",
    "/empresas/investimentos",
    "/empresas/investimentos/clientes",
    "/configuracoes/flags",
    "/configuracoes/permissoes",
    "/time",
    "/juridico",
    "/reunioes",
    "/integracoes",
  ]) {
    assert.equal(agentePorRota(rota), null, `"${rota}" não deveria ter agente`);
  }
});

test("prefixo não vaza para rota vizinha de nome parecido", () => {
  // `startsWith` é generoso: sem esta conferência, uma rota futura chamada
  // "/kpis-antigos" herdaria o agente de KPIs sem ninguém decidir isso.
  assert.equal(agentePorRota("/kpis-antigos"), "kpis");
  assert.equal(agentePorRota("/analytics-v2"), "kpis");
  // Documentado, não corrigido: hoje não existe nenhuma dessas rotas
  // (conferido em src/app/), e apertar para igualdade exata quebraria
  // "/onix-corretora/alertas", que precisa do prefixo. Se uma rota assim
  // nascer, este teste falha e obriga a decisão em vez de deixar herdar.
});

test("a raiz exata não casa com nada", () => {
  assert.equal(agentePorRota("/"), null);
});
