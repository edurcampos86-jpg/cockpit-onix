/**
 * Anonimização das falas antes de qualquer coisa sair do banco.
 *
 * REGRA INEGOCIÁVEL: o guia de voz descreve COMO O EDUARDO FALA, nunca O QUE OS
 * CLIENTES CONTARAM. Este módulo é o único ponto onde essa regra vira código.
 *
 * Aplicado DUAS vezes de propósito (`scripts/guia-voz-eduardo.ts`):
 *   1. em cada fala, ANTES de mandar pra API — o que não sai daqui não vaza;
 *   2. no markdown final, ANTES de gravar — rede de segurança contra o modelo
 *      ter reintroduzido algo que ele "lembrou" do contexto.
 *
 * A defesa forte é a `denylist` vinda do próprio banco (nomes de
 * ClienteBackoffice, Lead e participantes). O heurístico de nome próprio é a
 * rede embaixo — ele erra pra mais (redige nome que não precisava), e é assim
 * que tem que errar.
 */

export interface OpcoesAnonimizacao {
  /** Nomes reais vindos do banco. Cada um vira `[cliente]`. */
  denylist?: string[];
  /** Nomes que devem sobreviver (Eduardo, time, marcas do próprio grupo). */
  allowlist?: string[];
}

export interface ResultadoAnonimizacao {
  texto: string;
  /** Quantas substituições de cada tipo — vira o relatório de auditoria. */
  contagem: Record<string, number>;
}

/** Categorias de produto que o guia PRECISA manter: a seção 5 descreve como ele
 *  fala de seguro de vida, consórcio e previdência. Categoria não identifica
 *  ninguém; o que identifica é valor, prazo e seguradora — e esses caem. */
const CATEGORIAS_PRESERVADAS = [
  "seguro de vida", "seguro", "consórcio", "consorcio", "previdência",
  "previdencia", "pgbl", "vgbl", "holding", "sucessão", "sucessao",
];

const PALAVRAS_ALLOWLIST_PADRAO = [
  "eduardo", "campos", "onix", "capital", "brasil", "deus", "instagram",
  "whatsapp", "excel", "cdi", "ipca", "selic", "cpf", "cnpj", "pix",
  "janeiro", "fevereiro", "março", "marco", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
  "segunda", "terça", "terca", "quarta", "quinta", "sexta", "sábado",
  "sabado", "domingo", "natal", "carnaval",
];

/** Termos de saúde: presença de qualquer um deles redige a ORAÇÃO inteira, não
 *  só a palavra — "ele descobriu um câncer no ano passado" sem a palavra
 *  "câncer" continua contando o caso do cliente. */
const TERMOS_SAUDE = [
  "câncer", "cancer", "tumor", "quimio", "metástase", "metastase", "avc",
  "infarto", "enfarte", "diabetes", "diabético", "diabetico", "hipertens",
  "depress", "ansiedade", "pânico", "panico", "bipolar", "alzheimer",
  "parkinson", "esclerose", "cirurgia", "transplante", "internação",
  "internacao", "uti", "quimioterapia", "hiv", "aids", "hepatite",
  "obesidade", "cardíac", "cardiac", "oncolog", "diagnóstic", "diagnostic",
  "laudo", "biópsia", "biopsia", "terminal", "invalidez", "sequela",
  "sequelas", "coma", "demência", "demencia", "autismo", "síndrome",
  "sindrome", "doença", "doenca", "tratamento",
];

/** Seguradoras, bancos e gestoras: marca de terceiro em fala de reunião é
 *  contexto de contratação, não voz do Eduardo. */
const MARCAS = [
  "prudential", "metlife", "icatu", "porto seguro", "bradesco", "itaú",
  "itau", "unibanco", "santander", "caixa", "banco do brasil", "safra",
  "xp investimentos", "xp", "btg", "pactual", "nubank", "inter", "sicredi",
  "sicoob", "mapfre", "sulamérica", "sulamerica", "allianz", "zurich",
  "tokio marine", "hdi", "liberty", "omint", "amil", "sompo", "mongeral",
  "principal", "generali", "chubb", "azos", "youse", "rico", "clear",
  "avenue", "warren", "empiricus", "vitreo", "genial",
];

