import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { implementacoesV2Habilitado } from "@/lib/implementacoes/v2-flag";
import { tokenizar, similaridade } from "@/lib/implementacoes/similares";

export const dynamic = "force-dynamic";

/**
 * GET /api/implementacoes/similares?q=…
 *
 * SOMENTE LEITURA: enquanto a pessoa digita "O quê?" no modal do FAB, devolve
 * até 3 sugestões já existentes parecidas. Não grava nada, não bloqueia o envio
 * — é aviso, não trava. Quem quiser mandar assim mesmo, manda.
 *
 * Por que existe: a fila tem teto de 300 linhas na tela e ninguém rola isso
 * antes de sugerir. A mesma ideia entra três vezes com três redações, e as três
 * competem por RICE como se fossem coisas diferentes.
 *
 * Reusa `tokenizar`/`similaridade` de `lib/implementacoes/similares.ts` — as
 * mesmas primitivas que calibram o prompt da IA. Não reusa `buscarSimilares`
 * porque aquela função é sobre ideias ENTREGUES (pede data de merge); aqui o
 * alvo é a fila inteira, inclusive o que ainda está em triagem — que é
 * justamente onde a duplicata costuma estar parada.
 *
 * ESCOPO: só a empresa que a pessoa selecionou no modal, e nunca a fila inteira.
 * O modal do FAB chama isto para todo usuário logado. Sem o recorte por empresa,
 * qualquer pessoa sondaria termos e enumeraria os títulos da fila de TODAS as
 * empresas. Duplicata só interessa dentro da própria fila de qualquer forma,
 * então o recorte não custa nada ao produto.
 *
 * O recorte por DONO, ao contrário, custaria tudo — ver o bloco de decisão
 * junto da consulta, no corpo do `GET`.
 *
 * Campos devolvidos ao mínimo (id, o quê, status): "por quê" é texto livre onde
 * as pessoas escrevem contexto que não precisa circular só para desduplicar um
 * título.
 */

/** Teto de linhas varridas. A comparação é O(n) em memória; 400 é folgado. */
const MAX_VARREDURA = 400;

/** Piso de similaridade. Abaixo disto o "parecido" é ruído e só atrapalha. */
const PISO = 0.18;

export async function GET(req: Request) {
  /* `getSession` basta: a única pergunta que este endpoint faz é "está logado?".
   * Sem recorte por dono não há o que perguntar sobre papel, e voltar ao
   * `getSession` devolve as duas buscas por chave primária que o recorte
   * custava a cada tecla digitada no modal. */
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ similares: [] }, { status: 401 });
  }

  // Flag OFF → responde vazio, sem tocar o banco. O modal não mostra nada.
  if (!(await implementacoesV2Habilitado())) {
    return NextResponse.json({ similares: [] });
  }

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const empresaId = (params.get("empresa") ?? "").trim();
  // Sem empresa declarada não há recorte seguro a aplicar — responde vazio em
  // vez de cair para "todas", que é exatamente o vazamento que se quer evitar.
  if (!empresaId) {
    return NextResponse.json({ similares: [] });
  }
  const alvo = tokenizar(q);
  // Menos de dois tokens úteis não distingue nada: "relatório" casaria com
  // meia fila e a pessoa aprenderia a ignorar o aviso já na terceira letra.
  if (alvo.size < 2) {
    return NextResponse.json({ similares: [] });
  }

  /* NÃO ESCOPADO PELO DONO — decisão do Eduardo, e ela tem nome.
   *
   * A central de implementações deixou de ser admin-only, e a régua de lá
   * (`lib/implementacoes/escopo.ts`) é "cada um vê APENAS as próprias". Este
   * endpoint é a ÚNICA exceção deliberada a ela, porque escopá-lo mata o
   * produto: um aviso de duplicata que só olha a sua própria fila nunca avisa
   * sobre a ideia que OUTRA pessoa já pediu — que é o caso que faz a mesma
   * ideia entrar três vezes com três redações.
   *
   * O que atravessa a fronteira é o MÍNIMO, e está no `select` abaixo:
   *   `oQue`    o título, que é o que se compara para desduplicar;
   *   `status`  para o aviso dizer se aquilo já foi entregue ou está parado;
   *   `id`      inerte — o PDF (`[id]/print`) e o anexo passam por `podeAbrir`
   *             e devolvem 404 para quem não é dono.
   *
   * O que NÃO atravessa: `porQue` (texto livre, onde as pessoas escrevem o
   * contexto do pedido) e qualquer traço de autoria. Título de sugestão interna
   * não é dado de cliente; o corpo continua escopado por dono na central.
   *
   * O recorte por empresa (`empresaId`, exigido acima) permanece: ele impede
   * enumerar a fila do grupo inteiro sondando termos. */
  const linhas = await prisma.implementacao.findMany({
    where: { empresaId },
    orderBy: { createdAt: "desc" },
    take: MAX_VARREDURA,
    select: { id: true, oQue: true, status: true },
  });

  const similares = linhas
    .map((l) => ({ l, s: similaridade(alvo, tokenizar(l.oQue)) }))
    .filter((x) => x.s >= PISO)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ l }) => ({ id: l.id, oQue: l.oQue, status: l.status }));

  return NextResponse.json({ similares });
}
