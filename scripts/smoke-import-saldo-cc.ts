/**
 * Smoke test do parse server-side do Saldo em CC — SEM banco.
 * Gera um XLSX sintético em memória no formato oficial BTG e valida:
 * parse → detecção de fonte → mapeamento → swap saldo→saldoConta.
 *
 * Rodar: npx tsx --conditions=react-server scripts/smoke-import-saldo-cc.ts
 */
import ExcelJS from "exceljs";
import { parseXlsxRows, mapearLinhasSaldoCc } from "../src/lib/backoffice/import-saldo-cc";
import { detectarTipoArquivo } from "../src/lib/backoffice/xlsx-mapping";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`✗ FALHOU: ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Saldo");
  // Formato oficial BTG "Saldo em CC": poucas colunas, Saldo + PL.
  ws.addRow(["Conta", "Cliente", "Saldo", "Patrimônio Líquido Total"]);
  ws.addRow(["002870286", "Cliente Um", 1234.56, 100000]); // número nativo
  ws.addRow(["2870287", "Cliente Dois", "1.234,56-", "50.000,00"]); // string BR + negativo BTG
  ws.addRow(["", "Linha sem conta", 10, 10]); // inválida: sem conta
  ws.addRow(["2870288", "Cliente Três", "", ""]); // inválida: sem saldo
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const rows = await parseXlsxRows(buffer);
  assert(rows.length === 4, `parse: 4 linhas de dados (veio ${rows.length})`);

  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const det = detectarTipoArquivo(headers);
  assert(det.fonte === "saldo_em_cc", `detecção: saldo_em_cc (veio ${det.fonte} — ${det.motivo})`);

  const { linhas } = mapearLinhasSaldoCc(rows);
  assert(linhas.length === 2, `mapeamento: 2 válidas (veio ${linhas.length})`);
  assert(
    linhas[0].numeroConta === "002870286" && linhas[0].saldoConta === 1234.56,
    `linha 1: conta canônica + saldo numérico (veio ${JSON.stringify(linhas[0])})`,
  );
  assert(
    linhas[1].numeroConta === "002870287" && linhas[1].saldoConta === -1234.56,
    `linha 2: pad9 + "1.234,56-" → -1234.56 (veio ${JSON.stringify(linhas[1])})`,
  );

  // Arquivo errado (Base BTG) tem que ser recusado pela detecção.
  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet("Base");
  ws2.addRow(["Conta", "Nome", "PL Total", "Renda Fixa", "Fundos"]);
  ws2.addRow(["123", "X", 1, 1, 1]);
  const rows2 = await parseXlsxRows(Buffer.from(await wb2.xlsx.writeBuffer()));
  const det2 = detectarTipoArquivo([...new Set(rows2.flatMap((r) => Object.keys(r)))]);
  assert(det2.fonte === "base_btg", `arquivo errado detectado como base_btg (veio ${det2.fonte})`);

  console.log("\nSMOKE OK");
}

main().catch((e) => {
  console.error("✗ erro inesperado:", e);
  process.exit(1);
});
