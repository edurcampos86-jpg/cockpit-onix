import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  carregarPainelDoDia,
  hojeBahia,
} from "@/lib/painel-do-dia/agregador";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data") ?? hojeBahia();

  try {
    const payload = await carregarPainelDoDia(session.userId, data);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erro ao carregar painel do dia:", error);
    return NextResponse.json(
      { error: "Falha ao carregar painel" },
      { status: 500 }
    );
  }
}