const NUMERO_POR_EXTENSO =
  "(?:um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milh[õo]es|milh[ãa]o|bilh[õo]es|bilh[ãa]o|meio|meia)";

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Redige uma fala. Idempotente: rodar duas vezes dá o mesmo resultado, o que é
 * exatamente o que a segunda passada no markdown final precisa.
 */
export function anonimizar(
  entrada: string,
  opcoes: OpcoesAnonimizacao = {},
): ResultadoAnonimizacao {
  const contagem: Record<string, number> = {};
  let texto = entrada;

  const conta = (chave: string, n: number) => {
    if (n > 0) contagem[chave] = (contagem[chave] ?? 0) + n;
  };

  const sub = (chave: string, re: RegExp, por: string) => {
    let n = 0;
    texto = texto.replace(re, (m) => {
      // Não re-redige o que já é placeholder.
      if (/^\[[a-zç ]+\]$/i.test(m)) return m;
      n++;
      return por;
    });
    conta(chave, n);
  };

  // ── 1. Identificadores duros ────────────────────────────────────────────
  sub("documento", /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento]");
  sub("documento", /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[documento]");
  sub("email", /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, "[email]");
  sub(
    "telefone",
    /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s.]?\d{4}\b/g,
    "[telefone]",
  );
  sub("data", /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, "[data]");
  sub("apolice", /\b(?:ap[óo]lice|contrato|proposta|conta)\s+(?:n[ºo°.]?\s*)?[\d.-]{4,}\b/gi, "[referência]");

  // ── 2. Valores ──────────────────────────────────────────────────────────
  // Numéricos, com ou sem "R$", com escala por extenso ("2 milhões").
  sub(
    "valor",
    new RegExp(
      `(?:R\\$\\s*)?\\b\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?\\b(?:\\s*(?:mil|milh[õo]es|milh[ãa]o|bilh[õo]es|bilh[ãa]o|k|mi))?`,
      "gi",
    ),
    "[valor]",
  );
  sub(
    "valor",
    /R\$\s*\d+(?:[.,]\d+)?\s*(?:mil|milh[õo]es|milh[ãa]o|bilh[õo]es|bilh[ãa]o|k|mi)?/gi,
    "[valor]",
  );
  sub(
    "valor",
    /\b\d+(?:[.,]\d+)?\s*(?:mil|milh[õo]es|milh[ãa]o|bilh[õo]es|bilh[ãa]o)\b(?:\s*(?:de\s*)?(?:reais|real|d[óo]lares))?/gi,
    "[valor]",
  );
  // Por extenso: "duzentos mil reais", "dois milhões e meio".
  sub(
    "valor",
    new RegExp(
      `\\b${NUMERO_POR_EXTENSO}(?:\\s+(?:e\\s+)?${NUMERO_POR_EXTENSO}){0,4}\\s+(?:reais|real|d[óo]lares|conto|paus)\\b`,
      "gi",
    ),
    "[valor]",
  );
  sub(
    "valor",
    new RegExp(
      `\\b${NUMERO_POR_EXTENSO}(?:\\s+(?:e\\s+)?${NUMERO_POR_EXTENSO}){0,3}\\s+(?:mil|milh[õo]es|milh[ãa]o|bilh[õo]es|bilh[ãa]o)\\b`,
      "gi",
    ),
    "[valor]",
  );

  // ── 3. Marcas de terceiros ──────────────────────────────────────────────
  for (const marca of MARCAS) {
    sub("marca", new RegExp(`\\b${escapar(marca)}\\b`, "gi"), "[instituição]");
  }

  // ── 4. Saúde — redige a oração inteira ──────────────────────────────────
  {
    const partes = texto.split(/(?<=[.!?;])\s+|(?<=,)\s+/);
    let n = 0;
    const redigidas = partes.map((p) => {
      const alvo = semAcento(p);
      const bate = TERMOS_SAUDE.some((t) => alvo.includes(semAcento(t)));
      if (!bate) return p;
      n++;
      return "[situação de saúde]";
    });
    if (n > 0) {
      texto = redigidas.join(" ");
      conta("saude", n);
    }
  }

  // ── 5. Nomes conhecidos do banco ────────────────────────────────────────
  const allow = new Set(
    [...PALAVRAS_ALLOWLIST_PADRAO, ...(opcoes.allowlist ?? [])].map(semAcento),
  );
  for (const nome of opcoes.denylist ?? []) {
    for (const parte of nome.split(/\s+/)) {
      const p = parte.trim();
      if (p.length < 3) continue;
      if (allow.has(semAcento(p))) continue;
      if (PARTICULAS.has(semAcento(p))) continue;
      sub("nome_banco", new RegExp(`\\b${escapar(p)}\\b`, "gi"), "[cliente]");
    }
  }

  // ── 6. Rede de segurança: nome próprio não reconhecido ──────────────────
  // Erra pra mais de propósito. Só dispara fora do início de frase, onde
  // maiúscula carrega informação.
  {
    let n = 0;
    texto = texto.replace(
      /(?<=[a-zà-ÿ,]\s)(?:d[oaei]s?\s+)?([A-ZÀ-Þ][a-zà-ÿ]{2,})(?:\s+(?:d[oaei]s?\s+)?[A-ZÀ-Þ][a-zà-ÿ]{2,})*/g,
      (m, primeiro: string) => {
        const chave = semAcento(primeiro);
        if (allow.has(chave)) return m;
        if (PALAVRAS_COMUNS_MAIUSCULAS.has(chave)) return m;
        n++;
        return "[cliente]";
      },
    );
    conta("nome_heuristica", n);
  }

  // ── 7. Colapsa placeholders repetidos ───────────────────────────────────
  texto = texto
    .replace(/(\[cliente\]\s*){2,}/g, "[cliente] ")
    .replace(/(\[valor\]\s*){2,}/g, "[valor] ")
    .replace(/(\[situação de saúde\]\s*){2,}/g, "[situação de saúde] ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { texto, contagem };
}

/** Partículas de nome composto — sozinhas não identificam ninguém. */
const PARTICULAS = new Set([
  "de", "da", "do", "das", "dos", "e", "junior", "filho", "neto", "sobrinho",
  "santo", "santa", "dr", "dra", "sr", "sra",
]);

/** Palavras que aparecem capitalizadas no meio da frase sem serem nome de
 *  pessoa. Sem isso o heurístico redige metade do vocabulário dele. */
const PALAVRAS_COMUNS_MAIUSCULAS = new Set(
  [
    ...CATEGORIAS_PRESERVADAS,
    "sao", "santo", "santa", "doutor", "doutora", "senhor", "senhora",
    "voce", "voces", "entao", "porque", "quando", "agora", "hoje", "ontem",
    "amanha", "sim", "nao", "tudo", "bem", "olha", "veja", "certo", "claro",
    "deus", "ok", "beleza", "legal", "otimo", "perfeito", "exato",
    "empresa", "familia", "governo", "receita", "federal", "estado",
    "previdencia", "social", "imposto", "renda", "bolsa", "mercado",
  ].map(semAcento),
);

/**
 * Última barreira: roda antes de gravar o arquivo e devolve o que ficou
 * suspeito. Se voltar não-vazio, o script aborta a gravação.
 */
export function auditarVazamento(markdown: string): string[] {
  const suspeitas: string[] = [];
  const checa = (rotulo: string, re: RegExp) => {
    const achados = markdown.match(re);
    if (achados) suspeitas.push(`${rotulo}: ${[...new Set(achados)].slice(0, 5).join(", ")}`);
  };
  checa("CPF/CNPJ", /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g);
  checa("e-mail", /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g);
  checa("valor em reais", /R\$\s*\d/g);
  const saude = TERMOS_SAUDE.filter((t) => semAcento(markdown).includes(semAcento(t)));
  if (saude.length) suspeitas.push(`termo de saúde: ${saude.slice(0, 5).join(", ")}`);
  return suspeitas;
}
