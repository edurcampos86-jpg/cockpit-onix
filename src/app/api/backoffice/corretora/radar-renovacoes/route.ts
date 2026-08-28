/**
 * GET /api/backoffice/corretora/radar-renovacoes
 *
 * Quem já venceu, quem está vencendo, e quem não tem data. Em JSON, hoje.
 *
 * ── POR QUE ESTA ROTA VEM ANTES DA TELA ──────────────────────────────────
 * Os contratos vencidos existem AGORA e independem de qualquer interface. São
 * ligações de renovação que já poderiam estar acontecendo, e cada dia que a
 * lista espera uma tela é um dia a mais de cliente vencido sem ninguém ligar.
 *
 * A tela vem depois e vai consumir o mesmo módulo. Esta rota não é protótipo
 * descartável: é a mesma fonte, servida no formato que dá para usar hoje.
 *
 * ── DEPENDÊNCIA DE PRODUÇÃO, E ELA É BLOQUEANTE ──────────────────────────
 * Tudo aqui vive de `ContratoCorretora.fimVigencia`. Enquanto a trava do
 * update cego (PR #424) não estiver em `main`, um perfil que não mapeie a
 * coluna de fim de vigência ZERA a data de todo contrato que atualizar. O
 * radar então mostraria uma fila curta e correta na aparência, com os
 * vencimentos apagados — o pior desfecho possível para uma tela cuja função é
 * impedir perda silenciosa.
 *
 * A rota é somente leitura e não causa isso; ela apenas fica cega. Ligar o
 * alerta antes daquela trava é montar o alarme e desligar o sensor.
 *
 * ── SOMENTE LEITURA ──────────────────────────────────────────────────────
 * `coletarRadar` só faz `SELECT`. Nenhum `create`/`update`/`upsert`/`delete`/
 * `executeRaw` em caminho nenhum, nem sob condição. `GET` de verdade: chamar
 * dez vezes seguidas não muda uma linha.
 *
 * ── DADO PESSOAL: O QUE SAI, E POR QUE ───────────────────────────────────
 * Sai `nome` e `telefone` do titular, quando existem, mais o documento.
 *
 * Isso é dado pessoal e está aqui por decisão explícita: fila de renovação sem
 * com quem falar é relatório, não ferramenta — é a diferença entre a tela que
 * substitui a planilha e a que vira mais uma aba aberta. O documento vem junto
 * porque, para o cliente exclusivo da Corretora, não há nome em lugar nenhum
 * do sistema e ele é a única identificação disponível.
 *
 * Gate de admin estrito, o mesmo das rotas irmãs. Nada disso é agregado nem
 * anonimizado, e a rota não finge o contrário.
 *
 * ── A RÉGUA É DADO ───────────────────────────────────────────────────────
 * A antecedência por produto vem de `Config`, não do código: auto renova
 * diferente de vida, e consórcio dos dois — e quem descobre a antecedência
 * certa é o backoffice usando a fila, não quem escreve o módulo. Mudar a régua
 * não pode exigir deploy.
 *
 * Sem valor gravado, vale `REGUA_PADRAO`, que é ponto de partida declarado e
 * não verdade descoberta.
 */
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { CHAVE_DA_REGUA, coletarRadar, lerRegua } from "@/lib/corretora/radar-renovacoes";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const EMPRESA = "corretora";

export async function GET() {
  noStore();

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const regua = lerRegua(await getConfig(CHAVE_DA_REGUA));
    const radar = await coletarRadar(prisma, { empresaId: EMPRESA, hoje: new Date(), regua });

    return NextResponse.json({
      geradoEm: new Date().toISOString(),
      somenteLeitura: true,
      radar,
      // O que a fila AINDA não faz, dito na própria resposta. Sem isto, a
      // primeira semana de uso ensina que a lista se repete e a segunda ensina
      // a ignorá-la — que é como a planilha chegou onde chegou.
      limites: {
        registroDeTratativa: false,
        porQue:
          "Não há onde registrar 'liguei', 'renovado' ou 'cliente recusou': isso " +
          "exige tabela nova e está reportado como faixa vermelha. Enquanto não " +
          "existir, a mesma lista reaparece a cada consulta, inclusive os nomes " +
          "que você já trabalhou.",
        dependeDaTravaDoImport:
          "Esta lista vive de fimVigencia. Enquanto a PR #424 não estiver em main, " +
          "uma importação com perfil que não mapeie fim de vigência apaga essas " +
          "datas e a fila encolhe sozinha, sem avisar.",
      },
    });
  } catch (e) {
    // A mensagem do driver pode conter a connection string (logo, credencial).
    // Ela vai para o log do servidor; o cliente recebe só o código. Mesma
    // regra de `api/backoffice/recon-identidade`.
    console.error("[radar-renovacoes] falha ao montar o radar:", e);
    return NextResponse.json({ error: "erro ao montar o radar" }, { status: 500 });
  }
}
