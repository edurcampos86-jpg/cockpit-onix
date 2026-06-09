// Gerador do carrossel "Tudo dá trabalho" — identidade visual Onix Capital
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

// ── Identidade visual Onix Capital ──
const PRETO = "#080808";
const CREME = "#FFFAF0";
const OURO = "#FFB114";
const OURO_CLARO = "#FFDD99";
const CINZA = "#888888";

const W = 1080;
const H = 1350;

const font = (file) => readFileSync(join(FONTS, file));
const fonts = [
  { name: "Poppins", data: font("Poppins-Regular.ttf"), weight: 400, style: "normal" },
  { name: "Poppins", data: font("Poppins-Medium.ttf"), weight: 500, style: "normal" },
  { name: "Poppins", data: font("Poppins-SemiBold.ttf"), weight: 600, style: "normal" },
  { name: "Poppins", data: font("Poppins-Bold.ttf"), weight: 700, style: "normal" },
  { name: "Poppins", data: font("Poppins-ExtraBold.ttf"), weight: 800, style: "normal" },
  { name: "Poppins", data: font("Poppins-Black.ttf"), weight: 900, style: "normal" },
];

// helper de createElement enxuto
const h = (type, props, ...children) => {
  const kids = children.flat().filter((c) => c !== null && c !== undefined);
  return {
    type,
    props: { ...(props || {}), children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids },
  };
};

// Headline com palavras coloridas: tokens = [{t:"PALAVRA", g:true}] (g = ouro)
function headline(tokens, fontSize, lineHeight = 1.04) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        columnGap: `${fontSize * 0.26}px`,
        rowGap: `${fontSize * (lineHeight - 0.78)}px`,
        fontFamily: "Poppins",
        fontWeight: 800,
        fontSize: `${fontSize}px`,
        lineHeight: 1,
        letterSpacing: "-0.01em",
        textTransform: "uppercase",
      },
    },
    ...tokens.map((tk) =>
      h("div", { style: { color: tk.g ? OURO : CREME, display: "flex" } }, tk.t)
    )
  );
}

// Marca do topo: "O" dourado + wordmark
function topbar(numero, total) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "18px" } },
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            backgroundColor: OURO,
          },
        },
        h(
          "div",
          {
            style: {
              color: PRETO,
              fontFamily: "Poppins",
              fontWeight: 800,
              fontSize: "40px",
              lineHeight: 1,
              marginTop: "-2px",
            },
          },
          "O"
        )
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h(
          "div",
          {
            style: {
              color: CREME,
              fontFamily: "Poppins",
              fontWeight: 700,
              fontSize: "26px",
              lineHeight: 1.1,
              letterSpacing: "0.02em",
            },
          },
          "ECOSSISTEMA ONIX"
        ),
        h(
          "div",
          {
            style: {
              color: CINZA,
              fontFamily: "Poppins",
              fontWeight: 500,
              fontSize: "18px",
              letterSpacing: "0.18em",
            },
          },
          "ONIX CAPITAL"
        )
      )
    ),
    numero
      ? h(
          "div",
          {
            style: {
              color: CINZA,
              fontFamily: "Poppins",
              fontWeight: 600,
              fontSize: "22px",
              letterSpacing: "0.1em",
            },
          },
          `${String(numero).padStart(2, "0")} / ${String(total).padStart(2, "0")}`
        )
      : null
  );
}

// Barrinha de destaque dourada
const goldBar = () =>
  h("div", {
    style: { width: "88px", height: "8px", borderRadius: "4px", backgroundColor: OURO },
  });

// Container base de um slide
function slide({ numero, total, kicker, body, footer, center = false }) {
  return h(
    "div",
    {
      style: {
        width: `${W}px`,
        height: `${H}px`,
        display: "flex",
        flexDirection: "column",
        padding: "72px",
        backgroundColor: PRETO,
        // brilho dourado sutil no canto (profundidade)
        backgroundImage: `radial-gradient(120% 80% at 100% 0%, rgba(255,177,20,0.10) 0%, rgba(255,177,20,0) 42%), radial-gradient(100% 70% at 0% 100%, rgba(255,177,20,0.06) 0%, rgba(255,177,20,0) 45%)`,
      },
    },
    topbar(numero, total),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: center ? "center" : "flex-end",
          paddingBottom: footer ? "0" : "24px",
        },
      },
      kicker
        ? h(
            "div",
            {
              style: {
                display: "flex",
                color: OURO,
                fontFamily: "Poppins",
                fontWeight: 700,
                fontSize: "24px",
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                marginBottom: "28px",
              },
            },
            kicker
          )
        : null,
      goldBar(),
      h("div", { style: { display: "flex", flexDirection: "column", marginTop: "32px" } }, body)
    ),
    footer || null
  );
}

