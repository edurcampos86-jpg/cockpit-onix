/**
 * Merge transacional de clientes duplicados por zeros à esquerda no
 * `numeroConta` (ex.: "2870286" antigo vs "002870286" novo, padStart 9).
 *
 * Substitui o merge antigo que copiava 7 escalares e DELETAVA o antigo —
 * perdendo por cascade os filhos do registro antigo (MovimentacaoBtg e
 * 8 outras tabelas). Aqui RELIGAMOS todos os filhos para o novo ANTES de
 * deletar, dentro de uma transação por par. Qualquer falha/abort reverte o
 * par inteiro e deixa os dois clientes intactos.
 *
 * Caminho seguro (políticas):
 *  - 8 filhos via updateMany clienteId antigo→novo: ReuniaoCliente,
 *    MovimentacaoBtg, InteracaoCliente, MetaCliente, EventoVida,
 *    GrupoCliente, Conversa, AcaoPainel (clienteVinculadoId).
 *  - 1:1 (PerfilDescoberta, PlanoUmaPagina, ChecklistOrganizacao): se o novo
 *    NÃO tem, religa o do antigo; se AMBOS têm, ABORTA o par (nunca destrói
 *    dado 1:1 curado).
 *  - Guarda durável: antes do delete, conta TODO filho cascade (qualquer
 *    tabela, via pg_constraint) ainda apontando para o antigo. Se sobrar
 *    qualquer um, ABORTA — protege contra filhos cascade futuros não
 *    previstos aqui.
 */

import { type PrismaClient } from "@/generated/prisma/client";

export function normalizarConta(conta: string | null): string | null {
  if (!conta) return null;
  return /^\d+$/.test(conta) ? conta.padStart(9, "0") : conta;
}

type ClienteMin = {
  id: string;
  numeroConta: string | null;
  proximaReuniaoAt: Date | null;
  ultimaReuniaoAt: Date | null;
  ultimoContatoAt: Date | null;
  observacoes: string | null;
  perfilEmocional: string | null;
  classificacaoManual: boolean | null;
  classificacao: string | null;
};

export type ParResultado =
  | { status: "merged"; antigoId: string; novoId: string; conta: string }
  | { status: "abortado-conflito-1a1"; antigoId: string; novoId: string; conta: string; tabela: string }
  | { status: "abortado-filhos-restantes"; antigoId: string; novoId: string; conta: string; detalhe: string };

// Lançado para reverter a transação do par; carrega o resultado a reportar.
class AbortPar extends Error {
  constructor(public resultado: ParResultado) {
    super(resultado.status);
  }
}

// Filhos cascade de ClienteBackoffice descobertos dinamicamente do catálogo.
type FilhoCascade = { table: string; column: string };

async function listarFilhosCascade(prisma: PrismaClient): Promise<FilhoCascade[]> {
  const rows = await prisma.$queryRaw<{ child_table: string; fk_column: string }[]>`
    SELECT (con.conrelid::regclass)::text AS child_table,
           att.attname                    AS fk_column
    FROM pg_constraint con
    JOIN pg_class ref       ON ref.oid = con.confrelid
    JOIN pg_attribute att   ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confdeltype = 'c'           -- ON DELETE CASCADE
      AND ref.relname = 'ClienteBackoffice'`;
  return rows.map((r) => ({ table: r.child_table, column: r.fk_column }));
}

function montarPatch(antigo: ClienteMin, novo: ClienteMin): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (antigo.proximaReuniaoAt && !novo.proximaReuniaoAt) patch.proximaReuniaoAt = antigo.proximaReuniaoAt;
  if (antigo.ultimaReuniaoAt && !novo.ultimaReuniaoAt) patch.ultimaReuniaoAt = antigo.ultimaReuniaoAt;
  if (antigo.ultimoContatoAt && !novo.ultimoContatoAt) patch.ultimoContatoAt = antigo.ultimoContatoAt;
  if (antigo.observacoes && !novo.observacoes) patch.observacoes = antigo.observacoes;
  if (antigo.perfilEmocional && !novo.perfilEmocional) patch.perfilEmocional = antigo.perfilEmocional;
  if (antigo.classificacaoManual && !novo.classificacaoManual) {
    patch.classificacaoManual = true;
    patch.classificacao = antigo.classificacao;
  }
  return patch;
}

