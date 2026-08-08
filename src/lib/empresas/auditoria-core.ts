import type { NoEmpresa } from "@/lib/empresas/hierarquia";
import { empresasVisiveis, type ConcessaoEmpresa } from "@/lib/empresas/acesso-core";

/* ──────────────────────────────────────────────────────────────
 * Auditoria de acesso por empresa — módulo PURO.
 *
 * ── POR QUE UMA AUDITORIA, E NÃO SÓ A TELA ───────────────────────────────
 * `/configuracoes/permissoes` mostra o que foi CONCEDIDO. Ninguém consegue ver
 * ali o que a pessoa EFETIVAMENTE enxerga, porque entre as duas coisas há três
 * regras que operam em silêncio:
 *
 *   1. herança (`incluiDescendentes`) adiciona empresas que ninguém clicou —
 *      conceder a raiz com herança é o grupo INTEIRO, e a tela não diz isso;
 *   2. `Pessoa` sem `userId` nunca chega a ser resolvida em runtime, então as
 *      concessões dela não têm efeito nenhum;
 *   3. concessão órfã é ignorada sem erro — e se TODAS forem órfãs, a pessoa
 *      volta a ver tudo. (Hoje a FK impede que isso aconteça; fica como
 *      tripwire, ver `CodigoAlerta`.)
 *
 * Cada uma dessas é, isolada, uma decisão correta e deliberada (ver
 * `acesso-core.ts`). Somadas, produzem um estado em que o admin acredita ter
 * restringido alguém e não restringiu. Este módulo é o que responde "quem vê o
 * quê, de verdade" — e, mais importante, POR QUÊ.
 *
 * ── PURO PELO MESMO MOTIVO DOS VIZINHOS ──────────────────────────────────
 * Sem prisma e sem `server-only`: a rota lê o banco e passa as listas prontas.
 * A regra caminha em árvore vinda de dado editável e classifica estados que
 * quase nunca acontecem em desenvolvimento (concessão órfã, restrição vazia) —
 * exatamente o tipo de coisa que precisa de teste sem banco.
 * ────────────────────────────────────────────────────────────── */

/** O mínimo que a auditoria precisa saber sobre uma pessoa. */
export type PessoaAuditada = {
  id: string;
  nome: string;
  email: string;
  /** "ativo" | "arquivado". */
  status: string;
  /** Tem `User` vinculado. Sem isso, concessão nenhuma tem efeito. */
  temUsuario: boolean;
};

/** Uma concessão, já com o veredito de existência da empresa alvo. */
export type ConcessaoAuditada = ConcessaoEmpresa & {
  /** A empresa existe na tabela `Empresa`? Órfã = ignorada pela regra. */
  existe: boolean;
};

export type CodigoAlerta =
  /**
   * Concessão apontando para empresa que não existe em `Empresa`.
   *
   * MEDIDO: hoje isto NÃO acontece pelo caminho normal —
   * `PessoaEmpresa_empresaId_fkey` é `ON DELETE CASCADE`, então o banco recusa
   * o INSERT órfão e apaga a concessão junto com a empresa. Verificado com
   * INSERT direto no Postgres: `violates foreign key constraint`.
   *
   * Fica no código como TRIPWIRE, com o motivo escrito para ninguém achar que
   * é caminho quente: `empresasVisiveis` TOLERA órfã de propósito (e volta a
   * "vê tudo" se todas forem), e essa tolerância é o que esta auditoria
   * precisa espelhar. Se a FK cair — troca de relação no schema, restore com
   * trigger desligada, carga por fora do Prisma —, a regra passa a liberar
   * acesso em silêncio e este é o único lugar que diria.
   */
  | "concessao_orfa"
  /** Todas as concessões eram órfãs ⇒ a pessoa voltou a ver TUDO. Mesma FK, mesmo tripwire. */
  | "restricao_anulada"
  /** As concessões alcançam o grupo inteiro ⇒ restringir não restringiu nada. */
  | "restricao_vazia"
  /** `Pessoa` sem `User`: as concessões dela nunca são aplicadas em runtime. */
  | "sem_usuario"
  /** Pessoa arquivada que continua com concessões. */
  | "arquivada_com_acesso"
  /** Enxerga empresa que não aparece no hub — invisível na tela inicial. */
  | "invisivel_no_hub";

