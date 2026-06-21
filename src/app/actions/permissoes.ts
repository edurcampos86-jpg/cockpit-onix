"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

const ESCOPOS = ["propria", "propria_mais_apoio", "todas"];
const NIVEIS = ["nenhum", "membro", "admin"];
const AREAS = ["investimentos", "corretora", "imobiliaria", "qualidade", "configuracoes"];

export type SalvarPapelInput = {
  papelId: string;
  escopoOperacional: string;
  adminGlobal: boolean;
  permissoes: { area: string; nivel: string }[];
};

export type SalvarPapelState = { ok: boolean; error?: string };

/**
 * Atualiza um Papel existente (escopoOperacional + adminGlobal) e faz UPSERT das
 * PapelPermissao por (papelId, area). nível "nenhum" => remove a linha (ausência
 * = sem acesso, igual ao seed). Gate admin DENTRO da action. NÃO cria papéis,
 * NÃO toca nenhuma outra tabela, sem enforcement.
 */
export async function salvarPapel(input: SalvarPapelInput): Promise<SalvarPapelState> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return { ok: false, error: "Apenas administradores podem editar papéis." };
  }

  if (!ESCOPOS.includes(input.escopoOperacional)) {
    return { ok: false, error: "Escopo operacional inválido." };
  }

  const papel = await prisma.papel.findUnique({ where: { id: input.papelId } });
  if (!papel) return { ok: false, error: "Papel não encontrado." };

  await prisma.papel.update({
    where: { id: input.papelId },
    data: {
      escopoOperacional: input.escopoOperacional,
      adminGlobal: input.adminGlobal,
    },
  });

  for (const { area, nivel } of input.permissoes) {
    if (!AREAS.includes(area) || !NIVEIS.includes(nivel)) continue;
    if (nivel === "nenhum") {
      await prisma.papelPermissao.deleteMany({
        where: { papelId: input.papelId, area },
      });
    } else {
      await prisma.papelPermissao.upsert({
        where: { papelId_area: { papelId: input.papelId, area } },
        create: { papelId: input.papelId, area, nivel },
        update: { nivel },
      });
    }
  }

  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

// ============================================================================
// CARTEIRAS (RBAC Fase 3 UI — aba Carteiras). Cada action gateia admin DENTRO.
// Toca SOMENTE Carteira / CarteiraCge / AcessoCarteira. NÃO toca ClienteBackoffice
// (a contagem de clientes é leitura na page). Sem enforcement.
// ============================================================================

export type CarteiraResult = { ok: boolean; error?: string; id?: string };

async function gateAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return { ok: false, error: "Apenas administradores podem gerir carteiras." };
  }
  return { ok: true };
}

export async function criarCarteira(input: { nome: string; donoId: string }): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  const nome = input.nome?.trim();
  if (!nome) return { ok: false, error: "Informe o nome da carteira." };
  if (!input.donoId) return { ok: false, error: "Selecione o dono da carteira." };
  const dono = await prisma.pessoa.findUnique({ where: { id: input.donoId }, select: { id: true } });
  if (!dono) return { ok: false, error: "Pessoa (dono) não encontrada." };

  const c = await prisma.carteira.create({ data: { nome, donoId: input.donoId } });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true, id: c.id };
}

export async function atualizarCarteira(input: {
  carteiraId: string;
  nome: string;
  donoId: string;
}): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  const nome = input.nome?.trim();
  if (!nome) return { ok: false, error: "Informe o nome da carteira." };
  if (!input.donoId) return { ok: false, error: "Selecione o dono da carteira." };
  const dono = await prisma.pessoa.findUnique({ where: { id: input.donoId }, select: { id: true } });
  if (!dono) return { ok: false, error: "Pessoa (dono) não encontrada." };

  await prisma.carteira.update({
    where: { id: input.carteiraId },
    data: { nome, donoId: input.donoId },
  });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

export async function excluirCarteira(input: { carteiraId: string }): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  // Bloqueia se houver acessos vinculados (FK RESTRICT; aba Pessoas vem depois).
  const acessos = await prisma.acessoCarteira.count({ where: { carteiraId: input.carteiraId } });
  if (acessos > 0) {
    return {
      ok: false,
      error: `Carteira tem ${acessos} acesso(s) de pessoa vinculado(s). Remova-os antes de excluir.`,
    };
  }
  // Remove os CGEs antes (FK RESTRICT) e então a carteira, atomicamente.
  await prisma.$transaction([
    prisma.carteiraCge.deleteMany({ where: { carteiraId: input.carteiraId } }),
    prisma.carteira.delete({ where: { id: input.carteiraId } }),
  ]);
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

export async function adicionarCge(input: { carteiraId: string; cge: string }): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  const cge = input.cge?.trim();
  if (!cge) return { ok: false, error: "Informe o CGE." };
  // cge é @unique — se já existe, erro claro (mesma carteira ou outra).
  const existente = await prisma.carteiraCge.findUnique({
    where: { cge },
    select: { carteiraId: true },
  });
  if (existente) {
    return {
      ok: false,
      error:
        existente.carteiraId === input.carteiraId
          ? "CGE já está nesta carteira."
          : "CGE já pertence a outra carteira.",
    };
  }
  await prisma.carteiraCge.create({ data: { carteiraId: input.carteiraId, cge } });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

export async function removerCge(input: { cgeId: string }): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  await prisma.carteiraCge.delete({ where: { id: input.cgeId } });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}
