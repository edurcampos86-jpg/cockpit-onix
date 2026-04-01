import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const stage = searchParams.get("stage");
  const temperature = searchParams.get("temperature");

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (temperature) where.temperature = temperature;

  const leads = await prisma.lead.findMany({
    where,
    include: { assignedTo: { select: { name: true } } },
    orderBy: { enteredAt: "desc" },
  });

  return NextResponse.json(leads);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const lead = await prisma.lead.create({ data: body });
  return NextResponse.json(lead, { status: 201 });
}
