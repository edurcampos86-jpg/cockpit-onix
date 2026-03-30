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
  const script = await prisma.script.update({
    where: { id },
    data: body,
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(script);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.script.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