async function mergePar(
  prisma: PrismaClient,
  antigo: ClienteMin,
  novo: ClienteMin,
  cascadeChildren: FilhoCascade[],
): Promise<ParResultado> {
  const conta = antigo.numeroConta ?? "";
  try {
    return await prisma.$transaction(async (tx) => {
      // 1) Conflito 1:1 — se AMBOS têm, aborta sem tocar em nada.
      if (
        (await tx.perfilDescoberta.findUnique({ where: { clienteId: antigo.id }, select: { id: true } })) &&
        (await tx.perfilDescoberta.findUnique({ where: { clienteId: novo.id }, select: { id: true } }))
      ) {
        throw new AbortPar({ status: "abortado-conflito-1a1", antigoId: antigo.id, novoId: novo.id, conta, tabela: "PerfilDescoberta" });
      }
      if (
        (await tx.planoUmaPagina.findUnique({ where: { clienteId: antigo.id }, select: { id: true } })) &&
        (await tx.planoUmaPagina.findUnique({ where: { clienteId: novo.id }, select: { id: true } }))
      ) {
        throw new AbortPar({ status: "abortado-conflito-1a1", antigoId: antigo.id, novoId: novo.id, conta, tabela: "PlanoUmaPagina" });
      }
      if (
        (await tx.checklistOrganizacao.findUnique({ where: { clienteId: antigo.id }, select: { id: true } })) &&
        (await tx.checklistOrganizacao.findUnique({ where: { clienteId: novo.id }, select: { id: true } }))
      ) {
        throw new AbortPar({ status: "abortado-conflito-1a1", antigoId: antigo.id, novoId: novo.id, conta, tabela: "ChecklistOrganizacao" });
      }

      // 2) Religa os 8 filhos por updateMany (antigo → novo).
      await tx.reuniaoCliente.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.movimentacaoBtg.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.interacaoCliente.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.metaCliente.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.eventoVida.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.grupoCliente.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.conversa.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.acaoPainel.updateMany({ where: { clienteVinculadoId: antigo.id }, data: { clienteVinculadoId: novo.id } });

      // 3) Religa os 1:1 (novo não tem — garantido pelo passo 1; no-op se antigo também não tem).
      await tx.perfilDescoberta.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.planoUmaPagina.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });
      await tx.checklistOrganizacao.updateMany({ where: { clienteId: antigo.id }, data: { clienteId: novo.id } });

      // 4) Copia os escalares (comportamento legado preservado).
      const patch = montarPatch(antigo, novo);
      const migrouEscalares = Object.keys(patch).length > 0;
      if (migrouEscalares) {
        await tx.clienteBackoffice.update({ where: { id: novo.id }, data: patch });
      }

      // 5) Guarda durável: nenhum filho CASCADE pode sobrar apontando para o antigo.
      const detalhes: string[] = [];
      for (const ch of cascadeChildren) {
        const rows = await tx.$queryRawUnsafe<{ c: number }[]>(
          `SELECT count(*)::int AS c FROM ${ch.table} WHERE "${ch.column}" = $1`,
          antigo.id,
        );
        const c = Number(rows[0]?.c ?? 0);
        if (c > 0) detalhes.push(`${ch.table}.${ch.column}=${c}`);
      }
      if (detalhes.length > 0) {
        throw new AbortPar({
          status: "abortado-filhos-restantes",
          antigoId: antigo.id,
          novoId: novo.id,
          conta,
          detalhe: detalhes.join(", "),
        });
      }

      // 6) Só agora deleta o antigo — sem filhos cascade, nada é destruído.
      await tx.clienteBackoffice.delete({ where: { id: antigo.id } });
      return { status: "merged", antigoId: antigo.id, novoId: novo.id, conta };
    });
  } catch (e) {
    if (e instanceof AbortPar) return e.resultado;
    throw e;
  }
}

export type CleanupSummary = {
  pares_encontrados: number;
  merged: number;
  abortados_conflito_1a1: number;
  abortados_filhos_restantes: number;
  antigos_sem_par_normalizados: number;
  antigos_sem_par_pulados: number;
  resultados: ParResultado[];
  erros: Array<{ id: string; conta: string; motivo: string }>;
};

/**
 * Orquestra o cleanup: acha pares (antigo sem zero / novo com zero), faz o
 * merge transacional de cada par, e para antigos sem par normaliza o
 * numeroConta (padStart 9) quando não colide.
 */
export async function executarMergeLeadingZeros(prisma: PrismaClient): Promise<CleanupSummary> {
  const todos = await prisma.clienteBackoffice.findMany({
    select: {
      id: true,
      numeroConta: true,
      proximaReuniaoAt: true,
      ultimaReuniaoAt: true,
      ultimoContatoAt: true,
      observacoes: true,
      perfilEmocional: true,
      classificacaoManual: true,
      classificacao: true,
    },
  });

  const antigos = todos.filter((c) => c.numeroConta && /^\d+$/.test(c.numeroConta) && !c.numeroConta.startsWith("0"));
  const novos = todos.filter((c) => c.numeroConta && c.numeroConta.startsWith("0"));
  const novosByConta = new Map(novos.map((n) => [n.numeroConta as string, n]));

  const cascadeChildren = await listarFilhosCascade(prisma);

  const summary: CleanupSummary = {
    pares_encontrados: 0,
    merged: 0,
    abortados_conflito_1a1: 0,
    abortados_filhos_restantes: 0,
    antigos_sem_par_normalizados: 0,
    antigos_sem_par_pulados: 0,
    resultados: [],
    erros: [],
  };

  for (const antigo of antigos) {
    const padded = normalizarConta(antigo.numeroConta);
    if (!padded) continue;
    const novo = novosByConta.get(padded);

    if (novo) {
      summary.pares_encontrados++;
      try {
        const r = await mergePar(prisma, antigo, novo, cascadeChildren);
        summary.resultados.push(r);
        if (r.status === "merged") summary.merged++;
        else if (r.status === "abortado-conflito-1a1") summary.abortados_conflito_1a1++;
        else summary.abortados_filhos_restantes++;
      } catch (e) {
        summary.erros.push({
          id: antigo.id,
          conta: antigo.numeroConta ?? "",
          motivo: e instanceof Error ? e.message : "erro desconhecido",
        });
      }
    } else {
      // Sem par: normaliza o numeroConta se a coluna padronizada estiver livre.
      const colisao = await prisma.clienteBackoffice.findFirst({
        where: { numeroConta: padded, NOT: { id: antigo.id } },
        select: { id: true },
      });
      if (colisao) {
        summary.antigos_sem_par_pulados++;
        continue;
      }
      try {
        await prisma.clienteBackoffice.update({ where: { id: antigo.id }, data: { numeroConta: padded } });
        summary.antigos_sem_par_normalizados++;
      } catch (e) {
        summary.erros.push({
          id: antigo.id,
          conta: antigo.numeroConta ?? "",
          motivo: e instanceof Error ? e.message : "erro desconhecido",
        });
      }
    }
  }

  return summary;
}
