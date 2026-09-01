import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Guarda: o tooltip não pode roubar o clique do controle vizinho.
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────
 * Em /configuracoes/flags, o selo de origem fica colado ao interruptor. Com o
 * tooltip aberto e `pointer-events: auto`, o popup — portalado e em `z-50` —
 * cobre o interruptor e engole o clique. Sem erro na tela: o clique pousa no
 * tooltip e o handler do Switch nunca roda.
 *
 * ── O QUE ESTA GUARDA PROVA, E O QUE NÃO PROVA ───────────────────────────
 * PROVA que a configuração continua caindo no ramo em que o Base UI desliga
 * os eventos de ponteiro do popup, e que o mecanismo da biblioteca continua
 * sendo o que a correção assume.
 *
 * NÃO prova que um clique real alcança o Switch num navegador: este
 * repositório não tem jsdom, testing-library nem runner de DOM (conferido no
 * package.json), e `npm test` roda `tsx --test` sobre módulos. Provar o
 * clique exigiria trazer um runner de DOM — decisão maior que esta correção.
 *
 * ── POR QUE LER O node_modules ───────────────────────────────────────────
 * A correção depende de UM detalhe interno do Base UI: `disableHoverablePopup`
 * é o que faz o positioner voltar a `pointer-events: none`. Se um upgrade
 * mudar esse contrato, a tela volta a engolir cliques em silêncio — e o
 * `npm run build` passaria, porque o tipo do prop continuaria existindo.
 * Aqui a premissa fica escrita e verificada contra a versão instalada.
 */
const require_ = createRequire(import.meta.url);

/* O `exports` do pacote não publica os caminhos internos, então resolver
 * `@base-ui/react/esm/...` direto dá ERR_PACKAGE_PATH_NOT_EXPORTED. O
 * `package.json` é exportado e serve de âncora para chegar à pasta. */
const RAIZ_BASE_UI = dirname(require_.resolve("@base-ui/react/package.json"));

const NOSSO_TOOLTIP = readFileSync(
  new URL("./tooltip.tsx", import.meta.url),
  "utf8",
);

function fonteDoBaseUi(caminho: string): string {
  return readFileSync(join(RAIZ_BASE_UI, "esm", caminho), "utf8");
}

test("o nosso Tooltip desliga o popup hoverável por padrão", () => {
  assert.match(
    NOSSO_TOOLTIP,
    /disableHoverablePopup\s*=\s*true/,
    "sem este default o popup fica com pointer-events: auto e cobre o controle vizinho",
  );
  assert.match(
    NOSSO_TOOLTIP,
    /<TooltipPrimitive\.Root[\s\S]*?disableHoverablePopup=\{disableHoverablePopup\}/,
    "o valor precisa chegar ao Root — é lá que o Base UI o lê",
  );
});

test("o default continua sobrescrevível por quem precisar de popup hoverável", () => {
  assert.match(
    NOSSO_TOOLTIP,
    /function Tooltip\(\{\s*disableHoverablePopup = true,\s*\.\.\.props\s*\}/,
    "desestruturar com default mantém <Tooltip disableHoverablePopup={false}> funcionando",
  );
});

test("o Base UI instalado ainda liga pointer-events a disableHoverablePopup", () => {
  const positioner = fonteDoBaseUi("tooltip/positioner/TooltipPositioner.js");
  assert.match(
    positioner,
    /if \(!open \|\| trackCursorAxis === 'both' \|\| disableHoverablePopup\)/,
    "o Base UI mudou a condição que devolve pointer-events: none ao positioner — reavaliar a correção",
  );
  assert.match(
    positioner,
    /hiddenStyles\.pointerEvents = 'none'/,
    "o Base UI deixou de zerar pointerEvents nesse ramo — reavaliar a correção",
  );
});

test("o Base UI instalado ainda liga o safePolygon ao mesmo flag", () => {
  const trigger = fonteDoBaseUi("tooltip/trigger/TooltipTrigger.js");
  assert.match(
    trigger,
    /handleClose: !disableHoverablePopup &&/,
    "o safePolygon deixou de depender de disableHoverablePopup — reavaliar a correção",
  );
});
