/* ──────────────────────────────────────────────────────────────
 * Conversão de texto cru em valor tipado. Módulo PURO, sem banco e sem I/O.
 *
 * Vale aqui a MESMA régua de generalidade de `perfil.ts`: nenhum identificador
 * deste arquivo pode nomear seguro, apólice, prêmio ou seguradora. Quem lê uma
 * célula não sabe o que ela significa — sabe só como ela está escrita.
 *
 * ── A REGRA QUE GOVERNA O ARQUIVO INTEIRO ───────────────────────────────
 * Célula que não casa com o formato declarado devolve ERRO, nunca um palpite.
 * "1.234,56" lido como ISO daria 1.234 — três ordens de grandeza a menos, sem
 * exceção nenhuma no caminho, num campo de dinheiro. Preferimos a linha
 * rejeitada com motivo a um número errado gravado em silêncio.
 * ────────────────────────────────────────────────────────────── */

import type { FormatoValor } from "./perfil";

/** Sucesso traz o valor; falha traz o motivo, em português, para o relatório. */
export type ResultadoValor =
  | { readonly ok: true; readonly valor: string | number | boolean | Date | null }
  | { readonly ok: false; readonly erro: string };

const ok = (valor: string | number | boolean | Date | null): ResultadoValor => ({ ok: true, valor });
const falha = (erro: string): ResultadoValor => ({ ok: false, erro });

/** Célula vazia é ausência de dado, não erro: quem exige é o gravador. */
function vazio(bruto: string): boolean {
  return bruto.trim().length === 0;
}

function decimalPtbr(bruto: string): ResultadoValor {
  // "R$ 1.234,56" → 1234.56. O ponto é separador de milhar e some; a vírgula é
  // o decimal e vira ponto.
  const limpo = bruto.replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  if (limpo === "" || !Number.isFinite(n)) return falha(`decimal_ptbr não reconhece ${JSON.stringify(bruto)}`);
  return ok(n);
}

function decimalIso(bruto: string): ResultadoValor {
  // "1,234.56" → 1234.56. Espelho do caso acima: a vírgula é o milhar.
  const limpo = bruto.replace(/[^\d,.\-]/g, "").replace(/,/g, "");
  const n = Number(limpo);
  if (limpo === "" || !Number.isFinite(n)) return falha(`decimal_iso não reconhece ${JSON.stringify(bruto)}`);
  return ok(n);
}

function inteiro(bruto: string): ResultadoValor {
  const limpo = bruto.replace(/[^\d\-]/g, "");
  const n = Number(limpo);
  if (limpo === "" || !Number.isInteger(n)) return falha(`inteiro não reconhece ${JSON.stringify(bruto)}`);
  return ok(n);
}

/**
 * Monta a data em UTC ao meio-dia.
 *
 * Meio-dia e não meia-noite porque vigência é DIA, não instante: gravada como
 * 00:00Z, a mesma linha aparece como o dia anterior para quem lê em GMT-3 — e
 * um contrato que começou dia 1º passa a constar como do dia 31.
 */
function montarData(ano: number, mes: number, dia: number, bruto: string): ResultadoValor {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return falha(`data fora de faixa: ${JSON.stringify(bruto)}`);
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  // Rejeita 31/02, que o Date "corrige" para 03/03 sem avisar.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return falha(`data inexistente: ${JSON.stringify(bruto)}`);
  }
  return ok(d);
}

function partesData(bruto: string): number[] | null {
  const partes = bruto.trim().split(/[^\d]+/).filter((p) => p.length > 0);
  if (partes.length < 3) return null;
  return partes.slice(0, 3).map(Number);
}

function anoDeDoisDigitos(ano: number): number {
  // Planilha antiga escreve "05/03/24". 24 é 2024; 89 é 1989. O corte em 70 é
  // a convenção do POSIX e cobre data de nascimento sem inventar futuro.
  if (ano >= 100) return ano;
  return ano < 70 ? 2000 + ano : 1900 + ano;
}

function dataDdMmAaaa(bruto: string): ResultadoValor {
  const p = partesData(bruto);
  if (!p) return falha(`data_ddmmaaaa não reconhece ${JSON.stringify(bruto)}`);
  return montarData(anoDeDoisDigitos(p[2]), p[1], p[0], bruto);
}

function dataMmDdAaaa(bruto: string): ResultadoValor {
  const p = partesData(bruto);
  if (!p) return falha(`data_mmddaaaa não reconhece ${JSON.stringify(bruto)}`);
  return montarData(anoDeDoisDigitos(p[2]), p[0], p[1], bruto);
}

function dataIso(bruto: string): ResultadoValor {
  const p = partesData(bruto);
  if (!p) return falha(`data_iso não reconhece ${JSON.stringify(bruto)}`);
  return montarData(p[0], p[1], p[2], bruto);
}

/**
 * Documento: só os dígitos, e só se forem 11 (CPF) ou 14 (CNPJ).
 *
 * Comprimento errado NÃO passa. É este campo que casa a linha com a pessoa; um
 * documento truncado casaria com ninguém, ou pior, com outro alguém.
 */
function documentoDigitos(bruto: string): ResultadoValor {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) {
    return falha(
      `documento com ${digitos.length} dígitos (esperado 11 ou 14): ${JSON.stringify(bruto)}`,
    );
  }
  return ok(digitos);
}

const SIM = new Set(["sim", "s", "true", "1", "yes", "y", "verdadeiro"]);
const NAO = new Set(["nao", "não", "n", "false", "0", "no", "falso"]);

function booleanoSimNao(bruto: string): ResultadoValor {
  const chave = bruto.trim().toLowerCase();
  if (SIM.has(chave)) return ok(true);
  if (NAO.has(chave)) return ok(false);
  return falha(`booleano_sim_nao não reconhece ${JSON.stringify(bruto)}`);
}

/**
 * Converte uma célula segundo o formato declarado no perfil.
 *
 * Campo sem entrada em `formatosValor` chega aqui como `"texto"` — o padrão
 * silencioso do perfil.
 */
export function converterValor(bruto: string, formato: FormatoValor): ResultadoValor {
  if (vazio(bruto)) return ok(null);
  switch (formato) {
    case "texto":
      return ok(bruto.trim());
    case "decimal_ptbr":
      return decimalPtbr(bruto);
    case "decimal_iso":
      return decimalIso(bruto);
    case "inteiro":
      return inteiro(bruto);
    case "data_ddmmaaaa":
      return dataDdMmAaaa(bruto);
    case "data_mmddaaaa":
      return dataMmDdAaaa(bruto);
    case "data_iso":
      return dataIso(bruto);
    case "documento_digitos":
      return documentoDigitos(bruto);
    case "booleano_sim_nao":
      return booleanoSimNao(bruto);
  }
}
