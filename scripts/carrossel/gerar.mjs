// Gerador do carrossel "Tudo dá trabalho" — layout estilo post Onix / Eduardo Campos
// Referência: post @eduardocampos86 (fundo azul-marinho, caixa baixa, destaque dourado, pill "Leia a legenda")
// Pipeline: satori (layout + fontes) -> @resvg/resvg-js (PNG)
// Uso: node scripts/carrossel/gerar.mjs
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(__dirname, "fonts");
const OUT = join(__dirname, "out");

// ── Paleta extraída da referência ──
const NAVY_TOP = "#182433";
const NAVY_MID = "#0E1726";
const NAVY_BOT = "#0A0E1A";
const WHITE = "#F6F8FC";
const GRAY = "#9BA4B4";
const GRAY_DIM = "#6E7788";
const GOLD = "#C9A15C"; // destaque
const GOLD_PILL_1 = "#E4C57E";
const GOLD_PILL_2 = "#BD9248";
const BLUE = "#3897F0"; // selo verificado

const W = 1080;
const H = 1350;

const font = (file) => readFileSync(join(FONTS, file));
const fonts = [
  { name: "Poppins", data: font("Poppins-Regular.ttf"), weight: 400, style: "normal" },
  { name: "Poppins", data: font("Poppins-Medium.ttf"), weight: 500, style: "normal" },
  { name: "Poppins", data: font("Poppins-SemiBold.ttf"), weight: 600, style: "normal" },
  { name: "Poppins", data: font("Poppins-Bold.ttf"), weight: 700, style: "normal" },
  { name: "Poppins", data: font("Poppins-ExtraBold.ttf"), weight: 800, style: "normal" },
];

const h = (type, props, ...children) => {
  const kids = children.flat().filter((c) => c !== null && c !== undefined);
  return {
    type,
    props: { ...(props || {}), children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids },
  };
};

// Selo verificado (círculo azul + check branco)
const verified = () =>
  h(
    "svg",
    { width: "34", height: "34", viewBox: "0 0 24 24", fill: "none" },
    h("path", {
      d: "M12 1.5l2.3 1.7 2.85-.2.86 2.72 2.43 1.5-.86 2.73L22 12l-1.53 2.05.86 2.73-2.43 1.5-.86 2.72-2.85-.2L12 22.5l-2.3-1.7-2.85.2-.86-2.72-2.43-1.5.86-2.73L2 12l1.53-2.05-.86-2.73 2.43-1.5.86-2.72 2.85.2L12 1.5z",
      fill: BLUE,
    }),
    h("path", {
      d: "M7.5 12.3l2.7 2.7 6-6",
      stroke: "#fff",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );

// Cabeçalho do perfil (avatar + nome + selo + @handle) e numeração
function header(numero, total) {
  return h(
    "div",
    {
      style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "22px" } },
      // avatar com iniciais
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100px",
            height: "100px",
            borderRadius: "50px",
            backgroundColor: "#101a29",
            border: `2px solid rgba(201,161,92,0.55)`,
          },
        },
        h(
          "div",
          {
            style: {
              color: GOLD,
              fontFamily: "Poppins",
              fontWeight: 700,
              fontSize: "40px",
              letterSpacing: "0.02em",
            },
          },
          "EC"
        )
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px" } },
          h(
            "div",
            { style: { display: "flex", color: WHITE, fontFamily: "Poppins", fontWeight: 700, fontSize: "32px" } },
            "Eduardo Campos"
          ),
          verified()
        ),
        h(
          "div",
          { style: { display: "flex", color: GRAY, fontFamily: "Poppins", fontWeight: 400, fontSize: "24px", marginTop: "2px" } },
          "@eduardocampos86"
        )
      )
    ),
    numero
      ? h(
          "div",
          { style: { display: "flex", color: GRAY_DIM, fontFamily: "Poppins", fontWeight: 600, fontSize: "22px", letterSpacing: "0.1em" } },
          `${String(numero).padStart(2, "0")} / ${String(total).padStart(2, "0")}`
        )
      : null
  );
}

// Título do post (branco, caixa baixa, negrito)
const title = (text, size = 60) =>
  h(
    "div",
    {
      style: {
        display: "flex",
        color: WHITE,
        fontFamily: "Poppins",
        fontWeight: 700,
        fontSize: `${size}px`,
        lineHeight: 1.18,
        letterSpacing: "-0.01em",
        maxWidth: "920px",
      },
    },
    text
  );

// Parágrafo de corpo (cinza)
const body = (text, size = 36) =>
  h(
    "div",
    {
      style: {
        display: "flex",
        color: GRAY,
        fontFamily: "Poppins",
        fontWeight: 400,
        fontSize: `${size}px`,
        lineHeight: 1.5,
        maxWidth: "900px",
      },
    },
    text
  );

