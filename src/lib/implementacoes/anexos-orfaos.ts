import "server-only";
import { prisma } from "@/lib/prisma";
import { b2ContratosConfigurado } from "@/lib/b2/client";
import { deleteContrato, listContratos } from "@/lib/b2/upload";

/**
 * Varredura de anexos ÓRFÃOS no Backblaze — objeto que existe no bucket sem
 * nenhuma linha no banco apontando para ele.
 *
 * Por que existe: `onDelete: Cascade` apaga a linha `ImplementacaoAnexo`, NÃO o
 * objeto no bucket (o próprio `prisma/schema.prisma` documenta isso). Hoje só
 * `removerAnexo()` chama `deleteContrato()`. Não existe action de delete de
 * sugestão — mas o dia em que existir, ela herda o vazamento pronto; e linha
 * apagada por SQL à mão já vaza hoje. Objeto órfão é custo mensal invisível:
 * ninguém o vê na UI e nada acusa que ele está lá.
 *
 * TRÊS TRAVAS, porque isto APAGA arquivo e apagar o arquivo errado é
 * irreversível:
 *
 * 1. PREFIXO FECHADO. Só varre `implementacoes/`. O bucket de contratos é
 *    compartilhado com o módulo Jurídico — varrer a raiz colocaria contrato de
 *    cliente na mira de uma rotina que existe para limpar print de sugestão.
 * 2. CARÊNCIA. Objeto recente é poupado. A criação sobe para o B2 ANTES de
 *    gravar a linha (ver `criarImplementacao`), então existe uma janela real em
 *    que o objeto legítimo ainda não tem dono no banco. Sem carência, a
 *    varredura apagaria anexo de sugestão sendo criada naquele instante.
 * 3. DRY-RUN POR PADRÃO. `apagar` é opt-in explícito. O cron roda em modo
 *    relatório: ele CONTA e LISTA, não apaga. Assim o buraco fica visível antes
 *    de alguém autorizar a limpeza, e uma varredura com bug não custa dado.
 */

const PREFIXO = "implementacoes/";

/**
 * Carência antes de considerar um objeto órfão. 24h é folgado de propósito:
 * a janela real entre upload e gravação da linha é de segundos, e o custo de
 * esperar um dia a mais é irrelevante perto do custo de apagar arquivo bom.
 */
const CARENCIA_HORAS = 24;

export type VarreduraOrfaos = {
  configurado: boolean;
  /** Objetos sob o prefixo, no bucket. */
  noBucket: number;
  /** Keys referenciadas por alguma linha (anexo ou printUrl legado). */
  referenciadas: number;
  /** Órfãos fora da carência — candidatos reais. */
  orfaos: number;
  /** Objetos órfãos ainda dentro da carência (poupados nesta rodada). */
  recentesPoupados: number;
  bytesOrfaos: number;
  apagados: number;
  /** Amostra das keys órfãs, para o relatório caber no log. */
  amostra: string[];
};

export async function varrerAnexosOrfaos(
  opts: { apagar?: boolean } = {},
): Promise<VarreduraOrfaos> {
  const vazio: VarreduraOrfaos = {
    configurado: false,
    noBucket: 0,
    referenciadas: 0,
    orfaos: 0,
    recentesPoupados: 0,
    bytesOrfaos: 0,
    apagados: 0,
    amostra: [],
  };
  if (!b2ContratosConfigurado()) return vazio;

  const [objetos, anexos, comPrint] = await Promise.all([
    listContratos(PREFIXO),
    prisma.implementacaoAnexo.findMany({ select: { b2Key: true } }),
    // O legado `printUrl` guarda uma KEY no MESMO bucket. Esquecê-lo aqui faria
    // a varredura classificar como órfão o print de uma sugestão viva.
    prisma.implementacao.findMany({
      where: { printUrl: { not: null } },
      select: { printUrl: true },
    }),
  ]);

  const referenciadas = new Set<string>();
  for (const a of anexos) referenciadas.add(a.b2Key);
  for (const i of comPrint) if (i.printUrl) referenciadas.add(i.printUrl);

  const limite = new Date(Date.now() - CARENCIA_HORAS * 60 * 60 * 1000);

  const orfaos: Array<{ key: string; size: number }> = [];
  let recentesPoupados = 0;

  for (const obj of objetos) {
    if (referenciadas.has(obj.key)) continue;
    if (obj.lastModified > limite) {
      recentesPoupados++;
      continue;
    }
    orfaos.push({ key: obj.key, size: obj.size });
  }

  let apagados = 0;
  if (opts.apagar) {
    for (const o of orfaos) {
      try {
        await deleteContrato(o.key);
        apagados++;
      } catch {
        // Falha em um objeto não interrompe a varredura: o que sobrar aparece
        // de novo na próxima rodada.
      }
    }
  }

  return {
    configurado: true,
    noBucket: objetos.length,
    referenciadas: referenciadas.size,
    orfaos: orfaos.length,
    recentesPoupados,
    bytesOrfaos: orfaos.reduce((s, o) => s + o.size, 0),
    apagados,
    amostra: orfaos.slice(0, 20).map((o) => o.key),
  };
}
