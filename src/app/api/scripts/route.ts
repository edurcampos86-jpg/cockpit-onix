import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const templatesOnly = searchParams.get("templates") === "true";
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (templatesOnly) where.isTemplate = true;
  if (category) where.category = category;

  // For non-template queries, exclude templates by default
  if (!templatesOnly && searchParams.get("templates") !== "all") {
    where.isTemplate = false;
  }

  const scripts = await prisma.script.findMany({
    where,
    include: {
      author: { select: { name: true } },
      post: { select: { id: true, title: true, scheduledDate: true, format: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Client-side search filter (SQLite doesn't support ILIKE)
  let result = scripts;
  if (search) {
    const term = search.toLowerCase();
    result = scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        (s.hook && s.hook.toLowerCase().includes(term)) ||
        s.body.toLowerCase().includes(term)
    );
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const script = await prisma.script.create({
    data: body,
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(script, { status: 201 });
}