// Linha de destaque dourada
const highlight = (text, size = 40) =>
  h(
    "div",
    {
      style: {
        display: "flex",
        color: GOLD,
        fontFamily: "Poppins",
        fontWeight: 600,
        fontSize: `${size}px`,
        lineHeight: 1.4,
        maxWidth: "900px",
      },
    },
    text
  );

// Pill "Leia a legenda"
const pill = () =>
  h(
    "div",
    {
      style: {
        display: "flex",
        alignSelf: "flex-start",
        alignItems: "center",
        gap: "14px",
        paddingTop: "20px",
        paddingBottom: "20px",
        paddingLeft: "38px",
        paddingRight: "38px",
        borderRadius: "999px",
        backgroundImage: `linear-gradient(135deg, ${GOLD_PILL_1} 0%, ${GOLD_PILL_2} 100%)`,
      },
    },
    h(
      "svg",
      { width: "30", height: "30", viewBox: "0 0 24 24", fill: "none" },
      h("path", {
        d: "M4 5.5A1.5 1.5 0 015.5 4H11v15.5H5.5A1.5 1.5 0 014 18V5.5zM20 5.5A1.5 1.5 0 0018.5 4H13v15.5h5.5A1.5 1.5 0 0020 18V5.5z",
        stroke: "#1a1205",
        "stroke-width": "1.8",
        "stroke-linejoin": "round",
      })
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          color: "#1a1205",
          fontFamily: "Poppins",
          fontWeight: 700,
          fontSize: "26px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        },
      },
      "Leia a legenda"
    )
  );

// Rodapé "arraste" pros slides intermediários
const arraste = () =>
  h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: "14px" } },
    h(
      "div",
      { style: { display: "flex", color: GRAY_DIM, fontFamily: "Poppins", fontWeight: 500, fontSize: "24px", letterSpacing: "0.04em" } },
      "Arraste"
    ),
    h(
      "svg",
      { width: "38", height: "24", viewBox: "0 0 40 26", fill: "none" },
      h("path", {
        d: "M2 13 H34 M25 4 L35 13 L25 22",
        stroke: GRAY_DIM,
        "stroke-width": "3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      })
    )
  );

// Container base do slide (card azul-marinho full-bleed)
function slide({ numero, total, blocks, footer }) {
  return h(
    "div",
    {
      style: {
        width: `${W}px`,
        height: `${H}px`,
        display: "flex",
        flexDirection: "column",
        padding: "76px",
        backgroundColor: NAVY_MID,
        backgroundImage: `linear-gradient(170deg, ${NAVY_TOP} 0%, ${NAVY_MID} 52%, ${NAVY_BOT} 100%), radial-gradient(90% 55% at 12% 8%, rgba(201,161,92,0.10) 0%, rgba(201,161,92,0) 50%)`,
      },
    },
    header(numero, total),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: "30px",
        },
      },
      ...blocks
    ),
    footer || h("div", { style: { display: "flex", height: "8px" } })
  );
}

const TOTAL = 5;

const slides = [
  // 1
  slide({
    numero: 1,
    total: TOTAL,
    blocks: [
      title("Tudo dá trabalho. E está tudo certo.", 66),
      body("Casa dá trabalho. Família dá trabalho. Cliente dá trabalho. Tudo que tem valor cobra a sua dedicação."),
    ],
    footer: arraste(),
  }),

  // 2
  slide({
    numero: 2,
    total: TOTAL,
    blocks: [
      title("Nada que importa se sustenta sozinho.", 64),
      body("Não existe construção que se preserve no automático. O que deixa de receber cuidado começa a se desfazer — em silêncio."),
    ],
    footer: arraste(),
  }),

  // 3
  slide({
    numero: 3,
    total: TOTAL,
    blocks: [
      title("Reclamar do peso só trava você.", 64),
      body("Se for reclamar de tudo que exige a sua entrega, vai viver em frustração constante. A cobrança vira ruído e o ruído vira paralisia."),
    ],
    footer: arraste(),
  }),

  // 4
  slide({
    numero: 4,
    total: TOTAL,
    blocks: [
      title("A rotina desgasta.", 72),
      body("Mas desgaste é sinal de movimento. Quem não carrega nada não cansa — e também não constrói nada."),
    ],
    footer: arraste(),
  }),

  // 5 — fechamento com destaque + pill
  slide({
    numero: 5,
    total: TOTAL,
    blocks: [
      title("É sinal de vida em movimento.", 64),
      body("Da próxima vez que a rotina pesar, lembra:"),
      highlight("O peso não é castigo. É a prova de que você está carregando algo que vale a pena.", 42),
    ],
    footer: pill(),
  }),
];

async function render(node, file) {
  const svg = await satori(node, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  writeFileSync(join(OUT, file), png);
  console.log("ok ->", file);
}

for (let i = 0; i < slides.length; i++) {
  await render(slides[i], `slide-${String(i + 1).padStart(2, "0")}.png`);
}
console.log("Carrossel gerado em", OUT);
