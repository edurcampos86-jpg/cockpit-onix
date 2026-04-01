import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const weeks = parseInt(searchParams.get("weeks") || "8");

  const now = new Date();
  const dow = now.getDay();

  const results = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) - i * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const [posts, tasks] = await Promise.all([
      prisma.post.findMany({
        where: { scheduledDate: { gte: monday, lte: sunday } },
      }),
      prisma.task.findMany({
        where: {
          OR: [
            { dueDate: { gte: monday, lte: sunday } },
            { completedAt: { gte: monday, lte: sunday } },
          ],
        },
      }),
    ]);

    const published = posts.filter((p) => p.status === "publicado").length;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "concluida").length;

    results.push({
      weekLabel: `${monday.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
      total: posts.length,
      published,
      goalMet: posts.length >= 5,
      taskCompletion: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    });
  }

  return NextResponse.json(results);
}
