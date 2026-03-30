import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const assigneeId = searchParams.get("assigneeId");
  const today = searchParams.get("today");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (assigneeId) where.assigneeId = assigneeId;
  if (today === "true") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.dueDate = { gte: start, lte: end };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: { assignee: { select: { name: true } }, post: { select: { title: true, category: true } } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const task = await prisma.task.create({ data: body });
  return NextResponse.json(task, { status: 201 });
}
