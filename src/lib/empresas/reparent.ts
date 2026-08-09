/**
 * Reparenting da tabela `Empresa` — fonte única.
 *
 * Compartilhado por `scripts/reparent-empresas.ts` (terminal) e por
 * `POST /api/empresas/hierarquia` com `acao: "reparent"` (navegador). A régua,
 * as guardas e a auditoria moram AQUI; os dois consumidores só formatam.
 *
 * ── PLANEJAR E APLICAR SÃO SEPARADOS DE PROPÓSITO ────────────────────────
 * `planejarReparent` é PURO: recebe a árvore e devolve o que faria, sem tocar
 * em banco. `aplicarPlano` recebe esse plano e escreve. A separação é o que
 * torna o dry-run confiável — ele não é "o aplicar com um `if` no fim", é
 * literalmente a mesma função de planejamento, com a escrita nunca chamada.
 * Um dry-run que compartilhasse o caminho de escrita poderia escrever por
 * engano; este não tem como.
 *
 * ── A RÉGUA É A DE `hierarquia.ts`, NÃO UMA CÓPIA ────────────────────────
 * `validarParent` roda para cada empresa ANTES do movimento dela, sobre o
 * estado corrente (que muda a cada movimento aceito). `validarArvore` audita o
 * resultado inteiro no fim. Nível 3 é recusado pela mesma função que o teste
 * de `hierarquia.test.ts` trava.
 *
 * ── O QUE NÃO FAZ ────────────────────────────────────────────────────────
 * Não cria empresa (isso é o seed), não renomeia, não apaga, e não toca em
 * `PessoaEmpresa`. Empresa que não existir no banco é reportada e pulada, não
 * aborta as demais.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { RAIZ_DO_GRUPO, idsFilhasDaRaiz } from "@/lib/empresas/catalogo";
import { validarArvore, validarParent, type NoEmpresa } from "@/lib/empresas/hierarquia";

/** O contrato mínimo: ler/escrever `Empresa` e gravar o log. */
export type ClienteReparent = Pick<PrismaClient, "empresa" | "empresaBootstrapLog" | "user">;

/** Desfecho de uma empresa dentro do plano. */
export type SituacaoMovimento =
  /** Vai ser movida (dry-run) ou foi movida (aplicar). */
  | "mover"
  /** Já está pendurada na raiz — nada a fazer. */
  | "ja_ok"
  /** Não existe no banco, ou já tem outro pai. Este módulo não remaneja. */
  | "pulada"
  /** A régua de hierarquia recusou. */
  | "recusada";

export type Movimento = {
  id: string;
  situacao: SituacaoMovimento;
  de: string | null;
  para: string | null;
  /** Só quando `pulada` ou `recusada`: por quê, em uma frase. */
  motivo?: string;
};

