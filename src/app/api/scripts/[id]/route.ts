import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const script = await prisma.script.findUnique({
    where: { id },
    include: { author: { select: { name: true } }, post: { select: { id: true, title: true, scheduledDate: true } } },
  });
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(script);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  // Salvar versão anterior antes de atualizar
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
        changeReason: body._changeReason || "edição manual",
      },
    });
  }

  // Remover campos internos antes de salvar
  const { _changeReason, ...updateData } = body;

  const script = await prisma.script.update({
    where: { id },
    data: updateData,
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(script);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.script.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
