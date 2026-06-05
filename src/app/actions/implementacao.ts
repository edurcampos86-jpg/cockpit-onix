"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { uploadContrato } from "@/lib/b2/upload";
import { calcRiceScore } from "@/lib/rice";

const TIPOS = ["melhoria", "erro", "ideia"];
const STATUSES = ["triagem", "aprovada", "em-andamento", "concluida", "recusada"];

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function sOrNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length === 0 ? null : t;
}
function intOrNull(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.trunc(v);
}

export type CriarState = { ok: boolean; error?: string };

/**
 * Cria uma Implementação (Golden Circle). Obrigatórios: porQue, oQue, empresaId.
 * Print é opcional e vai pro Backblaze B2 (guardamos a key em printUrl).
 * Assinatura compatível com useActionState (prevState, formData).
 */
export async function criarImplementacao(
  _prev: CriarState,
  formData: FormData,
): Promise<CriarState> {
  const ctx = await getAuthContext();

  const empresaId = s(formData.get("empresaId"));
  const porQue = s(formData.get("porQue"));
  const oQue = s(formData.get("oQue"));
  const como = sOrNull(formData.get("como"));
  let tipo = s(formData.get("tipo"));
  if (!TIPOS.includes(tipo)) tipo = "melhoria";

  if (!porQue || !oQue || !empresaId) {
    return { ok: false, error: "Preencha Por quê, O quê e a empresa." };
  }

  let printUrl: string | null = null;
  const file = formData.get("print");
  if (file && typeof file !== "string" && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const key = `implementacoes/${empresaId}/${ctx.userId}-${Date.now()}.${ext}`;
    await uploadContrato({
      key,
      body: buf,
      contentType: file.type || "image/png",
    });
    printUrl = key;
  }

  await prisma.implementacao.create({
    data: {
      userId: ctx.userId,
      empresaId,
      departamento: ctx.pessoa?.departamentoId ?? null,
      tipo,
      porQue,
      oQue,
      como,
      printUrl,
    },
  });

  revalidatePath("/configuracoes/implementacoes");
  redirect("/configuracoes/implementacoes");
}

/** Atualiza os 4 fatores RICE e recalcula o score. Cliente envia o conjunto completo. */
export async function atualizarRice(
  id: string,
  vals: {
    reach?: number | null;
    impact?: number | null;
    confidence?: number | null;
    effort?: number | null;
  },
): Promise<void> {
  await getAuthContext();

  const reach = intOrNull(vals.reach);
  const impact = intOrNull(vals.impact);
  const confidence = intOrNull(vals.confidence);
  const effort = intOrNull(vals.effort);
  const score = calcRiceScore(reach, impact, confidence, effort);

  await prisma.implementacao.update({
    where: { id },
    data: { reach, impact, confidence, effort, score },
  });
  revalidatePath("/configuracoes/implementacoes");
}

/** Atualiza o status (triagem|aprovada|em-andamento|concluida|recusada). */
export async function atualizarStatus(id: string, status: string): Promise<void> {
  await getAuthContext();
  if (!STATUSES.includes(status)) return;

  await prisma.implementacao.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/configuracoes/implementacoes");
}
