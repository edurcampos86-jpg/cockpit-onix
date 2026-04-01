import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  const postCount = await prisma.post.count({
    where: {
      scheduledDate: { gte: nextMonth, lte: nextMonthEnd },
    },
  });

  const monthName = nextMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return NextResponse.json({
    nextMonth: monthName,
    postCount,
    needsPlanning: postCount < 10,
  });
}
