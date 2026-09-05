import "server-only";

import { getAuthContext } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isAdminMaster } from "@/lib/rbac-papeis";
import {
  GERADOR_QUESTIONARIO_PAT_VERSAO,
  gerarPerguntasPat,
  type PatParaQuestionario,
  type PerguntaPat,
} from "@/lib/time/questionario-pat";
import { podeAcessarQuestionarioPat } from "@/lib/time/questionario-pat-acesso";
import { questionarioPatTimeHabilitado } from "@/lib/time/questionario-pat-flag";

type AuthQuestionarioPat = Awaited<ReturnType<typeof getAuthContext>>;

/**
 * Resolve o alvo já dentro do escopo autorizado.
 *
 * O `where` contém a hierarquia ANTES de carregar PAT ou respostas. Assim um ID
 * de outra pessoa produz o mesmo `null` de um ID inexistente e os dados
 * sensíveis nem entram na memória da requisição.
 */
export async function resolverAcessoQuestionarioPat(pessoaId: string): Promise<{
  ctx: AuthQuestionarioPat;
  pessoa: {
    id: string;
    nomeCompleto: string;
    lideradoPorId: string | null;
    patVigente: {
      id: string;
      dataPat: Date;
      orientacao: string | null;
      perspectiva: string | null;
      ambienteNome: string | null;
      tendencias: PatParaQuestionario["tendencias"];
      ambiente: PatParaQuestionario["ambiente"];
      estrutural: PatParaQuestionario["estrutural"];
    } | null;
  };
} | null> {
  if (!pessoaId || !(await questionarioPatTimeHabilitado())) return null;

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return null;

  const master = isAdminMaster(ctx);
  if (!master && !ctx.pessoa?.id) return null;

  const pessoa = await prisma.pessoa.findFirst({
    where: {
      id: pessoaId,
      ...(master ? {} : { lideradoPorId: ctx.pessoa!.id }),
    },
    select: {
      id: true,
      nomeCompleto: true,
      lideradoPorId: true,
      pats: {
        where: { vigente: true, status: "extraido" },
        orderBy: [{ dataPat: "desc" }, { uploadedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          dataPat: true,
          orientacao: true,
          perspectiva: true,
          ambienteNome: true,
          tendencias: true,
          ambiente: true,
          estrutural: true,
        },
      },
    },
  });
  if (!pessoa || !podeAcessarQuestionarioPat(ctx, pessoa)) return null;

  const pat = pessoa.pats[0] ?? null;

  return {
    ctx,
    pessoa: {
      id: pessoa.id,
      nomeCompleto: pessoa.nomeCompleto,
      lideradoPorId: pessoa.lideradoPorId,
      patVigente: pat
        ? {
            ...pat,
            tendencias: objetoJson<NonNullable<PatParaQuestionario["tendencias"]>>(
              pat.tendencias,
            ),
            ambiente: objetoJson<NonNullable<PatParaQuestionario["ambiente"]>>(
              pat.ambiente,
            ),
            estrutural: objetoJson<NonNullable<PatParaQuestionario["estrutural"]>>(
              pat.estrutural,
            ),
          }
        : null,
    },
  };
}

function objetoJson<T extends object>(valor: unknown): T | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as T)
    : null;
}

export type QuestionarioPatCarregado = {
  pessoa: { id: string; nomeCompleto: string };
  // O Client Component só precisa distinguir presença/ausência. Os sinais do
  // laudo ficam no servidor, onde geram as perguntas.
  pat: { id: string } | null;
  perguntas: PerguntaPat[];
  versaoPerguntas: number;
  questionario: {
    id: string;
    status: string;
    preocupacoesAtuais: string | null;
    objetivoCurtoPrazo: string | null;
    objetivoLongoPrazo: string | null;
    incentivos: string | null;
    desmotivadores: string | null;
    esforcosNecessarios: string | null;
    apoioEsperado: string | null;
    indicadoresProgresso: string | null;
    proximaRevisao: string | null;
    criadoEm: string;
    atualizadoEm: string;
    acompanhamentos: Array<{
      id: string;
      data: string;
      direcao: string;
      evidencias: string;
      proximosEsforcos: string | null;
      criadoEm: string;
    }>;
  } | null;
};

function perguntasDoSnapshot(valor: unknown): PerguntaPat[] | null {
  if (!valor || typeof valor !== "object") return null;
  const perguntas = (valor as { perguntas?: unknown }).perguntas;
  if (!Array.isArray(perguntas)) return null;

  const validas = perguntas.filter(
    (item): item is PerguntaPat =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { texto?: unknown }).texto === "string" &&
          typeof (item as { tom?: unknown }).tom === "string",
      ),
  );
  return validas.length === perguntas.length && validas.length > 0 ? validas : null;
}

/** Loader JSON-ready para Server Components. `null` equivale a not-found. */
export async function carregarQuestionarioPat(
  pessoaId: string,
): Promise<QuestionarioPatCarregado | null> {
  const acesso = await resolverAcessoQuestionarioPat(pessoaId);
  if (!acesso) return null;

  const pat = acesso.pessoa.patVigente;
  const row = await prisma.questionarioPatPessoa.findUnique({
    where: { pessoaId: acesso.pessoa.id },
    select: {
      id: true,
      versaoPerguntas: true,
      perguntasSnapshot: true,
      status: true,
      preocupacoesAtuais: true,
      objetivoCurtoPrazo: true,
      objetivoLongoPrazo: true,
      incentivos: true,
      desmotivadores: true,
      esforcosNecessarios: true,
      apoioEsperado: true,
      indicadoresProgresso: true,
      proximaRevisao: true,
      criadoEm: true,
      atualizadoEm: true,
      acompanhamentos: {
        orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
        select: {
          id: true,
          data: true,
          direcao: true,
          evidencias: true,
          proximosEsforcos: true,
          criadoEm: true,
        },
      },
    },
  });
  const perguntas = row
    ? perguntasDoSnapshot(row.perguntasSnapshot) ?? []
    : pat
      ? gerarPerguntasPat(pat)
      : [];

  return {
    pessoa: { id: acesso.pessoa.id, nomeCompleto: acesso.pessoa.nomeCompleto },
    pat: pat ? { id: pat.id } : null,
    perguntas,
    versaoPerguntas: row?.versaoPerguntas ?? GERADOR_QUESTIONARIO_PAT_VERSAO,
    questionario: row
      ? {
          id: row.id,
          status: row.status,
          preocupacoesAtuais: row.preocupacoesAtuais,
          objetivoCurtoPrazo: row.objetivoCurtoPrazo,
          objetivoLongoPrazo: row.objetivoLongoPrazo,
          incentivos: row.incentivos,
          desmotivadores: row.desmotivadores,
          esforcosNecessarios: row.esforcosNecessarios,
          apoioEsperado: row.apoioEsperado,
          indicadoresProgresso: row.indicadoresProgresso,
          proximaRevisao: row.proximaRevisao?.toISOString() ?? null,
          criadoEm: row.criadoEm.toISOString(),
          atualizadoEm: row.atualizadoEm.toISOString(),
          acompanhamentos: row.acompanhamentos.map((item) => ({
            ...item,
            data: item.data.toISOString(),
            criadoEm: item.criadoEm.toISOString(),
          })),
        }
      : null,
  };
}
