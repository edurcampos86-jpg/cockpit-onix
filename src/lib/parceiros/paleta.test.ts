import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PALETA_PARCEIROS,
  contraste,
  luminancia,
  hexParaRgb,
  passaAaTexto,
  passaAaGrande,
  AA_TEXTO,
  AA_GRANDE,
} from "./paleta";

/**
 * O critério de aprovação diz "contraste WCAG AA". Isto o torna verificável:
 * cada par que as telas de Parceiros usam está travado aqui, com o papel que
 * ele tem direito a exercer.
 */

// Tokens estruturais do app, de globals.css. Copiados de propósito: se alguém
// mudar o tema global, o teste falha e alguém confere as telas de Parceiros —
// que é exatamente o aviso que se quer.
const CREME = "#FAF9F5"; // --background claro
const TINTA = "#141413"; // --foreground claro
const NOITE = "#080808"; // --background escuro
const MARFIM = "#FFFAF0"; // --foreground escuro

// ── A régua ──────────────────────────────────────────────────────────────

test("contraste é simétrico e conhece os extremos", () => {
  assert.equal(Math.round(contraste("#000000", "#FFFFFF")), 21);
  assert.equal(contraste("#123456", "#123456"), 1);
  assert.equal(contraste("#A87A2E", CREME), contraste(CREME, "#A87A2E"));
});

test("hex de 3 dígitos é o mesmo de 6", () => {
  assert.deepEqual(hexParaRgb("#abc"), hexParaRgb("#aabbcc"));
  assert.equal(luminancia("#fff"), luminancia("#FFFFFF"));
});

test("hex inválido lança em vez de devolver cor errada", () => {
  // Silenciar aqui produziria uma cor plausível e um contraste inventado.
  assert.throws(() => hexParaRgb("roxo"));
  assert.throws(() => hexParaRgb("#12345"));
});

// ── Tema CLARO ───────────────────────────────────────────────────────────

test("texto corrido no claro é tinta sobre creme, com folga", () => {
  assert.ok(passaAaTexto(TINTA, CREME), `${contraste(TINTA, CREME)}`);
});

test("OURO sobre creme: vale para título e ícone, NÃO para texto corrido", () => {
  // É o par delicado da paleta, e o motivo de o ouro nunca aparecer em
  // parágrafo nas telas. Fixar os dois lados impede tanto o uso indevido
  // quanto uma "correção" que escureça o ouro sem necessidade.
  const razao = contraste(PALETA_PARCEIROS.ouro, CREME);
  assert.ok(razao >= AA_GRANDE, `esperado >= ${AA_GRANDE}, foi ${razao}`);
  assert.ok(razao < AA_TEXTO, `ouro passou a servir texto corrido: ${razao}`);
});

test("AZUL sobre creme serve texto corrido no claro", () => {
  assert.ok(passaAaTexto(PALETA_PARCEIROS.azul, CREME));
});

// ── Tema ESCURO ──────────────────────────────────────────────────────────

test("texto corrido no escuro é marfim sobre noite", () => {
  assert.ok(passaAaTexto(MARFIM, NOITE));
});

test("OURO sobre a superfície azul passa AA de texto no escuro", () => {
  // Mesma cor, papel mais folgado — o azul é bem mais escuro que o creme.
  assert.ok(
    passaAaTexto(PALETA_PARCEIROS.ouro, PALETA_PARCEIROS.azul),
    `${contraste(PALETA_PARCEIROS.ouro, PALETA_PARCEIROS.azul)}`,
  );
});

test("marfim sobre a superfície azul passa AA de texto", () => {
  assert.ok(passaAaTexto(MARFIM, PALETA_PARCEIROS.azul));
});

test("texto secundário sobre a superfície azul ainda passa AA", () => {
  // `--muted-foreground` do tema escuro. É a cor de MAIS texto nas telas de
  // Parceiros (ajudas, datas, contagens); se ela não passa sobre o azul, a
  // superfície de destaque está errada — não o texto.
  assert.ok(
    passaAaTexto("#888888", PALETA_PARCEIROS.azul),
    `${contraste("#888888", PALETA_PARCEIROS.azul)}`,
  );
});

test("azul sobre noite NÃO serve de texto — é superfície, não tinta", () => {
  // Registra o erro fácil: usar o azul como cor de letra no tema escuro.
  assert.ok(!passaAaGrande(PALETA_PARCEIROS.azul, NOITE));
});
