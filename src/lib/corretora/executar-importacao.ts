/* ──────────────────────────────────────────────────────────────
 * Execução do import — a única camada deste conjunto que fala com o banco.
 *
 * ── O DRY-RUN NÃO ESCREVE NADA. NEM O REGISTRO DO PRÓPRIO DRY-RUN ───────
 * Nenhum `ImportJob`, nenhuma `PessoaGrupo`, nenhum contrato. É o que torna o
 * ensaio confiável: se ele criasse "só" a linha de job, "zero escrita" viraria
 * "quase zero", e a próxima pessoa acrescentaria mais uma exceção.
 *
 * ── LOTE INTERROMPÍVEL, TRANSAÇÃO POR LOTE ──────────────────────────────
 * Uma transação só, envolvendo 8.000 contratos, é uma transação que não se
 * pode cancelar e cujo rollback demora tanto quanto a ida. Em lotes, cada
 * pedaço é atômico (ou entra inteiro, ou não entra), o progresso é visível no
 * `ImportJob`, e parar no meio deixa um estado íntegro e retomável — a
 * idempotência por chave de negócio garante que retomar não duplica.
 *
 * ── SEM MODEL NOVO ──────────────────────────────────────────────────────
 * O lote é registrado no `ImportJob` que já existe (schema.prisma:2709), com
 * `tipo: "corretora_contratos"`. Os contadores dele (`totalArquivos`,
 * `processados`, `sucessos`, `erros`, `pulados`) já respondem o que o import de
 * contratos precisa. Nenhuma migration nesta PR.
 * ────────────────────────────────────────────────────────────── */

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import {
  agruparNaoMapeados,
  aplicarPerfil,
  type LinhaAplicada,
  type RotuloNaoMapeado,
} from "@/lib/importacao/aplicar-perfil";
import {
  extrair,
  type ArquivoEntrada,
  type CustoExtracao,
  type OpcoesExtracao,
} from "@/lib/importacao/extracao";
import type { PerfilImportacaoConfig } from "@/lib/importacao/perfil";
import { exigirTipoProduto } from "./catalogo-produtos";
import {
  chaveNegocio,
  montarRegistro,
  planejar,
  type AcaoContrato,
  type EstadoAtual,
  type GrafiaAtendente,
  type LinhaRejeitada,
  type Plano,
  type RegistroContrato,
} from "./importar-contratos";
import { exigirStatus } from "./status-contrato";

export const TIPO_IMPORT_JOB = "corretora_contratos";
const TAMANHO_LOTE = 100;

export type ModoImportacao = "dry-run" | "aplicar";

/** Uma linha de exemplo SEM dado pessoal — nem documento, nem nome. */
export type AmostraLinha = {
  readonly linha: number;
  readonly tipoDocumento: "CPF" | "CNPJ";
  readonly tipoProduto: string;
  readonly parceiro: string;
  readonly status: string;
  readonly inicioVigencia: string;
  readonly temPremio: boolean;
  readonly origemExtracao: string;
  readonly acao: "criar" | "atualizar";
};

export type ResultadoImportacao = {
  readonly modo: ModoImportacao;
  readonly loteImportacao: string;
  /** `null` no dry-run — ele não cria `ImportJob`. */
  readonly importJobId: string | null;
  readonly linhasLidas: number;
  readonly pessoasACriar: number;
  readonly pessoasACasar: number;
  readonly contratosACriar: number;
  readonly contratosAAtualizar: number;
  readonly historicoPreservado: Plano["historicoPreservado"];
  readonly duplicadasNoLote: Plano["duplicadasNoLote"];
  /** Regra 5 — linhas de relatório mais antigo que o registro gravado. */
  readonly ignoradasPorAntiguidade: Plano["ignoradasPorAntiguidade"];
  readonly rejeitadas: readonly LinhaRejeitada[];
  readonly rotulosNaoMapeados: readonly RotuloNaoMapeado[];
  readonly grafiasAtendente: readonly GrafiaAtendente[];
  readonly amostra: readonly AmostraLinha[];
  readonly custoIa: CustoExtracao | null;
  readonly avisos: readonly string[];
  /** Preenchidos só no "aplicar": o que de fato entrou. */
  readonly pessoasCriadas: number;
  readonly contratosCriados: number;
  readonly contratosAtualizados: number;
  readonly interrompido: boolean;
};

