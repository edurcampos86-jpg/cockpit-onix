"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth-helpers";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { parsePendencias } from "@/lib/cockpit-reuniao/derivar";
import type { ReuniaoPendencias } from "@/lib/cockpit-reuniao/tipos";

/**
 * Server Actions do PR-C — ações sobre as PENDÊNCIAS de uma ReuniaoEstruturada.
 *
 * Molde de `reuniao-estruturada.ts`: "use server", `getAuthContext`, validação
 * manual (sem Zod), `revalidatePath`. Parsing DEFENSIVO via `parsePendencias`
 * (a MESMA função que a leitura usa em derivar.ts) — assim o `indice` vindo da
 * UI casa com a posição no array que re-gravamos.
 *
 * Este é o PRIMEIRO caminho de UPDATE de ReuniaoEstruturada (até aqui só havia
 * `.create`) e o PRIMEIRO que cria AcaoPainel para um `userId` != criador.
 */

export type PendenciaActionState = { ok: boolean; error?: string };

type Lado = "assessor" | "cliente";

function ladoValido(v: string): v is Lado {
  return v === "assessor" || v === "cliente";
}

/**
 * Carrega a reunião + pendências canônicas, valida lado/índice. Retorna o
 * estado canônico (mutável) ou um erro padronizado — sem lançar exceção.
 */
async function carregarItem(
  reuniaoId: string,
  lado: string,
  indice: number,
  ctx: AuthContext,
) {
  if (!reuniaoId) return { erro: "Reunião não informada." as const };
  if (!ladoValido(lado)) return { erro: "Lado inválido." as const };
  if (!Number.isInteger(indice) || indice < 0) return { erro: "Índice inválido." as const };

  const reuniao = await prisma.reuniaoEstruturada.findUnique({
    where: { id: reuniaoId },
    select: {
      id: true,
      clienteId: true,
      pendencias: true,
      cliente: { select: { assessorCge: true } },
    },
  });
  if (!reuniao) return { erro: "Reunião não encontrada." as const };

  // RBAC — Camada 2 (escopo). Pendência de cliente fora do escopo do usuário =
  // "não encontrada" (não pode ver ⇒ não pode mutar) — mesma máscara de
  // inexistência das rotas-irmãs (apelido/route.ts, cockpit-reuniao/importar).
  // Reusa o assessorCge já carregado (sem 2ª query). Flag RBAC_ENFORCEMENT
  // (default OFF) → comportamento idêntico a hoje.
  if (await rbacEnforcementHabilitado()) {
    if (!(await clienteVisivelPorAssessorCge(reuniao.cliente?.assessorCge ?? null, ctx))) {
      return { erro: "Reunião não encontrada." as const };
    }
  }

  const pend = parsePendencias(reuniao.pendencias);
  const item = pend[lado][indice];
  if (!item) return { erro: "Pendência não encontrada." as const };

  return { reuniao, pend, item, lado };
}

/**
 * Marca uma pendência como realizada (concluido=true, concluidoEm=now ISO) e
 * re-grava o Json inteiro. Idempotente: item já concluído não falha.
 */
export async function marcarPendenciaRealizada(input: {
  reuniaoId: string;
  lado: string;
  indice: number;
}): Promise<PendenciaActionState> {
  const ctx = await getAuthContext();

  const r = await carregarItem(input.reuniaoId, input.lado, input.indice, ctx);
  if ("erro" in r) return { ok: false, error: r.erro };

  if (!r.item.concluido) {
    r.item.concluido = true;
    r.item.concluidoEm = new Date().toISOString();
    await prisma.reuniaoEstruturada.update({
      where: { id: r.reuniao.id },
      data: { pendencias: r.pend as ReuniaoPendencias },
    });
  }

  revalidatePath(`/empresas/investimentos/clientes/${r.reuniao.clienteId}`);
  return { ok: true };
}

/**
 * Reverte uma pendência para aberta (concluido=false, concluidoEm=null).
 * Idempotente: item já aberto não falha.
 */
export async function desmarcarPendencia(input: {
  reuniaoId: string;
  lado: string;
  indice: number;
}): Promise<PendenciaActionState> {
  const ctx = await getAuthContext();

  const r = await carregarItem(input.reuniaoId, input.lado, input.indice, ctx);
  if ("erro" in r) return { ok: false, error: r.erro };

  if (r.item.concluido) {
    r.item.concluido = false;
    r.item.concluidoEm = null;
    await prisma.reuniaoEstruturada.update({
      where: { id: r.reuniao.id },
      data: { pendencias: r.pend as ReuniaoPendencias },
    });
  }

  revalidatePath(`/empresas/investimentos/clientes/${r.reuniao.clienteId}`);
  return { ok: true };
}

/**
 * Roteia uma pendência para o Painel do Dia de uma pessoa COM login, criando um
 * AcaoPainel. NÃO marca a pendência como realizada (rotear e concluir são ações
 * distintas).
 *
 * Destino: resolve `destinatarioPessoaId` → Pessoa.userId. Pessoa sem login
 * (userId null) → erro, e NADA é criado.
 *
 * AcaoPainel: origem="local" + pendingSync=false + syncOp=null garantem que o
 * cowork (Chrome MCP) NUNCA puxe esta ação para write-back externo (o GET de
 * /cowork-sync filtra por pendingSync=true). noMeuDia=true faz cair no "Hoje".
 */
export async function rotearPendenciaParaPainel(input: {
  reuniaoId: string;
  lado: string;
  indice: number;
  destinatarioPessoaId: string;
}): Promise<PendenciaActionState> {
  const ctx = await getAuthContext();

  if (!input.destinatarioPessoaId) {
    return { ok: false, error: "Destinatário não informado." };
  }

  const r = await carregarItem(input.reuniaoId, input.lado, input.indice, ctx);
  if ("erro" in r) return { ok: false, error: r.erro };

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: input.destinatarioPessoaId },
    select: { userId: true },
  });
  if (!pessoa) return { ok: false, error: "Pessoa não encontrada." };
  if (!pessoa.userId) {
    return { ok: false, error: "Essa pessoa ainda não tem login no sistema." };
  }

  await prisma.acaoPainel.create({
    data: {
      userId: pessoa.userId,
      titulo: r.item.texto,
      origem: "local",
      noMeuDia: true,
      pendingSync: false,
      syncOp: null,
      clienteVinculadoId: r.reuniao.clienteId,
    },
  });

  return { ok: true };
}
