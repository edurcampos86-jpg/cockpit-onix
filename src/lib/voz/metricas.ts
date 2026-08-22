/**
 * Métricas determinísticas sobre as falas do Eduardo.
 *
 * POR QUE NÃO DEIXAR TUDO PRA IA: "ele usa muito a analogia do X" é uma
 * afirmação de frequência, e frequência se conta, não se acha. O que a IA faz
 * bem é NOMEAR o padrão e escrever a regra de redação; o que ela faz mal é
 * estimar quantas vezes algo apareceu. Então este módulo produz os números, e
 * o prompt recebe os números já prontos — a IA descreve, não estima.
 *
 * Tudo aqui roda sobre texto JÁ ANONIMIZADO (`anonimizar.ts`).
 */

/** Baseline in-corpus: as falas dos CLIENTES nas mesmas reuniões. Comparar o
 *  Eduardo com o interlocutor dele é melhor que comparar com português geral —
 *  isola o que é dele, não o que é do assunto. */
export interface CorpusComparado {
  eduardo: string[];
  interlocutores: string[];
}

const STOPWORDS = new Set(
  ("a o as os um uma uns umas de do da dos das em no na nos nas por pro pra para " +
    "com sem sob sobre entre ate ate' e ou mas nem que se como quando onde qual " +
    "quais quem cujo eu tu ele ela nos vos eles elas me te lhe nos vos lhes meu " +
    "minha seu sua dele dela nosso nossa este esta esse essa aquele aquela isso " +
    "isto aquilo ser estar ter haver ir vir fazer poder dever querer e' eh ne " +
    "nao sim ja mais menos muito pouco tambem so' so entao assim aqui ali la' la " +
    "hoje agora depois antes bem mal tudo nada algo cada todo toda todos todas " +
    "e´ tá ta né neh ah oh uh hum ahn eh").split(/\s+/),
);

export function normalizarPalavras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\[[a-z ]+\]/g, " ") // placeholders não são vocabulário dele
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function separarFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

// ── 4. Ritmo ────────────────────────────────────────────────────────────────

export interface Ritmo {
  frases: number;
  palavrasPorFrase: { media: number; mediana: number; p90: number };
  /** % de frases terminadas em "?" — pergunta retórica é assinatura de estilo. */
  pctPerguntas: number;
  /** % de frases com menos de 6 palavras — a "frase curta de martelo". */
  pctFrasesCurtas: number;
  /** Repetição imediata da mesma abertura em frases consecutivas (anáfora). */
  anaforas: Array<{ abertura: string; ocorrencias: number }>;
  /** Marcadores de pausa transcritos ("...", "né", "olha"). */
  marcadoresDePausa: Array<{ termo: string; ocorrencias: number }>;
}

const MARCADORES_PAUSA = ["...", " né", " ne ", " tá", " ta ", " entendeu", " sabe", " olha", " assim", " tipo"];

