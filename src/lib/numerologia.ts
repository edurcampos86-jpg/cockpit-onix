/**
 * Numerologia Pitagórica — cálculo dos 6 números a partir de nome + data de nascimento.
 *
 * Convenções aplicadas (escolhidas com Eduardo):
 * - Tabela Pitagórica clássica: A=1...I=9, J=1...R=9, S=1...Z=8
 * - Y é tratado SEMPRE como vogal (regra A — padrão Brasil)
 * - Master numbers preservados (não reduzidos): 11, 22, 33
 * - Kármicos rastreados: 13, 14, 16, 19 (quando aparecem antes da redução final)
 * - Caminho da Vida: soma direta de todos os dígitos de DD/MM/AAAA
 * - Ano Pessoal: dia + mês de nascimento + ano calendário, reduzido
 *
 * Esta lib é PURA (sem IO, sem dependências externas) — fácil de testar.
 */

// Tabela Pitagórica
const LETRA_VALOR: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
  S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8,
};

// Y entra como vogal (decisão de Eduardo).
const VOGAIS = new Set(["A", "E", "I", "O", "U", "Y"]);

const MASTER = new Set([11, 22, 33]);
const KARMICOS = new Set([13, 14, 16, 19]);

/**
 * Remove acentos e diacríticos. Mantém ç → c, ã → a, etc.
 * Resultado em maiúsculas, apenas letras A-Z.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos combinantes
    .toUpperCase()
    .replace(/[^A-Z]/g, ""); // mantém só A-Z
}

function somarDigitos(n: number): number {
  let total = 0;
  let x = Math.abs(n);
  while (x > 0) {
    total += x % 10;
    x = Math.floor(x / 10);
  }
  return total;
}

/**
 * Reduz um número aplicando regras Pitagóricas:
 * - Se já é master (11, 22, 33) ou < 10: retorna como está
 * - Caso contrário, soma dígitos repetidamente até < 10 ou virar master
 */
export function reduzir(n: number): number {
  let x = n;
  if (MASTER.has(x)) return x;
  while (x >= 10) {
    x = somarDigitos(x);
    if (MASTER.has(x)) return x;
  }
  return x;
}

/**
 * Reduz e retorna metadata: número final + se passou por master + se passou por kármico.
 * Útil para detectar dívidas kármicas no caminho do cálculo.
 */
export function reduzirComRastreio(n: number): {
  resultado: number;
  passouPorKarmico: number | null;
  passouPorMaster: number | null;
  somaInicial: number;
} {
  const somaInicial = n;
  let passouPorKarmico: number | null = null;
  let passouPorMaster: number | null = null;

  // Detectar kármico/master na soma inicial (antes de qualquer redução)
  if (KARMICOS.has(n)) passouPorKarmico = n;
  if (MASTER.has(n)) passouPorMaster = n;

  let x = n;
  if (MASTER.has(x)) return { resultado: x, passouPorKarmico, passouPorMaster, somaInicial };

  while (x >= 10) {
    x = somarDigitos(x);
    if (MASTER.has(x)) {
      passouPorMaster = passouPorMaster ?? x;
      return { resultado: x, passouPorKarmico, passouPorMaster, somaInicial };
    }
    if (KARMICOS.has(x)) passouPorKarmico = passouPorKarmico ?? x;
  }

  return { resultado: x, passouPorKarmico, passouPorMaster, somaInicial };
}

/**
 * Caminho da Vida — soma direta de todos os dígitos da data de nascimento.
 */
export function calcularCaminhoVida(data: Date): {
  numero: number;
  passouPorKarmico: number | null;
  passouPorMaster: number | null;
} {
  const yyyy = data.getUTCFullYear();
  const mm = data.getUTCMonth() + 1;
  const dd = data.getUTCDate();
  const soma = somarDigitos(yyyy) + somarDigitos(mm) + somarDigitos(dd);
  const r = reduzirComRastreio(soma);
  return {
    numero: r.resultado,
    passouPorKarmico: r.passouPorKarmico,
    passouPorMaster: r.passouPorMaster,
  };
}

/**
 * Expressão — soma dos valores numéricos de TODAS as letras do nome completo.
 */
export function calcularExpressao(nome: string): {
  numero: number;
  passouPorKarmico: number | null;
  passouPorMaster: number | null;
} {
  const limpo = normalizarNome(nome);
  let soma = 0;
  for (const ch of limpo) soma += LETRA_VALOR[ch] ?? 0;
  const r = reduzirComRastreio(soma);
  return {
    numero: r.resultado,
    passouPorKarmico: r.passouPorKarmico,
    passouPorMaster: r.passouPorMaster,
  };
}

/**
 * Alma / Motivação — soma dos valores das VOGAIS (Y entra).
 */
