"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { isAdminMaster } from "@/lib/rbac-papeis";

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
  /* SÓ ADMIN MASTER. Editar papel É conceder acesso: quem mexe em
   * `adminGlobal` e no escopo operacional decide o que todo mundo enxerga.
   * Admin comum perdeu isto de propósito — ver `isAdminMaster`. */
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdminMaster(ctx)) {
    return { ok: false, error: "Apenas o Admin Master pode editar papéis." };
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

/**
 * SÓ ADMIN MASTER — o ponto único de conceder e revogar acesso.
 *
 * Carteira define QUEM enxerga QUAIS clientes: criar, mudar dono, acrescentar
 * CGE ou apoio é conceder; remover é revogar. Todas as operações de carteira
 * passam por aqui, então este é o gate que a regra do Eduardo pede — "conceder
 * e revogar acesso → só Admin Master".
 *
 * O nome `gateAdmin` ficou por compatibilidade com os dez chamadores; o que ele
 * exige agora está no corpo, não no nome.
 */
async function gateAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdminMaster(ctx)) {
    return { ok: false, error: "Apenas o Admin Master pode gerir carteiras." };
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

// ============================================================================
// PESSOAS & ACESSOS (RBAC Fase 3 UI). Atribui papel à Pessoa e gere os APOIOS
// (AcessoCarteira tipo="apoia"). O DONO da carteira vem de Carteira.donoId (aba
// Carteiras), NÃO daqui. Gate admin DENTRO de cada action. Sem enforcement.
// ============================================================================

export async function atribuirPapel(input: {
  pessoaId: string;
  papelId: string | null;
}): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  if (input.papelId) {
    const papel = await prisma.papel.findUnique({
      where: { id: input.papelId },
      select: { id: true },
    });
    if (!papel) return { ok: false, error: "Papel não encontrado." };
  }
  await prisma.pessoa.update({
    where: { id: input.pessoaId },
    data: { papelId: input.papelId },
  });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

export async function adicionarApoio(input: {
  pessoaId: string;
  carteiraId: string;
}): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  // @@unique([pessoaId, carteiraId]): no máx. 1 vínculo pessoa↔carteira.
  const existente = await prisma.acessoCarteira.findUnique({
    where: { pessoaId_carteiraId: { pessoaId: input.pessoaId, carteiraId: input.carteiraId } },
    select: { id: true },
  });
  if (existente) return { ok: false, error: "Pessoa já tem acesso a esta carteira." };
  await prisma.acessoCarteira.create({
    data: { pessoaId: input.pessoaId, carteiraId: input.carteiraId, tipo: "apoia" },
  });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

export async function removerApoio(input: { acessoId: string }): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  await prisma.acessoCarteira.delete({ where: { id: input.acessoId } });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Acesso por EMPRESA (`PessoaEmpresa`).
 *
 * Complementa — não substitui — o acesso por carteira/CGE acima. São escopos
 * diferentes: carteira decide QUAIS CLIENTES a pessoa vê; empresa decide QUAIS
 * EMPRESAS do grupo ela enxerga (nós do hub e páginas de `/empresas/*`).
 *
 * Até aqui a única forma de escrever nesta tabela era `psql` — exatamente o
 * problema que a tela de flags existe para resolver, recriado num lugar mais
 * sensível.
 *
 * Postura NÃO-DISRUPTIVA, e ela tem uma consequência de UX que a tela precisa
 * dizer em voz alta: pessoa SEM concessão nenhuma vê TUDO. Conceder a primeira
 * empresa a alguém RESTRINGE essa pessoa às empresas concedidas — é o momento
 * em que ela passa de "vê tudo" para "vê só isto". A regra completa está em
 * `lib/empresas/acesso-core.ts`.
 * ────────────────────────────────────────────────────────────── */

export async function concederEmpresa(input: {
  pessoaId: string;
  empresaId: string;
  incluiDescendentes: boolean;
}): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;

  // @@unique([pessoaId, empresaId]) — no máximo um vínculo por par.
  const existente = await prisma.pessoaEmpresa.findUnique({
    where: { pessoaId_empresaId: { pessoaId: input.pessoaId, empresaId: input.empresaId } },
    select: { id: true },
  });
  if (existente) return { ok: false, error: "Esta pessoa já tem acesso a esta empresa." };

  await prisma.pessoaEmpresa.create({
    data: {
      pessoaId: input.pessoaId,
      empresaId: input.empresaId,
      incluiDescendentes: input.incluiDescendentes,
    },
  });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

export async function revogarEmpresa(input: { acessoId: string }): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  await prisma.pessoaEmpresa.delete({ where: { id: input.acessoId } });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}

/** Liga/desliga a herança de UMA concessão já existente. */
export async function alternarHerancaEmpresa(input: {
  acessoId: string;
  incluiDescendentes: boolean;
}): Promise<CarteiraResult> {
  const g = await gateAdmin();
  if (!g.ok) return g;
  await prisma.pessoaEmpresa.update({
    where: { id: input.acessoId },
    data: { incluiDescendentes: input.incluiDescendentes },
  });
  revalidatePath("/configuracoes/permissoes");
  return { ok: true };
}
