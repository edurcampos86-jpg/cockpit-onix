/**
 * Testes da política multi-fonte (FIELD_SOURCE_POLICY + display-name +
 * detectarTipoArquivo).
 *
 * Como rodar:
 *   tsx scripts/test-multi-fonte.ts
 *
 * Cobertura intencional:
 *   - getNomeRelacionamento prioridade (apelido > nome > nomeCompleto > "Cliente")
 *   - getNomeFormal prioridade (nomeCompleto > nome > "Cliente")
 *   - FIELD_SOURCE_POLICY bloqueia fonte errada
 *   - apelido só é editável por fonte=manual
 *   - detectarTipoArquivo identifica Base/Informacoes/Saldo
 *   - Validação de apelido: max 50, trim, null
 *
 * Sem testes de DB end-to-end (sem creds nem dados de fixtures).
 */
import {
  getNomeRelacionamento,
  getNomeFormal,
  getPrimeiroNomeRelacionamento,
} from "../src/lib/backoffice/display-name";
import { FIELD_SOURCE_POLICY, type FonteImport } from "../src/lib/backoffice/field-source-policy";
import { detectarTipoArquivo } from "../src/lib/backoffice/xlsx-mapping";

let totalOk = 0;
let totalFail = 0;

function eq(rotulo: string, atual: unknown, esperado: unknown) {
  const ok = JSON.stringify(atual) === JSON.stringify(esperado);
  if (ok) {
    totalOk++;
    console.log(`  ✓ ${rotulo}`);
  } else {
    totalFail++;
    console.error(`  ✗ ${rotulo}: esperado ${JSON.stringify(esperado)}, recebeu ${JSON.stringify(atual)}`);
  }
}

console.log("\n— getNomeRelacionamento —");
eq(
  "apelido vence nome e nomeCompleto",
  getNomeRelacionamento({ apelido: "Pimenta", nome: "Luiz Fernando", nomeCompleto: "Luiz Fernando Pimenta de Souza" }),
  "Pimenta",
);
eq(
  "sem apelido cai pra nome",
  getNomeRelacionamento({ apelido: null, nome: "Luiz Fernando", nomeCompleto: "Luiz Fernando Pimenta de Souza" }),
  "Luiz Fernando",
);
eq(
  "só nomeCompleto",
  getNomeRelacionamento({ apelido: null, nome: null, nomeCompleto: "Luiz Fernando Pimenta de Souza" }),
  "Luiz Fernando Pimenta de Souza",
);
eq(
  "vazio total devolve 'Cliente'",
  getNomeRelacionamento({ apelido: null, nome: null, nomeCompleto: null }),
  "Cliente",
);
eq(
  "apelido com espaço é trimado",
  getNomeRelacionamento({ apelido: "  Pimenta  ", nome: "Luiz" }),
  "Pimenta",
);
eq(
  "apelido vazio (só espaços) ignorado",
  getNomeRelacionamento({ apelido: "   ", nome: "Luiz" }),
  "Luiz",
);

console.log("\n— getNomeFormal —");
eq(
  "ignora apelido, prefere nomeCompleto",
  getNomeFormal({ nomeCompleto: "Luiz Fernando Pimenta de Souza", nome: "Luiz Fernando" }),
  "Luiz Fernando Pimenta de Souza",
);
eq(
  "sem nomeCompleto cai pra nome",
  getNomeFormal({ nomeCompleto: null, nome: "Luiz Fernando" }),
  "Luiz Fernando",
);
eq(
  "vazio devolve 'Cliente'",
  getNomeFormal({ nomeCompleto: null, nome: null }),
  "Cliente",
);

console.log("\n— getPrimeiroNomeRelacionamento —");
eq("nome composto pega primeiro", getPrimeiroNomeRelacionamento({ nome: "Roberto Souza Silva" }), "Roberto");
eq("apelido único", getPrimeiroNomeRelacionamento({ apelido: "Pimenta", nome: "Luiz" }), "Pimenta");

console.log("\n— FIELD_SOURCE_POLICY (whitelist por campo) —");
// Helper: verifica se uma fonte pode escrever um campo
function podeEscrever(campo: string, fonte: FonteImport): boolean {
  return FIELD_SOURCE_POLICY[campo]?.includes(fonte) ?? false;
}

eq("apelido só editável manualmente", podeEscrever("apelido", "manual"), true);
eq("apelido NÃO editável por base_btg", podeEscrever("apelido", "base_btg"), false);
eq("apelido NÃO editável por informacoes", podeEscrever("apelido", "informacoes"), false);
eq("apelido NÃO editável por saldo_em_cc", podeEscrever("apelido", "saldo_em_cc"), false);

