"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { TIPOS_ACORDO, type TipoAcordoValue } from "@/lib/team";

function isTipo(v: string): v is TipoAcordoValue {
  return TIPOS_ACORDO.some((t) => t.value === v);
}

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function sOrNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length === 0 ? null : t;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const t = s(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ──────────────────────────────────────────────────────────────────────────
   criarAcordo — cria novo acordo e fecha o vigente automaticamente
   ────────────────────────────────────────────────────────────────────────── */

export async function criarAcordo(
  formData: FormData,
): Promise<{ ok: true; acordoId: string } | { ok: false; error: string }> {
  await requireAdmin();

  const pessoaId = s(formData.get("pessoaId"));
  const tipoRaw = s(formData.get("tipo"));
  const dataInicio = dateOrNull(formData.get("dataInicio")) ?? new Date();
  const file = formData.get("contrato");

  if (!pessoaId) return { ok: false, error: "ID da pessoa ausente" };
  if (!isTipo(tipoRaw)) return { ok: false, error: "Tipo de acordo inválido" };

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: { id: true },
  });
  if (!pessoa) return { ok: false, error: "Pessoa não encontrada" };

  // PDF opcional
  let contratoFilename: string | null = null;
  let contratoBase64: string | null = null;
  let contratoMimeType: string | null = null;
  let contratoBytes: number | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      return { ok: false, error: "PDF do contrato maior que 8MB" };
    }
    if (!file.type.includes("pdf")) {
      return { ok: false, error: `Apenas PDF é aceito (recebido: ${file.type})` };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    contratoBase64 = buf.toString("base64");
    contratoFilename = file.name;
    contratoMimeType = file.type;
    contratoBytes = file.size;
  }

  // Transação: fechar acordo vigente (se houver) + criar novo
  const novo = await prisma.$transaction(async (tx) => {
    // Fecha o vigente — qualquer acordo da pessoa com dataFim null
    await tx.acordoComercial.updateMany({
      where: { pessoaId, dataFim: null },
      data: { dataFim: dataInicio },
    });

    // Cria o novo
    return tx.acordoComercial.create({
      data: {
        pessoaId,
        tipo: tipoRaw,
        regrasEspeciais: sOrNull(formData.get("regrasEspeciais")),
        observacoes: sOrNull(formData.get("observacoes")),
        dataInicio,
        contratoFilename,
        contratoBase64,
        contratoMimeType,
        contratoBytes,
      },
    });
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true, acordoId: novo.id };
}

/* ──────────────────────────────────────────────────────────────────────────
   atualizarAcordo — edita um acordo existente sem mexer em vigência
   ────────────────────────────────────────────────────────────────────────── */

export async function atualizarAcordo(
  formData: FormData,
): Promise<{ ok: true; acordoId: string } | { ok: false; error: string }> {
  await requireAdmin();

  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const tipoRaw = s(formData.get("tipo"));
  if (!isTipo(tipoRaw)) return { ok: false, error: "Tipo inválido" };

  const file = formData.get("contrato");

  const baseData: {
    tipo: string;
    regrasEspeciais: string | null;
    observacoes: string | null;
  } = {
    tipo: tipoRaw,
    regrasEspeciais: sOrNull(formData.get("regrasEspeciais")),
    observacoes: sOrNull(formData.get("observacoes")),
  };

  // Se um novo PDF foi enviado, atualiza; senão, mantém o anterior
  let pdfData: {
    contratoFilename: string;
    contratoBase64: string;
    contratoMimeType: string;
    contratoBytes: number;
  } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      return { ok: false, error: "PDF do contrato maior que 8MB" };
    }
    if (!file.type.includes("pdf")) {
      return { ok: false, error: `Apenas PDF é aceito (recebido: ${file.type})` };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    pdfData = {
      contratoFilename: file.name,
      contratoBase64: buf.toString("base64"),
      contratoMimeType: file.type,
      contratoBytes: file.size,
    };
  }

  const updated = await prisma.acordoComercial.update({
    where: { id },
    data: { ...baseData, ...(pdfData ?? {}) },
  });

  revalidatePath(`/time/${updated.pessoaId}`);
  return { ok: true, acordoId: updated.id };
}

/* ──────────────────────────────────────────────────────────────────────────
   encerrarAcordo — admin marca um acordo como finalizado (sem criar novo)
   ────────────────────────────────────────────────────────────────────────── */

export async function encerrarAcordo(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  const dataFim = dateOrNull(formData.get("dataFim")) ?? new Date();
  if (!id) return { ok: false, error: "ID ausente" };

  const acordo = await prisma.acordoComercial.update({
    where: { id },
    data: { dataFim },
  });

  revalidatePath(`/time/${acordo.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   excluirAcordo — admin only, remove permanentemente
   ────────────────────────────────────────────────────────────────────────── */

export async function excluirAcordo(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const acordo = await prisma.acordoComercial.findUnique({
    where: { id },
    select: { pessoaId: true },
  });
  if (!acordo) return { ok: false, error: "Acordo não encontrado" };

  await prisma.acordoComercial.delete({ where: { id } });
  revalidatePath(`/time/${acordo.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   Wrappers void para uso direto em <form action={...}> (Next 16)
   ────────────────────────────────────────────────────────────────────────── */

export async function criarAcordoForm(formData: FormData): Promise<void> {
  const r = await criarAcordo(formData);
  if (!r.ok) throw new Error(r.error);
}

export async function atualizarAcordoForm(formData: FormData): Promise<void> {
  const r = await atualizarAcordo(formData);
  if (!r.ok) throw new Error(r.error);
}

export async function encerrarAcordoForm(formData: FormData): Promise<void> {
  const r = await encerrarAcordo(formData);
  if (!r.ok) throw new Error(r.error);
}

export async function excluirAcordoForm(formData: FormData): Promise<void> {
  const r = await excluirAcordo(formData);
  if (!r.ok) throw new Error(r.error);
}
