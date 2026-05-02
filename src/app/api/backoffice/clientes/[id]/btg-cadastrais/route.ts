import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";

/**
 * POST /api/backoffice/clientes/[id]/btg-cadastrais
 *
 * Busca dados cadastrais do BTG (Account Information) pra um único cliente sob demanda.
 * Rápido (1 chamada). Atualiza nome, cpfCnpj, email, telefone, coHolders, usuariosBtg.
 * Preserva nome se já não for placeholder "Cliente NNN".
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }
  const { id } = await params;

  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id },
    select: { id: true, nome: true, numeroConta: true, cpfCnpj: true, email: true, telefone: true, coHolders: true, usuariosBtg: true },
  });
  if (!cliente) {
    return NextResponse.json({ success: false, message: "Cliente não encontrado" }, { status: 404 });
  }

  const numeroConta = cliente.numeroConta.replace(/^0+/, "").trim();
  const r = await btg.getAccountInformation(numeroConta);

  if (r.status === 404) {
    return NextResponse.json({ success: false, message: "Conta não encontrada no BTG (404)" }, { status: 404 });
  }
  if (r.status !== 200) {
    return NextResponse.json(
      { success: false, message: `BTG retornou ${r.status}`, sample: r.raw.slice(0, 500) },
      { status: 502 },
    );
  }

  const parsed = parseAccountInformation(r.body);

  const data: Record<string, unknown> = { ultimaSyncBtg: new Date() };
  // Nome: substitui só se for placeholder ou vazio
  if (parsed.nome && (cliente.nome.trim() === "" || /^Cliente\s+\d+$/i.test(cliente.nome.trim()))) {
    data.nome = parsed.nome;
  }
  if (parsed.cpfCnpj && !cliente.cpfCnpj) data.cpfCnpj = parsed.cpfCnpj;
  if (parsed.email && !cliente.email) data.email = parsed.email;
  if (parsed.telefone && !cliente.telefone) data.telefone = parsed.telefone;
  if (parsed.coHolders && !cliente.coHolders) data.coHolders = parsed.coHolders;
  if (parsed.usuariosBtg && !cliente.usuariosBtg) data.usuariosBtg = parsed.usuariosBtg;

  await prisma.clienteBackoffice.update({ where: { id }, data });

  return NextResponse.json({
    success: true,
    message: "Dados cadastrais sincronizados",
    nomeBtg: parsed.nome,
    cpfCnpj: parsed.cpfCnpj,
    email: parsed.email,
    telefone: parsed.telefone,
    coHolders: parsed.coHolders,
    usuariosBtg: parsed.usuariosBtg,
  });
}

interface ParsedCadastral {
  nome: string | null;
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
  coHolders: unknown;
  usuariosBtg: unknown;
}

function parseAccountInformation(body: unknown): ParsedCadastral {
  if (!body || typeof body !== "object") {
    return { nome: null, cpfCnpj: null, email: null, telefone: null, coHolders: null, usuariosBtg: null };
  }
  const p = body as Record<string, unknown>;
  const holder = (p.holder ?? p.Holder) as Record<string, unknown> | undefined;
  const coHolders = (p.coHolders ?? p.CoHolders) as unknown[] | undefined;
  const users = (p.users ?? p.Users) as Array<Record<string, unknown>> | undefined;

  const nome = holder ? pickString(holder, ["name", "Name"]) : null;
  const cpfCnpj = holder ? pickString(holder, ["taxIdentification", "TaxIdentification", "cpf", "cnpj"]) : null;

  const owner = users?.find((u) => u.isOwner === true) || users?.[0];
  const email = owner ? pickString(owner, ["userEmail", "email", "Email"]) : null;
  const telefone = owner ? pickString(owner, ["phoneNumber", "phone", "Phone"]) : null;

  return { nome, cpfCnpj, email, telefone, coHolders: coHolders ?? null, usuariosBtg: users ?? null };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}
