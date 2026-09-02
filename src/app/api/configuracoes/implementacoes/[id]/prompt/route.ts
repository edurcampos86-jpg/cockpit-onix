import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { nomeEmpresa } from "@/lib/empresas-config";
import { filtroDeDono, type QuemOlha } from "@/lib/implementacoes/escopo";
import {
  inferirSinaisFallback,
  normalizarRespostas,
  perguntasFallback,
} from "@/lib/prompts/elicitar-implementacao";
import {
  montarPromptEntrega,
  versaoTemplate,
  type PerfilPatPrompt,
  type TrocaElicitacao,
} from "@/lib/prompts/montar-prompt-entrega";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}

async function buscarImplementacao(id: string, quem: QuemOlha) {
  return prisma.implementacao.findFirst({
    // O recorte acontece ANTES de carregar o PAT. Um id de outra pessoa não
    // deve nem trazer o perfil sensível para a memória desta requisição.
    where: { id, ...filtroDeDono(quem) },
    select: {
      id: true,
      empresaId: true,
      tipo: true,
      pagina: true,
      oQue: true,
      como: true,
      porQue: true,
      printUrl: true,
      promptGerado: true,
      versaoTemplate: true,
      anexos: {
        select: { nomeArquivo: true },
        orderBy: { ordem: "asc" },
      },
      user: {
        select: {
          pessoa: {
            select: {
              cargoTitulo: true,
              cargoFamilia: true,
              pats: {
                where: { vigente: true },
                orderBy: { dataPat: "desc" },
                take: 1,
                select: {
                  arquetipoCodigo: true,
                  arquetipo: { select: { nome: true } },
                  orientacao: true,
                  perspectiva: true,
                  ambienteNome: true,
                  principaisCompetencias: true,
                  estiloComunicacao: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

type ImplementacaoPrompt = NonNullable<Awaited<ReturnType<typeof buscarImplementacao>>>;

function perfilPat(impl: ImplementacaoPrompt): PerfilPatPrompt | null {
  const pat = impl.user.pessoa?.pats[0];
  if (!pat) return null;
  return {
    arquetipoCodigo: pat.arquetipoCodigo,
    arquetipoNome: pat.arquetipo?.nome ?? null,
    orientacao: pat.orientacao,
    perspectiva: pat.perspectiva,
    ambienteNome: pat.ambienteNome,
    principaisCompetencias: pat.principaisCompetencias,
    estiloComunicacao: pat.estiloComunicacao,
  };
}

function contextoTexto(
  impl: ImplementacaoPrompt,
  respostas: TrocaElicitacao[] = [],
): string {
  return [
    nomeEmpresa(impl.empresaId),
    impl.tipo,
    impl.pagina,
    impl.oQue,
    impl.como,
    impl.porQue,
    ...respostas.flatMap((r) => [r.pergunta, r.resposta]),
  ]
    .filter((v): v is string => Boolean(v))
    .join("\n");
}

function perguntasDoPedido(impl: ImplementacaoPrompt) {
  const temAnexos = impl.anexos.length > 0 || Boolean(impl.printUrl);
  const perguntas = perguntasFallback(temAnexos);

  // Pedido antigo sem "Como" precisa fechar o comportamento antes das demais
  // perguntas. A regra é local e previsível: nenhum dado sai do sistema.
  if (!impl.como?.trim()) {
    perguntas.unshift({
      id: "funcionamento",
      pergunta: "Como você imagina essa solução funcionando, passo a passo?",
      ajuda: "Conte desde o clique inicial até o resultado final na tela.",
      obrigatoria: true,
    });
  }
  return perguntas.slice(0, 6);
}

async function autorizado(id: string) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) {
    return { erro: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  const impl = await buscarImplementacao(id, {
    userId: ctx.userId,
    ehAdmin: isAdmin(ctx),
  });
  if (!impl) {
    return { erro: notFound() };
  }
  return { impl };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const acesso = await autorizado(id);
  if (acesso.erro) return acesso.erro;
  return NextResponse.json({
    prompt: acesso.impl.promptGerado,
    versaoTemplate: acesso.impl.versaoTemplate,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const acesso = await autorizado(id);
  if (acesso.erro) return acesso.erro;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.acao !== "perguntas" && body.acao !== "gerar")) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  if (body.acao === "perguntas") {
    const cargo =
      acesso.impl.user.pessoa?.cargoTitulo ??
      acesso.impl.user.pessoa?.cargoFamilia ??
      "papel não identificado";
    return NextResponse.json({
      resumoEntendimento: `Pedido para ${nomeEmpresa(acesso.impl.empresaId)}, criado por ${cargo}. Agora vamos fechar as decisões que podem mudar a entrega.`,
      perguntas: perguntasDoPedido(acesso.impl),
    });
  }

  const respostas = normalizarRespostas(body.respostas);
  if (respostas.length === 0) {
    return NextResponse.json(
      { error: "Responda ao menos uma pergunta antes de gerar o prompt." },
      { status: 400 },
    );
  }

  const sinais = inferirSinaisFallback(contextoTexto(acesso.impl, respostas));
  const anexos = acesso.impl.anexos.length
    ? acesso.impl.anexos.map((a) => ({ nomeArquivo: a.nomeArquivo }))
    : acesso.impl.printUrl
      ? [{ nomeArquivo: acesso.impl.printUrl.split("/").pop() || "print-legado" }]
      : [];
  const prompt = montarPromptEntrega({
    titulo: acesso.impl.oQue.slice(0, 180),
    empresaNome: nomeEmpresa(acesso.impl.empresaId),
    tipo: acesso.impl.tipo,
    pagina: acesso.impl.pagina,
    oQue: acesso.impl.oQue,
    como: acesso.impl.como,
    porQue: acesso.impl.porQue,
    elicitacao: respostas,
    anexos,
    perfilPat: perfilPat(acesso.impl),
    sinais,
  });
  const versao = versaoTemplate();

  await prisma.implementacao.update({
    where: { id: acesso.impl.id },
    data: {
      promptGerado: prompt,
      versaoTemplate: versao,
      conversaIA: {
        respostas,
        sinais,
        processamento: "local",
        geradoEm: new Date().toISOString(),
      },
    },
  });

  return NextResponse.json({ prompt, versaoTemplate: versao });
}
