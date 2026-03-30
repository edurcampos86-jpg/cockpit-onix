import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const templatesOnly = searchParams.get("templates") === "true";
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};
  if (templatesOnly) where.isTemplate = true;
  if (category) where.category = category;

  const scripts = await prisma.script.findMany({
    where,
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(scripts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const script = await prisma.script.create({
    data: body,
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(script, { status: 201 });
}
