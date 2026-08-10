/**
 * Execução do backfill de `PessoaGrupo` — a camada que toca o banco.
 *
 * Separada de `backfill-pessoa-grupo.ts` (puro) de propósito: aquele decide O
 * QUE fazer e é testável sem Postgres; este faz, e é exercitado pelo ensaio de
 * shadow-DB. O dry-run da rota chama SÓ o módulo puro — não existe caminho em
 * que ele escreva.
 *
 * ── POR QUE O CLIENT VEM POR PARÂMETRO ───────────────────────────────────
 * Mesmo padrão de `empresas/seed-hierarquia.ts` e
 * `backoffice/recon-identidade.ts`: nada aqui importa `@/lib/prisma`
 * estaticamente, para o script de ensaio poder checar `DATABASE_URL` antes de
 * o cliente ser construído (`src/lib/prisma.ts:10` usa `process.env.DATABASE_URL!`
 * no import).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import {
  dividirEmLotes,
  planejarBackfill,
  planejarEscrita,
  resumirPlano,
  type AcaoGrupo,
  type LinhaCliente,
  type PlanoBackfill,
  type PlanoEscrita,
  type ResultadoLote,
  type ResumoBackfill,
} from "@/lib/backoffice/backfill-pessoa-grupo";

/** O contrato mínimo: ler clientes, ler/criar pessoas, e transacionar. */
export type ClienteBackfill = Pick<
  PrismaClient,
  "clienteBackoffice" | "pessoaGrupo" | "$transaction"
>;

/**
 * Lê o que o planejamento precisa: id, documento e vínculo atual.
 *
 * `select` MÍNIMO e explícito. Nome, e-mail e telefone não são lidos porque
 * não participam da régua — e o que não é lido não pode vazar num log de erro.
 */
export async function carregarLinhas(db: ClienteBackfill): Promise<LinhaCliente[]> {
  return db.clienteBackoffice.findMany({
    select: { id: true, cpfCnpj: true, pessoaGrupoId: true },
    orderBy: { id: "asc" },
  });
}

/** Documento → `PessoaGrupo.id` do que já está gravado. Vazio na 1ª execução. */
export async function carregarPessoasExistentes(
  db: ClienteBackfill,
): Promise<Map<string, string>> {
  const pessoas = await db.pessoaGrupo.findMany({ select: { id: true, cpfCnpj: true } });
  return new Map(pessoas.map((p) => [p.cpfCnpj, p.id]));
}

export type Diagnostico = {
  plano: PlanoBackfill;
  escrita: PlanoEscrita;
  resumo: ResumoBackfill;
};

/**
 * Lê o banco e planeja, SEM escrever. É o corpo inteiro do dry-run.
 *
 * Também é o que o modo "aplicar" chama antes de começar — então os números
 * que a aplicação reporta como "medidos" vêm do mesmo caminho que os
 * "previstos", e comparar os dois é comparar maçã com maçã.
 */
export async function diagnosticar(db: ClienteBackfill): Promise<Diagnostico> {
  const linhas = await carregarLinhas(db);
  const existentes = await carregarPessoasExistentes(db);
  const plano = planejarBackfill(linhas);
  const escrita = planejarEscrita(plano, linhas, existentes);
  return { plano, escrita, resumo: resumirPlano(plano, escrita) };
}

export type ProgressoLote = (r: ResultadoLote) => Promise<void>;

export type ResultadoAplicacao = {
  lotes: ResultadoLote[];
  /** Diagnóstico relido DEPOIS de tudo — o estado final medido, não previsto. */
  depois: Diagnostico;
};

