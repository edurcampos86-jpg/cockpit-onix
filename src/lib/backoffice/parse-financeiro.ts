/**
 * Parser único pra valores financeiros vindos de XLSX/CSV (BTG, Excel manual,
 * etc.). Suporta os formatos que aparecem na base BTG:
 *
 *   "1234.56"          → 1234.56
 *   "1.234,56"         → 1234.56     (pt-BR)
 *   "1,234.56"         → 1234.56     (en-US)
 *   "R$ 1.234,56"      → 1234.56
 *   "-1.234,56"        → -1234.56
 *   "-R$ 1.234,56"     → -1234.56
 *   "R$ -1.234,56"     → -1234.56
 *   "(1.234,56)"       → -1234.56    (contábil — parênteses indicam negativo)
 *   "1.234,56-"        → -1234.56    (alguns exports BTG colam o sinal no fim)
 *   ""                 → undefined
 *   "—" / "-"          → undefined
 *
 * Devolve `undefined` quando o conteúdo é vazio ou não-numérico. Nunca devolve
 * NaN, e NUNCA devolve 0 silenciosamente — call site decide se vai usar
 * `?? 0` ou preservar o saldo anterior. Mascarar NaN como 0 era a causa raiz
 * da divergência de R$ 1.033.649,57 vs BTG (negativos descartados, falhas de
 * parse viradas em zero).
 */
export function parseValorFinanceiro(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;

  let s = String(v).trim();
  if (s.length === 0) return undefined;
  // Traços/em-dash que o BTG usa pra "vazio"
  if (s === "-" || s === "—" || s === "–") return undefined;

  let negativo = false;

  // Contábil: (1.234,56) → -1234.56
  if (s.startsWith("(") && s.endsWith(")")) {
    negativo = true;
    s = s.slice(1, -1).trim();
  }

  // Sinal no fim: 1.234,56- → -1234.56
  if (s.endsWith("-")) {
    negativo = !negativo;
    s = s.slice(0, -1).trim();
  }

  // Remove símbolo da moeda e espaços, mas preserva sinal explícito no início
  s = s.replace(/R\$/gi, "").replace(/BRL/gi, "").trim();

  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  if (s.length === 0) return undefined;

  // A essa altura `s` só deve ter dígitos, pontos e vírgulas.
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let normalizado: string;

  if (dots > 1 && commas === 0) {
    // pt-BR sem decimal: "1.234.567" → 1234567
    normalizado = s.replace(/\./g, "");
  } else if (commas > 1 && dots === 0) {
    // en-US sem decimal: "1,234,567" → 1234567
    normalizado = s.replace(/,/g, "");
  } else if (dots > 0 && commas > 0) {
    // Ambos presentes — o último é o separador decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // pt-BR: "1.234,56"
      normalizado = s.replace(/\./g, "").replace(",", ".");
    } else {
      // en-US: "1,234.56"
      normalizado = s.replace(/,/g, "");
    }
  } else if (commas === 1) {
    // Vírgula única → tratamos como decimal pt-BR ("12,34" → 12.34)
    normalizado = s.replace(",", ".");
  } else if (dots === 1) {
    // Ponto único — ambíguo entre milhar e decimal. Heurística: se vier
    // exatamente "Xddd" (3 dígitos), assume milhar pt-BR. Senão, decimal.
    const partes = s.split(".");
    if (partes[1] && /^\d{3}$/.test(partes[1])) {
      normalizado = s.replace(".", "");
    } else {
      normalizado = s;
    }
  } else {
    // Sem . nem ,
    normalizado = s;
  }

  // Após normalização só são válidos dígitos e UM ponto
  if (!/^\d+(\.\d+)?$/.test(normalizado)) return undefined;

  const n = parseFloat(normalizado);
  if (!Number.isFinite(n)) return undefined;

  return negativo ? -n : n;
}

/**
 * Detecta se a string original tinha conteúdo de pendência cadastral
 * "verdadeira". O campo `pendenciaCadastral` vem do BTG/Excel como texto
 * livre — pode ser "Sim", "Não", "Sem pendência", "Validar suitability",
 * vazio, etc. Esta função retorna `true` quando há pendência ativa.
 */
export function temPendenciaCadastral(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  if (s.length === 0) return false;
  // Negativos comuns
  if (s === "nao" || s === "não" || s === "n" || s === "no") return false;
  if (s === "sem pendencia" || s === "sem pendência") return false;
  if (s === "ok" || s === "regular" || s === "completo") return false;
  if (s === "-" || s === "—" || s === "0") return false;
  return true;
}
