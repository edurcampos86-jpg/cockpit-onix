"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  normalizarTipoParceiro,
  ehTipoParceiroConhecido,
} from "@/lib/parceiros/vocabulario";
import { parceiroPorNome } from "@/lib/parceiros/consultas";

/* ──────────────────────────────────────────────────────────────
 * Escritas de Parceiro. Uma ação por decisão de negócio.
 *
 * `requireAdmin` em TODAS: parceiro carrega acordo de comissão, e quem cadastra
 * o parceiro é quem depois pendura o percentual nele. Mesma régua do
 * `actions/acordo-comercial.ts` (Pessoa), pelo mesmo motivo.
 * ────────────────────────────────────────────────────────────── */

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function dataOuNula(v: FormDataEntryValue | null): Date | null {
  const t = texto(v);
  if (!t) return null;
  // Data sem hora vira meio-dia UTC: meia-noite ISO cai no dia anterior em
  // qualquer fuso a oeste, e "assinado em 01/08" virando 31/07 não se percebe.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00Z` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ResultadoAcao =
  | { ok: true; parceiroId: string }
  | { ok: false; erro: string };

/**
 * Cria o parceiro. NÃO cria acordo nem vínculo — são decisões separadas, com
 * telas próprias, porque um parceiro pode existir por meses antes de o acordo
 * ser fechado.
 */
export async function criarParceiro(formData: FormData): Promise<ResultadoAcao> {
  const ctx = await requireAdmin();

  const pessoaId = texto(formData.get("pessoaId"));
  const tipoBruto = texto(formData.get("tipo"));
  const contratoAssinadoEm = dataOuNula(formData.get("contratoAssinadoEm"));

  // ── Herança: quando o parceiro é do time, o nome vem de lá ─────────────
  //
  // Não é conveniência de formulário, é o ponto do elo: digitar o nome de novo
  // produz a segunda grafia do mesmo humano — uma na ficha do cliente, outra na
  // do time. Com pessoa escolhida, o campo de nome nem é pedido na tela.
  let nome = texto(formData.get("nome"));
  if (pessoaId) {
    const pessoa = await prisma.pessoa.findUnique({
      where: { id: pessoaId },
      select: { nomeCompleto: true, apelido: true, parceiro: { select: { nome: true } } },
    });
    if (!pessoa) return { ok: false, erro: "Pessoa do time não encontrada." };
    if (pessoa.parceiro) {
      return {
        ok: false,
        erro: `Essa pessoa já está ligada ao parceiro "${pessoa.parceiro.nome}". Uma pessoa do time representa um parceiro só.`,
      };
    }
    nome = pessoa.apelido?.trim() || pessoa.nomeCompleto;
  }

  if (nome.length < 2) {
    return { ok: false, erro: "Informe o nome do parceiro." };
  }
  if (nome.length > 120) {
    return { ok: false, erro: "Nome muito longo (máximo 120 caracteres)." };
  }

  const tipo = normalizarTipoParceiro(tipoBruto);
  if (!tipo) {
    return { ok: false, erro: "Escolha a relação do parceiro com a Onix." };
  }
  // Fora da lista é PERMITIDO — a taxonomia ainda assenta (ver vocabulario.ts).
  // O aviso fica para quem lê o registro depois, não bloqueia o cadastro.
  if (!ehTipoParceiroConhecido(tipo)) {
    console.info(`[parceiros] tipo fora da lista de referência: ${tipo}`);
  }

  // Nome repetido não é erro de banco (não há unique), e sim quase sempre erro
  // humano: o segundo "Renan" divide a carteira em duas e nenhuma das duas
  // fecha. Barrar aqui é mais barato que descobrir no fechamento.
  const jaExiste = await parceiroPorNome(nome);
  if (jaExiste) {
    return {
      ok: false,
      erro: `Já existe um parceiro chamado "${jaExiste.nome}". Abra a ficha dele em vez de criar outro.`,
    };
  }

  const criado = await prisma.parceiro.create({
    data: {
      nome,
      tipo,
      contratoAssinadoEm,
      pessoaId: pessoaId || null,
      criadoPor: ctx.userId,
    },
    select: { id: true },
  });

  revalidatePath("/time/parceiros");
  return { ok: true, parceiroId: criado.id };
}

/**
 * Versão para `<form action={...}>`: cria e leva para a ficha do parceiro.
 *
 * O erro volta pela querystring, e não por estado de cliente, para o formulário
 * seguir sendo um Server Component — sem `useState`, sem hidratação, e sem
 * chance de o Prisma atravessar para o browser.
 */
export async function criarParceiroForm(formData: FormData): Promise<void> {
  const r = await criarParceiro(formData);
  if (!r.ok) {
    const nome = texto(formData.get("nome"));
    redirect(
      `/time/parceiros/novo?erro=${encodeURIComponent(r.erro)}&nome=${encodeURIComponent(nome)}`,
    );
  }
  redirect(`/time/parceiros/${r.parceiroId}?novo=1`);
}

/** Marca o parceiro como inativo (ou reativa). Não apaga nada. */
export async function alternarAtivoForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = texto(formData.get("parceiroId"));
  const ativar = texto(formData.get("ativar")) === "1";
  if (!id) return;

  // `updateMany` e não `update`: com `update`, id inexistente vira P2025 e
  // uma tela de erro do Next. Aqui vira zero linhas afetadas — a ação some,
  // que é o comportamento certo para um botão de uma página que alguém deixou
  // aberta enquanto o registro era removido em outra aba.
  await prisma.parceiro.updateMany({
    where: { id },
    data: { ativo: ativar, atualizadoPor: ctx.userId },
  });
  revalidatePath("/time/parceiros");
  revalidatePath(`/time/parceiros/${id}`);
}

