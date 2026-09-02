/**
 * Questionário de motivação calibrado pelo PAT vigente da pessoa.
 *
 * O gerador só escolhe linguagem, tom e ordem. Ele nunca infere respostas nem
 * inclui diagnóstico. A versão faz parte do snapshot persistido pelo chamador:
 * mudar uma pergunta existente exige subir este número.
 */

export const GERADOR_QUESTIONARIO_PAT_VERSAO = 1 as const;

export const PERGUNTA_PAT_IDS = [
  "motivadores",
  "desmotivadores",
  "preocupacoes",
  "objetivoCurtoPrazo",
  "objetivoLongoPrazo",
  "esforcosNecessarios",
  "apoioEsperado",
  "evidenciasProgresso",
] as const;

export type PerguntaPatId = (typeof PERGUNTA_PAT_IDS)[number];

export type TomPerguntaPat =
  | "neutro"
  | "dinamico"
  | "direto"
  | "acolhedor"
  | "reflexivo";

export type PerguntaPat = {
  id: PerguntaPatId;
  texto: string;
  tom: TomPerguntaPat;
};

export type PatParaQuestionario = {
  orientacao?: string | null;
  perspectiva?: string | null;
  tendencias?: {
    foco?: number | null;
    orientacao?: number | null;
    acao?: number | null;
    conexao?: number | null;
    relacionamento?: number | null;
    regras?: number | null;
    suportePressao?: number | null;
  } | null;
  ambiente?: {
    nome?: string | null;
    desafios?: number | null;
    habilidades?: number | null;
    percepcaoPredominante?: string | null;
    caracteristicas?: string[] | null;
    orientacoes?: string[] | null;
    recomendacoes?: string[] | null;
  } | null;
  estrutural?: {
    spread?: number | null;
    spreadNivel?: string | null;
    suporteEstrutural?: number | null;
    suporteNivel?: string | null;
    perspectivaValor?: number | null;
    cicloAlertaHoras?: number | null;
  } | null;
};

type PerfilDePerguntas = "neutro" | "socialRapido" | "tecnico" | "cuidadoso";

const ORDEM_NEUTRA: readonly PerguntaPatId[] = PERGUNTA_PAT_IDS;

const ORDENS: Record<PerfilDePerguntas, readonly PerguntaPatId[]> = {
  neutro: ORDEM_NEUTRA,
  socialRapido: [
    "motivadores",
    "objetivoCurtoPrazo",
    "objetivoLongoPrazo",
    "esforcosNecessarios",
    "apoioEsperado",
    "evidenciasProgresso",
    "desmotivadores",
    "preocupacoes",
  ],
  tecnico: [
    "objetivoCurtoPrazo",
    "evidenciasProgresso",
    "esforcosNecessarios",
    "objetivoLongoPrazo",
    "motivadores",
    "apoioEsperado",
    "desmotivadores",
    "preocupacoes",
  ],
  cuidadoso: [
    "motivadores",
    "apoioEsperado",
    "desmotivadores",
    "preocupacoes",
    "objetivoCurtoPrazo",
    "objetivoLongoPrazo",
    "esforcosNecessarios",
    "evidenciasProgresso",
  ],
};

const TEXTOS: Record<PerfilDePerguntas, Record<PerguntaPatId, string>> = {
  neutro: {
    motivadores: "O que mais dá energia e sentido ao seu trabalho hoje?",
    desmotivadores: "O que mais desmotiva ou dificulta manter um bom ritmo?",
    preocupacoes: "Que preocupação relacionada ao trabalho merece atenção?",
    objetivoCurtoPrazo: "Qual resultado você quer alcançar nos próximos 90 dias?",
    objetivoLongoPrazo: "Onde você quer estar profissionalmente em um ou dois anos?",
    esforcosNecessarios: "Que esforço seu é necessário para chegar lá?",
    apoioEsperado: "Como seu líder pode apoiar você melhor?",
    evidenciasProgresso: "Qual evidência mostrará que você está avançando?",
  },
  socialRapido: {
    motivadores: "Que conquista ou impacto mais dá energia a você hoje?",
    desmotivadores: "O que faz seu entusiasmo cair no trabalho?",
    preocupacoes: "Qual preocupação pode limitar seu avanço hoje?",
    objetivoCurtoPrazo: "Que vitória nos próximos 90 dias teria mais impacto para você?",
    objetivoLongoPrazo: "Onde você quer chegar em um ou dois anos?",
    esforcosNecessarios: "Qual ação simples pode acelerar esse objetivo?",
    apoioEsperado: "Que forma de incentivo funciona melhor para você?",
    evidenciasProgresso: "Qual sinal rápido mostrará que houve avanço?",
  },
  tecnico: {
    motivadores: "Que desafio ou resultado concreto mais aumenta sua motivação?",
    desmotivadores: "Que obstáculo ou retrabalho mais reduz seu rendimento?",
    preocupacoes: "Qual risco ou incerteza precisa ser resolvido?",
    objetivoCurtoPrazo: "Qual resultado mensurável você quer atingir nos próximos 90 dias?",
    objetivoLongoPrazo: "Que domínio ou resultado quer conquistar em um ou dois anos?",
    esforcosNecessarios: "Qual competência, hábito ou decisão mais limita esse avanço hoje?",
    apoioEsperado: "Que recurso ou autonomia ajudaria você a entregar melhor?",
    evidenciasProgresso: "Qual indicador mostrará que houve progresso?",
  },
  cuidadoso: {
    motivadores: "O que faz você se sentir valorizado e seguro para trabalhar bem?",
    desmotivadores: "Que situação torna o trabalho mais pesado ou tira sua tranquilidade?",
    preocupacoes: "Que preocupação merece mais clareza e apoio?",
    objetivoCurtoPrazo: "Qual avanço realista nos próximos 90 dias mostraria o caminho certo?",
    objetivoLongoPrazo: "Que cenário profissional você gostaria de construir em um ou dois anos?",
    esforcosNecessarios: "Qual pequeno passo, mantido com constância, aproxima esse objetivo?",
    apoioEsperado: "Que apoio do líder ajuda sem gerar pressão desnecessária?",
    evidenciasProgresso: "Qual sinal simples mostrará que o plano está funcionando?",
  },
};