export function calcularRitmo(falas: string[]): Ritmo {
  const frases = falas.flatMap(separarFrases);
  const tamanhos = frases.map((f) => normalizarPalavras(f).length).filter((n) => n > 0);
  const ord = [...tamanhos].sort((a, b) => a - b);
  const pick = (q: number) => (ord.length ? ord[Math.min(ord.length - 1, Math.floor(ord.length * q))]! : 0);

  const aberturas = new Map<string, number>();
  for (let i = 1; i < frases.length; i++) {
    const a = normalizarPalavras(frases[i - 1]!).slice(0, 2).join(" ");
    const b = normalizarPalavras(frases[i]!).slice(0, 2).join(" ");
    if (a && a === b) aberturas.set(a, (aberturas.get(a) ?? 0) + 1);
  }

  const texto = falas.join(" ").toLowerCase();
  const pausas = MARCADORES_PAUSA.map((termo) => ({
    termo: termo.trim(),
    ocorrencias: texto.split(termo).length - 1,
  }))
    .filter((p) => p.ocorrencias > 0)
    .sort((a, b) => b.ocorrencias - a.ocorrencias);

  return {
    frases: frases.length,
    palavrasPorFrase: {
      media: tamanhos.length ? +(tamanhos.reduce((s, n) => s + n, 0) / tamanhos.length).toFixed(1) : 0,
      mediana: pick(0.5),
      p90: pick(0.9),
    },
    pctPerguntas: pct(frases.filter((f) => f.trimEnd().endsWith("?")).length, frases.length),
    pctFrasesCurtas: pct(tamanhos.filter((n) => n < 6).length, tamanhos.length),
    anaforas: [...aberturas.entries()]
      .map(([abertura, ocorrencias]) => ({ abertura, ocorrencias }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias)
      .slice(0, 15),
    marcadoresDePausa: pausas,
  };
}

function pct(parte: number, total: number): number {
  return total ? +((parte / total) * 100).toFixed(1) : 0;
}

// ── 1. Analogias ────────────────────────────────────────────────────────────

/** Marcadores que abrem comparação em fala espontânea. Ranquear por frequência
 *  do MARCADOR é ruído; o valor está na frase inteira, que vira citação. */
const MARCADORES_ANALOGIA = [
  "e como", "e igual", "e a mesma coisa", "e tipo", "funciona como",
  "funciona igual", "imagina", "imagine", "pensa", "pense", "e nem que",
  "e como se", "parece", "assim como", "do mesmo jeito", "e que nem",
  "compara", "e igual voce", "faz de conta", "suponha", "e a mesma logica",
];

export interface Analogia {
  frase: string;
  marcador: string;
  /** Núcleo da comparação — as 4 palavras de conteúdo após o marcador. */
  nucleo: string;
}

export function extrairAnalogias(falas: string[]): Analogia[] {
  const out: Analogia[] = [];
  for (const frase of falas.flatMap(separarFrases)) {
    const alvo = frase
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    for (const marcador of MARCADORES_ANALOGIA) {
      const i = alvo.indexOf(marcador);
      if (i === -1) continue;
      const depois = normalizarPalavras(alvo.slice(i + marcador.length))
        .filter((p) => !STOPWORDS.has(p))
        .slice(0, 4)
        .join(" ");
      if (!depois) continue;
      out.push({ frase: frase.trim(), marcador, nucleo: depois });
      break;
    }
  }
  return out;
}

/** Agrupa analogias pelo núcleo, para ranquear POR TEMA e não por frase. */
export function ranquearAnalogias(analogias: Analogia[]): Array<{
  tema: string;
  ocorrencias: number;
  exemplos: string[];
}> {
  const grupos = new Map<string, Analogia[]>();
  for (const a of analogias) {
    // Chave = primeira palavra de conteúdo do núcleo: "casa", "carro", "time".
    const chave = a.nucleo.split(" ")[0]!;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(a);
  }
  return [...grupos.entries()]
    .map(([tema, itens]) => ({
      tema,
      ocorrencias: itens.length,
      exemplos: [...new Set(itens.map((i) => i.frase))].slice(0, 3),
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias);
}

// ── 2. Aberturas de explicação ──────────────────────────────────────────────

export function extrairAberturas(falas: string[], n = 4): Array<{ abertura: string; ocorrencias: number }> {
  const contagem = new Map<string, number>();
  for (const fala of falas) {
    const frases = separarFrases(fala);
    // Só a primeira frase do turno: é ali que a explicação começa.
    const primeira = frases[0];
    if (!primeira) continue;
    const palavras = normalizarPalavras(primeira);
    if (palavras.length < 3) continue;
    for (let k = 2; k <= Math.min(n, palavras.length); k++) {
      const chave = palavras.slice(0, k).join(" ");
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
  }
  const candidatos = [...contagem.entries()]
    .map(([abertura, ocorrencias]) => ({ abertura, ocorrencias }))
    .filter((a) => a.ocorrencias >= 3)
    .sort((a, b) => b.ocorrencias - a.ocorrencias || b.abertura.length - a.abertura.length);

  // "olha so", "olha so deixa" e "olha so deixa eu" com a MESMA contagem são a
  // mesma abertura vista em três tamanhos. Fica a mais longa — é ela que
  // mostra a formulação real dele.
  const mantidos: Array<{ abertura: string; ocorrencias: number }> = [];
  for (const c of candidatos) {
    const redundante = mantidos.some(
      (m) => m.ocorrencias === c.ocorrencias && m.abertura.startsWith(c.abertura),
    );
    if (!redundante) mantidos.push(c);
  }
  return mantidos.slice(0, 40);
}

// ── 3. Léxico próprio (log-odds contra os interlocutores) ───────────────────

export interface TermoCaracteristico {
  termo: string;
  eduardo: number;
  interlocutores: number;
  /** Log-odds com prior de Dirichlet. Positivo = característico dele. */
  score: number;
}

export function lexicoCaracteristico(corpus: CorpusComparado, minimo = 5): TermoCaracteristico[] {
  const fa = contar(corpus.eduardo);
  const fb = contar(corpus.interlocutores);
  const totalA = soma(fa);
  const totalB = soma(fb);
  const vocab = new Set([...fa.keys(), ...fb.keys()]);
  const alfa = 0.5;

  const out: TermoCaracteristico[] = [];
  for (const termo of vocab) {
    const a = fa.get(termo) ?? 0;
    if (a < minimo) continue;
    if (STOPWORDS.has(termo) || termo.length < 3) continue;
    const b = fb.get(termo) ?? 0;
    const score =
      Math.log((a + alfa) / (totalA + alfa * vocab.size)) -
      Math.log((b + alfa) / (totalB + alfa * vocab.size));
    out.push({ termo, eduardo: a, interlocutores: b, score: +score.toFixed(3) });
  }
  return out.sort((x, y) => y.score - x.score);
}

function contar(textos: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of textos) for (const p of normalizarPalavras(t)) m.set(p, (m.get(p) ?? 0) + 1);
  return m;
}
function soma(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

/** Jargão financeiro: contar o uso DELE contra o dos interlocutores mostra o
 *  que ele evita — e, quando ele usa, a frase seguinte costuma ser a tradução. */
export const JARGAO = [
  "alocacao", "diversificacao", "volatilidade", "liquidez", "rentabilidade",
  "aporte", "resgate", "carencia", "sinistro", "premio", "cobertura",
  "beneficiario", "estipulante", "portabilidade", "taxa", "administracao",
  "carregamento", "come-cotas", "aliquota", "regressiva", "progressiva",
  "renda fixa", "renda variavel", "ativo", "passivo", "patrimonio",
  "sucessorio", "inventario", "itcmd", "holding", "usufruto", "blindagem",
  "compliance", "suitability", "asset", "benchmark", "spread", "hedge",
];

export function usoDeJargao(corpus: CorpusComparado): Array<{
  termo: string;
  eduardo: number;
  interlocutores: number;
}> {
  const norm = (ts: string[]) => ts.map((t) => normalizarPalavras(t).join(" ")).join(" | ");
  const a = norm(corpus.eduardo);
  const b = norm(corpus.interlocutores);
  return JARGAO.map((termo) => ({
    termo,
    eduardo: a.split(termo).length - 1,
    interlocutores: b.split(termo).length - 1,
  })).sort((x, y) => x.eduardo - y.eduardo);
}

// ── 6. Frases-assinatura (3+ reuniões distintas) ────────────────────────────

export interface FalasPorReuniao {
  reuniaoId: string;
  falas: string[];
}

export interface FraseAssinatura {
  frase: string;
  reunioes: number;
  ocorrencias: number;
}

/**
 * n-gramas de 4 a 8 palavras que aparecem em 3+ reuniões DISTINTAS. O corte por
 * reunião (e não por ocorrência) é o que separa bordão de tique de uma conversa
 * só, onde ele repetiu a mesma coisa cinco vezes pro mesmo cliente.
 */
export function frasesAssinatura(
  porReuniao: FalasPorReuniao[],
  minReunioes = 3,
): FraseAssinatura[] {
  const reunioesPorGrama = new Map<string, Set<string>>();
  const totalPorGrama = new Map<string, number>();

  for (const { reuniaoId, falas } of porReuniao) {
    for (const frase of falas.flatMap(separarFrases)) {
      const palavras = normalizarPalavras(frase);
      for (let n = 4; n <= 8; n++) {
        for (let i = 0; i + n <= palavras.length; i++) {
          const grama = palavras.slice(i, i + n).join(" ");
          // Sequência só de stopwords não é assinatura, é cola gramatical.
          if (palavras.slice(i, i + n).every((p) => STOPWORDS.has(p))) continue;
          if (!reunioesPorGrama.has(grama)) reunioesPorGrama.set(grama, new Set());
          reunioesPorGrama.get(grama)!.add(reuniaoId);
          totalPorGrama.set(grama, (totalPorGrama.get(grama) ?? 0) + 1);
        }
      }
    }
  }

  const candidatos = [...reunioesPorGrama.entries()]
    .filter(([, r]) => r.size >= minReunioes)
    .map(([frase, r]) => ({
      frase,
      reunioes: r.size,
      ocorrencias: totalPorGrama.get(frase) ?? 0,
    }))
    .sort((a, b) => b.reunioes - a.reunioes || b.frase.length - a.frase.length);

  // Janelas deslizantes sobre a MESMA fala geram dezenas de recortes da mesma
  // frase ("...que a casa primeiro o alicerce", "a casa primeiro o alicerce
  // depois"). Reconstrói a frase inteira antes de descartar os pedaços — senão
  // a lista mostra o bordão picado, e o valor dele está em ser lido inteiro.
  return podarSobreposicoes(candidatos).slice(0, 60);
}

/** Encadeia n-gramas que se sobrepõem (sufixo de um = prefixo do outro, mesma
 *  cobertura), depois joga fora tudo que virou pedaço de uma frase maior. */
function podarSobreposicoes(candidatos: FraseAssinatura[]): FraseAssinatura[] {
  const porCobertura = new Map<number, FraseAssinatura[]>();
  for (const c of candidatos) {
    if (!porCobertura.has(c.reunioes)) porCobertura.set(c.reunioes, []);
    porCobertura.get(c.reunioes)!.push(c);
  }

  const finais: FraseAssinatura[] = [];
  for (const [reunioes, grupo] of porCobertura) {
    // Semente: os n-gramas mais longos do grupo. Estende para a direita
    // enquanto houver um vizinho que continue a frase.
    const porPrefixo = new Map<string, FraseAssinatura[]>();
    for (const g of grupo) {
      const p = g.frase.split(" ").slice(0, -1).join(" ");
      if (!porPrefixo.has(p)) porPrefixo.set(p, []);
      porPrefixo.get(p)!.push(g);
    }

    const estendidas = new Set<string>();
    for (const semente of grupo) {
      let frase = semente.frase;
      let ocorrencias = semente.ocorrencias;
      const vistos = new Set([frase]);
      for (let passo = 0; passo < 40; passo++) {
        const palavras = frase.split(" ");
        // Vizinho cujo prefixo (n-1 palavras) é o sufixo atual.
        let esticou = false;
        for (let k = Math.min(palavras.length - 1, 7); k >= 3; k--) {
          const sufixo = palavras.slice(-k).join(" ");
          const vizinhos = porPrefixo.get(sufixo) ?? [];
          const proximo = vizinhos.find((v) => !vistos.has(v.frase));
          if (!proximo) continue;
          const novasPalavras = proximo.frase.split(" ");
          frase = [...palavras, ...novasPalavras.slice(k)].join(" ");
          ocorrencias = Math.min(ocorrencias, proximo.ocorrencias);
          vistos.add(proximo.frase);
          esticou = true;
          break;
        }
        if (!esticou) break;
      }
      estendidas.add(frase);
      if (frase !== semente.frase) {
        // A frase inteira herda a contagem da janela — é a mesma ocorrência.
        finais.push({ frase, reunioes, ocorrencias });
      }
    }
    for (const g of grupo) if (!estendidas.has(g.frase) || finais.every((f) => f.frase !== g.frase)) finais.push(g);
  }

  // Descarta tudo que é pedaço de uma frase maior com a mesma cobertura.
  const ordenados = [...new Map(finais.map((f) => [`${f.reunioes}|${f.frase}`, f])).values()].sort(
    (a, b) => b.reunioes - a.reunioes || b.frase.length - a.frase.length,
  );
  const mantidos: FraseAssinatura[] = [];
  for (const c of ordenados) {
    const pedaco = mantidos.some(
      (m) => m.reunioes === c.reunioes && m.frase.includes(c.frase),
    );
    if (!pedaco) mantidos.push(c);
  }
  return mantidos;
}

// ── 5. Sequência argumentativa em produtos sensíveis ────────────────────────

export const PRODUTOS_SENSIVEIS: Record<string, string[]> = {
  "seguro de vida": ["seguro de vida", "seguro", "protecao", "vida"],
  consorcio: ["consorcio", "carta de credito", "lance", "contemplado"],
  previdencia: ["previdencia", "pgbl", "vgbl", "aposentadoria", "aposentar"],
};

/** Devolve os turnos onde cada produto aparece, com o turno anterior e o
 *  seguinte — a sequência argumentativa mora na vizinhança, não na frase. */
export function trechosPorProduto(
  turnosEduardo: string[],
  janela = 1,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [produto, termos] of Object.entries(PRODUTOS_SENSIVEIS)) {
    const trechos: string[] = [];
    turnosEduardo.forEach((t, i) => {
      const alvo = normalizarPalavras(t).join(" ");
      if (!termos.some((termo) => alvo.includes(termo))) return;
      trechos.push(
        turnosEduardo.slice(Math.max(0, i - janela), i + janela + 1).join(" ⏵ "),
      );
    });
    out[produto] = trechos;
  }
  return out;
}

// ── 7. Padrões AUSENTES ─────────────────────────────────────────────────────

/** Um redator genérico usaria isto. Se a contagem der ~0 no corpus dele, vira
 *  linha da seção "o que ele NUNCA faz" — com o número como prova. */
export const PADROES_GENERICOS: Record<string, RegExp> = {
  "alarmismo": /\b(urgente|corre|ultima chance|voce vai perder|antes que seja tarde|nao perca)\b/gi,
  "promessa de retorno": /\b(garanto|garantido|rende \d|vai render|retorno garantido|lucro certo|sem risco)\b/gi,
  "superlativo de venda": /\b(melhor do mercado|imperdivel|exclusivo|revolucionario|unico no brasil)\b/gi,
  "apelo por escassez": /\b(so hoje|vagas limitadas|ultimas unidades|acaba (hoje|amanha))\b/gi,
  "jargão sem tradução": /\b(suitability|benchmark|asset allocation|drawdown|sharpe)\b/gi,
  "chamada imperativa": /\b(clique|assine ja|contrate agora|nao pense duas vezes)\b/gi,
  "autoelogio": /\b(sou o melhor|especialista numero um|referencia nacional)\b/gi,
};

export function contarPadroesGenericos(falas: string[]): Array<{
  padrao: string;
  ocorrencias: number;
  exemplos: string[];
}> {
  const texto = falas.join("\n").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Object.entries(PADROES_GENERICOS).map(([padrao, re]) => {
    const achados = texto.match(new RegExp(re.source, re.flags)) ?? [];
    return {
      padrao,
      ocorrencias: achados.length,
      exemplos: [...new Set(achados)].slice(0, 3),
    };
  });
}
