"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  PERMISSOES_TUDO,
  TEMPLATES,
  type ModuloEcossistema,
  type PermissoesAcesso,
} from "@/lib/permissoes";

const MODULOS_KEYS: ModuloEcossistema[] = [
  "mkt",
  "corretora",
  "backoffice",
  "time",
  "timeInsights",
  "metodo",
  "glossario",
  "integracoes",
  "configuracoes",
];

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/* ──────────────────────────────────────────────────────────────────────────
   updatePermissoes — admin only.
   Aceita um campo por módulo (checkbox: presença = true, ausência = false).
   ────────────────────────────────────────────────────────────────────────── */

export async function updatePermissoes(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const pessoaId = s(formData.get("pessoaId"));
  if (!pessoaId) return { ok: false, error: "ID da pessoa ausente" };

  const permissoes: PermissoesAcesso = { ...PERMISSOES_TUDO };
  for (const key of MODULOS_KEYS) {
    permissoes[key] = formData.get(`p_${key}`) === "on";
  }

  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { permissoes },
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true };
}

export async function updatePermissoesForm(formData: FormData): Promise<void> {
  const r = await updatePermissoes(formData);
  if (!r.ok) throw new Error(r.error);
}

/* ──────────────────────────────────────────────────────────────────────────
   aplicarTemplate — admin only. Atalho pra aplicar um perfil pronto.
   ────────────────────────────────────────────────────────────────────────── */

export async function aplicarTemplate(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const pessoaId = s(formData.get("pessoaId"));
  const templateId = s(formData.get("templateId"));
  if (!pessoaId) return { ok: false, error: "ID da pessoa ausente" };
  if (!templateId) return { ok: false, error: "Template ausente" };

  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { ok: false, error: "Template inválido" };

  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { permissoes: template.permissoes },
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true };
}

export async function aplicarTemplateForm(formData: FormData): Promise<void> {
  const r = await aplicarTemplate(formData);
  if (!r.ok) throw new Error(r.error);
}
