export type CamposTemporaisInteracao =
  | { ok: true; data: Date; duracaoMin: number | null }
  | { ok: false; erro: string };

/**
 * Normaliza data e duração antes de qualquer transação/Prisma.
 * JSON permite strings e números arbitrários; esta fronteira impede Invalid
 * Date e NaN de chegarem ao adapter do Postgres.
 */
export function validarCamposTemporaisInteracao(
  entrada: { tipo: string; data?: unknown; duracaoMin?: unknown },
  agora = new Date(),
): CamposTemporaisInteracao {
  let data = agora;
  if (entrada.data !== undefined && entrada.data !== null && entrada.data !== "") {
    if (typeof entrada.data !== "string") {
      return { ok: false, erro: "Data inválida" };
    }
    data = new Date(entrada.data);
    if (Number.isNaN(data.getTime())) {
      return { ok: false, erro: "Data inválida" };
    }
  }

  if (
    (entrada.tipo === "ligacao" || entrada.tipo === "reuniao") &&
    data.getTime() > agora.getTime()
  ) {
    return { ok: false, erro: "A data da ligação ou reunião não pode estar no futuro" };
  }

  const duracaoBruta = entrada.duracaoMin;
  if (duracaoBruta === undefined || duracaoBruta === null || duracaoBruta === "") {
    return { ok: true, data, duracaoMin: null };
  }
  if (
    (typeof duracaoBruta !== "number" && typeof duracaoBruta !== "string") ||
    (typeof duracaoBruta === "string" && !duracaoBruta.trim())
  ) {
    return { ok: false, erro: "Duração inválida" };
  }

  const duracaoMin = Number(duracaoBruta);
  if (!Number.isFinite(duracaoMin) || !Number.isInteger(duracaoMin) || duracaoMin <= 0) {
    return { ok: false, erro: "Duração deve ser um número inteiro positivo de minutos" };
  }

  return { ok: true, data, duracaoMin };
}
