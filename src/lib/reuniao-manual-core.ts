export const TIPOS_REUNIAO_MANUAL = ["ultima", "proxima"] as const;

export type TipoReuniaoManual = (typeof TIPOS_REUNIAO_MANUAL)[number];

export type MutacaoReuniaoManual =
  | { ok: true; tipo: TipoReuniaoManual; data: null; relato: null }
  | { ok: true; tipo: TipoReuniaoManual; data: Date; relato: string | null }
  | { ok: false; erro: string };

/**
 * Chave estavel dentro do unique (userId, source, externalId, clienteId).
 * O cliente ja faz parte da constraint, portanto um id por slot basta e evita
 * criar uma nova linha a cada edicao da mesma coluna.
 */
export function externalIdReuniaoManual(tipo: TipoReuniaoManual): string {
  return `slot:${tipo}`;
}

/** Namespace estável usado no advisory xact lock do Postgres. */
export function chaveLockReuniaoManual(clienteId: string, tipo: TipoReuniaoManual): string {
  return `reuniao-manual:${clienteId}:${tipo}`;
}

/** Valida o contrato HTTP sem carregar Prisma, para ser testavel como funcao pura. */
export function validarMutacaoReuniaoManual(
  body: unknown,
  agora = new Date(),
  operacao: "salvar" | "remover" = "salvar",
): MutacaoReuniaoManual {
  if (!body || typeof body !== "object") {
    return { ok: false, erro: "Corpo inválido" };
  }

  const entrada = body as { tipo?: unknown; data?: unknown; relato?: unknown };
  if (entrada.tipo !== "ultima" && entrada.tipo !== "proxima") {
    return { ok: false, erro: 'tipo deve ser "ultima" ou "proxima"' };
  }
  const tipo = entrada.tipo;

  if (operacao === "remover") {
    return { ok: true, tipo, data: null, relato: null };
  }

  if (typeof entrada.data !== "string" || !entrada.data.trim()) {
    return { ok: false, erro: "data é obrigatória e deve ser uma data válida" };
  }

  const data = new Date(entrada.data);
  if (Number.isNaN(data.getTime())) {
    return { ok: false, erro: "Data inválida" };
  }
  if (tipo === "ultima" && data.getTime() >= agora.getTime()) {
    return { ok: false, erro: "A última reunião deve estar no passado" };
  }
  if (tipo === "proxima" && data.getTime() <= agora.getTime()) {
    return { ok: false, erro: "A próxima reunião deve estar no futuro" };
  }

  if (entrada.relato !== undefined && typeof entrada.relato !== "string") {
    return { ok: false, erro: "relato deve ser texto" };
  }
  const relato = typeof entrada.relato === "string" ? entrada.relato.trim() || null : null;
  if (tipo === "ultima" && !relato) {
    return { ok: false, erro: "Relato do que foi tratado é obrigatório para a última reunião" };
  }

  return { ok: true, tipo, data, relato };
}
