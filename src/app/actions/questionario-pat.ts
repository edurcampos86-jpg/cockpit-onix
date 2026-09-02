"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  GERADOR_QUESTIONARIO_PAT_VERSAO,
  gerarPerguntasPat,
} from "@/lib/time/questionario-pat";
import { resolverAcessoQuestionarioPat } from "@/lib/time/questionario-pat-loader";

export type QuestionarioPatActionState =
  | undefined
  | { ok: true; mensagem: string; error?: never }
  | { ok?: false; error: string; mensagem?: never };

const MAX_RESPOSTA_CHARS = 6_000;
const STATUS = new Set(["rascunho", "concluido"]);
const DIRECOES = new Set(["avancando", "estavel", "afastando"]);

const CAMPOS_RESPOSTA = [
  "preocupacoesAtuais",
  "objetivoCurtoPrazo",
  "objetivoLongoPrazo",
  "incentivos",
  "desmotivadores",
  "esforcosNecessarios",
  "apoioEsperado",
  "indicadoresProgresso",
] as const;

const CAMPOS_OBRIGATORIOS = CAMPOS_RESPOSTA.filter(
  (campo) => campo !== "preocupacoesAtuais",
);

function texto(formData: FormData, nome: string, max = MAX_RESPOSTA_CHARS): string {
  const valor = formData.get(nome);
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function excedeLimite(formData: FormData, nome: string, max = MAX_RESPOSTA_CHARS): boolean {
  const valor = formData.get(nome);
  return typeof valor === "string" && valor.length > max;
}

function dataOpcional(valor: string): Date | null | "invalida" {
  if (!valor) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return "invalida";
  const data = new Date(`${valor}T12:00:00.000Z`);
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor
    ? "invalida"
    : data;
}

function naoEncontrado(): QuestionarioPatActionState {
  return { error: "Não encontrado." };
}

function falhaAoPersistir(operacao: string, erro: unknown): QuestionarioPatActionState {
  const tipo = erro instanceof Error ? erro.name : "erro_desconhecido";
  console.error(`[questionario-pat] ${operacao} falhou (${tipo})`);
  return { error: "Não foi possível salvar agora. Tente novamente." };
}

/** Salva rascunho ou conclui a entrevista. Nunca chama IA. */
export async function salvarQuestionarioPat(
  _state: QuestionarioPatActionState,
  formData: FormData,
): Promise<QuestionarioPatActionState> {
  try {
    return await salvarQuestionarioPatInterno(formData);
  } catch (erro) {
    return falhaAoPersistir("salvar questionário", erro);
  }
}

async function salvarQuestionarioPatInterno(
  formData: FormData,
): Promise<QuestionarioPatActionState> {
  const pessoaId = texto(formData, "pessoaId", 80);
  const acesso = await resolverAcessoQuestionarioPat(pessoaId);
  if (!acesso) return naoEncontrado();
  if (!acesso.pessoa.patVigente) {
    return { error: "PAT vigente não localizado. Cadastre o PAT antes de editar." };
  }

  const existente = await prisma.questionarioPatPessoa.findUnique({
    where: { pessoaId },
    select: { id: true, atualizadoEm: true },
  });

  const status = texto(formData, "status", 20);
  if (!STATUS.has(status)) return { error: "Status inválido." };

  if (CAMPOS_RESPOSTA.some((campo) => excedeLimite(formData, campo))) {
    return { error: `Cada resposta pode ter no máximo ${MAX_RESPOSTA_CHARS} caracteres.` };
  }

  const respostas = Object.fromEntries(
    CAMPOS_RESPOSTA.map((campo) => [campo, texto(formData, campo) || null]),
  ) as Record<(typeof CAMPOS_RESPOSTA)[number], string | null>;

  if (status === "concluido") {
    const faltantes = CAMPOS_OBRIGATORIOS.filter((campo) => !respostas[campo]);
    if (faltantes.length > 0) {
      return { error: "Para concluir, responda todas as perguntas do questionário." };
    }
  }

  const proximaRevisao = dataOpcional(texto(formData, "proximaRevisao", 10));
  if (proximaRevisao === "invalida") return { error: "Data da próxima revisão inválida." };

  const perguntas = gerarPerguntasPat(acesso.pessoa.patVigente);
  const perguntasSnapshot = {
    versaoGerador: GERADOR_QUESTIONARIO_PAT_VERSAO,
    perguntas,
  } as unknown as Prisma.InputJsonValue;

  if (existente) {
    const versaoRegistro = texto(formData, "versaoRegistro", 40);
    if (versaoRegistro !== existente.atualizadoEm.toISOString()) {
      return { error: "As respostas mudaram em outra sessão. Recarregue a página antes de editar." };
    }

    const alterado = await prisma.questionarioPatPessoa.updateMany({
      where: { id: existente.id, atualizadoEm: existente.atualizadoEm },
      data: {
        // PAT e perguntas pertencem à conversa original. Um PAT novo não
        // reescreve retroativamente o que foi perguntado.
        status,
        ...respostas,
        proximaRevisao,
        atualizadoPorUserId: acesso.ctx.userId,
      },
    });
    if (alterado.count !== 1) {
      return { error: "As respostas mudaram em outra sessão. Recarregue a página antes de editar." };
    }
  } else {
    await prisma.questionarioPatPessoa.create({
      data: {
        pessoaId,
        patId: acesso.pessoa.patVigente.id,
        versaoPerguntas: GERADOR_QUESTIONARIO_PAT_VERSAO,
        perguntasSnapshot,
        status,
        ...respostas,
        proximaRevisao,
        criadoPorUserId: acesso.ctx.userId,
        atualizadoPorUserId: acesso.ctx.userId,
      },
    });
  }

  revalidatePath(`/time/${pessoaId}`);
  return {
    ok: true,
    mensagem: status === "concluido" ? "Questionário concluído." : "Rascunho salvo.",
  };
}

/** Registra um check-in sem alterar acompanhamentos anteriores. */
export async function registrarAcompanhamentoQuestionarioPat(
  _state: QuestionarioPatActionState,
  formData: FormData,
): Promise<QuestionarioPatActionState> {
  try {
    return await registrarAcompanhamentoQuestionarioPatInterno(formData);
  } catch (erro) {
    return falhaAoPersistir("registrar acompanhamento", erro);
  }
}

async function registrarAcompanhamentoQuestionarioPatInterno(
  formData: FormData,
): Promise<QuestionarioPatActionState> {
  const pessoaId = texto(formData, "pessoaId", 80);
  const acesso = await resolverAcessoQuestionarioPat(pessoaId);
  if (!acesso) return naoEncontrado();
  if (!acesso.pessoa.patVigente) {
    return { error: "PAT vigente não localizado. Cadastre o PAT antes de acompanhar." };
  }

  const direcao = texto(formData, "direcao", 20);
  if (!DIRECOES.has(direcao)) return { error: "Direção inválida." };

  if (
    excedeLimite(formData, "evidencias") ||
    excedeLimite(formData, "proximosEsforcos")
  ) {
    return { error: `Cada texto pode ter no máximo ${MAX_RESPOSTA_CHARS} caracteres.` };
  }

  const evidencias = texto(formData, "evidencias");
  if (!evidencias) return { error: "Descreva ao menos uma evidência observável." };
  const proximosEsforcos = texto(formData, "proximosEsforcos") || null;

  const data = dataOpcional(texto(formData, "data", 10));
  if (data === "invalida") return { error: "Data do acompanhamento inválida." };

  const questionario = await prisma.questionarioPatPessoa.findFirst({
    where: { pessoaId, status: "concluido" },
    select: { id: true },
  });
  if (!questionario) {
    return { error: "Conclua o questionário antes de registrar um acompanhamento." };
  }

  await prisma.questionarioPatAcompanhamento.create({
    data: {
      questionarioId: questionario.id,
      data: data ?? new Date(),
      direcao,
      evidencias,
      proximosEsforcos,
      criadoPorUserId: acesso.ctx.userId,
    },
  });

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true, mensagem: "Acompanhamento registrado." };
}
