import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/config?key=DATACRAZY_TOKEN
 * Returns whether a config key is set (never returns the value for security)
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    // List all keys (no values)
    const configs = await prisma.config.findMany({ select: { key: true, updatedAt: true } });
    return NextResponse.json({ keys: configs });
  }

  const config = await prisma.config.findUnique({ where: { key } });
  return NextResponse.json({
    key,
    exists: !!config,
    valueLen: config?.value?.length ?? 0,
    updatedAt: config?.updatedAt ?? null,
  });
}

/**
 * POST /api/admin/config
 * Body: { secret, key, value }
 * Upserts a config value in the DB
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { secret, key, value } = body;

  if (!secret || secret !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  if (typeof value !== "string") {
    return NextResponse.json({ error: "value must be a string" }, { status: 400 });
  }

  const config = await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });

  return NextResponse.json({
    ok: true,
    key: config.key,
    valueLen: config.value.length,
    updatedAt: config.updatedAt,
  });
}
