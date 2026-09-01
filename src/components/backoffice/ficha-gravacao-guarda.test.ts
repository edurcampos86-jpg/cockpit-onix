import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guarda de fonte — a ficha do cliente não volta a engolir falha de gravação.
 *
 * POR QUE UM TESTE DE FONTE, E NÃO UM TESTE DE TELA
 * -------------------------------------------------
 * Este repositório roda `tsx --test` com `node:test` e não tem jsdom, nem
 * testing-library, nem playwright — nenhum dos 1.132 testes clica em tela. Um
 * teste que montasse a ficha e simulasse a rede caindo é o teste certo, e não
 * existe infraestrutura para ele hoje.
 *
 * A alternativa honesta é a que o repo já usa em `guarda-drift-fts.sh`,
 * `guarda-not-null-sem-default.sh` e `tooltip-guarda.test.ts`: afirmar sobre a
 * FONTE a regra que não dá para afirmar em runtime.
 *
 * O que estas asserções seguram é a regressão real e barata: alguém acrescenta
 * a décima primeira gravação daqui a três meses, copia o padrão do vizinho, e o
 * padrão do vizinho volta a ser `if (res.ok)` sem `else`. O teste quebra na
 * hora, com o motivo escrito.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const FICHA = join(AQUI, "cliente-detalhe.tsx");
const fonte = readFileSync(FICHA, "utf8");

test("a ficha não chama fetch direto — toda gravação passa pelo recibo", () => {
  // `fetch(` cru é o que devolve uma Response que ninguém é obrigado a
  // conferir. `gravar`/`gravarJson`/`apagar` devolvem um recibo tipado em que
  // o ramo de falha não tem como ser esquecido: sem tratá-lo, não há dados.
  const chamadas = fonte.match(/\bfetch\s*\(/g) ?? [];
  assert.equal(
    chamadas.length,
    0,
    `cliente-detalhe.tsx voltou a chamar fetch direto (${chamadas.length}×). ` +
      "Use gravarJson/apagar de @/lib/backoffice/gravacao — eles devolvem { ok, motivo }.",
  );
});

test("nenhum `if (res.ok)` sobrou sem ramo de falha", () => {
  assert.doesNotMatch(
    fonte,
    /if\s*\(\s*res\.ok\s*\)/,
    "voltou o padrão `if (res.ok)` sem else: falha de rede vira indistinguível de sucesso",
  );
});

test("os quatro botões de salvar mostram o estado da gravação", () => {
  // Descoberta, One-Page Plan, Organização e Perfil emocional. Se um deles
  // voltar a ter rótulo fixo, some o "Tentar salvar de novo" — e some com ele
  // o único sinal de que a gravação falhou.
  const rotulos = fonte.match(/rotuloGravacao\(/g) ?? [];
  assert.equal(rotulos.length, 4, `esperava 4 botões com estado, achei ${rotulos.length}`);
});

test("todo componente que grava tem uma faixa de falha montada", () => {
  // Sete componentes gravam: os quatro com botão "Salvar" mais Metas de vida,
  // Eventos de vida e RCA/Reuniões. Cada um monta a sua faixa — uma faixa só,
  // no topo da ficha, não serviria: as abas desmontam ao trocar.
  const hooks = fonte.match(/useGravacao\(\)/g) ?? [];
  const faixas = fonte.match(/<ReciboGravacao\b/g) ?? [];
  assert.equal(
    hooks.length,
    faixas.length,
    `${hooks.length} componentes gravam mas só ${faixas.length} mostram falha — ` +
      "alguém grava em silêncio de novo",
  );
  assert.ok(hooks.length >= 7, `esperava ao menos 7 pontos de gravação, achei ${hooks.length}`);
});

test("o aviso de falha não se apaga sozinho", () => {
  // Regra de produto, não de estilo: "Salvo!" pode sumir em 2s porque perder
  // esse aviso não custa nada. Perder o aviso de FALHA custa o texto que a
  // pessoa acabou de escrever. O único setTimeout do módulo de estado só pode
  // limpar o estado "gravado".
  const recibo = readFileSync(join(AQUI, "recibo-gravacao.tsx"), "utf8");
  const timeouts = recibo.match(/setTimeout\(/g) ?? [];
  assert.equal(timeouts.length, 1, "apareceu um setTimeout novo — confira se ele apaga a falha");
  assert.match(
    recibo,
    /atual === "gravado" \? "parado" : atual/,
    "o setTimeout deixou de proteger o estado \"falhou\"",
  );
});