/**
 * Aplica o plano em lotes, cada lote em sua própria transação.
 *
 * ── POR QUE UMA TRANSAÇÃO POR LOTE, E NÃO UMA SÓ ─────────────────────────
 * Uma transação única sobre ~2 mil linhas seguraria locks por toda a duração
 * e, se caísse no fim, jogaria fora todo o trabalho. Por lote, uma
 * interrupção — deploy, timeout de gateway, o operador fechando a aba — deixa
 * os lotes já confirmados VÁLIDOS e o resto por fazer. Reexecutar continua de
 * onde parou porque `planejarEscrita` recalcula o que falta a partir do banco,
 * não de um cursor guardado.
 *
 * ── O QUE CADA TRANSAÇÃO ESCREVE ─────────────────────────────────────────
 * Só duas coisas: `PessoaGrupo` nova (create) e `ClienteBackoffice.pessoaGrupoId`
 * (updateMany restrito a `pessoaGrupoId: null`). Nenhum outro campo de
 * cliente, nenhum delete, em nenhum caminho.
 *
 * ── A GUARDA DENTRO DO UPDATE ────────────────────────────────────────────
 * O `where` repete `pessoaGrupoId: null` mesmo já tendo filtrado no
 * planejamento. É proposital: entre o SELECT e o UPDATE alguém pode ter
 * ligado a conta, e sem a condição este backfill sobrescreveria esse vínculo.
 * Com ela, a linha simplesmente não é tocada e a contagem devolvida denuncia
 * a diferença.
 */
export async function aplicarBackfill(
  db: ClienteBackfill,
  escrita: PlanoEscrita,
  aoTerminarLote?: ProgressoLote,
): Promise<ResultadoAplicacao> {
  const lotes = dividirEmLotes(escrita.acoes);
  const resultados: ResultadoLote[] = [];

  for (const [indice, acoes] of lotes.entries()) {
    const r = await db.$transaction(async (tx) => {
      let pessoasCriadas = 0;
      let linksGravados = 0;

      for (const acao of acoes) {
        const pessoaId = await garantirPessoa(tx, acao, () => {
          pessoasCriadas++;
        });

        if (acao.ligar.length > 0) {
          const { count } = await tx.clienteBackoffice.updateMany({
            // `pessoaGrupoId: null` no where é a guarda contra corrida — ver
            // o cabeçalho desta função.
            where: { id: { in: acao.ligar }, pessoaGrupoId: null },
            data: { pessoaGrupoId: pessoaId },
          });
          linksGravados += count;
        }
      }

      return {
        lote: indice + 1,
        totalLotes: lotes.length,
        pessoasCriadas,
        linksGravados,
        jaLigadas: acoes.reduce((n, a) => n + a.jaLigadas.length, 0),
        divergentes: acoes.reduce((n, a) => n + a.divergentes.length, 0),
      } satisfies ResultadoLote;
    });

    resultados.push(r);

    // O rastro do lote é gravado FORA da transação dele, de propósito: um log
    // que falha não pode desfazer um backfill que deu certo. A ordem também
    // importa — logar depois do commit significa que toda linha de log
    // corresponde a trabalho realmente confirmado.
    if (aoTerminarLote) await aoTerminarLote(r);
  }

  return { lotes: resultados, depois: await diagnosticar(db) };
}

/**
 * Devolve o `PessoaGrupo.id` do documento, criando a linha se faltar.
 *
 * `upsert` sobre a UNIQUE `cpfCnpj` em vez de "consultar e criar": entre o
 * SELECT e o INSERT duas execuções simultâneas colidiriam, e o upsert resolve
 * isso no banco. O `update` é VAZIO — reencontrar a pessoa não pode reescrever
 * nada dela, nem `tipoDocumento`, que é derivado e já está correto.
 */
async function garantirPessoa(
  tx: Pick<PrismaClient, "pessoaGrupo">,
  acao: AcaoGrupo,
  aoCriar: () => void,
): Promise<string> {
  if (!acao.criarPessoa) {
    const existente = await tx.pessoaGrupo.findUnique({
      where: { cpfCnpj: acao.documento },
      select: { id: true },
    });
    if (existente) return existente.id;
    // Sumiu entre o diagnóstico e a aplicação. Cai no upsert abaixo.
  }

  const antes = await tx.pessoaGrupo.count({ where: { cpfCnpj: acao.documento } });
  const pessoa = await tx.pessoaGrupo.upsert({
    where: { cpfCnpj: acao.documento },
    create: { cpfCnpj: acao.documento, tipoDocumento: acao.tipo },
    update: {},
    select: { id: true },
  });
  if (antes === 0) aoCriar();
  return pessoa.id;
}
