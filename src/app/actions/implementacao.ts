"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { uploadContrato, deleteContrato } from "@/lib/b2/upload";
import { b2ContratosConfigurado } from "@/lib/b2/client";
import { empresaAceitaImplementacao } from "@/lib/empresas-config";
import { calcRiceScore, validarRice, type RiceEixo } from "@/lib/rice";
import { implementacoesV2Habilitado } from "@/lib/implementacoes/v2-flag";
import {
  MAX_ANEXOS,
  MAX_ANEXO_BYTES,
  tipoAnexoPermitido,
  extFromContentType,
  sanitizeNomeArquivo,
} from "@/lib/implementacoes/anexos";
import { logResultadoSugestaoRice } from "@/lib/implementacoes/rice-audit";

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

export type CriarState = {
  ok: boolean;
  error?: string;
  /** Id da sugestão criada — só no caminho do FAB, para o modal linkar até ela. */
  id?: string;
  /**
   * Se quem enviou consegue ABRIR a triagem. O FAB é de todo usuário logado, mas
   * /configuracoes/implementacoes é admin-only: oferecer o link a quem não é
   * admin manda a pessoa para um redirect e faz a confirmação parecer quebrada.
   * Quem decide é o servidor, que sabe o papel; o modal só renderiza se vier.
   */
  podeVerNaTriagem?: boolean;
};

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

  // A mensagem nomeia só o que faltou de verdade. A anterior citava os três
  // sempre, então quem esquecia só a empresa era mandado revisar dois campos
  // que já estavam preenchidos.
  const faltando = [
    !oQue && "O quê (o pedido)",
    !porQue && "Por quê (o motivo)",
    !empresaId && "a empresa",
  ].filter(Boolean);
  if (faltando.length > 0) {
    return { ok: false, error: `Faltou preencher: ${faltando.join(", ")}.` };
  }

  // A empresa precisa EXISTIR, não só estar preenchida.
  //
  // `empresaAceitaImplementacao` já existia (`lib/empresas-config.ts`) e já
  // estava testada — só não era chamada aqui. As duas telas restringem o valor
  // (a de `/nova` valida o `?empresa=` e manda num hidden; o FAB usa um
  // `<select>`), mas nenhuma das duas é a fonte da verdade: quem grava é esta
  // action, e ela aceitava qualquer texto não vazio.
  //
  // O estrago não é a linha errada, é o filtro: `opcoesFiltroEmpresa`
  // (`empresas-config.ts`) monta as opções a partir dos `empresaId` GRAVADOS.
  // Um "investimento" sem "s" viraria uma empresa nova no dropdown, com uma
  // sugestão presa dentro que ninguém procura ali — e sem nada na tela dizendo
  // que aquilo é um engano de digitação e não uma empresa do grupo.
  if (!empresaAceitaImplementacao(empresaId)) {
    return {
      ok: false,
      error: `"${empresaId}" não é uma empresa que aceita sugestão nesta fase. Recarregue a página e escolha uma da lista.`,
    };
  }

  // Anexos: lê o conjunto (name="anexos"), descartando entradas vazias.
  const arquivos = formData
    .getAll("anexos")
    .filter((f): f is File => typeof f !== "string" && f.size > 0);

  // Validação server-side (fonte da verdade). Falha aqui = nada sobe pro B2.
  if (arquivos.length > MAX_ANEXOS) {
    return {
      ok: false,
      error: `Dá para anexar até ${MAX_ANEXOS} arquivos por sugestão. Remova os que sobram e envie de novo.`,
    };
  }
  for (const f of arquivos) {
    if (!tipoAnexoPermitido(f.type)) {
      return {
        ok: false,
        error: `"${f.name || "arquivo"}" não pode ser anexado. Aceitamos imagem (print, foto) ou PDF.`,
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
        "Os anexos não puderam ser salvos — é uma configuração pendente aqui do nosso lado, não é você. Avise o administrador (falta a chave B2 de contratos). A sugestão sem anexo funciona normalmente.",
    };
  }

  // Sobe tudo pro B2 ANTES de criar a sugestão. Se algum upload falhar, limpa o
  // que já subiu e aborta — não deixa órfão no bucket nem sugestão sem anexo.
  const uploadedKeys: string[] = [];
  // Declarado FORA do try: o `catch` abaixo faz limpeza e sai, e o retorno de
  // sucesso está depois do bloco — o id precisa sobreviver ao escopo.
  let criadaId: string | undefined;
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
    const criada = await prisma.implementacao.create({
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
      select: { id: true },
    });
    criadaId = criada.id;
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
    return { ok: true, id: criadaId, podeVerNaTriagem: isAdmin(ctx) };
  }
  // Quem NÃO é admin não pode ir para a central: `page.tsx` a redireciona para
  // "/". O efeito era cruel — a pessoa preenchia o formulário inteiro, clicava
  // em Salvar e caía na home sem mensagem nenhuma. Salvou, mas parece que
  // perdeu, e a próxima reação é mandar de novo.
  //
  // O caminho existe de verdade: a aba "Melhorias" de TODAS as empresas
  // (`lib/empresas-config.ts`) manda qualquer usuário logado para cá.
  if (!isAdmin(ctx)) {
    return { ok: true, id: criadaId, podeVerNaTriagem: false };
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

export type AtualizarRiceState = { ok: boolean; erro?: string };

/**
 * Atualiza os 4 fatores RICE e recalcula o score. Cliente envia o conjunto completo.
 *
 * Passou a DEVOLVER resultado (antes era `void`) para que a tela consiga desfazer
 * a atualização otimista quando o servidor recusa. Acrescentar retorno é
 * compatível: quem já chamava e ignorava continua funcionando igual.
 *
 * A validação de escala só entra com IMPLEMENTACOES_V2 ligada. Com a flag OFF o
 * caminho é byte a byte o de antes — inclusive aceitar um valor fora de régua,
 * que é o comportamento atual. Ligar a flag é que aperta o parafuso; e ele
 * aperta AQUI, no servidor, porque o cliente não é autoridade sobre o que entra
 * no banco (a mesma checagem roda lá só para avisar antes).
 */
export async function atualizarRice(
  id: string,
  vals: {
    reach?: number | null;
    impact?: number | null;
    confidence?: number | null;
    effort?: number | null;
  },
): Promise<AtualizarRiceState> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return { ok: false, erro: "Sem permissão." }; // central é admin-only

  const reach = intOrNull(vals.reach);
  const impact = intOrNull(vals.impact);
  const confidence = intOrNull(vals.confidence);
  const effort = intOrNull(vals.effort);

  if (await implementacoesV2Habilitado()) {
    // Valida só os eixos que MUDARAM em relação ao que está gravado.
    //
    // O cliente manda sempre os quatro, então validar o conjunto reprovaria uma
    // edição legítima por causa de um valor herdado — e existem linhas assim: o
    // texto de ajuda antigo ensinava "0,5 baixo", o servidor truncava para 0 e
    // gravava. Quem tentasse corrigir o Alcance de uma delas receberia um erro
    // sobre o Impacto e não conseguiria salvar campo nenhum, para sempre.
    //
    // Uma leitura a mais por gravação é o preço; o autosave já é debounced, então
    // isso não vira uma leitura por tecla.
    const atual = await prisma.implementacao.findUnique({
      where: { id },
      select: { reach: true, impact: true, confidence: true, effort: true },
    });
    if (!atual) return { ok: false, erro: "Sugestão não encontrada." };

    const novos = { reach, impact, confidence, effort };
    const mudaram = (Object.keys(novos) as RiceEixo[]).filter(
      (e) => novos[e] !== atual[e],
    );

    // Validado sobre os valores JÁ truncados: é o que de fato iria para o banco.
    // Checar o número cru deixaria passar 0,5 no impacto — que vira 0 e some.
    const erros = validarRice(novos, mudaram);
    if (erros.length > 0) {
      return { ok: false, erro: erros.map((e) => e.mensagem).join(" ") };
    }
  }

  const score = calcRiceScore(reach, impact, confidence, effort);

  await prisma.implementacao.update({
    where: { id },
    data: { reach, impact, confidence, effort, score },
  });
  revalidatePath("/configuracoes/implementacoes");
  return { ok: true };
}

