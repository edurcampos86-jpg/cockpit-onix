"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { extrairPat } from "@/lib/integrations/pat";
import { MAX_PDF_BYTES, MAX_PDF_LABEL, formatarMB } from "@/lib/pat-upload";

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

   ── Por que esta action devolve estado em vez de lançar ───────────────────
   Ela já devolvia `{ ok: false, error }` em todos os ramos de guarda. O
   problema nunca esteve aqui: estava no wrapper `uploadPatForm`, que
   convertia a recusa educada num `throw`. Sem `error.tsx` no projeto, o Next
   trocava a mensagem por um digest e a tela mostrava 500 sem texto.

   Custou dois dias de diagnóstico errado — incluindo teste em domínio legado
   por suspeita de bug de rota — para descobrir que a causa era um arquivo
   grande demais e que o sistema SABIA disso desde o primeiro clique.

   Agora a assinatura é a de `useActionState` (mesma de `saveNotifyConfig`), o
   wrapper morreu, e a regra passa a ser: NENHUM caminho sai daqui por
   exceção. Toda falha vira texto que cabe na tela.
   ────────────────────────────────────────────────────────────────────────── */

export type UploadPatState =
  | undefined
  | { ok: true; patId: string; error?: never }
  | { ok?: false; error: string; patId?: never };

/** Mensagem de erro legível a partir de um `unknown` de catch. */
function motivo(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function uploadPat(
  _state: UploadPatState,
  formData: FormData,
): Promise<UploadPatState> {
  // FORA de qualquer try: `requireAdmin` sinaliza com `redirect()`, que é um
  // throw especial do Next. Um catch em volta o engoliria e devolveria "erro
  // inesperado" para quem apenas não é admin — trocando um redirecionamento
  // correto por uma mensagem falsa.
  await requireAdmin();

  const pessoaId = s(formData.get("pessoaId"));
  const file = formData.get("pdf");

  if (!pessoaId) return { error: "ID da pessoa ausente — recarregue a ficha e tente de novo." };
  if (!(file instanceof File)) return { error: "Nenhum arquivo foi anexado." };
  if (file.size === 0) return { error: "O arquivo está vazio." };

  if (file.size > MAX_PDF_BYTES) {
    return {
      error:
        `Este PDF tem ${formatarMB(file.size)}, acima do limite de ${MAX_PDF_LABEL}. ` +
        `Comprima o PDF antes de enviar. Reexportar pelo navegador não reduz o suficiente.`,
    };
  }

  if (!file.type.includes("pdf")) {
    const tipo = file.type || "de tipo desconhecido";
    return { error: `Só PDF é aceito aqui — o arquivo enviado é ${tipo}.` };
  }

  // ── Gravação do PDF ───────────────────────────────────────────────────────
  // `arrayBuffer()` e o `create` podem falhar por conta própria (memória,
  // constraint, banco fora). Sem este catch, voltariam a ser 500 mudo mesmo
  // com o wrapper removido — é o ponto que a auditoria deste handler achou
  // além das guardas.
  let patId: string;
  let pdfBase64: string;
  try {
    const pessoa = await prisma.pessoa.findUnique({
      where: { id: pessoaId },
      select: { id: true },
    });
    if (!pessoa) return { error: "Pessoa não encontrada." };

    pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    // Registro pendente: existe antes da extração para que uma falha na
    // extração deixe rastro na ficha em vez de sumir.
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
    patId = pat.id;
  } catch (e) {
    return { error: `Não deu para guardar o PDF: ${motivo(e)}` };
  }

  // ── Extração via Claude ──────────────────────────────────────────────────
  let extraction;
  try {
    extraction = await extrairPat(pdfBase64);
  } catch (e) {
    const msg = motivo(e);
    await marcarErro(patId, msg);
    return { error: `Falha na extração: ${msg}` };
  }

  const dataPat = extraction.dataPat ? new Date(extraction.dataPat) : new Date();
  if (Number.isNaN(dataPat.getTime())) {
    const msg = "Data do PAT inválida na extração";
    await marcarErro(patId, msg);
    return { error: msg };
  }

  // ── Gravação do resultado ────────────────────────────────────────────────
  try {
    await prisma.pat.update({
      where: { id: patId },
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
  } catch (e) {
    const msg = motivo(e);
    await marcarErro(patId, msg);
    return { error: `Extraiu, mas não deu para gravar: ${msg}` };
  }

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true, patId };
}

/**
 * Marca o PAT como "erro" e guarda o motivo.
 * Nunca lança: é chamada de dentro de tratamento de erro, e uma falha aqui
 * não pode substituir a mensagem que o usuário precisa ver.
 */
async function marcarErro(patId: string, mensagem: string): Promise<void> {
  try {
    await prisma.pat.update({
      where: { id: patId },
      data: { status: "erro", erroMensagem: mensagem.slice(0, 500) },
    });
  } catch {
    // silêncio proposital — ver docstring
  }
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

// `uploadPatForm` foi removido: era ele que transformava `{ ok: false, error }`
// num throw, e o throw num 500 sem texto. O upload agora usa `uploadPat`
// direto, via `useActionState`, em `pat-upload-form.tsx`.
//
// Os wrappers abaixo continuam lançando — e continuam produzindo 500 mudo
// pelos mesmos motivos. Ficam de fora desta PR de propósito (uma preocupação
// por PR); estão listados no relatório como a próxima frente.
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
