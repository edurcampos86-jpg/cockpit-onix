import type { Prisma } from "@/generated/prisma/client";
import type { PatrimonioSnapshot } from "@/lib/cockpit-reuniao/tipos";

/**
 * Grava os 3 totais de patrimônio declarados na reunião como fatos em
 * `ClienteFato`, dentro do MESMO `tx` da importação (atômico com a reunião).
 *
 * Salvaguarda única: só grava quando o valor MUDA vs. o último fato daquele
 * campo — isso cobre, num mecanismo só, tanto duplicata de reprocessamento
 * (reimport idêntico → valor igual → nada grava) quanto ruído.
 *
 * Convenções travadas:
 *   - valor = inteiro em reais crus como String (ex.: "4000000"). Nunca float/formatado.
 *   - fonte = "reuniao". categoria = "METRICA".
 *
 * NOTA (ordem cronológica — aceita de propósito nesta fase, não resolver aqui):
 * "último fato" é por `criadoEm` (ordem de INSERÇÃO), não pela data da reunião.
 * Importar uma reunião antiga depois de uma recente registra a mudança fora de
 * ordem cronológica. É um trade-off conhecido da Fase 1a.
 */

const MAPA_PATRIMONIO = [
  { chave: "totalBtg", campo: "patrimonioBtg" },
  { chave: "totalForaBtg", campo: "patrimonioForaBtg" },
  { chave: "totalGeral", campo: "patrimonioTotal" },
] as const satisfies ReadonlyArray<{ chave: keyof PatrimonioSnapshot; campo: string }>;

export async function gravarFatosPatrimonio(
  tx: Prisma.TransactionClient,
  args: { clienteId: string; reuniaoId: string; patrimonio: PatrimonioSnapshot },
): Promise<void> {
  const { clienteId, reuniaoId, patrimonio } = args;

  for (const { chave, campo } of MAPA_PATRIMONIO) {
    const total = patrimonio[chave];
    // Só totais presentes/finitos viram fato (o snapshot normalizado já descarta
    // NaN/Infinity, mas cada total é opcional — pode vir undefined).
    if (typeof total !== "number" || !Number.isFinite(total)) continue;

    const novoValor = String(Math.round(total));

    const ultimo = await tx.clienteFato.findFirst({
      where: { clienteId, campo },
      orderBy: { criadoEm: "desc" },
      select: { valor: true },
    });

    // Sem mudança → não grava (idempotente no reprocessamento + sem ruído).
    if (ultimo?.valor === novoValor) continue;

    await tx.clienteFato.create({
      data: {
        clienteId,
        reuniaoId,
        categoria: "METRICA",
        campo,
        valor: novoValor,
        valorAnterior: ultimo?.valor ?? null,
        fonte: "reuniao",
      },
    });
  }
}