/** Registra (ou limpa) a data de assinatura do contrato do parceiro. */
export async function salvarContratoForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = texto(formData.get("parceiroId"));
  if (!id) return;

  // Mesmo motivo do `alternarAtivoForm`: id inexistente não deve virar erro
  // 500 numa página que já estava aberta.
  await prisma.parceiro.updateMany({
    where: { id },
    data: {
      contratoAssinadoEm: dataOuNula(formData.get("contratoAssinadoEm")),
      atualizadoPor: ctx.userId,
    },
  });
  revalidatePath("/time/parceiros");
  revalidatePath(`/time/parceiros/${id}`);
}

/* ──────────────────────────────────────────────────────────────
 * ACORDOS DO PARCEIRO — uma linha por tipo de produto, datada.
 *
 * ── A REGRA QUE MANDA NO DESENHO: ALTERAR FECHA E ABRE ───────────────────
 * O percentual NUNCA sofre UPDATE. Mudar de 20% para 25% é FECHAR a linha
 * vigente (`dataFim`) e ABRIR outra — porque vale o percentual da data do
 * fato gerador, não o do fechamento. Um UPDATE no lugar reescreveria o
 * passado: o fechamento de março passaria a usar o percentual de junho, e
 * nada no banco registraria que mudou.
 *
 * O banco tem índice parcial único por (parceiroId, tipoProduto) onde
 * `dataFim IS NULL` (#318). Fechar e abrir na MESMA transação é o que impede
 * a janela em que os dois existiriam vigentes — e o índice é a rede embaixo:
 * se a ordem inverter algum dia, o INSERT falha em vez de duplicar comissão.
 * ────────────────────────────────────────────────────────────── */