function normalizar(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numero(valor: number | null | undefined): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function textoDoAmbiente(pat: PatParaQuestionario): string {
  const ambiente = pat.ambiente;
  if (!ambiente) return "";
  return normalizar(
    [
      ambiente.nome,
      ambiente.percepcaoPredominante,
      ...(ambiente.caracteristicas ?? []),
      ...(ambiente.orientacoes ?? []),
      ...(ambiente.recomendacoes ?? []),
    ]
      .filter((item): item is string => typeof item === "string")
      .join(" "),
  );
}

function escolherPerfil(pat: PatParaQuestionario | null | undefined): {
  perfil: PerfilDePerguntas;
  tom: TomPerguntaPat;
} {
  if (!pat) return { perfil: "neutro", tom: "neutro" };

  const tendencias = pat.tendencias;
  const orientacaoDeclarada = normalizar(pat.orientacao);
  const orientacaoNumerica = numero(tendencias?.orientacao);
  const foco = numero(tendencias?.foco);
  const acao = numero(tendencias?.acao);
  const conexao = numero(tendencias?.conexao);
  const regras = numero(tendencias?.regras);
  const suportePressao = numero(tendencias?.suportePressao);
  const suporteEstrutural = numero(pat.estrutural?.suporteEstrutural);
  const perspectivaValor = numero(pat.estrutural?.perspectivaValor);
  const perspectiva = normalizar(pat.perspectiva);
  const suporteNivel = normalizar(pat.estrutural?.suporteNivel);
  const ambiente = textoDoAmbiente(pat);

  const social =
    orientacaoDeclarada.includes("social") ||
    (!orientacaoDeclarada && orientacaoNumerica !== null && orientacaoNumerica >= 65);
  const tecnico =
    orientacaoDeclarada.includes("tecnic") ||
    (!orientacaoDeclarada && orientacaoNumerica !== null && orientacaoNumerica <= 35);
  const especialista = foco !== null && foco >= 65;
  const promovedor = acao !== null && acao >= 65;
  const mantenedor = acao !== null && acao <= 35;
  const rapido = conexao !== null && conexao <= 35;
  const ponderado = conexao !== null && conexao >= 65;
  const cuidadoso = regras !== null && regras >= 65;
  const ambientePedeEstrutura = /clare|estrutur|passo|ritmo|apoio|seguran|organiza/.test(
    ambiente,
  );
  const ambientePedeObjetividade = /objetiv|diret|dado|evid|resultado/.test(ambiente);
  const baixaPressao =
    (suportePressao !== null && suportePressao <= 35) ||
    (suporteEstrutural !== null && suporteEstrutural <= 35) ||
    suporteNivel.includes("baixo") ||
    perspectiva.includes("baixa") ||
    (perspectivaValor !== null && perspectivaValor < 0);

  const perfilCuidadoso =
    (ponderado && (mantenedor || cuidadoso || social)) ||
    (ambientePedeEstrutura && (mantenedor || baixaPressao));

  if (perfilCuidadoso) {
    return { perfil: "cuidadoso", tom: baixaPressao ? "acolhedor" : "reflexivo" };
  }
  // Uma orientação declarada tem precedência sobre sinais secundários. Foco
  // alto pode significar especialização dentro de um perfil social, e não
  // autoriza transformar a conversa em uma entrevista técnica.
  if (tecnico || (!social && (especialista || ambientePedeObjetividade))) {
    return { perfil: "tecnico", tom: baixaPressao ? "acolhedor" : "direto" };
  }
  if (social && (rapido || promovedor)) {
    return { perfil: "socialRapido", tom: baixaPressao ? "acolhedor" : "dinamico" };
  }
  if (baixaPressao) {
    return { perfil: "neutro", tom: "acolhedor" };
  }
  if (ponderado || ambientePedeEstrutura) {
    return { perfil: "neutro", tom: "reflexivo" };
  }
  return { perfil: "neutro", tom: "neutro" };
}

/**
 * Gera sempre os mesmos oito domínios. `null`, `undefined` ou PAT sem sinais
 * suficientes degradam para perguntas neutras, sem tentar adivinhar o perfil.
 */
export function gerarPerguntasPat(
  pat: PatParaQuestionario | null | undefined,
): PerguntaPat[] {
  const { perfil, tom } = escolherPerfil(pat);
  return ORDENS[perfil].map((id) => ({ id, texto: TEXTOS[perfil][id], tom }));
}
