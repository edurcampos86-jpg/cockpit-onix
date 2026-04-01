import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  const version = await prisma.scriptVersion.findUnique({ where: { id: versionId } });
  if (!version || version.scriptId !== id) {
    return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
  }

  // Salvar estado atual como versão antes de restaurar
  const current = await prisma.script.findUnique({ where: { id } });
  if (current) {
    await prisma.scriptVersion.create({
      data: {
        scriptId: id,
        title: current.title,
        hook: current.hook,
        body: current.body,
        cta: current.cta,
        ctaType: current.ctaType,
        estimatedTime: current.estimatedTime,
        hashtags: current.hashtags,
        changeReason: "antes de restaurar versão",
      },
    });
  }

  // Restaurar campos da versão
  const updated = await prisma.script.update({
    where: { id },
    data: {
      title: version.title,
      hook: version.hook,
      body: version.body,
      cta: version.cta,
      ctaType: version.ctaType,
      estimatedTime: version.estimatedTime,
      hashtags: version.hashtags,
    },
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json(updated);
}
