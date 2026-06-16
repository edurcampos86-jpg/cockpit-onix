import { prisma } from "@/lib/prisma";
import { FIELD_SOURCE_POLICY, type FonteImport } from "./field-source-policy";
import { contaCanonica, variacoesConta } from "./conta";

/**
 * Upsert respeitando FIELD_SOURCE_POLICY. Vive separado de
 * field-source-policy.ts pra que o módulo da policy não puxe prisma
 * (testes unitários da policy não precisam de DB).
 *
 * NÃO usa `prisma.upsert` porque `numeroConta` não é @unique no schema
 * atual — usa findFirst + create/update.
 *
 * Retorna { acao: 'create'|'update'|'noop', camposEscritos: [...], camposBloqueados: [...] }
 * pra cada chamada surfar pra cima o que foi efetivamente persistido.
 */
export interface ResultadoUpsert {
  acao: "create" | "update" | "noop";
  camposEscritos: string[];
  camposBloqueados: Array<{ campo: string; motivo: string }>;
  id?: string;
}

/**
 * Decide se o relógio `saldoContaDesde` deve REINICIAR na transição
 * `antigo → novo` do saldoConta. PURO (sem DB, sem efeitos) — testável
 * isolado, como selarPresenca.
 *
 * Regra:
 *  - antigo 0   → reseta se aparecer qualquer caixa (novo != 0)  [caixa do zero]
 *  - antigo !=0 → reseta se |novo - antigo| / |antigo| > 0.20    [movimento real]
 * Usa |antigo| no denominador pra tratar saldoConta negativo (overdraft) sem
 * inverter o sinal do limiar. Variações ≤ 20% são ruído e NÃO resetam.
 * (o caso "saldoContaDesde nunca medido" = baseline é tratado por quem chama.)
 */
export function deveResetarSaldoContaDesde(
  antigo: number,
  novo: number | null | undefined,
): boolean {
  if (antigo === 0) return novo != null && novo !== 0;
  if (novo == null) return false;
  return Math.abs(novo - antigo) / Math.abs(antigo) > 0.2;
}

export async function upsertPorPolitica(args: {
  numeroConta: string;
  dadosImportados: Record<string, unknown>;
  fonte: FonteImport;
}): Promise<ResultadoUpsert> {
  const { numeroConta, dadosImportados, fonte } = args;
  const camposEscritos: string[] = [];
  const camposBloqueados: Array<{ campo: string; motivo: string }> = [];

  const dadosFiltrados: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(dadosImportados)) {
    const fontesPermitidas = FIELD_SOURCE_POLICY[campo];
    if (!fontesPermitidas) {
      // Campo não declarado na policy → não escrever (segurança por default)
      camposBloqueados.push({ campo, motivo: "campo não declarado em FIELD_SOURCE_POLICY" });
      continue;
    }
    if (!fontesPermitidas.includes(fonte)) {
      camposBloqueados.push({
        campo,
        motivo: `fonte ${fonte} não autorizada (esperava ${fontesPermitidas.join("|")})`,
      });
      continue;
    }
    if (valor === null || valor === undefined || valor === "") {
      // Não sobrescrever com vazio — diferente de "explicitamente apagar"
      continue;
    }
    dadosFiltrados[campo] = valor;
    camposEscritos.push(campo);
  }

  if (camposEscritos.length === 0) {
    return { acao: "noop", camposEscritos, camposBloqueados };
  }

  // Casa por QUALQUER variação da conta (com/sem zeros à esquerda, pad9), não
  // só pelo valor exato — senão um sync que normaliza diferente do que foi
  // persistido cria um gêmeo. orderBy createdAt asc: se houver duplicata
  // legada, prefere a linha mais antiga (a canônica, com histórico).
  const existente = await prisma.clienteBackoffice.findFirst({
    where: { numeroConta: { in: variacoesConta(numeroConta) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, fonteUltimoUpdate: true, saldoConta: true, saldoContaDesde: true },
  });

  const agora = new Date().toISOString();
  const fonteAtualizada: Record<string, string> = {
    ...((existente?.fonteUltimoUpdate as Record<string, string> | null) ?? {}),
  };
  for (const k of camposEscritos) {
    fonteAtualizada[k] = `${fonte}:${agora}`;
  }

  if (existente) {
    // Relógio "parado desde": quando o saldoConta está de fato sendo gravado,
    // reinicia saldoContaDesde em movimento significativo (ou seta baseline se
    // nunca foi medido). DEFENSIVO (regra de ouro): QUALQUER erro aqui apenas
    // PULA o set de saldoContaDesde — a gravação do saldoConta segue intacta.
    if ("saldoConta" in dadosFiltrados) {
      try {
        const antigo = existente.saldoConta; // Float NOT NULL (default 0)
        const novo = dadosFiltrados.saldoConta as number | null | undefined;
        if (deveResetarSaldoContaDesde(antigo, novo) || existente.saldoContaDesde == null) {
          dadosFiltrados.saldoContaDesde = new Date();
        }
      } catch {
        // não seta saldoContaDesde; saldoConta continua sendo gravado normalmente
      }
    }

    const updated = await prisma.clienteBackoffice.update({
      where: { id: existente.id },
      data: {
        ...(dadosFiltrados as Record<string, never>),
        fonteUltimoUpdate: fonteAtualizada as never,
      },
    });
    return { acao: "update", camposEscritos, camposBloqueados, id: updated.id };
  }

  // Create — required fields que não vieram do import precisam de defaults
  // (numeroConta sempre; nome cai pra placeholder se não tiver vindo).
  const nomeCreate =
    typeof dadosFiltrados.nome === "string" && (dadosFiltrados.nome as string).trim()
      ? (dadosFiltrados.nome as string)
      : `Conta ${numeroConta}`;
  const created = await prisma.clienteBackoffice.create({
    data: {
      numeroConta: contaCanonica(numeroConta),
      nome: nomeCreate,
      ...(dadosFiltrados as Record<string, never>),
      fonteUltimoUpdate: fonteAtualizada as never,
    },
  });
  return { acao: "create", camposEscritos, camposBloqueados, id: created.id };
}