export async function criarAcordoForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();

  const parceiroId = texto(formData.get("parceiroId"));
  const empresaId = texto(formData.get("empresaId"));
  const percentualBruto = texto(formData.get("percentual")).replace(",", ".");
  const incluiDescendentes = texto(formData.get("incluiDescendentes")) === "1";
  const dataInicio = dataOuNula(formData.get("dataInicio")) ?? new Date();

  const volta = (erro: string) =>
    redirect(`/time/parceiros/${parceiroId}?erroAcordo=${encodeURIComponent(erro)}`);

  if (!parceiroId) return;
  if (!empresaId) volta("Escolha a empresa ou o departamento do acordo.");

  // FK existe no banco e barraria de qualquer jeito — a leitura aqui é para a
  // mensagem sair com o NOME do nó em vez de um erro de constraint.
  const no = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, nome: true },
  });
  if (!no) volta("Essa empresa não existe mais na hierarquia.");

  // Decimal e não Number: `percentual` é DECIMAL(7,4) e a aritmética de float
  // erra somas de taxa (0.1 + 0.2 !== 0.3). Converter aqui derrotaria a escolha
  // da #318 na porta de entrada.
  let percentual: Prisma.Decimal;
  try {
    percentual = new Prisma.Decimal(percentualBruto);
  } catch {
    volta("Percentual precisa ser um número — use 20 ou 20,5.");
    return;
  }
  if (percentual.lessThan(0) || percentual.greaterThan(100)) {
    volta("Percentual precisa ficar entre 0 e 100.");
  }

  // ── Retroatividade que quebraria a linha anterior ──────────────────────
  //
  // Fechar o vigente grava `dataFim = dataInicio` do novo. Data anterior ao
  // início do que está valendo deixaria a linha antiga com
  // `dataFim < dataInicio` — o CHECK `vigencia_coerente` da #318 recusa, e o
  // usuário veria erro de constraint no lugar de uma frase.
  const vigenteAtual = await prisma.acordoComercialParceiro.findFirst({
    where: { parceiroId, empresaId, dataFim: null },
    select: { dataInicio: true },
  });
  if (vigenteAtual && dataInicio < vigenteAtual.dataInicio) {
    volta(
      `O acordo que vale hoje em ${no!.nome} começou em ${vigenteAtual.dataInicio.toLocaleDateString("pt-BR", { timeZone: "UTC" })}. ` +
        "A nova data precisa ser igual ou posterior — para corrigir o passado, encerre e registre de novo.",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Fecha o vigente DESTE nó — e só dele. Os outros nós seguem vigentes: é o
    // ponto da modelagem por hierarquia.
    await tx.acordoComercialParceiro.updateMany({
      where: { parceiroId, empresaId, dataFim: null },
      data: { dataFim: dataInicio, encerradoPor: ctx.userId },
    });

    await tx.acordoComercialParceiro.create({
      data: {
        parceiroId,
        empresaId,
        incluiDescendentes,
        // `tipoProduto` fica NULL: linha nova nasce no caminho novo. A coluna
        // segue existindo para as linhas antigas até a PR de remoção.
        percentual,
        dataInicio,
        criadoPor: ctx.userId,
      },
    });
  });

  revalidatePath(`/time/parceiros/${parceiroId}`);
  revalidatePath("/time/parceiros");
  redirect(`/time/parceiros/${parceiroId}?acordo=salvo`);
}

/**
 * Encerra o acordo vigente de um produto sem abrir outro — o parceiro deixa de
 * ter acordo naquele produto.
 *
 * Diferente de gravar 0%: 0% é acordo ("decidido que não remunera"), encerrar
 * é ausência de acordo ("não há regra vigente"). Guardar os dois separados é o
 * que permite responder "isso foi decidido ou ninguém cadastrou?".
 */
export async function encerrarAcordoForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const parceiroId = texto(formData.get("parceiroId"));
  const acordoId = texto(formData.get("acordoId"));
  if (!parceiroId || !acordoId) return;

  await prisma.acordoComercialParceiro.updateMany({
    // `dataFim: null` na condição: encerrar duas vezes (dois cliques, duas
    // abas) não pode reescrever a data do encerramento original.
    where: { id: acordoId, parceiroId, dataFim: null },
    data: { dataFim: new Date(), encerradoPor: ctx.userId },
  });

  revalidatePath(`/time/parceiros/${parceiroId}`);
  revalidatePath("/time/parceiros");
  redirect(`/time/parceiros/${parceiroId}?acordo=encerrado`);
}

/* ──────────────────────────────────────────────────────────────
 * VÍNCULO PARCEIRO ↔ CLIENTE — datado, e exclusivo por cliente.
 *
 * O banco garante o principal: índice parcial único em `clienteId` onde
 * `dataFim IS NULL` (#310). Um cliente tem NO MÁXIMO UM parceiro vigente,
 * porque a comissão do parceiro sai da mesma base que a do assessor e dois
 * parceiros retirariam duas vezes.
 *
 * A checagem no código não substitui o índice — ela existe para a pessoa ver
 * o NOME de quem já tem o cliente, em vez de um erro de unique violation.
 * ────────────────────────────────────────────────────────────── */

