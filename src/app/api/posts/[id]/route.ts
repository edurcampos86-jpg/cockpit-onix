import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { author: true, script: true, tasks: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  // Regra 80/20: validar CTA explícito ao alterar
  if (body.ctaType === "explicito" || body.scheduledDate) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (existing) {
      const ctaType = body.ctaType ?? existing.ctaType;
      const schedDate = body.scheduledDate ? new Date(body.scheduledDate) : existing.scheduledDate;

      if (ctaType === "explicito" && schedDate) {
        const dayStart = new Date(schedDate.getFullYear(), schedDate.getMonth(), schedDate.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const explicitCount = await prisma.post.count({
          where: {
            ctaType: "explicito",
            scheduledDate: { gte: dayStart, lt: dayEnd },
            id: { not: id },
          },
        });

        if (explicitCount >= 1) {
          return NextResponse.json(
            { error: "CTA_LIMIT", message: "Já existe 1 CTA Explícito neste dia. Regra 80/20: máximo 1 CTA Explícito por dia." },
            { status: 422 }
          );
        }
      }
    }
  }

  const post = await prisma.post.update({
    where: { id },
    data: body,
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(post);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
