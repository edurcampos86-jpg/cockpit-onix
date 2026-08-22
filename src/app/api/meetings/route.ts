import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { escopoDeReunioes } from "@/lib/reunioes/escopo-reuniao-sessao";
import { filtrarReunioesPorEscopo } from "@/lib/reunioes/escopo-reuniao";
import { casarClientePorParticipantes } from "@/lib/reunioes/casar-cliente";

/**
 * GET /api/meetings — inbox de transcrições do Plaud.
 *
 * Duas coisas acontecem aqui, e a ORDEM entre elas é a regra:
 *
 *   1. FILTRA por escopo (#363). Até aquela mudança a rota não fazia nenhuma
 *      checagem além da que o proxy já faz ("existe sessão"): qualquer pessoa
 *      logada lia a transcrição inteira de qualquer reunião, enquanto a ficha
 *      do mesmo cliente era gateada. A régua e o porquê do eixo ser `vendedor`
 *      estão em `src/lib/reunioes/escopo-reuniao.ts`.
 *
 *   2. CASA com o cliente (#357). Cada reunião que sobrou vem com `cliente`:
 *      quem da base estava naquela sala, quando dá para afirmar. O casamento é
 *      CALCULADO na leitura, não gravado: `Meeting` não tem coluna de cliente,
 *      e criar uma exigiria migration para uma informação derivável que muda
 *      sozinha quando o cadastro muda (apelido novo, nome completo preenchido
 *      depois). Dado derivado guardado envelhece. A regra vive em
 *      `src/lib/reunioes/casar-cliente.ts`, testada — e é deliberadamente mais
 *      estrita que a de `lead`: igualdade de nome normalizado, nunca substring.
 *
 * Filtrar ANTES de casar não é detalhe de desempenho, ainda que também economize
 * o casamento de reunião que ninguém vai ver: é o que garante que o campo
 * `cliente` nunca seja calculado — nem devolvido — para reunião fora do escopo
 * de quem perguntou.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 403 });

  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
  const escopo = await escopoDeReunioes(ctx);

  /*
   * O filtro roda DEPOIS do `take`, então quem tem escopo restrito pode receber
   * menos itens que o `limit` pedido. É deliberado: filtrar no banco exigiria
   * traduzir a régua de contenção de tokens para SQL, e uma régua duplicada em
   * dois dialetos é a que diverge. A tela lista dezenas, não milhares.
   */
  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: { lead: { select: { name: true, productInterest: true } } },
  });

  const visiveis = filtrarReunioesPorEscopo(meetings, escopo);

  // Uma consulta para a lista inteira, não uma por reunião. São 4 colunas
  // curtas; o custo é o de uma varredura, e o casamento acontece em memória.
  const candidatos = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true, nomeCompleto: true, apelido: true },
  });

  const comCliente = visiveis.map((m) => {
    const participantes = (m.participants ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const casamento = casarClientePorParticipantes(participantes, candidatos);
    return {
      ...m,
      cliente:
        casamento.tipo === "casou"
          ? { id: casamento.clienteId, nome: casamento.nome }
          : null,
      // A tela precisa distinguir "não achei" de "achei dois": no segundo caso
      // o cliente EXISTE na base e o Eduardo só precisa dizer qual.
      clienteAmbiguo: casamento.tipo === "ambiguo" ? casamento.participante : null,
    };
  });

  return NextResponse.json(comCliente);
}