export function calcularAlma(nome: string): {
  numero: number;
  passouPorKarmico: number | null;
  passouPorMaster: number | null;
} {
  const limpo = normalizarNome(nome);
  let soma = 0;
  for (const ch of limpo) {
    if (VOGAIS.has(ch)) soma += LETRA_VALOR[ch] ?? 0;
  }
  const r = reduzirComRastreio(soma);
  return {
    numero: r.resultado,
    passouPorKarmico: r.passouPorKarmico,
    passouPorMaster: r.passouPorMaster,
  };
}

/**
 * Personalidade — soma dos valores das CONSOANTES.
 */
export function calcularPersonalidade(nome: string): {
  numero: number;
  passouPorKarmico: number | null;
  passouPorMaster: number | null;
} {
  const limpo = normalizarNome(nome);
  let soma = 0;
  for (const ch of limpo) {
    if (!VOGAIS.has(ch)) soma += LETRA_VALOR[ch] ?? 0;
  }
  const r = reduzirComRastreio(soma);
  return {
    numero: r.resultado,
    passouPorKarmico: r.passouPorKarmico,
    passouPorMaster: r.passouPorMaster,
  };
}

/**
 * Ano Pessoal — soma do dia + mês de nascimento + ano calendário, reduzido.
 * Recalcular anualmente.
 */
export function calcularAnoPessoal(data: Date, anoCalendario: number): {
  numero: number;
  passouPorKarmico: number | null;
  passouPorMaster: number | null;
} {
  const mm = data.getUTCMonth() + 1;
  const dd = data.getUTCDate();
  const soma = somarDigitos(dd) + somarDigitos(mm) + somarDigitos(anoCalendario);
  const r = reduzirComRastreio(soma);
  return {
    numero: r.resultado,
    passouPorKarmico: r.passouPorKarmico,
    passouPorMaster: r.passouPorMaster,
  };
}

/**
 * Resultado completo da numerologia para uma pessoa.
 */
export type NumerologiaCompleta = {
  caminhoVida: number;
  expressao: number;
  alma: number;
  personalidade: number;
  anoPessoal: number;
  anoPessoalRef: number; // ano calendário usado
  karmicos: number[]; // únicos, ordenados
  masterNumbers: number[]; // únicos, ordenados
};

/**
 * Calcula todos os 6 números da numerologia Pitagórica.
 *
 * @param nome  Nome completo (acentos serão removidos automaticamente)
 * @param dataNascimento Data de nascimento (em UTC)
 * @param anoCalendario Ano usado para Ano Pessoal — default = ano atual
 */
export function calcularNumerologia(
  nome: string,
  dataNascimento: Date,
  anoCalendario: number = new Date().getUTCFullYear(),
): NumerologiaCompleta {
  const cv = calcularCaminhoVida(dataNascimento);
  const expr = calcularExpressao(nome);
  const alma = calcularAlma(nome);
  const pers = calcularPersonalidade(nome);
  const ap = calcularAnoPessoal(dataNascimento, anoCalendario);

  const karmicos = [...new Set(
    [cv, expr, alma, pers, ap].map((r) => r.passouPorKarmico).filter((k): k is number => k !== null),
  )].sort((a, b) => a - b);

  const masterNumbers = [...new Set(
    [cv, expr, alma, pers, ap].map((r) => r.passouPorMaster).filter((m): m is number => m !== null),
  )].sort((a, b) => a - b);

  return {
    caminhoVida: cv.numero,
    expressao: expr.numero,
    alma: alma.numero,
    personalidade: pers.numero,
    anoPessoal: ap.numero,
    anoPessoalRef: anoCalendario,
    karmicos,
    masterNumbers,
  };
}

/**
 * Descrição curta de cada número (1-9 + master 11/22/33). Para tooltip / hint na UI.
 */
export const NUMERO_DESCRICAO: Record<number, string> = {
  1: "Liderança, independência, pioneirismo",
  2: "Cooperação, sensibilidade, parceria",
  3: "Comunicação, criatividade, expressão",
  4: "Estrutura, disciplina, trabalho duro",
  5: "Liberdade, mudança, aventura",
  6: "Responsabilidade, família, harmonia",
  7: "Análise, espiritualidade, introspecção",
  8: "Poder, ambição, materialização",
  9: "Humanitarismo, conclusão, sabedoria",
  11: "Mestre intuitivo — iluminação espiritual",
  22: "Mestre construtor — visão prática em grande escala",
  33: "Mestre instrutor — serviço humanitário",
};

export const KARMICO_DESCRICAO: Record<number, string> = {
  13: "Dívida cármica do trabalho — esforço para superar inércia/preguiça",
  14: "Dívida cármica do excesso — disciplina para evitar abuso de prazeres",
  16: "Dívida cármica do ego — humildade e revisão de orgulho",
  19: "Dívida cármica do poder — usar autoridade com responsabilidade",
};