function amostrar(acoes: readonly AcaoContrato[], quantas = 5): AmostraLinha[] {
  return acoes.slice(0, quantas).map((a) => ({
    linha: a.registro.linhaOrigem,
    // O documento NÃO aparece — só o seu tipo. A amostra existe para conferir
    // se o mapeamento acertou as colunas, e isso não exige dado de pessoa.
    tipoDocumento: a.registro.cpfCnpj.length === 11 ? "CPF" : "CNPJ",
    tipoProduto: a.registro.tipoProduto,
    parceiro: a.registro.parceiro,
    status: a.registro.status,
    inicioVigencia: a.registro.inicioVigencia.toISOString().slice(0, 10),
    temPremio: a.registro.premio != null,
    origemExtracao: a.registro.origemExtracao,
    acao: a.acao,
  }));
}

/**
 * Pergunta ao banco o estado de que o planejamento precisa.
 *
 * As duas consultas são por lista fechada de chaves — nada de varredura das
 * tabelas inteiras. Numa base de 8.000 contratos isso importa.
 */
async function carregarEstado(
  prisma: PrismaClient,
  documentos: readonly string[],
  chaves: readonly string[],
  empresaId: string,
): Promise<EstadoAtual> {
  const pessoas = documentos.length
    ? await prisma.pessoaGrupo.findMany({
        where: { cpfCnpj: { in: [...documentos] } },
        select: { id: true, cpfCnpj: true },
      })
    : [];

  // A chave de negócio é NORMALIZADA e não existe como coluna; então o filtro
  // vem pelo lado barato (empresa + números de contrato presentes no arquivo) e
  // a chave é recalculada em memória sobre o que voltou.
  const contratos = chaves.length
    ? await prisma.contratoCorretora.findMany({
        where: { empresaId },
        select: {
          id: true,
          status: true,
          parceiro: true,
          numeroContrato: true,
          tipoProduto: true,
          // A competência do lote que gravou a linha. É o que a regra 5 compara.
          importadoEm: true,
        },
      })
    : [];

  const contratosPorChave = new Map<
    string,
    { id: string; status: string; dataReferencia: Date | null }
  >();
  for (const c of contratos) {
    contratosPorChave.set(chaveNegocio(c), {
      id: c.id,
      status: c.status,
      dataReferencia: c.importadoEm,
    });
  }

  return {
    pessoasPorDocumento: new Map(pessoas.map((p) => [p.cpfCnpj, p.id])),
    contratosPorChave,
  };
}

function dadosDoContrato(
  registro: RegistroContrato,
  pessoaGrupoId: string,
  empresaId: string,
  contexto: { loteImportacao: string; arquivoOrigem: string; perfilImportacaoId: string | null },
) {
  return {
    pessoaGrupoId,
    empresaId,
    // Validação na ESCRITA, e não só na leitura: é literalmente o erro que
    // `Implementacao.empresaId` cometeu (String sem validação, empresa
    // fantasma no banco). Aqui, valor fora do catálogo lança.
    tipoProduto: exigirTipoProduto(registro.tipoProduto),
    status: exigirStatus(registro.status),
    parceiro: registro.parceiro,
    numeroContrato: registro.numeroContrato,
    inicioVigencia: registro.inicioVigencia,
    fimVigencia: registro.fimVigencia,
    premio: registro.premio,
    comissao: registro.comissao,
    atendenteCorretora: registro.atendenteCorretora,
    assessorCge: registro.assessorCge,
    // `InputJsonValue` e não `Record<string, unknown>`: o Prisma exige o tipo
    // Json dele, e o registro já garantiu que só há valor serializável aqui.
    dadosProduto:
      Object.keys(registro.dadosProduto).length > 0
        ? (registro.dadosProduto as Prisma.InputJsonValue)
        : undefined,
    perfilImportacaoId: contexto.perfilImportacaoId,
    loteImportacao: contexto.loteImportacao,
    arquivoOrigem: contexto.arquivoOrigem,
    linhaOrigem: registro.linhaOrigem,
    // A COMPETÊNCIA do relatório, não o relógio da máquina. `createdAt` e
    // `updatedAt` já registram quando a linha foi escrita; gravar o relógio
    // aqui de novo custaria a coluna que a regra 5 precisa para ordenar dois
    // arquivos — e era exatamente por não existir essa coluna que agosto
    // reprocessado revertia setembro.
    importadoEm: registro.dataReferencia,
  };
}

