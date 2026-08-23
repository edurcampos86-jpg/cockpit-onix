import { NextRequest, NextResponse } from "next/server";

import { guardAdminApi } from "@/lib/api-admin-guard";
import { mesclarDicionarios } from "@/lib/importacao-ui/merge-dicionarios";
import { validarPerfil, type PerfilImportacaoConfig } from "@/lib/importacao/perfil";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/empresas/corretora/perfis/[id]
 *
 * ROTA NOVA. Grava no perfil o mapeamento arrastado na tela e as palavras que
 * a pessoa acabou de ensinar. É o que transforma uma correção pontual em
 * perfil reutilizável — o mês seguinte já chega mapeado.
 *
 * ── O DICIONÁRIO É MESCLADO, NUNCA SUBSTITUÍDO ──────────────────────────
 * `dicionarios` tem dois níveis (campo → { rótulo → valor }). Gravar o objeto
 * recebido por cima apagaria todo o vocabulário que o perfil já tinha naquele
 * campo: ensinar uma palavra desaprenderia trinta. `mesclarDicionarios` faz a
 * junção por rótulo e devolve `redefinidos` — as traduções que MUDARAM de
 * significado —, que a resposta repassa para a tela poder mostrar o que a
 * gravação alterou de fato.
 *
 * O mapeamento de colunas, esse sim, é substituição: ele descreve o layout de
 * UM arquivo, e mesclar layouts de arquivos diferentes produziria um perfil
 * que não corresponde a nenhum dos dois.
 *
 * ── VALIDA ANTES DE GRAVAR ──────────────────────────────────────────────
 * O perfil resultante passa por `validarPerfil` — a mesma régua da importação.
 * Perfil quebrado gravado é pior que perfil quebrado recusado: ele só falha na
 * próxima importação, longe de quem o quebrou.
 */

export const dynamic = "force-dynamic";

const EMPRESA = "corretora";
const CHAVES_RECUSADAS = new Set(["__proto__", "constructor", "prototype"]);

/** Copia só chaves seguras de um objeto vindo de JSON. */
function limpar(entrada: unknown): Record<string, string> | null {
  if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(entrada as Record<string, unknown>)) {
    if (CHAVES_RECUSADAS.has(k) || typeof v !== "string" || v === "") continue;
    saida[k] = v;
  }
  return saida;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const negado = await guardAdminApi("empresas/corretora/perfis/[id]");
  if (negado) return negado;

  const { id } = await ctx.params;

  let corpo: { mapeamentoColunas?: unknown; dicionarios?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo precisa ser JSON" }, { status: 400 });
  }

  const perfilLinha = await prisma.perfilImportacao.findUnique({ where: { id } });
  if (!perfilLinha) {
    return NextResponse.json({ error: "perfil de importação não encontrado" }, { status: 404 });
  }
  if (perfilLinha.empresaId !== EMPRESA) {
    return NextResponse.json(
      { error: `perfil pertence à empresa "${perfilLinha.empresaId}", não a "${EMPRESA}"` },
      { status: 400 },
    );
  }

  const mapeamento =
    corpo.mapeamentoColunas === undefined
      ? (perfilLinha.mapeamentoColunas as Record<string, string>)
      : limpar(corpo.mapeamentoColunas);
  if (mapeamento === null) {
    return NextResponse.json(
      { error: "mapeamentoColunas precisa ser um objeto { coluna: campo }" },
      { status: 400 },
    );
  }

  // O aprendizado chega no mesmo formato de `dicionarios`: campo → { rótulo → valor }.
  const aprendizado: Record<string, Record<string, string>> = {};
  if (corpo.dicionarios !== undefined) {
    if (
      corpo.dicionarios === null ||
      typeof corpo.dicionarios !== "object" ||
      Array.isArray(corpo.dicionarios)
    ) {
      return NextResponse.json({ error: "dicionarios precisa ser um objeto" }, { status: 400 });
    }
    for (const [campo, tabela] of Object.entries(corpo.dicionarios as Record<string, unknown>)) {
      const limpa = limpar(tabela);
      if (limpa === null) {
        return NextResponse.json(
          { error: `dicionarios.${campo} precisa ser um objeto { rótulo: valor }` },
          { status: 400 },
        );
      }
      aprendizado[campo] = limpa;
    }
  }

  const merge = mesclarDicionarios(
    (perfilLinha.dicionarios ?? {}) as Record<string, Record<string, string>>,
    aprendizado,
  );

  const perfil = {
    formato: perfilLinha.formato,
    extracao: perfilLinha.extracao,
    mapeamentoColunas: mapeamento,
    formatosValor: perfilLinha.formatosValor,
    dicionarios: merge.dicionarios,
  } as unknown as PerfilImportacaoConfig;

  const problemas = validarPerfil(perfil);
  if (problemas.length > 0) {
    return NextResponse.json({ error: "perfil inválido", problemas }, { status: 400 });
  }

  await prisma.perfilImportacao.update({
    where: { id },
    data: {
      mapeamentoColunas: mapeamento,
      // `Object.create(null)` não é serializável pelo Prisma como Json sem
      // protótipo; o spread devolve objeto comum sem trazer chave perigosa.
      dicionarios: JSON.parse(JSON.stringify(merge.dicionarios)),
    },
  });

  return NextResponse.json({
    ok: true,
    adicionados: merge.adicionados,
    redefinidos: merge.redefinidos,
    descartados: merge.descartados,
    camposRecusados: merge.camposRecusados,
  });
}
