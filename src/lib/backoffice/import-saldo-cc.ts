import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { sendSlackMessage } from "@/lib/integrations/slack";
import { mapRowToCliente, detectarTipoArquivo } from "./xlsx-mapping";
import { parseValorFinanceiro } from "./parse-financeiro";
import { contaCanonica, variacoesConta } from "./conta";
import { gateSanidadeSaldoCc } from "./import-sanity";
import { upsertPorPolitica } from "./upsert-cliente";

/**
 * Import server-side do XLSX "Saldo em CC" — caminho da automação (Cowork).
 *
 * Diferente do fluxo da UI (parse no browser + POST JSON), aqui o arquivo
 * chega inteiro e o parse usa o MESMO xlsx-mapping.ts do frontend — fonte
 * única de verdade pros cabeçalhos, sem drift entre os dois caminhos.
 *
 * Escopo deliberadamente mínimo: SÓ saldo_em_cc, SÓ update (sem match =
 * órfão, nunca cria), e o payload por cliente é só { saldoConta } — a
 * FIELD_SOURCE_POLICY continua de guarda, mas nem chega a ser testada por
 * outros campos. Pior caso de abuso = sobrescrever saldoConta, com o gate
 * de sanidade na frente.
 */

/** Achata os tipos de célula do exceljs pra um valor primitivo. */
function cellPlain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return v.text; // hyperlink
    if ("result" in v) return v.result; // fórmula → valor calculado
    if ("error" in v) return undefined;
  }
  return v;
}

/** Lê a primeira worksheet em linhas { header: valor }, header da linha 1. */
export async function parseXlsxRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = String(cellPlain(cell.value) ?? "").trim();
  });

  const rows: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let temAlgo = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = headers[col];
      if (!h) return;
      const v = cellPlain(cell.value);
      if (v === undefined || v === "") return;
      obj[h] = v;
      temAlgo = true;
    });
    if (temAlgo) rows.push(obj);
  });
  return rows;
}

/**
 * Linhas brutas → { numeroConta canônica, saldoConta } com o MESMO mapping
 * da UI. Pura (sem DB) pra ser smoke-testável isolada.
 */
export function mapearLinhasSaldoCc(rows: Record<string, unknown>[]): {
  linhas: Array<{ numeroConta: string; saldoConta: number }>;
  headersDesconhecidos: string[];
} {
  const desconhecidos = new Set<string>();
  const linhas: Array<{ numeroConta: string; saldoConta: number }> = [];
  for (const row of rows) {
    const mapped = mapRowToCliente(row);
    for (const h of mapped.headersDesconhecidos) desconhecidos.add(h);
    const contaRaw = String(mapped.data.numeroConta ?? "").trim();
    if (!/^\d+$/.test(contaRaw)) continue;
    // No Saldo em CC o header "Saldo" mapeia pra `saldo` (PL), mas o
    // significado real é saldoConta — mesmo swap do fluxo da UI.
    const valor = parseValorFinanceiro(mapped.data.saldoConta ?? mapped.data.saldo);
    if (valor === undefined) continue;
    linhas.push({ numeroConta: contaCanonica(contaRaw), saldoConta: valor });
  }
  return { linhas, headersDesconhecidos: [...desconhecidos] };
}

export interface ResultadoImportSaldoCc {
  ok: boolean;
  /** Status HTTP sugerido pro caller. */
  status: number;
  fonteDetectada: string;
  motivoDeteccao: string;
  recebidas: number;
  validas: number;
  atualizados: number;
  noop: number;
  orfaos: number;
  camposBloqueados: Record<string, number>;
  headersDesconhecidos: string[];
  erro?: string;
}

export async function importarSaldoCcDeXlsx(buffer: Buffer): Promise<ResultadoImportSaldoCc> {
  const base: Omit<ResultadoImportSaldoCc, "ok" | "status"> = {
    fonteDetectada: "desconhecido",
    motivoDeteccao: "",
    recebidas: 0,
    validas: 0,
    atualizados: 0,
    noop: 0,
    orfaos: 0,
    camposBloqueados: {},
    headersDesconhecidos: [],
  };

  const rows = await parseXlsxRows(buffer);
  base.recebidas = rows.length;
  if (rows.length === 0) {
    return { ...base, ok: false, status: 422, erro: "Planilha sem linhas de dados." };
  }

  // Headers = união das primeiras linhas (linha 1 pode vir esparsa).
  const headers = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))];
  const det = detectarTipoArquivo(headers);
  base.fonteDetectada = det.fonte;
  base.motivoDeteccao = det.motivo;
  if (det.fonte !== "saldo_em_cc") {
    return {
      ...base,
      ok: false,
      status: 422,
      erro:
        `Este endpoint importa SOMENTE o relatório "Saldo em CC". ` +
        `Arquivo detectado como "${det.fonte}" (${det.motivo}). Nada foi importado.`,
    };
  }

  const { linhas, headersDesconhecidos } = mapearLinhasSaldoCc(rows);
  base.validas = linhas.length;
  base.headersDesconhecidos = headersDesconhecidos.slice(0, 10);

  const gate = await gateSanidadeSaldoCc({
    recebidas: rows.length,
    validas: linhas.length,
    baseAtual: await prisma.clienteBackoffice.count(),
  });
  if (!gate.ok) {
    await avisarSlack(`⚠️ *Import automático Saldo em CC rejeitado pelo gate*\n${gate.erro}`);
    return { ...base, ok: false, status: 422, erro: gate.erro };
  }

  for (const linha of linhas) {
    // Update-only: sem match = órfão (upsertPorPolitica criaria — filtra antes).
    const existente = await prisma.clienteBackoffice.findFirst({
      where: { numeroConta: { in: variacoesConta(linha.numeroConta) } },
      select: { id: true },
    });
    if (!existente) {
      base.orfaos++;
      continue;
    }
    const res = await upsertPorPolitica({
      numeroConta: linha.numeroConta,
      dadosImportados: { saldoConta: linha.saldoConta },
      fonte: "saldo_em_cc",
    });
    if (res.acao === "update") base.atualizados++;
    else base.noop++;
    for (const b of res.camposBloqueados) {
      base.camposBloqueados[b.campo] = (base.camposBloqueados[b.campo] ?? 0) + 1;
    }
  }

  console.log("[import-saldo-cc automático]", {
    recebidas: base.recebidas,
    validas: base.validas,
    atualizados: base.atualizados,
    noop: base.noop,
    orfaos: base.orfaos,
  });
  await avisarSlack(
    `✅ *Import automático Saldo em CC*: ${base.atualizados} atualizados, ` +
      `${base.noop} sem mudança, ${base.orfaos} órfãos (de ${base.recebidas} linhas).`,
  );

  return { ...base, ok: true, status: 200 };
}

/** Slack é visibilidade, não gate — falha de webhook nunca derruba o import. */
async function avisarSlack(msg: string): Promise<void> {
  try {
    await sendSlackMessage(msg);
  } catch (e) {
    console.error("[import-saldo-cc] aviso Slack falhou:", e);
  }
}