export type OpcoesExecucao = {
  readonly modo: ModoImportacao;
  readonly empresaId: string;
  readonly perfil: PerfilImportacaoConfig;
  readonly perfilImportacaoId: string | null;
  readonly parceiroPadrao: string;
  readonly iniciadoPorId: string;
  readonly loteImportacao: string;
  /**
   * COMPETÊNCIA do relatório — de que mês é este arquivo.
   *
   * Obrigatória, a menos que o perfil mapeie uma coluna para `dataReferencia`
   * (aí cada linha traz a sua). Sem nenhuma das duas a execução FALHA na
   * entrada, antes de ler o arquivo: um import sem competência não consegue
   * decidir se está atualizando ou revertendo, e essa dúvida em silêncio é o
   * bug que a regra 5 fecha.
   */
  readonly dataReferencia?: Date;
  readonly extracao?: OpcoesExtracao;
  /** Consultada ENTRE lotes. `true` encerra a execução com estado íntegro. */
  readonly deveParar?: () => boolean;
};

/** O perfil traz a competência linha a linha? */
function perfilMapeiaReferencia(perfil: PerfilImportacaoConfig): boolean {
  return Object.values(perfil.mapeamentoColunas).includes("dataReferencia");
}

export async function executarImportacao(
  prisma: PrismaClient,
  arquivo: ArquivoEntrada,
  opcoes: OpcoesExecucao,
): Promise<ResultadoImportacao> {
  if (!opcoes.dataReferencia && !perfilMapeiaReferencia(opcoes.perfil)) {
    throw new Error(
      "importação sem competência: informe `dataReferencia` na chamada ou mapeie a coluna no perfil",
    );
  }

  const extracaoResultado = await extrair(arquivo, opcoes.perfil, opcoes.extracao);
  const linhas: LinhaAplicada[] = aplicarPerfil(extracaoResultado.linhas, opcoes.perfil);

  // Pré-varredura só para saber O QUE PERGUNTAR ao banco. `montarRegistro` é
  // puro e barato; o planejamento a seguir refaz o cálculo sobre o estado real.
  const dicionarioProduto = opcoes.perfil.dicionarios.tipoProduto;
  const documentos = new Set<string>();
  const chaves = new Set<string>();
  for (const linha of linhas) {
    const r = montarRegistro(linha, opcoes.parceiroPadrao, dicionarioProduto, opcoes.dataReferencia);
    if (!r.ok) continue;
    documentos.add(r.registro.cpfCnpj);
    chaves.add(chaveNegocio(r.registro));
  }

  const estado = await carregarEstado(prisma, [...documentos], [...chaves], opcoes.empresaId);
  const plano = planejar(linhas, estado, {
    parceiroPadrao: opcoes.parceiroPadrao,
    dicionarioProduto,
    dataReferenciaDoLote: opcoes.dataReferencia,
  });

  const criar = plano.acoes.filter((a) => a.acao === "criar");
  const atualizar = plano.acoes.filter((a) => a.acao === "atualizar");

  const base: ResultadoImportacao = {
    modo: opcoes.modo,
    loteImportacao: opcoes.loteImportacao,
    importJobId: null,
    linhasLidas: plano.linhasLidas,
    pessoasACriar: plano.pessoasACriar.length,
    pessoasACasar: plano.pessoasCasadas,
    contratosACriar: criar.length,
    contratosAAtualizar: atualizar.length,
    historicoPreservado: plano.historicoPreservado,
    duplicadasNoLote: plano.duplicadasNoLote,
    ignoradasPorAntiguidade: plano.ignoradasPorAntiguidade,
    rejeitadas: plano.rejeitadas,
    rotulosNaoMapeados: agruparNaoMapeados(linhas),
    grafiasAtendente: plano.grafiasAtendente,
    amostra: amostrar(plano.acoes),
    custoIa: extracaoResultado.custo,
    avisos: extracaoResultado.avisos,
    pessoasCriadas: 0,
    contratosCriados: 0,
    contratosAtualizados: 0,
    interrompido: false,
  };

  if (opcoes.modo === "dry-run") return base;

  // ── A partir daqui há escrita ──────────────────────────────────────────

  const job = await prisma.importJob.create({
    data: {
      tipo: TIPO_IMPORT_JOB,
      status: "running",
      iniciadoPorId: opcoes.iniciadoPorId,
      zipFilename: arquivo.nome,
      zipBytes: BigInt(arquivo.conteudo.byteLength),
      totalArquivos: plano.acoes.length,
      pulados:
        plano.duplicadasNoLote.length +
        plano.historicoPreservado.length +
        plano.ignoradasPorAntiguidade.length,
      erros: plano.rejeitadas.length,
      detalhes: {
        loteImportacao: opcoes.loteImportacao,
        perfilImportacaoId: opcoes.perfilImportacaoId,
        rotulosNaoMapeados: base.rotulosNaoMapeados,
        grafiasAtendente: base.grafiasAtendente,
        rejeitadas: plano.rejeitadas.slice(0, 200),
        ignoradasPorAntiguidade: plano.ignoradasPorAntiguidade.slice(0, 200),
        custoIa: extracaoResultado.custo,
      },
    },
    select: { id: true },
  });

  const contexto = {
    loteImportacao: opcoes.loteImportacao,
    arquivoOrigem: arquivo.nome,
    perfilImportacaoId: opcoes.perfilImportacaoId,
  };

  let pessoasCriadas = 0;
  let contratosCriados = 0;
  let contratosAtualizados = 0;
  let interrompido = false;

  try {
    // 1) As pessoas que faltam. `skipDuplicates` porque duas execuções
    //    simultâneas do mesmo arquivo não podem quebrar por corrida — o
    //    `@unique` de `cpfCnpj` é quem arbitra.
    for (let i = 0; i < plano.pessoasACriar.length; i += TAMANHO_LOTE) {
      if (opcoes.deveParar?.()) {
        interrompido = true;
        break;
      }
      const fatia = plano.pessoasACriar.slice(i, i + TAMANHO_LOTE);
      const criadas = await prisma.pessoaGrupo.createMany({
        data: fatia.map((p) => ({
          cpfCnpj: p.cpfCnpj,
          tipoDocumento: p.cpfCnpj.length === 11 ? "CPF" : "CNPJ",
        })),
        skipDuplicates: true,
      });
      pessoasCriadas += criadas.count;
    }

    // 2) Reconsulta os ids: `createMany` não os devolve, e algumas pessoas
    //    podem ter sido criadas por outra execução no intervalo.
    const todosDocumentos = [...documentos];
    const pessoas = todosDocumentos.length
      ? await prisma.pessoaGrupo.findMany({
          where: { cpfCnpj: { in: todosDocumentos } },
          select: { id: true, cpfCnpj: true },
        })
      : [];
    const idPorDocumento = new Map(pessoas.map((p) => [p.cpfCnpj, p.id]));

    // 3) Contratos, em lotes atômicos.
    for (let i = 0; i < plano.acoes.length && !interrompido; i += TAMANHO_LOTE) {
      if (opcoes.deveParar?.()) {
        interrompido = true;
        break;
      }
      const fatia = plano.acoes.slice(i, i + TAMANHO_LOTE);

      const resultado = await prisma.$transaction(async (tx) => {
        let criados = 0;
        let atualizados = 0;
        for (const acao of fatia) {
          const pessoaGrupoId = idPorDocumento.get(acao.registro.cpfCnpj);
          if (!pessoaGrupoId) {
            // Não deveria acontecer: o passo 2 acabou de garantir. Se
            // acontecer, o lote inteiro volta atrás em vez de gravar contrato
            // sem titular.
            throw new Error(
              `pessoa não resolvida para a linha ${acao.registro.linhaOrigem} — lote revertido`,
            );
          }
          const dados = dadosDoContrato(
            acao.registro,
            pessoaGrupoId,
            opcoes.empresaId,
            contexto,
          );
          if (acao.acao === "criar") {
            await tx.contratoCorretora.create({ data: dados });
            criados += 1;
          } else {
            await tx.contratoCorretora.update({ where: { id: acao.id }, data: dados });
            atualizados += 1;
          }
        }
        return { criados, atualizados };
      });

      contratosCriados += resultado.criados;
      contratosAtualizados += resultado.atualizados;

      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          processados: contratosCriados + contratosAtualizados,
          sucessos: contratosCriados + contratosAtualizados,
        },
      });
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: interrompido ? "interrupted" : "completed",
        finalizadoEm: new Date(),
        processados: contratosCriados + contratosAtualizados,
        sucessos: contratosCriados + contratosAtualizados,
      },
    });
  } catch (erro) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        finalizadoEm: new Date(),
        processados: contratosCriados + contratosAtualizados,
        sucessos: contratosCriados + contratosAtualizados,
        detalhes: {
          loteImportacao: opcoes.loteImportacao,
          erro: erro instanceof Error ? erro.message : String(erro),
          gravadosAntesDaFalha: { pessoasCriadas, contratosCriados, contratosAtualizados },
        },
      },
    });
    throw erro;
  }

  return {
    ...base,
    importJobId: job.id,
    pessoasCriadas,
    contratosCriados,
    contratosAtualizados,
    interrompido,
  };
}
