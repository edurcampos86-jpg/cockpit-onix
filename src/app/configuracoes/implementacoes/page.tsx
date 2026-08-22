import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { opcoesFiltroEmpresa } from "@/lib/empresas-config";
import { calcularMetricasBacklog } from "@/lib/implementacoes/metricas";
import { implementacoesV2Habilitado } from "@/lib/implementacoes/v2-flag";
import { ImplementacoesList, type ImplementacaoDTO } from "./implementacoes-list";

export const dynamic = "force-dynamic";

/**
 * Teto de linhas trazidas por render. A página é `force-dynamic` e o filtro roda
 * no cliente, então TODA a fila viaja em TODO acesso. Hoje isso é barato; com
 * `promptGerado` (texto longo) entrando no modelo e a fila crescendo — que é o
 * objetivo declarado do fluxo guiado —, deixa de ser.
 *
 * O teto é uma trava de segurança, não paginação: acima dele a tela avisa em vez
 * de esconder em silêncio, e aí vale trocar por filtro server-side de verdade.
 */
const MAX_LINHAS = 300;

export default async function ImplementacoesPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const v2 = await implementacoesV2Habilitado();

  // `select` explícito em vez de `include`: `como` segue FORA do payload — campo
  // de texto livre que nenhuma célula renderiza é peso puro no HTML serializado
  // do RSC.
  //
  // `createdAt` e o nome do autor são LIDOS sempre (custo desprezível: uma coluna
  // escalar e um join por chave primária), mas só ENTRAM no DTO com a flag
  // ligada. O que pesa no RSC é o que atravessa a fronteira servidor→cliente,
  // não o que o Postgres devolveu — então com a flag OFF o payload continua
  // idêntico ao de antes desta entrega.
  const [total, semRiceTotal, itens, paraMetrica] = await Promise.all([
    prisma.implementacao.count(),
    // Quantas NUNCA foram pontuadas, na fila inteira. O recorte abaixo é
    // `score desc nulls last`: são exatamente estas que o teto corta primeiro,
    // e o banner precisa dizer isso em número, não em silêncio.
    prisma.implementacao.count({ where: { score: null } }),
    prisma.implementacao.findMany({
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: MAX_LINHAS,
      select: {
        id: true,
        empresaId: true,
        tipo: true,
        porQue: true,
        oQue: true,
        printUrl: true,
        reach: true,
        impact: true,
        confidence: true,
        effort: true,
        score: true,
        status: true,
        prNumero: true,
        prUrl: true,
        prStatus: true,
        createdAt: true,
        user: { select: { name: true } },
        anexos: {
          select: { id: true, nomeArquivo: true, contentType: true },
          orderBy: { ordem: "asc" },
        },
      },
    }),
    // Query PRÓPRIA da métrica, sem `take`: o teto acima corta as linhas de
    // menor score, e "quantas ideias viraram entrega" sobre uma amostra
    // truncada seria um número errado apresentado com cara de certo. São 4
    // campos escalares por linha — barato mesmo com a fila inteira.
    prisma.implementacao.findMany({
      select: {
        createdAt: true,
        prNumero: true,
        prStatus: true,
        prMergedAt: true,
      },
    }),
  ]);

  const metricas = calcularMetricasBacklog(paraMetrica);

  // Com a flag OFF os campos novos são REMOVIDOS do DTO, não enviados como null:
  // chave presente com valor nulo ainda viaja no payload e ainda aparece para
  // quem inspeciona o HTML. Ausente não existe.
  const dto: ImplementacaoDTO[] = itens.map(({ createdAt, user, ...resto }) =>
    v2
      ? { ...resto, criadoEm: createdAt.toISOString(), autorNome: user.name }
      : resto,
  );

  // Opções derivadas da fase inicial UNIDA aos empresaId realmente gravados —
  // assim nenhuma linha visível na tabela fica sem opção correspondente no filtro.
  const empresas = opcoesFiltroEmpresa(itens.map((i) => i.empresaId));

  // Só as sem RICE que ficaram DE FORA: o total global menos as que vieram na
  // página. Com a fila abaixo do teto os dois termos se igualam e dá zero, como
  // `ocultadas`. O piso existe porque as duas queries correm em `Promise.all`,
  // não em transação — uma sugestão criada entre elas daria número negativo.
  const ocultadasSemRice = Math.max(
    0,
    semRiceTotal - itens.filter((i) => i.score == null).length,
  );

  return (
    <ImplementacoesList
      itens={dto}
      empresas={empresas}
      ocultadas={Math.max(0, total - itens.length)}
      ocultadasSemRice={ocultadasSemRice}
      metricas={metricas}
      v2={v2}
    />
  );
}
