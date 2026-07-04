"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { uploadContrato, deleteContrato } from "@/lib/b2/upload";
import { b2ContratosConfigurado } from "@/lib/b2/client";
import { calcRiceScore } from "@/lib/rice";
import {
  MAX_ANEXOS,
  MAX_ANEXO_BYTES,
  tipoAnexoPermitido,
  extFromContentType,
  sanitizeNomeArquivo,
} from "@/lib/implementacoes/anexos";

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
 * Anexos (até 5, imagem ou PDF, 10 MB cada) são opcionais e vão pro Backblaze B2;
 * cada um vira uma linha ImplementacaoAnexo. O legado printUrl fica intacto, mas
 * não é mais alimentado por aqui (novos anexos vão pra ImplementacaoAnexo).
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
  const pagina = sOrNull(formData.get("pagina")); // rota de origem (FAB); null = não informada
  const inline = s(formData.get("origem")) === "fab"; // FAB: fica na página (sem redirect)
  let tipo = s(formData.get("tipo"));
  if (!TIPOS.includes(tipo)) tipo = "melhoria";

  if (!porQue || !oQue || !empresaId) {
    return { ok: false, error: "Preencha Por quê, O quê e a empresa." };
  }

  // Anexos: lê o conjunto (name="anexos"), descartando entradas vazias.
  const arquivos = formData
    .getAll("anexos")
    .filter((f): f is File => typeof f !== "string" && f.size > 0);

  // Validação server-side (fonte da verdade). Falha aqui = nada sobe pro B2.
  if (arquivos.length > MAX_ANEXOS) {
    return { ok: false, error: `No máximo ${MAX_ANEXOS} anexos por sugestão.` };
  }
  for (const f of arquivos) {
    if (!tipoAnexoPermitido(f.type)) {
      return {
        ok: false,
        error: `"${f.name || "arquivo"}" não é imagem nem PDF.`,
      };
    }
    if (f.size > MAX_ANEXO_BYTES) {
      return { ok: false, error: `"${f.name || "arquivo"}" passa de 10 MB.` };
    }
  }

  // Gate de storage: se há anexos mas o B2 (bucket contratos) não está
  // configurado no ambiente, falha com motivo CLARO em vez de estourar lá no
  // upload e cair no catch genérico. Mesma proteção que a rota do Jurídico.
  if (arquivos.length > 0 && !b2ContratosConfigurado()) {
    return {
      ok: false,
      error:
        "Não foi possível salvar os anexos: o armazenamento de arquivos não está configurado no servidor (falta a chave B2 de contratos). Avise o administrador — a sugestão sem anexo funciona normalmente.",
    };
  }

  // Sobe tudo pro B2 ANTES de criar a sugestão. Se algum upload falhar, limpa o
  // que já subiu e aborta — não deixa órfão no bucket nem sugestão sem anexo.
  const uploadedKeys: string[] = [];
  const anexosData: {
    b2Key: string;
    nomeArquivo: string;
    contentType: string;
    tamanhoBytes: number;
    ordem: number;
  }[] = [];
  try {
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      const buf = Buffer.from(await f.arrayBuffer());
      const ext = extFromContentType(f.type);
      const key = `implementacoes/${empresaId}/${ctx.userId}-${Date.now()}-${i}.${ext}`;
      await uploadContrato({ key, body: buf, contentType: f.type });
      uploadedKeys.push(key);
      anexosData.push({
        b2Key: key,
        nomeArquivo: sanitizeNomeArquivo(f.name || `anexo-${i + 1}.${ext}`),
        contentType: f.type,
        tamanhoBytes: f.size,
        ordem: i,
      });
    }

    // create + anexos numa única operação (nested create é atômico no Prisma).
    await prisma.implementacao.create({
      data: {
        userId: ctx.userId,
        empresaId,
        departamento: ctx.pessoa?.departamentoId ?? null,
        tipo,
        porQue,
        oQue,
        como,
        pagina,
        anexos: anexosData.length ? { create: anexosData } : undefined,
      },
    });
  } catch (err) {
    // Loga a causa REAL no servidor (antes o catch engolia tudo → o erro ficava
    // invisível em produção e o bug parecia um fantasma).
    console.error(
      "[criarImplementacao] falha ao salvar anexos/sugestão:",
      err,
    );
    // Falhou upload ou persistência: remove do B2 o que tiver subido.
    await Promise.allSettled(uploadedKeys.map((k) => deleteContrato(k)));
    return {
      ok: false,
      error: "Não consegui salvar os anexos. Tente novamente.",
    };
  }

  revalidatePath("/configuracoes/implementacoes");
  // FAB (origem=fab): fica na página atual e o modal mostra sucesso.
  // Form da página /nova: mantém o redirect pra central (comportamento original).
  if (inline) {
    return { ok: true };
  }
  redirect("/configuracoes/implementacoes");
}

/**
 * Remove UM anexo salvo: apaga o objeto no B2 e, só então, a linha. Ordem
 * proposital — se o B2 falhar, mantém a linha e aborta (sem deixar objeto órfão
 * no bucket nem linha apontando pra arquivo inexistente). Gate admin: a central
 * é admin-only. deleteContrato é idempotente (S3 delete não falha se já sumiu).
 */
export async function removerAnexo(
  anexoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return { ok: false, error: "Sem permissão." };

  const anexo = await prisma.implementacaoAnexo.findUnique({
    where: { id: anexoId },
    select: { b2Key: true },
  });
  if (!anexo) return { ok: true }; // já não existe — idempotente

  try {
    await deleteContrato(anexo.b2Key);
  } catch {
    return { ok: false, error: "Falha ao remover o arquivo do storage." };
  }
  await prisma.implementacaoAnexo.delete({ where: { id: anexoId } });
  revalidatePath("/configuracoes/implementacoes");
  return { ok: true };
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
