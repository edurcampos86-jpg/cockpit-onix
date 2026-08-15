import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { casarClientePorParticipantes } from "@/lib/reunioes/casar-cliente";

/**
 * GET /api/meetings — inbox de transcrições do Plaud.
 *
 * Cada reunião vem com `cliente`: quem da base estava naquela sala, quando dá
 * para afirmar. O casamento é CALCULADO na leitura, não gravado: `Meeting` não
 * tem coluna de cliente, e criar uma exigiria migration para uma informação que
 * é derivável e que muda sozinha quando o cadastro do cliente muda (apelido
 * novo, nome completo preenchido depois). Dado derivado guardado envelhece.
 *
 * A regra de casamento vive em `src/lib/reunioes/casar-cliente.ts`, testada —
 * e é deliberadamente mais estrita que a de `lead` logo acima: igualdade de
 * nome normalizado, nunca substring.
 */
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: { lead: { select: { name: true, productInterest: true } } },
  });

  // Uma consulta para a lista inteira, não uma por reunião. São 4 colunas
  // curtas; o custo é o de uma varredura, e o casamento acontece em memória.
  const candidatos = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true, nomeCompleto: true, apelido: true },
  });

  const comCliente = meetings.map((m) => {
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
