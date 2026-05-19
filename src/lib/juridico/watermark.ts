import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

/**
 * Watermark dinâmico via pdf-lib — modifica o PDF in-memory antes de stream.
 *
 * Por que pdf-lib e não pdf-to-img + sharp:
 *  - Sem dependência nativa (pdfjs/canvas) — funciona em qualquer runtime serverless
 *  - Mais leve (CPU/memória) — não rasteriza páginas em PNG 300dpi
 *  - Watermark fica VETORIAL → escala bem, não pixela em zoom
 *  - PDF de saída tem texto selecionável (browser exibe normalmente)
 *
 * O preço pago: o watermark é uma camada PDF, então um atacante motivado e
 * técnico pode editá-lo no Adobe Acrobat. Não é proteção criptográfica —
 * é INTIMIDAÇÃO LEGAL + AUDIT TRAIL. Cada PDF que sai tem nome+email+IP+ts
 * impresso, então se vazar dá pra rastrear quem foi.
 *
 * Configuração via env:
 *   WATERMARK_OPACITY    (0.0 a 1.0)  default 0.15
 *   WATERMARK_FONT_SIZE  (em pontos)  default 18
 *   WATERMARK_ANGLE      (graus)      default -30
 *   WATERMARK_LINHAS     (qtd repete) default 6
 */

export type WatermarkPayload = {
  nomeUsuario: string;
  email: string;
  ipAddress: string;
  timestamp: Date;
};

const DEFAULTS = {
  opacity: 0.15,
  fontSize: 18,
  angleDeg: -30,
  linhas: 6,
};

function readEnv() {
  return {
    opacity: clamp(
      Number(process.env.WATERMARK_OPACITY ?? DEFAULTS.opacity),
      0.05,
      0.5,
      DEFAULTS.opacity
    ),
    fontSize: clamp(
      Number(process.env.WATERMARK_FONT_SIZE ?? DEFAULTS.fontSize),
      8,
      48,
      DEFAULTS.fontSize
    ),
    angleDeg: clamp(
      Number(process.env.WATERMARK_ANGLE ?? DEFAULTS.angleDeg),
      -90,
      90,
      DEFAULTS.angleDeg
    ),
    linhas: clamp(
      Number(process.env.WATERMARK_LINHAS ?? DEFAULTS.linhas),
      2,
      16,
      DEFAULTS.linhas
    ),
  };
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function fmtTimestamp(d: Date): string {
  // 19/05/2026 14:32 UTC — usa UTC porque o servidor pode estar em qualquer zona
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

/**
 * Aplica watermark diagonal repetido em TODAS as páginas do PDF e devolve
 * o buffer modificado. Idempotente: chamar 2x adiciona 2x — caller é
 * responsável por chamar 1x por request.
 */
export async function aplicarWatermark(
  pdfBuffer: Buffer,
  payload: WatermarkPayload
): Promise<Buffer> {
  const cfg = readEnv();
  const linha1 = `${payload.nomeUsuario}  |  ${payload.email}`;
  const linha2 = `${fmtTimestamp(payload.timestamp)}  |  IP ${payload.ipAddress}`;

  // Tentar carregar; alguns PDFs vêm com objetos cifrados (Acrobat com password)
  // que pdf-lib rejeita por default. Usar ignoreEncryption pra contratos típicos.
  const pdf = await PDFDocument.load(new Uint8Array(pdfBuffer), {
    ignoreEncryption: true,
  });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const stepY = height / (cfg.linhas + 1);
    const angleRad = (cfg.angleDeg * Math.PI) / 180;

    for (let i = 1; i <= cfg.linhas; i++) {
      const y = stepY * i;

      // Linha 1 (nome+email)
      desenharRotacionado(page, font, linha1, {
        cx: width / 2,
        cy: y + cfg.fontSize * 0.6,
        fontSize: cfg.fontSize,
        angleRad,
        opacity: cfg.opacity,
      });
      // Linha 2 (timestamp + IP)
      desenharRotacionado(page, font, linha2, {
        cx: width / 2,
        cy: y - cfg.fontSize * 0.6,
        fontSize: cfg.fontSize * 0.7,
        angleRad,
        opacity: cfg.opacity,
      });
    }

    // Faixa preta no rodapé com texto branco — não passa despercebida
    const rodape = `CONFIDENCIAL — ${payload.nomeUsuario} (${payload.email}) — ${fmtTimestamp(payload.timestamp)} — IP ${payload.ipAddress}`;
    const rodapeFontSize = 7;
    const rodapeAltura = rodapeFontSize + 6;
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: rodapeAltura,
      color: rgb(0, 0, 0),
      opacity: 0.85,
    });
    page.drawText(rodape, {
      x: 8,
      y: 4,
      size: rodapeFontSize,
      font,
      color: rgb(1, 1, 1),
    });
  }

  const out = await pdf.save();
  return Buffer.from(out);
}

function desenharRotacionado(
  page: import("pdf-lib").PDFPage,
  font: import("pdf-lib").PDFFont,
  text: string,
  opts: {
    cx: number;
    cy: number;
    fontSize: number;
    angleRad: number;
    opacity: number;
  }
): void {
  const textWidth = font.widthOfTextAtSize(text, opts.fontSize);
  // Posiciona o texto centralizado no ponto (cx, cy) considerando a rotação.
  // pdf-lib desenha do canto inferior-esquerdo do baseline; rotação é em
  // torno desse mesmo ponto. Pra centralizar visualmente, deslocamos
  // por -textWidth/2 ao longo do eixo X rotacionado.
  const dx = -(textWidth / 2) * Math.cos(opts.angleRad);
  const dy = -(textWidth / 2) * Math.sin(opts.angleRad);

  page.drawText(text, {
    x: opts.cx + dx,
    y: opts.cy + dy,
    size: opts.fontSize,
    font,
    rotate: degrees((opts.angleRad * 180) / Math.PI),
    color: rgb(0.1, 0.1, 0.1),
    opacity: opts.opacity,
  });
}
