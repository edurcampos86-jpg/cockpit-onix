/**
 * GET /api/backoffice/medir-corretora
 *
 * As cinco medições que decidem o desenho das telas da Corretora — Carteira,
 * Ficha 360 e Radar de renovação —, em JSON.
 *
 * ── POR QUE UMA ROTA, SE JÁ EXISTE O SCRIPT ──────────────────────────────
 * `scripts/medir-corretora.ts` (#418) responde as mesmas perguntas e exige
 * terminal. Quem decide o desenho não usa terminal, e medição que depende de
 * outra pessoa rodar não é medição: é intenção. A rota tira o intermediário.
 *
 * ── A LÓGICA NÃO MORA AQUI ───────────────────────────────────────────────
 * `lib/corretora/medicoes.ts` tem as consultas e as leituras; script e rota
 * consomem o MESMO módulo. Esta rota autentica, chama a coleta e serializa —
 * nada mais. Duas cópias das consultas divergiriam no primeiro ajuste e
 * passariam a dar respostas diferentes para a mesma pergunta, que é
 * exatamente o defeito que estas medições existem para evitar.
 *
 * ── SOMENTE LEITURA, EM TODOS OS CAMINHOS ────────────────────────────────
 * `coletarMedicoes` só faz `SELECT`/`count`/`GROUP BY`, numa transação de
 * leitura. Não há `create`, `update`, `upsert`, `delete` nem `executeRaw` em
 * caminho nenhum — nem sob condição. É `GET`, e é `GET` de verdade: chamar
 * dez vezes seguidas não muda uma linha.
 *
 * ── NENHUM DADO PESSOAL NA RESPOSTA ──────────────────────────────────────
 * Só contagens agregadas e nomes de COLUNA de relatório. Nem documento, nem
 * nome de cliente, nem e-mail, nem telefone — a medição de colunas extras
 * devolve as CHAVES do Json e nunca os valores. A única string livre é
 * `atendenteCorretora`, que é quem atende e não o cliente, e é o objeto da
 * própria medição 4. Mesma regra de `api/backoffice/recon-identidade` e de
 * `api/backoffice/pessoa-grupo/backfill`.
 *
 * ── GATE DE AUTORIZAÇÃO ──────────────────────────────────────────────────
 * `isAdmin(ctx)` de `@/lib/auth-helpers`, o mesmo das rotas irmãs
 * (`recon-identidade`, `pessoa-grupo/backfill`). Admin estrito —
 * `teamRole: "lideranca"` não passa. Contagem agregada não é dado pessoal,
 * mas responde "quantos clientes a corretora tem" e "como a carteira se
 * divide entre atendentes", que é informação de negócio.
 *
 * ── SEM CACHE ────────────────────────────────────────────────────────────
 * `force-dynamic` + `noStore()`: a resposta muda a cada importação, e uma
 * medição servida do cache seria pior do que medição nenhuma — teria a
 * aparência de dado fresco. É o mesmo trio das rotas que leem estado
 * pós-import.
 */
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import {
  LEITURAS,
  TABELAS_NECESSARIAS,
  coletarMedicoes,
  tabelasAusentes,
} from "@/lib/corretora/medicoes";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  noStore();

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Tabela ausente é 503 e não 500: o serviço está de pé, a pergunta é que não
  // pode ser respondida NESTE banco (branch sem a migration, ambiente errado).
  // Devolver 500 mandaria procurar bug onde há descompasso de ambiente.
  const faltando = await tabelasAusentes(prisma);
  if (faltando.length > 0) {
    return NextResponse.json(
      {
        error: "tabelas-ausentes",
        faltando,
        necessarias: TABELAS_NECESSARIAS,
        detalhe:
          "Estas tabelas não existem neste banco. As medições não podem ser feitas aqui.",
      },
      { status: 503 },
    );
  }

  const medicoes = await coletarMedicoes(prisma);

  return NextResponse.json({
    medidoEm: new Date().toISOString(),
    medicoes,
    // As leituras viajam junto com os números DE PROPÓSITO. Número sem leitura
    // vira interpretação de quem lê, e a interpretação errada é o defeito que
    // estas medições existem para evitar — a versão anterior deste cálculo
    // errou justamente aí.
    leituras: LEITURAS,
    // O contexto que muda a leitura do resultado, e que não está em nenhum
    // dos números: a carteira de Investimentos TEM nome, documento, e-mail e
    // telefone. Logo, para o cliente das duas casas o nome já é alcançável
    // sem migration nenhuma, e o número que decide a coluna nova é só o
    // complemento — quem não tem contraparte lá.
    contexto: {
      investimentosTemNomeEContato: true,
      numeroQueDecideAColunaDeNome: "medicoes.nome.semContraparteEmInvestimentos",
      porQue:
        "Cliente das duas casas já tem nome, e-mail e telefone alcançáveis por " +
        "PessoaGrupo.clientes, sem migration. Só o cliente EXCLUSIVO da Corretora " +
        "fica sem nome em lugar nenhum — e é só ele que justifica (ou não) a " +
        "coluna PessoaGrupo.nome, que é faixa vermelha.",
    },
    somenteLeitura: true,
  });
}
