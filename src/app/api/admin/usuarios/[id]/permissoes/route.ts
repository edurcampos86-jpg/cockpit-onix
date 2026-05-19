/**
 * GET / PUT /api/admin/usuarios/[id]/permissoes
 *
 * Gerencia as permissões granulares de um usuário no módulo Jurídico.
 * Acesso: admin only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctxParams.params;

  const perm = await prisma.usuarioPermissao.findUnique({
    where: { userId: id },
    select: {
      podeVerContratos: true,
      podeBaixarContratos: true,
      podeEditarContratos: true,
      podeAprovarContratos: true,
      carteirasPermitidas: true,
      twoFactorEnabled: true,
      twoFactorVerifiedAt: true,
      atualizadoEm: true,
    },
  });

  return NextResponse.json(perm ?? {
    podeVerContratos: false,
    podeBaixarContratos: false,
    podeEditarContratos: false,
    podeAprovarContratos: false,
    carteirasPermitidas: [],
    twoFactorEnabled: false,
  });
}

export async function PUT(req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctxParams.params;

  let body: {
    podeVerContratos?: boolean;
    podeBaixarContratos?: boolean;
    podeEditarContratos?: boolean;
    podeAprovarContratos?: boolean;
    carteirasPermitidas?: string[] | "*";
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const carteiras: Prisma.InputJsonValue =
    body.carteirasPermitidas === "*"
      ? "*"
      : Array.isArray(body.carteirasPermitidas)
        ? (body.carteirasPermitidas.filter((s) => typeof s === "string"))
        : [];

  const updated = await prisma.usuarioPermissao.upsert({
    where: { userId: id },
    create: {
      userId: id,
      podeVerContratos: !!body.podeVerContratos,
      podeBaixarContratos: !!body.podeBaixarContratos,
      podeEditarContratos: !!body.podeEditarContratos,
      podeAprovarContratos: !!body.podeAprovarContratos,
      carteirasPermitidas: carteiras,
    },
    update: {
      ...(body.podeVerContratos !== undefined ? { podeVerContratos: body.podeVerContratos } : {}),
      ...(body.podeBaixarContratos !== undefined ? { podeBaixarContratos: body.podeBaixarContratos } : {}),
      ...(body.podeEditarContratos !== undefined ? { podeEditarContratos: body.podeEditarContratos } : {}),
      ...(body.podeAprovarContratos !== undefined ? { podeAprovarContratos: body.podeAprovarContratos } : {}),
      ...(body.carteirasPermitidas !== undefined ? { carteirasPermitidas: carteiras } : {}),
    },
    select: {
      podeVerContratos: true,
      podeBaixarContratos: true,
      podeEditarContratos: true,
      podeAprovarContratos: true,
      carteirasPermitidas: true,
    },
  });

  return NextResponse.json({ ok: true, permissoes: updated });
}