eq("nome (curto) só por base_btg", podeEscrever("nome", "base_btg"), true);
eq("nome NÃO escrito por informacoes", podeEscrever("nome", "informacoes"), false);

eq("nomeCompleto só por informacoes", podeEscrever("nomeCompleto", "informacoes"), true);
eq("nomeCompleto NÃO por base_btg", podeEscrever("nomeCompleto", "base_btg"), false);

eq("saldoConta primário é saldo_em_cc", FIELD_SOURCE_POLICY.saldoConta?.[0], "saldo_em_cc");
eq("saldoConta secundário é base_btg", FIELD_SOURCE_POLICY.saldoConta?.[1], "base_btg");
eq("saldoConta NÃO editável manualmente", podeEscrever("saldoConta", "manual"), false);

eq("pendenciaCadastral só por informacoes", podeEscrever("pendenciaCadastral", "informacoes"), true);
eq("pendenciaCadastral NÃO por base_btg", podeEscrever("pendenciaCadastral", "base_btg"), false);

eq("fundos só por base_btg", podeEscrever("fundos", "base_btg"), true);
eq("fundos NÃO por informacoes", podeEscrever("fundos", "informacoes"), false);

eq("campo não declarado bloqueia tudo", podeEscrever("campoQueNaoExiste", "manual"), false);

console.log("\n— detectarTipoArquivo —");
const detBase = detectarTipoArquivo([
  "Conta", "Cliente", "PL Total", "Renda Fixa", "Fundos", "Renda Variável",
  "Previdência", "Aportes", "Retiradas", "Qtd Ativos", "CGE", "Escritório",
]);
eq("Base BTG detectada", detBase.fonte, "base_btg");

const detInfo = detectarTipoArquivo([
  "Conta", "Nome Completo", "CPF", "Perfil Suitability", "Pendência Cadastral",
  "Ativação Conta", "Idade", "Nacionalidade", "Endereço",
]);
eq("Informações detectada", detInfo.fonte, "informacoes");

const detInfoSemAcento = detectarTipoArquivo([
  "Conta", "Nome Completo", "Perfil Suitability", "Pendencia Cadastral",
]);
eq("Informações detectada (sem acento)", detInfoSemAcento.fonte, "informacoes");

const detSaldoCC = detectarTipoArquivo([
  "Conta", "Cliente", "Saldo", "Patrimônio Líquido Total",
]);
eq("Saldo_em_CC detectada (poucas colunas)", detSaldoCC.fonte, "saldo_em_cc");

const detDesconhecido = detectarTipoArquivo(["foo", "bar", "baz"]);
eq("XLSX random → desconhecido", detDesconhecido.fonte, "desconhecido");

console.log("\n— Validação apelido (regras do endpoint PATCH) —");
function validarApelido(raw: unknown): { ok: boolean; valor?: string | null; erro?: string } {
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return { ok: false, erro: "Apelido deve ser string ou null" };
  }
  const trim = typeof raw === "string" ? raw.trim() : null;
  if (trim && trim.length > 50) {
    return { ok: false, erro: "Apelido muito longo (max 50 caracteres)" };
  }
  return { ok: true, valor: trim && trim.length > 0 ? trim : null };
}

eq("apelido normal OK", validarApelido("Pimenta"), { ok: true, valor: "Pimenta" });
eq("apelido com espaços nas pontas → trim", validarApelido("  Pimenta  "), { ok: true, valor: "Pimenta" });
eq("apelido vazio (só espaços) → null", validarApelido("   "), { ok: true, valor: null });
eq("string vazia → null", validarApelido(""), { ok: true, valor: null });
eq("null explícito → null", validarApelido(null), { ok: true, valor: null });
eq("undefined → null", validarApelido(undefined), { ok: true, valor: null });
eq(
  "apelido 50 chars OK",
  validarApelido("a".repeat(50)),
  { ok: true, valor: "a".repeat(50) },
);
eq(
  "apelido 51 chars rejeita",
  validarApelido("a".repeat(51)),
  { ok: false, erro: "Apelido muito longo (max 50 caracteres)" },
);
eq(
  "número rejeita",
  validarApelido(42),
  { ok: false, erro: "Apelido deve ser string ou null" },
);

console.log(`\nTotal: ${totalOk} passou, ${totalFail} falhou`);
if (totalFail > 0) process.exit(1);