export type AtualizarStatusState = { ok: boolean; erro?: string };

/**
 * Atualiza o status (triagem|aprovada|em-andamento|concluida|recusada).
 *
 * DEVOLVE resultado, e isso é o ponto. Antes era `Promise<void>` e saía calada
 * nos dois caminhos de recusa abaixo — a tela, que é otimista, ficava mostrando
 * um status que o banco não tinha, até alguém recarregar. E é sobre essa fila
 * que a decisão de prioridade é tomada.
 *
 * Mesma correção que `atualizarRice` já tinha recebido; o status ficou para
 * trás porque ninguém lia o retorno dele.
 */
export async function atualizarStatus(
  id: string,
  status: string,
): Promise<AtualizarStatusState> {
  const ctx = await getAuthContext();
  // Central é admin-only — defesa em profundidade.
  if (!isAdmin(ctx)) return { ok: false, erro: "Sem permissão para mudar o status." };
  if (!STATUSES.includes(status)) return { ok: false, erro: "Status inválido." };

  await prisma.implementacao.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/configuracoes/implementacoes");
  return { ok: true };
}

/** Estados do PR que uma sugestão originou. */
const PR_STATUSES = ["aberta", "merged", "fechada"] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export type VincularPrState = { ok: boolean; error?: string };

/**
 * Vincula (ou desvincula) uma sugestão ao PR que ela originou.
 *
 * Fecha o loop da fila: sem isto, "concluída" é digitado à mão e não há como
 * saber quantas ideias viraram entrega nem em quanto tempo. Com prNumero +
 * prMergedAt, o lead time "ideia → merge" vira uma subtração.
 *
 * Preenchimento MANUAL de propósito: não há webhook do GitHub apontando para
 * cá, e inventar um só para isto seria infra nova para um dado que o Eduardo
 * já tem na mão no momento em que mergeia.
 *
 * Passar `numero: null` limpa o vínculo inteiro — inclusive prMergedAt, senão
 * sobraria data de merge de um PR que não está mais vinculado.
 */
