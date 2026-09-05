import { prisma } from "@/lib/prisma";
import { exigirSessao } from "@/lib/backoffice/dado-interno";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const lead = await prisma.lead.update({
    where: { id },
    data: body,
  });
  return NextResponse.json(lead);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  /* Aberto a qualquer pessoa logada, por decisão — lead é dado interno,
   * criado e editado por quem trabalha aqui. Ver `lib/backoffice/dado-interno.ts`
   * para a regra inteira e por que ela está escrita em vez de implícita. */
  const semSessao = await exigirSessao();
  if (semSessao) return semSessao;

  const { id } = await params;
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
