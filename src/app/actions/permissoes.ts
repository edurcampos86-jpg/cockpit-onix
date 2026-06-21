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