export async function vincularPr(
  id: string,
  input: { numero: number | null; url?: string | null; status?: string | null },
): Promise<VincularPrState> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return { ok: false, error: "Sem permissão." };

  if (input.numero == null) {
    await prisma.implementacao.update({
      where: { id },
      data: { prNumero: null, prUrl: null, prStatus: null, prMergedAt: null },
    });
    revalidatePath("/configuracoes/implementacoes");
    return { ok: true };
  }

  const numero = Math.trunc(input.numero);
  if (!Number.isFinite(numero) || numero <= 0) {
    return { ok: false, error: "Número de PR inválido." };
  }

  const status = input.status ?? "aberta";
  if (!PR_STATUSES.includes(status as PrStatus)) {
    return { ok: false, error: "Status de PR inválido." };
  }

  // prMergedAt é carimbado pelo SERVIDOR na primeira vez que o status vira
  // "merged". Duas defesas da métrica de lead time:
  //  - o cliente não manda a data (não daria para confiar em lead time negativo);
  //  - re-salvar um PR já merged NÃO recarimba, senão editar a URL meses depois
  //    reescreveria a data de merge e o lead time viraria ficção.
  // Sair de "merged" limpa a data: PR revertido não tem data de merge válida.
  const atual = await prisma.implementacao.findUnique({
    where: { id },
    select: { prMergedAt: true },
  });
  if (!atual) return { ok: false, error: "Não encontrado." };

  const prMergedAt =
    status === "merged" ? (atual.prMergedAt ?? new Date()) : null;

  await prisma.implementacao.update({
    where: { id },
    data: {
      prNumero: numero,
      prUrl: sOrNull(input.url ?? null),
      prStatus: status,
      prMergedAt,
    },
  });
  revalidatePath("/configuracoes/implementacoes");
  return { ok: true };
}

/**
 * Loga o RESULTADO de uma sugestão de RICE da IA ("confirmada" | "descartada"),
 * correlacionado à sugestão original via sugestaoLogId. Admin-only (a central é
 * admin-only). Append-only e fire-and-forget: só INSERT no SugestaoRiceLog, e o
 * writer engole qualquer falha pra nunca quebrar o fluxo do front.
 */
export async function registrarResultadoSugestaoRice(input: {
  implementacaoId: string;
  sugestaoLogId: string | null;
  resultado: "confirmada" | "descartada";
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  confiancaGeral?: string | null;
  eixosEditados?: string[];
}): Promise<void> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return; // central é admin-only — defesa em profundidade

  const score = calcRiceScore(
    input.reach,
    input.impact,
    input.confidence,
    input.effort,
  );
  await logResultadoSugestaoRice({
    evento: input.resultado,
    implementacaoId: input.implementacaoId,
    sugestaoLogId: input.sugestaoLogId,
    usuarioId: ctx.userId,
    usuarioNome: ctx.name,
    valores: {
      reach: input.reach,
      impact: input.impact,
      confidence: input.confidence,
      effort: input.effort,
      score,
      confiancaGeral: input.confiancaGeral ?? null,
    },
    metadata:
      input.eixosEditados && input.eixosEditados.length
        ? { eixosEditados: input.eixosEditados }
        : undefined,
  });
}
