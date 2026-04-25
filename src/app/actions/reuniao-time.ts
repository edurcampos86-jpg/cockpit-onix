"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { extrairReuniao } from "@/lib/integrations/reuniao-time";
import { CATEGORIAS_REUNIAO } from "@/lib/team";

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function sOrNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length === 0 ? null : t;
}
function dateOrNow(v: FormDataEntryValue | null): Date {
  const t = s(v);
  if (!t) return new Date();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function isCategoria(v: string): boolean {
  return CATEGORIAS_REUNIAO.some((c) => c.value === v);
}

type ProximoPasso = { texto: string; concluido: boolean; concluidoEm: string | null };

/* ──────────────────────────────────────────────────────────────────────────
   uploadReuniao — admin only.
   Cria reunião + salva PDF + extrai dados via Claude (se houver PDF).
   ────────────────────────────────────────────────────────────────────────── */

export async function uploadReuniao(
  formData: FormData,
): Promise<{ ok: true; reuniaoId: string } | { ok: false; error: string }> {
  const ctx = await requireAdmin();

  const data = dateOrNow(formData.get("data"));
  const titulo = sOrNull(formData.get("titulo"));
  const categoriaRaw = s(formData.get("categoria"));
  const observacoes = sOrNull(formData.get("observacoes"));
  const transcricaoManual = sOrNull(formData.get("transcricao"));
  const resumoManual = sOrNull(formData.get("resumo"));

  if (!isCategoria(categoriaRaw))
    return { ok: false, error: "Categoria inválida" };

  // Participantes (multivalor)
  const participantesRaw = formData.getAll("participantes");
  const participantesIds = participantesRaw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);

  if (participantesIds.length === 0) {
    return {
      ok: false,
      error: "Selecione ao menos 1 participante (membro do time)",
    };
  }

  // Validar que todas as pessoas existem e estão ativas
  const pessoas = await prisma.pessoa.findMany({
    where: { id: { in: participantesIds } },
    select: { id: true },
  });
  if (pessoas.length !== participantesIds.length) {
    return { ok: false, error: "Um ou mais participantes não foram encontrados" };
  }

  // PDF opcional
  const file = formData.get("pdf");
  let filename: string | null = null;
  let pdfBase64: string | null = null;
  let bytes: number | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, error: "PDF maior que 15MB" };
    }
    if (!file.type.includes("pdf")) {
      return { ok: false, error: `Apenas PDF é aceito (recebido: ${file.type})` };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    pdfBase64 = buf.toString("base64");
    filename = file.name;
    bytes = file.size;
  }

  // Cria a reunião + participantes em transação
  const created = await prisma.reuniaoTime.create({
    data: {
      data,
      titulo,
      categoria: categoriaRaw,
      observacoes,
      filename,
      pdfBase64,
      bytes,
      transcricao: transcricaoManual,
      resumo: resumoManual,
      criadoPorUserId: ctx.userId,
      status: pdfBase64 ? "pendente" : "manual",
      participantes: {
        create: participantesIds.map((pessoaId) => ({ pessoaId })),
      },
    },
  });

  // Se tem PDF, dispara extração
  if (pdfBase64) {
    try {
      const extracao = await extrairReuniao(pdfBase64);
      const proximosPassos: ProximoPasso[] = extracao.proximosPassos.map((p) => ({
        texto: p.texto,
        concluido: false,
        concluidoEm: null,
      }));

      await prisma.reuniaoTime.update({
        where: { id: created.id },
        data: {
          status: "extraido",
          resumo: resumoManual ?? extracao.resumo, // não sobrescreve resumo manual
          proximosPassos,
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      await prisma.reuniaoTime.update({
        where: { id: created.id },
        data: { status: "erro", erroMensagem: msg.slice(0, 500) },
      });
      // Mesmo com erro de extração, a reunião ficou criada — admin pode editar manualmente
    }
  }

  for (const pid of participantesIds) revalidatePath(`/time/${pid}`);
  return { ok: true, reuniaoId: created.id };
}

/* ──────────────────────────────────────────────────────────────────────────
   atualizarReuniao — admin edita dados básicos
   ────────────────────────────────────────────────────────────────────────── */

export async function atualizarReuniao(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const reuniao = await prisma.reuniaoTime.update({
    where: { id },
    data: {
      titulo: sOrNull(formData.get("titulo")),
      data: dateOrNow(formData.get("data")),
      resumo: sOrNull(formData.get("resumo")),
      observacoes: sOrNull(formData.get("observacoes")),
    },
    include: { participantes: { select: { pessoaId: true } } },
  });

  for (const p of reuniao.participantes) revalidatePath(`/time/${p.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   toggleProximoPasso — admin OU participante marca/desmarca um item
   ────────────────────────────────────────────────────────────────────────── */

export async function toggleProximoPasso(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const id = s(formData.get("id"));
  const idxRaw = s(formData.get("indice"));
  const idx = parseInt(idxRaw, 10);

  if (!id) return { ok: false, error: "ID ausente" };
  if (Number.isNaN(idx) || idx < 0) return { ok: false, error: "Índice inválido" };

  // Buscar reunião + verificar permissão
  const reuniao = await prisma.reuniaoTime.findUnique({
    where: { id },
    include: { participantes: { select: { pessoaId: true } } },
  });
  if (!reuniao) return { ok: false, error: "Reunião não encontrada" };

  // Permissão: admin OU participante
  const isParticipante = ctx.pessoa
    ? reuniao.participantes.some((p) => p.pessoaId === ctx.pessoa!.id)
    : false;
  if (!isAdmin(ctx) && !isParticipante) {
    return { ok: false, error: "Sem permissão" };
  }

  const passos = (reuniao.proximosPassos as ProximoPasso[] | null) ?? [];
  if (idx >= passos.length) return { ok: false, error: "Índice fora do range" };

  const atualizado = passos.map((p, i) =>
    i === idx
      ? {
          ...p,
          concluido: !p.concluido,
          concluidoEm: !p.concluido ? new Date().toISOString() : null,
        }
      : p,
  );

  await prisma.reuniaoTime.update({
    where: { id },
    data: { proximosPassos: atualizado },
  });

  for (const p of reuniao.participantes) revalidatePath(`/time/${p.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   excluirReuniao — admin only
   ────────────────────────────────────────────────────────────────────────── */

export async function excluirReuniao(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const reuniao = await prisma.reuniaoTime.findUnique({
    where: { id },
    include: { participantes: { select: { pessoaId: true } } },
  });
  if (!reuniao) return { ok: false, error: "Reunião não encontrada" };

  await prisma.reuniaoTime.delete({ where: { id } });
  for (const p of reuniao.participantes) revalidatePath(`/time/${p.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   recalcularReuniao — admin force re-extração
   ────────────────────────────────────────────────────────────────────────── */

export async function recalcularReuniao(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const reuniao = await prisma.reuniaoTime.findUnique({
    where: { id },
    select: {
      id: true,
      pdfBase64: true,
      participantes: { select: { pessoaId: true } },
    },
  });
  if (!reuniao) return { ok: false, error: "Reunião não encontrada" };
  if (!reuniao.pdfBase64) return { ok: false, error: "Sem PDF — não dá pra recalcular" };

  let extracao;
  try {
    extracao = await extrairReuniao(reuniao.pdfBase64);
  } catch (e) {
    return { ok: false, error: `Falha: ${(e as Error).message}` };
  }

  // Preserva concluídos quando re-extrai (mesmo texto = mantém concluido)
  const passosAntigos = ((await prisma.reuniaoTime.findUnique({
    where: { id },
    select: { proximosPassos: true },
  }))?.proximosPassos as ProximoPasso[] | null) ?? [];

  const novosPassos: ProximoPasso[] = extracao.proximosPassos.map((p) => {
    const antigo = passosAntigos.find((a) => a.texto === p.texto);
    return {
      texto: p.texto,
      concluido: antigo?.concluido ?? false,
      concluidoEm: antigo?.concluidoEm ?? null,
    };
  });

  await prisma.reuniaoTime.update({
    where: { id },
    data: {
      status: "extraido",
      resumo: extracao.resumo,
      proximosPassos: novosPassos,
    },
  });

  for (const p of reuniao.participantes) revalidatePath(`/time/${p.pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   Wrappers void
   ────────────────────────────────────────────────────────────────────────── */

export async function uploadReuniaoForm(formData: FormData): Promise<void> {
  const r = await uploadReuniao(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function atualizarReuniaoForm(formData: FormData): Promise<void> {
  const r = await atualizarReuniao(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function toggleProximoPassoForm(formData: FormData): Promise<void> {
  const r = await toggleProximoPasso(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function excluirReuniaoForm(formData: FormData): Promise<void> {
  const r = await excluirReuniao(formData);
  if (!r.ok) throw new Error(r.error);
}
export async function recalcularReuniaoForm(formData: FormData): Promise<void> {
  const r = await recalcularReuniao(formData);
  if (!r.ok) throw new Error(r.error);
}
