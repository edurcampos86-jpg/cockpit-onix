import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { implementacoesInlineHabilitado } from "@/lib/implementacoes/inline-flag";
import { implementacoesV2Habilitado } from "@/lib/implementacoes/v2-flag";

export const dynamic = "force-dynamic";

/**
 * Status leve das flags que o FAB global precisa pra decidir o que renderizar.
 * Mesmo padrão de consumo do FloatingChat (fetch no mount). Exige sessão; sem
 * ela responde { enabled: false }.
 *
 * `v2` é campo ADICIONADO, não substituto: `enabled` continua respondendo
 * exatamente o que respondia (a flag IMPLEMENTACOES_INLINE, que decide se o
 * botão existe). Quem só lê `enabled` não percebe diferença nenhuma.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ enabled: false, v2: false }, { status: 401 });
  }
  const [enabled, v2] = await Promise.all([
    implementacoesInlineHabilitado(),
    implementacoesV2Habilitado(),
  ]);
  return NextResponse.json({ enabled, v2 });
}