export type Alerta = {
  codigo: CodigoAlerta;
  /** Frase pronta para o admin, sem precisar consultar este arquivo. */
  mensagem: string;
  /** Empresas envolvidas, quando o alerta é sobre empresas específicas. */
  empresas?: string[];
};

export type LinhaAuditoria = {
  pessoa: PessoaAuditada;
  concessoes: ConcessaoAuditada[];
  /**
   * Empresas efetivamente visíveis, JÁ com herança resolvida. `null` = sem
   * filtro (vê tudo) — o mesmo contrato de `empresasVisiveis`, preservado de
   * propósito: colapsar `null` em "todas" apagaria a diferença entre "não tem
   * restrição" e "tem restrição que por acaso cobre tudo", que é justamente o
   * que `restricao_vazia` existe para denunciar.
   */
  efetivas: string[] | null;
  /**
   * Das efetivas, quais entraram POR HERANÇA e não por concessão direta.
   * É a resposta para "por que fulano vê a Onix Tech se ninguém deu isso a
   * ele?" — a pergunta que motiva a auditoria inteira.
   */
  porHeranca: string[];
  alertas: Alerta[];
};

export type ResumoAuditoria = {
  pessoas: number;
  /** Quantas têm alguma concessão gravada. */
  comConcessao: number;
  /** Quantas efetivamente operam sob filtro (concessão que resolveu). */
  comFiltroEfetivo: number;
  /** Contagem por código de alerta, para triagem rápida. */
  alertas: Record<string, number>;
};

export type Auditoria = {
  resumo: ResumoAuditoria;
  linhas: LinhaAuditoria[];
};

export type EntradaAuditoria = {
  pessoas: readonly PessoaAuditada[];
  /** Todas as linhas de `PessoaEmpresa`, de todas as pessoas. */
  concessoes: readonly (ConcessaoEmpresa & { pessoaId: string })[];
  /** A árvore inteira de `Empresa`. */
  empresas: readonly NoEmpresa[];
  /** Ids que aparecem como nó no hub (`catalogo.idsNoHub()`). */
  idsNoHub: readonly string[];
};

/**
 * Monta a auditoria completa.
 *
 * Uma passada por pessoa, reusando `empresasVisiveis` — a MESMA função que o
 * hub e o gate de página chamam. Isso não é economia de código: uma auditoria
 * que reimplementasse a regra poderia jurar que está tudo certo enquanto o
 * runtime faz outra coisa, que é o pior defeito possível numa ferramenta cujo
 * propósito é ser acreditada.
 */
export function auditarAcessoPorEmpresa(entrada: EntradaAuditoria): Auditoria {
  const { pessoas, concessoes, empresas, idsNoHub } = entrada;

  const existeEmpresa = new Set(empresas.map((e) => e.id));
  const noHub = new Set(idsNoHub);
  const todasCadastradas = empresas.length;

  const porPessoa = new Map<string, ConcessaoEmpresa[]>();
  for (const c of concessoes) {
    const lista = porPessoa.get(c.pessoaId);
    const item = { empresaId: c.empresaId, incluiDescendentes: c.incluiDescendentes };
    if (lista) lista.push(item);
    else porPessoa.set(c.pessoaId, [item]);
  }

  const linhas = pessoas.map((pessoa) =>
    auditarPessoa(pessoa, porPessoa.get(pessoa.id) ?? [], {
      empresas,
      existeEmpresa,
      noHub,
      todasCadastradas,
    }),
  );

  const alertas: Record<string, number> = {};
  for (const linha of linhas) {
    for (const a of linha.alertas) alertas[a.codigo] = (alertas[a.codigo] ?? 0) + 1;
  }

  return {
    resumo: {
      pessoas: linhas.length,
      comConcessao: linhas.filter((l) => l.concessoes.length > 0).length,
      comFiltroEfetivo: linhas.filter((l) => l.efetivas !== null).length,
      alertas,
    },
    linhas,
  };
}

