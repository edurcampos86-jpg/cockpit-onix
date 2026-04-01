import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const versions = await prisma.scriptVersion.findMany({
    where: { scriptId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(versions);
}
