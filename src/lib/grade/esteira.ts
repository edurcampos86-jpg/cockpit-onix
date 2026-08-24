/**
 * A esteira de produção de um post — módulo PURO (sem prisma, sem sessão).
 *
 * ── O QUE ESTE ARQUIVO RESOLVE ──────────────────────────────────────────
 * As etapas de um post (roteiro → gravação → edição → publicação), a
 * antecedência de cada uma e o título de cada tarefa estavam copiados em
 * QUATRO rotas, mais a ordem cumulativa numa quinta. Nenhuma sabia das
 * outras.
 *
 * E a cópia já tinha divergido: `zapier/generate-script` perdeu a etapa de
 * roteiro em algum momento, e ninguém notou — porque nada compara uma cópia
 * com a outra. Isso não é hipótese, está no histórico do arquivo.
 *
 * ── DUAS VARIANTES, E A SEGUNDA NÃO É UM BUG ────────────────────────────
 * A ausência do roteiro na rota do Zapier é DESENHO: aquele fluxo gera o
 * roteiro dentro dele mesmo, então criar uma tarefa "escrever roteiro" para
 * algo que já foi escrito seria ruído na lista do dia.
 *
 * Por isso ela vira uma variante NOMEADA (`sem-roteiro`) em vez de uma
 * exceção silenciosa. Quem lê o código vê a intenção; quem copiar de novo
 * vai copiar um nome, não uma omissão.
 *
 * ── O QUE ESTE MÓDULO NÃO DECIDE ────────────────────────────────────────
 * `assigneeId` fica com cada rota, de propósito: as quatro atribuem a
 * pessoas diferentes (autor, sessão, autor resolvido, e em `api/posts` a
 * edição vai para o suporte quando existe). Isso é regra de quem chama, não
 * da esteira — trazer para cá obrigaria o módulo a conhecer sessão e time.
 */

/** As etapas, na ordem em que acontecem. A ordem desta lista É a esteira. */
export const ETAPAS = ["roteiro", "gravacao", "edicao", "publicacao"] as const;

export type Etapa = (typeof ETAPAS)[number];

export type VarianteEsteira =
  /** As quatro etapas. O caminho normal. */
  | "completa"
  /** Sem `roteiro` — o fluxo do Zapier já o gerou. Ver cabeçalho. */
  | "sem-roteiro";

interface DefinicaoEtapa {
  etapa: Etapa;
  /** Dias relativos à publicação. Negativo = antes; `0` = no dia. */
  diasAteAPublicacao: number;
  /** Prefixo do título da tarefa, antes de `: <título do post>`. */
  prefixoDoTitulo: string;
}

/**
 * A definição canônica. Mudar a antecedência aqui muda nas quatro rotas —
 * que é exatamente o ponto deste arquivo existir.
 */
const DEFINICOES: readonly DefinicaoEtapa[] = [
  { etapa: "roteiro", diasAteAPublicacao: -3, prefixoDoTitulo: "Escrever roteiro" },
  { etapa: "gravacao", diasAteAPublicacao: -2, prefixoDoTitulo: "Gravar" },
  { etapa: "edicao", diasAteAPublicacao: -1, prefixoDoTitulo: "Editar" },
  { etapa: "publicacao", diasAteAPublicacao: 0, prefixoDoTitulo: "Publicar" },
];

const ETAPAS_POR_VARIANTE: Record<VarianteEsteira, readonly Etapa[]> = {
  completa: ETAPAS,
  "sem-roteiro": ["gravacao", "edicao", "publicacao"],
};

export interface PassoDaEsteira {
  /** Título pronto da tarefa, no formato que as rotas já gravavam. */
  title: string;
  /** Vai para `Task.type`. */
  type: Etapa;
  /** Vencimento, já calculado a partir da data de publicação. */
  dueDate: Date;
}

/**
 * Monta os passos da esteira para um post.
 *
 * Devolve só `title`, `type` e `dueDate` — quem chama completa com
 * `assigneeId`, `postId` e o resto do payload. É essa fronteira que permite
 * as quatro rotas compartilharem a esteira sem compartilhar as regras de
 * atribuição delas.
 */
export function montarEsteira(opcoes: {
  tituloDoPost: string;
  publicacaoEm: Date;
  /** Padrão: `completa`. */
  variante?: VarianteEsteira;
}): PassoDaEsteira[] {
  const { tituloDoPost, publicacaoEm, variante = "completa" } = opcoes;
  const permitidas = ETAPAS_POR_VARIANTE[variante];

  return DEFINICOES.filter((d) => permitidas.includes(d.etapa)).map((d) => {
    // Aritmética de data idêntica à que as rotas faziam inline: parte da data
    // de publicação e desloca os dias no fuso local. `setDate` cuida da virada
    // de mês sozinho.
    const dueDate = new Date(publicacaoEm);
    dueDate.setDate(publicacaoEm.getDate() + d.diasAteAPublicacao);

    return {
      title: `${d.prefixoDoTitulo}: ${tituloDoPost}`,
      type: d.etapa,
      dueDate,
    };
  });
}

// ── Ordem cumulativa: que etapas um status já concluiu ──────────────────

/**
 * Até qual etapa cada status do post dá por concluída.
 *
 * `agendado` empata com `editado` de propósito: agendar não publica, então a
 * tarefa de publicação continua pendente. Estava assim antes e continua —
 * este mapa descreve o comportamento, não o corrige.
 */
const ULTIMA_ETAPA_CONCLUIDA: Record<string, Etapa> = {
  roteiro_pronto: "roteiro",
  gravado: "gravacao",
  editado: "edicao",
  agendado: "edicao",
  publicado: "publicacao",
};

/**
 * As etapas que este status já concluiu, na ordem da esteira.
 *
 * Devolve `null` para status que não concluem nada (`rascunho`, ou qualquer
 * valor desconhecido) — quem chama usa isso para não tocar em tarefa nenhuma.
 */
export function etapasConcluidasPor(status: string): Etapa[] | null {
  const ultima = ULTIMA_ETAPA_CONCLUIDA[status];
  if (!ultima) return null;
  return ETAPAS.slice(0, ETAPAS.indexOf(ultima) + 1);
}