type Contexto = {
  empresas: readonly NoEmpresa[];
  existeEmpresa: Set<string>;
  noHub: Set<string>;
  todasCadastradas: number;
};

function auditarPessoa(
  pessoa: PessoaAuditada,
  brutas: ConcessaoEmpresa[],
  ctx: Contexto,
): LinhaAuditoria {
  const concessoes: ConcessaoAuditada[] = brutas.map((c) => ({
    ...c,
    existe: ctx.existeEmpresa.has(c.empresaId),
  }));

  const conjunto = empresasVisiveis(brutas, ctx.empresas);
  const efetivas = conjunto === null ? null : [...conjunto].sort();

  // Herança = o que a pessoa vê sem ter recebido diretamente. Concessão órfã
  // não conta como "direta resolvida", então não distorce esta conta.
  const diretas = new Set(concessoes.filter((c) => c.existe).map((c) => c.empresaId));
  const porHeranca = (efetivas ?? []).filter((id) => !diretas.has(id));

  const alertas: Alerta[] = [];
  const orfas = concessoes.filter((c) => !c.existe).map((c) => c.empresaId);

  if (orfas.length > 0) {
    alertas.push({
      codigo: "concessao_orfa",
      mensagem:
        `Concessão para empresa que não existe em \`Empresa\`: ${orfas.join(", ")}. ` +
        "A regra ignora em silêncio — rode `scripts/seed-empresas.ts` ou remova a concessão.",
      empresas: orfas,
    });
  }

  if (concessoes.length > 0 && efetivas === null) {
    alertas.push({
      codigo: "restricao_anulada",
      mensagem:
        "Tem concessão gravada, mas NENHUMA resolveu — a pessoa voltou a ver todas as " +
        "empresas. É a postura não-disruptiva funcionando sobre config incompleta, " +
        "não um acesso concedido de propósito.",
    });
  }

  if (efetivas !== null && ctx.todasCadastradas > 0 && efetivas.length === ctx.todasCadastradas) {
    alertas.push({
      codigo: "restricao_vazia",
      mensagem:
        "As concessões alcançam o grupo INTEIRO (provavelmente via herança da raiz). " +
        "O filtro existe mas não recorta nada — se a intenção era restringir, desligue " +
        "`incluiDescendentes` ou conceda empresa a empresa.",
    });
  }

  if (concessoes.length > 0 && !pessoa.temUsuario) {
    alertas.push({
      codigo: "sem_usuario",
      mensagem:
        "Pessoa sem `User` vinculado. O contexto de autenticação resolve a Pessoa pelo " +
        "`userId`, então em runtime ela nunca é encontrada e as concessões NÃO têm efeito. " +
        "Convide a pessoa antes de contar com esta restrição.",
    });
  }

  if (concessoes.length > 0 && pessoa.status !== "ativo") {
    alertas.push({
      codigo: "arquivada_com_acesso",
      mensagem: `Pessoa com status "${pessoa.status}" continua com concessões de empresa.`,
    });
  }

  const foraDoHub = (efetivas ?? []).filter((id) => !ctx.noHub.has(id));
  if (efetivas !== null && foraDoHub.length > 0) {
    alertas.push({
      codigo: "invisivel_no_hub",
      mensagem:
        `Enxerga ${foraDoHub.join(", ")}, mas essas empresas não são nós do hub — ` +
        "não aparecem na tela inicial. O acesso funciona por link direto; a descoberta, não.",
      empresas: foraDoHub,
    });
  }

  return { pessoa, concessoes, efetivas, porHeranca, alertas };
}
