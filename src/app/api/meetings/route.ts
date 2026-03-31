import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: { lead: { select: { name: true, productInterest: true } } },
  });

  return NextResponse.json(meetings);
}