export type PlanoReparent = {
  raiz: string;
  movimentos: Movimento[];
  totais: { mover: number; jaOk: number; puladas: number; recusadas: number };
  /** A árvore como ficaria (dry-run) ou como deve ficar (aplicar). */
  arvoreResultante: NoEmpresa[];
  /** Vazio = árvore sã. Não-vazio impede a aplicação. */
  problemas: ReturnType<typeof validarArvore>;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Guardas de pré-condição
 * ────────────────────────────────────────────────────────────────────── */

/** Erro de pré-condição, com mensagem instrutiva em vez de erro cru do driver. */
export class PreCondicaoReparent extends Error {
  constructor(
    /** Chave estável para o chamador decidir status HTTP / código de saída. */
    readonly codigo: "tabela_ausente" | "tabela_vazia" | "raiz_ausente" | "lista_divergente",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "PreCondicaoReparent";
  }
}

/**
 * Lê a árvore, com as guardas que separam "erro de ordem" de "erro de dado".
 *
 * As três falhas abaixo têm consertos DIFERENTES, e é por isso que são
 * distinguidas em vez de colapsadas num "algo deu errado":
 *   - tabela ausente → a migration não subiu (erro de ORDEM: rodou antes do deploy)
 *   - tabela vazia   → o deploy passou, o seed não
 *   - raiz ausente   → semeou parcialmente, ou alguém apagou a raiz
 *
 * Sem isto, o primeiro caso chega como `P2021 / relation "Empresa" does not
 * exist` com stack trace de driver — que não diz o que fazer, justamente na
 * primeira execução, quando há menos contexto para interpretar.
 */
export async function carregarArvore(db: ClienteReparent): Promise<NoEmpresa[]> {
  let empresas: NoEmpresa[];
  try {
    empresas = await db.empresa.findMany({ select: { id: true, parentId: true } });
  } catch (erro) {
    if ((erro as { code?: string })?.code === "P2021") {
      throw new PreCondicaoReparent(
        "tabela_ausente",
        'A tabela "Empresa" não existe neste banco. A migration ainda não subiu — ' +
          "em produção ela roda no start do Railway (`prisma migrate deploy && next start`). " +
          "Depois de subir, crie as linhas com o seed.",
      );
    }
    throw erro;
  }

  if (empresas.length === 0) {
    throw new PreCondicaoReparent(
      "tabela_vazia",
      'A tabela "Empresa" existe mas está VAZIA — nenhuma empresa foi semeada. ' +
        "Rode o seed antes: POST /api/empresas/hierarquia com { confirmar: true } " +
        "cria a raiz, e `npx tsx scripts/seed-empresas.ts` cria as 8.",
    );
  }

  if (!empresas.some((e) => e.id === RAIZ_DO_GRUPO)) {
    throw new PreCondicaoReparent(
      "raiz_ausente",
      `A raiz "${RAIZ_DO_GRUPO}" não existe, mas a tabela tem ${empresas.length} empresa(s). ` +
        "Sem raiz não há onde pendurar. Crie-a com POST /api/empresas/hierarquia " +
        "({ confirmar: true }) ou com `npx tsx scripts/seed-empresas.ts`.",
    );
  }

  return empresas;
}

/**
 * Confere a lista de filhas contra o catálogo.
 *
 * Existe porque `scripts/reparent-empresas.ts` mantém a lista VISÍVEL no
 * próprio arquivo (mover dado de produção sem ver a lista do que se move é o
 * que se quer evitar). Esta função é o que impede a cópia envelhecer.
 */
export function conferirContraCatalogo(filhas: readonly string[]): void {
  const doCatalogo = idsFilhasDaRaiz();
  const faltando = doCatalogo.filter((id) => !filhas.includes(id));
  const sobrando = filhas.filter((id) => !doCatalogo.includes(id));
  if (faltando.length === 0 && sobrando.length === 0) return;

  throw new PreCondicaoReparent(
    "lista_divergente",
    "A lista de filhas divergiu de src/lib/empresas/catalogo.ts." +
      (faltando.length ? ` Faltando: ${faltando.join(", ")}.` : "") +
      (sobrando.length ? ` Sobrando: ${sobrando.join(", ")}.` : "") +
      " Acerte a lista (ou o catálogo) antes de mover dado de produção.",
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Planejamento — PURO
 * ────────────────────────────────────────────────────────────────────── */

/**
 * O que fazer com cada filha, sem tocar em banco.
 *
 * A validação é feita sobre o estado CORRENTE, que avança a cada movimento
 * aceito: a régua da próxima empresa tem de ver o mundo já com a anterior
 * aplicada. É o mesmo motivo pelo qual `aplicarPlano` não pode reordenar os
 * movimentos.
 *
 * Empresa recusada é PULADA, não aborta as demais — mas o motivo vai no plano,
 * e `problemas` no fim audita o resultado inteiro.
 */
export function planejarReparent(
  empresas: readonly NoEmpresa[],
  filhas: readonly string[] = idsFilhasDaRaiz(),
  raiz: string = RAIZ_DO_GRUPO,
): PlanoReparent {
  const porId = new Map(empresas.map((e) => [e.id, e]));
  let estado: NoEmpresa[] = empresas.map((e) => ({ ...e }));
  const movimentos: Movimento[] = [];

  for (const id of filhas) {
    const atual = porId.get(id);

    if (!atual) {
      movimentos.push({
        id,
        situacao: "pulada",
        de: null,
        para: null,
        motivo: "não existe no banco (rode o seed antes)",
      });
      continue;
    }

    if (atual.parentId === raiz) {
      movimentos.push({ id, situacao: "ja_ok", de: raiz, para: raiz });
      continue;
    }

    if (atual.parentId !== null) {
      movimentos.push({
        id,
        situacao: "pulada",
        de: atual.parentId,
        para: null,
        motivo: `já tem pai "${atual.parentId}" — este fluxo não remaneja, só pendura raiz solta`,
      });
      continue;
    }

    const veredito = validarParent(id, raiz, estado);
    if (!veredito.ok) {
      movimentos.push({
        id,
        situacao: "recusada",
        de: null,
        para: null,
        motivo: `${veredito.motivo}: ${veredito.mensagem}`,
      });
      continue;
    }

    movimentos.push({ id, situacao: "mover", de: null, para: raiz });
    estado = estado.map((e) => (e.id === id ? { ...e, parentId: raiz } : e));
  }

  const conta = (s: SituacaoMovimento) => movimentos.filter((m) => m.situacao === s).length;

  return {
    raiz,
    movimentos,
    totais: {
      mover: conta("mover"),
      jaOk: conta("ja_ok"),
      puladas: conta("pulada"),
      recusadas: conta("recusada"),
    },
    arvoreResultante: estado,
    problemas: validarArvore(estado),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Aplicação
 * ────────────────────────────────────────────────────────────────────── */

export type ResultadoAplicacao = {
  movidas: number;
  /** Linhas gravadas em `EmpresaBootstrapLog`. */
  auditadas: number;
  /** Movimentos aplicados cujo log falhou. > 0 ⇒ dado certo, histórico incompleto. */
  falhasDeLog: number;
  /** A árvore relida do banco DEPOIS das escritas — não a simulada. */
  arvoreFinal: NoEmpresa[];
  problemas: ReturnType<typeof validarArvore>;
};

/**
 * Aplica um plano já validado.
 *
 * RECUSA plano com `problemas`: se a simulação já sabe que a árvore ficaria
 * fora da régua, escrever seria produzir o estado ruim de propósito.
 *
 * `autorId` é obrigatório porque cada movimento vira uma linha em
 * `EmpresaBootstrapLog`, que tem FK obrigatória para `User`. Autor inventado
 * (ou um "sistema" genérico) é pior que log nenhum: dá aparência de rastro sem
 * responder à pergunta que o log existe para responder.
 *
 * DEFENSIVO no log: falha ao gravar NÃO derruba o reparenting. O UPDATE já
 * aconteceu e é idempotente; abortar faria o operador reexecutar uma operação
 * que deu certo, sem recuperar o log perdido. As falhas são contadas.
 */
export async function aplicarPlano(
  db: ClienteReparent,
  plano: PlanoReparent,
  opcoes: { autorId: string; origem: string },
): Promise<ResultadoAplicacao> {
  if (plano.problemas.length > 0) {
    throw new PreCondicaoReparent(
      "lista_divergente",
      "O plano produziria uma árvore fora da régua de 2 níveis: " +
        plano.problemas.map((p) => `${p.id} (${p.mensagem})`).join("; ") +
        ". Nada foi escrito.",
    );
  }

  let movidas = 0;
  let auditadas = 0;
  let falhasDeLog = 0;

  const registrar = async (empresaId: string, resultado: string, extra: object) => {
    try {
      await db.empresaBootstrapLog.create({
        data: {
          usuarioId: opcoes.autorId,
          acao: "reparent",
          resultado,
          empresaId,
          metadata: { origem: opcoes.origem, raiz: plano.raiz, ...extra },
        },
      });
      auditadas++;
    } catch {
      falhasDeLog++;
    }
  };

  // A ORDEM importa: o plano foi validado nesta sequência, com cada movimento
  // vendo o estado deixado pelo anterior. Reordenar invalidaria a validação.
  for (const m of plano.movimentos) {
    if (m.situacao !== "mover") continue;
    await db.empresa.update({ where: { id: m.id }, data: { parentId: plano.raiz } });
    movidas++;
    await registrar(m.id, "movida", { de: m.de, para: m.para });
  }

  // Execução que não moveu nada também deixa rastro. Mesma razão do log de
  // bootstrap: registrar só o caso feliz responde "quem mudou" mas nunca
  // "quem rodou". O alvo é a raiz, porque o run é sobre a árvore inteira.
  if (movidas === 0) {
    await registrar(plano.raiz, "nada_a_fazer", {
      jaOk: plano.totais.jaOk,
      puladas: plano.totais.puladas,
      recusadas: plano.totais.recusadas,
    });
  }

  // Relê do banco: a árvore que se reporta depois de escrever tem de ser a
  // REAL, não a simulada. Se um UPDATE não pegou, é aqui que aparece.
  const arvoreFinal = await db.empresa.findMany({ select: { id: true, parentId: true } });

  return { movidas, auditadas, falhasDeLog, arvoreFinal, problemas: validarArvore(arvoreFinal) };
}

/**
 * Resolve o autor a partir de email ou id. `null` se não casar ninguém.
 *
 * Chamado ANTES do primeiro UPDATE pelos dois consumidores: identificador que
 * não casa ninguém deve parar com o banco intacto, em vez de mover 7 empresas
 * e só então descobrir que o log não tem onde pendurar.
 */
export async function resolverAutor(
  db: ClienteReparent,
  identificador: string,
): Promise<{ id: string; name: string; email: string } | null> {
  return db.user.findFirst({
    where: { OR: [{ id: identificador }, { email: identificador.toLowerCase() }] },
    select: { id: true, name: true, email: true },
  });
}
