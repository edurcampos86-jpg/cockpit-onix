import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: Record<string, unknown> = {};
  if (startDate && endDate) {
    where.scheduledDate = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  const posts = await prisma.post.findMany({
    where,
    include: { author: { select: { name: true } }, script: true, tasks: true },
    orderBy: { scheduledDate: "asc" },
  });

  return NextResponse.json(posts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const post = await prisma.post.create({
    data: body,
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(post, { status: 201 });
}