function sub(text, size = 36) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        color: CINZA,
        fontFamily: "Poppins",
        fontWeight: 500,
        fontSize: `${size}px`,
        lineHeight: 1.35,
        marginTop: "30px",
        maxWidth: "860px",
      },
    },
    text
  );
}

// Rodapé de assinatura (slide final)
function assinatura() {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        borderTop: `2px solid rgba(255,177,20,0.25)`,
        paddingTop: "28px",
      },
    },
    h(
      "div",
      {
        style: {
          color: CREME,
          fontFamily: "Poppins",
          fontWeight: 700,
          fontSize: "32px",
        },
      },
      "Eduardo Campos"
    ),
    h(
      "div",
      {
        style: {
          color: OURO,
          fontFamily: "Poppins",
          fontWeight: 600,
          fontSize: "24px",
          letterSpacing: "0.04em",
          marginTop: "4px",
        },
      },
      "Onix Capital  ·  Ecossistema Onix"
    )
  );
}

const TOTAL = 6;

const slides = [
  // 1 — CAPA
  slide({
    numero: 1,
    total: TOTAL,
    center: true,
    kicker: "Mentalidade Onix",
    body: h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      headline([{ t: "Tudo" }, { t: "dá" }, { t: "trabalho.", g: true }], 132, 1.02),
      sub("E está tudo certo. Quem constrói algo grande, constrói cansado.", 40)
    ),
    footer: h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "16px",
          color: OURO_CLARO,
          fontFamily: "Poppins",
          fontWeight: 600,
          fontSize: "26px",
          letterSpacing: "0.04em",
        },
      },
      h("div", { style: { display: "flex" } }, "Arraste para o lado"),
      h(
        "svg",
        { width: "40", height: "26", viewBox: "0 0 40 26", fill: "none" },
        h("path", {
          d: "M2 13 H34 M25 4 L35 13 L25 22",
          stroke: OURO_CLARO,
          "stroke-width": "3.5",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        })
      )
    ),
  }),

  // 2 — o que dá trabalho
  slide({
    numero: 2,
    total: TOTAL,
    body: headline(
      [
        { t: "Casa" }, { t: "dá" }, { t: "trabalho." , g: true },
        { t: "Família" }, { t: "dá" }, { t: "trabalho.", g: true },
        { t: "Cliente" }, { t: "dá" }, { t: "trabalho.", g: true },
      ],
      88,
      1.12
    ),
  }),

  // 3 — se você reclamar
  slide({
    numero: 3,
    total: TOTAL,
    body: headline(
      [
        { t: "Se" }, { t: "você" }, { t: "for" }, { t: "reclamar" },
        { t: "de" }, { t: "tudo" }, { t: "que" }, { t: "exige" },
        { t: "a" }, { t: "sua" }, { t: "dedicação...", g: true },
      ],
      82,
      1.14
    ),
  }),

  // 4 — frustração
  slide({
    numero: 4,
    total: TOTAL,
    body: h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      headline(
        [{ t: "...vai" }, { t: "viver" }, { t: "em" }, { t: "constante" }, { t: "frustração.", g: true }],
        96,
        1.08
      ),
      sub("Cobrar leveza de tudo que importa é o caminho mais curto pra travar.", 38)
    ),
  }),

  // 5 — virada
  slide({
    numero: 5,
    total: TOTAL,
    center: true,
    body: h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      headline([{ t: "A" }, { t: "rotina" }, { t: "desgasta." }], 120, 1.04),
      h(
        "div",
        { style: { display: "flex", marginTop: "36px" } },
        headline(
          [{ t: "Mas" }, { t: "é" }, { t: "sinal" }, { t: "de" }, { t: "vida" }, { t: "em" }, { t: "movimento.", g: true }],
          76,
          1.14
        )
      )
    ),
  }),

  // 6 — fechamento
  slide({
    numero: 6,
    total: TOTAL,
    center: true,
    kicker: "Salve esse post",
    body: h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      headline([{ t: "Vida" }, { t: "em" }, { t: "movimento.", g: true }], 104, 1.05),
      sub("Da próxima vez que a rotina pesar, lembra: peso é sinal de que você está carregando algo que vale a pena.", 38)
    ),
    footer: assinatura(),
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
