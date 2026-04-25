"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { extrairPat } from "@/lib/integrations/pat";

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function sOrNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length === 0 ? null : t;
}

/* ──────────────────────────────────────────────────────────────────────────
   uploadPat — admin only.
   Salva PDF, extrai dados via Claude, cria registro Pat.
   ────────────────────────────────────────────────────────────────────────── */

export async function uploadPat(
  formData: FormData,
): Promise<{ ok: true; patId: string } | { ok: false; error: string }> {
  await requireAdmin();

  const pessoaId = s(formData.get("pessoaId"));
  const file = formData.get("pdf");

  if (!pessoaId) return { ok: false, error: "ID da pessoa ausente" };
  if (!(file instanceof File)) return { ok: false, error: "Arquivo PDF ausente" };
  if (file.size === 0) return { ok: false, error: "Arquivo vazio" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "PDF maior que 10MB" };
  if (!file.type.includes("pdf")) {
    return { ok: false, error: `Apenas PDF é aceito (recebido: ${file.type})` };
  }

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: { id: true },
  });
  if (!pessoa) return { ok: false, error: "Pessoa não encontrada" };

  const buf = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buf.toString("base64");

  // Cria registro pendente
  const pat = await prisma.pat.create({
    data: {
      pessoaId,
      filename: file.name,
      pdfBase64,
      bytes: file.size,
      dataPat: new Date(), // placeholder — será atualizado após extração
      status: "pendente",
    },
  });

  // Extração via Claude
  let extraction;
  try {
    extraction = await extrairPat(pdfBase64);
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.pat.update({
      where: { id: pat.id },
      data: { status: "erro", erroMensagem: msg.slice(0, 500) },
    });
    return { ok: false, error: `Falha na extração: ${msg}` };
  }

  // Atualiza com dados extraídos
  const dataPat = extraction.dataPat ? new Date(extraction.dataPat) : new Date();
  if (Number.isNaN(dataPat.getTime())) {
    await prisma.pat.update({
      where: { id: pat.id },
      data: { status: "erro", erroMensagem: "Data do PAT inválida na extração" },
    });
    return { ok: false, error: "Data do PAT inválida na extração" };
  }

  await prisma.pat.update({
    where: { id: pat.id },
    data: {
      status: "extraido",
      dataPat,
      perspectiva: extraction.perspectiva,
      ambienteCelula: extraction.ambienteCelula,
      ambienteNome: extraction.ambienteNome,
      orientacao: extraction.orientacao,
      aproveitamento: extraction.aproveitamento,
      principaisCompetencias: extraction.principaisCompetencias,
      caracteristicas: extraction.caracteristicas,
      estrutural: extraction.estrutural ?? undefined,
      iconeEstrutural: extraction.iconeEstrutural ?? undefined,
      tendencias: extraction.tendencias ?? undefined,
      risco: extraction.risco ?? undefined,
      competenciasEstrategicas: extraction.competenciasEstrategicas,
      ambiente: extraction.ambiente ?? undefined,
      resumido: extraction.resumido,
      detalhado: extraction.detalhado,
      sugestoes: extraction.sugestoes,
      gerencial: extraction.gerencial,
    },
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true, patId: pat.id };
}

/* ──────────────────────────────────────────────────────────────────────────
   atualizarLeituraPat — admin escreve campos textuais (pontos fortes etc)
   ────────────────────────────────────────────────────────────────────────── */

export async function atualizarLeituraPat(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const pat = await prisma.pat.update({
    where: { id },
    data: {
      pontosFortes: sOrNull(formData.get("pontosFortes")),
      pontosAtencao: sOrNull(formData.get("pontosAtencao")),
      estiloComunicacao: sOrNull(formData.get("estiloComunicacao")),
    },
    select: { pessoaId: true },
  });

  revalidatePath(`/time/${pat.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   excluirPat — admin only
   ────────────────────────────────────────────────────────────────────────── */

export async function excluirPat(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const pat = await prisma.pat.findUnique({
    where: { id },
    select: { pessoaId: true },
  });
  if (!pat) return { ok: false, error: "PAT não encontrado" };

  await prisma.pat.delete({ where: { id } });
  revalidatePath(`/time/${pat.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   recalcularPat — admin force re-extraction (após melhorias no parser)
   ────────────────────────────────────────────────────────────────────────── */

export async function recalcularPat(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const pat = await prisma.pat.findUnique({
    where: { id },
    select: { id: true, pessoaId: true, pdfBase64: true },
  });
  if (!pat) return { ok: false, error: "PAT não encontrado" };
  if (!pat.pdfBase64) return { ok: false, error: "PDF original ausente — não dá pra recalcular" };

  let extraction;
  try {
    extraction = await extrairPat(pat.pdfBase64);
  } catch (e) {
    return { ok: false, error: `Falha: ${(e as Error).message}` };
  }

  const dataPat = extraction.dataPat ? new Date(extraction.dataPat) : new Date();

  await prisma.pat.update({
    where: { id },
    data: {
      status: "extraido",
      dataPat,
      perspectiva: extraction.perspectiva,
      ambienteCelula: extraction.ambienteCelula,
      ambienteNome: extraction.ambienteNome,
      orientacao: extraction.orientacao,
      aproveitamento: extraction.aproveitamento,
      principaisCompetencias: extraction.principaisCompetencias,
      caracteristicas: extraction.caracteristicas,
      estrutural: extraction.estrutural ?? undefined,
      iconeEstrutural: extraction.iconeEstrutural ?? undefined,
      tendencias: extraction.tendencias ?? undefined,
      risco: extraction.risco ?? undefined,
      competenciasEstrategicas: extraction.competenciasEstrategicas,
      ambiente: extraction.ambiente ?? undefined,
      resumido: extraction.resumido,
      detalhado: extraction.detalhado,
      sugestoes: extraction.sugestoes,
      gerencial: extraction.gerencial,
    },
  });

  revalidatePath(`/time/${pat.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   Wrappers void
   ────────────────────────────────────────────────────────────────────────── */

export async function uploadPatForm(formData: FormData): Promise<void> {
  const r = await uploadPat(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function atualizarLeituraPatForm(formData: FormData): Promise<void> {
  const r = await atualizarLeituraPat(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function excluirPatForm(formData: FormData): Promise<void> {
  const r = await excluirPat(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function recalcularPatForm(formData: FormData): Promise<void> {
  const r = await recalcularPat(formData);
  if (!r.ok) throw new Error(r.error);
}
