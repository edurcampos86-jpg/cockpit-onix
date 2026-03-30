import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const [weekPosts, todayTasks, pendingTasks, totalLeads] = await Promise.all([
    prisma.post.findMany({
      where: { scheduledDate: { gte: startOfWeek, lte: endOfWeek } },
      include: { author: { select: { name: true } }, tasks: true },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.task.findMany({
      where: { dueDate: { gte: todayStart, lte: todayEnd } },
      include: { assignee: { select: { name: true } }, post: { select: { title: true, category: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.task.count({ where: { status: { not: "concluida" } } }),
    prisma.lead.count(),
  ]);

  const publishedThisWeek = weekPosts.filter((p) => p.status === "publicado").length;
  const weekProgress = `${publishedThisWeek}/5`;

  // Check CTA rule: count explicit CTAs today
  const todayExplicitCtas = weekPosts.filter(
    (p) =>
      p.ctaType === "explicito" &&
      new Date(p.scheduledDate).toDateString() === now.toDateString()
  ).length;

  return NextResponse.json({
    weekPosts,
    todayTasks,
    pendingTasks,
    totalLeads,
    weekProgress,
    publishedThisWeek,
    todayExplicitCtas,
    ctaWarning: todayExplicitCtas >= 1,
  });
}