export async function vincularClienteForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const parceiroId = texto(formData.get("parceiroId"));
  const clienteId = texto(formData.get("clienteId"));
  if (!parceiroId || !clienteId) return;

  const volta = (chave: string, valor: string) =>
    redirect(`/time/parceiros/${parceiroId}?${chave}=${encodeURIComponent(valor)}`);

  const vigente = await prisma.parceiroCliente.findFirst({
    where: { clienteId, dataFim: null },
    select: { parceiroId: true, parceiro: { select: { nome: true } } },
  });

  if (vigente?.parceiroId === parceiroId) {
    // Reexecução (dois cliques, aba antiga). Não é erro: já está como se quer.
    volta("vinculo", "ja");
  }
  if (vigente) {
    volta(
      "erroVinculo",
      `Esse cliente já está com ${vigente.parceiro.nome}. Encerre o vínculo lá antes de trazer para cá — um cliente tem um parceiro de cada vez.`,
    );
  }

  // A checagem acima resolve o caso comum; entre ela e este INSERT ainda cabe
  // uma corrida (duas abas, dois cliques). Quem decide de verdade é o índice
  // parcial único da #310 — e P2002 aqui significa exatamente "outro parceiro
  // ficou com o cliente primeiro". Vira frase, não tela de erro.
  try {
    await prisma.parceiroCliente.create({
      data: { parceiroId, clienteId, vinculadoPor: ctx.userId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      volta(
        "erroVinculo",
        "Esse cliente acabou de ser vinculado a outro parceiro. Recarregue a página para ver quem está com ele.",
      );
    }
    throw e;
  }

  revalidatePath(`/time/parceiros/${parceiroId}`);
  revalidatePath("/time/parceiros");
  revalidatePath(`/empresas/investimentos/clientes/${clienteId}`);
  volta("vinculo", "criado");
}

export async function desvincularClienteForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const parceiroId = texto(formData.get("parceiroId"));
  const vinculoId = texto(formData.get("vinculoId"));
  const clienteId = texto(formData.get("clienteId"));
  if (!parceiroId || !vinculoId) return;

  await prisma.parceiroCliente.updateMany({
    // `dataFim: null` na condição: desvincular duas vezes não pode reescrever
    // a data do primeiro encerramento.
    where: { id: vinculoId, parceiroId, dataFim: null },
    data: { dataFim: new Date(), desvinculadoPor: ctx.userId },
  });

  revalidatePath(`/time/parceiros/${parceiroId}`);
  revalidatePath("/time/parceiros");
  if (clienteId) revalidatePath(`/empresas/investimentos/clientes/${clienteId}`);
  redirect(`/time/parceiros/${parceiroId}?vinculo=encerrado`);
}


/* ──────────────────────────────────────────────────────────────
 * LIGAR / DESLIGAR a pessoa do time.
 *
 * Separado do cadastro porque a descoberta costuma vir depois: o parceiro é
 * criado quando aparece a primeira indicação, e só semanas mais tarde alguém
 * percebe que ele já tinha crachá.
 * ────────────────────────────────────────────────────────────── */

export async function ligarPessoaForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const parceiroId = texto(formData.get("parceiroId"));
  const pessoaId = texto(formData.get("pessoaId"));
  if (!parceiroId) return;

  const volta = (chave: string, valor: string) =>
    redirect(`/time/parceiros/${parceiroId}?${chave}=${encodeURIComponent(valor)}`);

  // Desligar é o caso de pessoaId vazio — sem confirmação extra aqui porque a
  // tela já pede a confirmação antes de chamar (ver ConfirmarAcao na ficha).
  if (!pessoaId) {
    await prisma.parceiro.updateMany({
      where: { id: parceiroId },
      data: { pessoaId: null, atualizadoPor: ctx.userId },
    });
    revalidatePath(`/time/parceiros/${parceiroId}`);
    volta("pessoa", "desligada");
    return;
  }

  const dona = await prisma.parceiro.findUnique({
    where: { pessoaId },
    select: { id: true, nome: true },
  });
  if (dona && dona.id !== parceiroId) {
    volta(
      "erroPessoa",
      `Essa pessoa já está ligada ao parceiro "${dona.nome}". Desfaça lá antes de ligar aqui.`,
    );
  }

  await prisma.parceiro.updateMany({
    where: { id: parceiroId },
    data: { pessoaId, atualizadoPor: ctx.userId },
  });

  revalidatePath(`/time/parceiros/${parceiroId}`);
  revalidatePath("/time/parceiros");
  volta("pessoa", "ligada");
}
