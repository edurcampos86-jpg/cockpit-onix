"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { calcularNumerologia } from "@/lib/numerologia";
import { extrairDadosContratoSocial } from "@/lib/integrations/contrato-social";

/* ──────────────────────────────────────────────────────────────────────────
   uploadContratoSocial — admin only
   Recebe um PDF (FormData), salva em ContratoSocialUpload, extrai dados via
   Claude, calcula numerologia e atualiza/cria registro Numerologia.
   ────────────────────────────────────────────────────────────────────────── */

export type UploadContratoResult =
  | { ok: true; uploadId: string; numerologiaId: string; extracao: ExtractionPreview }
  | { ok: false; error: string };

export type ExtractionPreview = {
  nomeExtraido: string | null;
  cpfExtraido: string | null;
  dataNascExtraida: string | null;
  confianca: string;
  observacoes: string;
};

export async function uploadContratoSocial(
  formData: FormData,
): Promise<UploadContratoResult> {
  await requireAdmin();

  const pessoaId = String(formData.get("pessoaId") || "");
  const file = formData.get("contrato");

  if (!pessoaId) return { ok: false, error: "ID da pessoa ausente" };
  if (!(file instanceof File)) return { ok: false, error: "Arquivo PDF ausente" };
  if (file.size === 0) return { ok: false, error: "Arquivo vazio" };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "PDF maior que 8MB" };
  if (!file.type.includes("pdf")) {
    return { ok: false, error: `Apenas PDF é aceito (recebido: ${file.type})` };
  }

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: { id: true, nomeCompleto: true, apelido: true },
  });
  if (!pessoa) return { ok: false, error: "Pessoa não encontrada" };

  // Ler bytes e converter para base64
  const buf = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buf.toString("base64");

  // Criar upload em estado pendente (vamos preencher os dados extraídos depois)
  const upload = await prisma.contratoSocialUpload.create({
    data: {
      pessoaId,
      filename: file.name,
      mimeType: file.type,
      pdfBase64,
      bytes: file.size,
      status: "pendente",
    },
  });

  // Extrair dados via Claude — usa o nome cadastrado como dica
  let extracao;
  try {
    extracao = await extrairDadosContratoSocial(pdfBase64, pessoa.nomeCompleto);
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.contratoSocialUpload.update({
      where: { id: upload.id },
      data: { status: "erro", erroMensagem: msg.slice(0, 500) },
    });
    return { ok: false, error: `Falha na extração: ${msg}` };
  }

  // Atualizar upload com dados extraídos
  await prisma.contratoSocialUpload.update({
    where: { id: upload.id },
    data: {
      nomeExtraido: extracao.nomeCompleto,
      cpfExtraido: extracao.cpf,
      dataNascExtraida: extracao.dataNascimento ? new Date(extracao.dataNascimento) : null,
      status: "extraido",
    },
  });

  // Validar dados mínimos para calcular numerologia
  if (!extracao.nomeCompleto || !extracao.dataNascimento) {
    return {
      ok: false,
      error: `Extração incompleta — nome ou data de nascimento ausentes. Confiança: ${extracao.confianca}. ${extracao.observacoes}`,
    };
  }

  // Calcular numerologia
  const dataNasc = new Date(extracao.dataNascimento);
  if (Number.isNaN(dataNasc.getTime())) {
    return { ok: false, error: "Data de nascimento inválida na extração" };
  }

  const numerologia = calcularNumerologia(extracao.nomeCompleto, dataNasc);

  // Upsert da numerologia (1:1 com pessoa)
  const result = await prisma.numerologia.upsert({
    where: { pessoaId },
    update: {
      nomeFonte: extracao.nomeCompleto,
      dataNascFonte: dataNasc,
      caminhoVida: numerologia.caminhoVida,
      expressao: numerologia.expressao,
      alma: numerologia.alma,
      personalidade: numerologia.personalidade,
      anoPessoal: numerologia.anoPessoal,
      anoPessoalRef: numerologia.anoPessoalRef,
      karmicos: numerologia.karmicos,
      masterNumbers: numerologia.masterNumbers,
      calculatedAt: new Date(),
    },
    create: {
      pessoaId,
      nomeFonte: extracao.nomeCompleto,
      dataNascFonte: dataNasc,
      caminhoVida: numerologia.caminhoVida,
      expressao: numerologia.expressao,
      alma: numerologia.alma,
      personalidade: numerologia.personalidade,
      anoPessoal: numerologia.anoPessoal,
      anoPessoalRef: numerologia.anoPessoalRef,
      karmicos: numerologia.karmicos,
      masterNumbers: numerologia.masterNumbers,
    },
  });

  // Sincronizar dataNascimento da Pessoa se estava vazia
  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: {
      dataNascimento: dataNasc,
      ...(extracao.cpf ? { /* não sobrescreve CPF — pode quebrar unicidade */ } : {}),
    },
  });

  revalidatePath(`/time/${pessoaId}`);

  return {
    ok: true,
    uploadId: upload.id,
    numerologiaId: result.id,
    extracao: {
      nomeExtraido: extracao.nomeCompleto,
      cpfExtraido: extracao.cpf,
      dataNascExtraida: extracao.dataNascimento,
      confianca: extracao.confianca,
      observacoes: extracao.observacoes,
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   recalcularNumerologia — usa dados já existentes para recalcular
   (útil ao virar do ano, ou quando admin quer forçar recálculo)
   ────────────────────────────────────────────────────────────────────────── */

export async function recalcularNumerologia(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const pessoaId = String(formData.get("pessoaId") || "");
  if (!pessoaId) return { ok: false, error: "ID ausente" };

  const existente = await prisma.numerologia.findUnique({ where: { pessoaId } });
  if (!existente) {
    return {
      ok: false,
      error: "Sem numerologia base. Faça o upload do contrato social primeiro.",
    };
  }

  const numerologia = calcularNumerologia(
    existente.nomeFonte,
    existente.dataNascFonte,
  );

  await prisma.numerologia.update({
    where: { pessoaId },
    data: {
      caminhoVida: numerologia.caminhoVida,
      expressao: numerologia.expressao,
      alma: numerologia.alma,
      personalidade: numerologia.personalidade,
      anoPessoal: numerologia.anoPessoal,
      anoPessoalRef: numerologia.anoPessoalRef,
      karmicos: numerologia.karmicos,
      masterNumbers: numerologia.masterNumbers,
      calculatedAt: new Date(),
    },
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   atualizarLeitura — admin escreve a interpretação textual
   ────────────────────────────────────────────────────────────────────────── */

export async function atualizarLeituraNumerologia(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const pessoaId = String(formData.get("pessoaId") || "");
  const leituraRaw = formData.get("leitura");
  const leitura = typeof leituraRaw === "string" ? leituraRaw.trim() : "";

  if (!pessoaId) return { ok: false, error: "ID ausente" };

  const existente = await prisma.numerologia.findUnique({ where: { pessoaId } });
  if (!existente) return { ok: false, error: "Numerologia não calculada ainda" };

  await prisma.numerologia.update({
    where: { pessoaId },
    data: { leitura: leitura || null },
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   deletarNumerologia — admin only (limpeza)
   ────────────────────────────────────────────────────────────────────────── */

export async function deletarNumerologia(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const pessoaId = String(formData.get("pessoaId") || "");
  if (!pessoaId) return { ok: false, error: "ID ausente" };

  await prisma.numerologia.deleteMany({ where: { pessoaId } });
  revalidatePath(`/time/${pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   Wrappers void para uso em <form action={...}> (Next 16 exige void return)
   ────────────────────────────────────────────────────────────────────────── */

export async function uploadContratoSocialForm(formData: FormData): Promise<void> {
  const r = await uploadContratoSocial(formData);
  if (!r.ok) throw new Error(r.error);
}

export async function recalcularNumerologiaForm(formData: FormData): Promise<void> {
  const r = await recalcularNumerologia(formData);
  if (!r.ok) throw new Error(r.error);
}

export async function atualizarLeituraForm(formData: FormData): Promise<void> {
  const r = await atualizarLeituraNumerologia(formData);
  if (!r.ok) throw new Error(r.error);
}
