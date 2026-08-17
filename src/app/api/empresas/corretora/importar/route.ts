import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { guardAdminApi } from "@/lib/api-admin-guard";
import { getAuthContext } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { executarImportacao, type ModoImportacao } from "@/lib/corretora/executar-importacao";
import { validarPerfil, type PerfilImportacaoConfig } from "@/lib/importacao/perfil";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/empresas/corretora/importar
 *
 * ROTA NOVA. Nenhuma rota existente foi tocada nesta PR.
 *
 * ── OS DOIS MODOS, E POR QUE O DRY-RUN VEM PRIMEIRO ─────────────────────
 * `modo: "dry-run"` NÃO ESCREVE NADA — nem contrato, nem pessoa, nem sequer a
 * linha de `ImportJob` do próprio ensaio. Ele devolve exatamente os mesmos
 * contadores que o "aplicar" devolveria, calculados pelo MESMO código
 * (`planejar`), porque o número que se aprova tem de ser o número que executa.
 *
 * `modo: "aplicar"` exige `confirmar: true`. Não é burocracia: o corpo é
 * multipart e um `curl` reaproveitado do ensaio, com um campo trocado, gravaria
 * a base inteira. `confirmar` é o campo que ninguém troca por acidente.
 *
 * ── COMO CHAMAR ─────────────────────────────────────────────────────────
 * `multipart/form-data` — o arquivo precisa vir junto:
 *
 *   arquivo   (File)    a planilha, o CSV, o PDF ou o Word
 *   perfilId  (string)  id de `PerfilImportacao`
 *   modo      (string)  "dry-run" | "aplicar"
 *   confirmar (string)  "true" — obrigatório em "aplicar"
 *
 * Gate: `guardAdminApi`. Importar a base de uma empresa inteira é operação de
 * administrador, e o middleware só garante que existe sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const EMPRESA = "corretora";
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const negado = await guardAdminApi("empresas/corretora/importar");
  if (negado) return negado;

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "nao_autenticado" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "corpo inválido — esta rota espera multipart/form-data com o campo `arquivo`" },
      { status: 400 },
    );
  }

  const modo = String(form.get("modo") ?? "") as ModoImportacao;
  if (modo !== "dry-run" && modo !== "aplicar") {
    return NextResponse.json({ error: 'modo deve ser "dry-run" ou "aplicar"' }, { status: 400 });
  }

  const confirmar = String(form.get("confirmar") ?? "") === "true";
  if (modo === "aplicar" && !confirmar) {
    return NextResponse.json(
      { error: 'modo "aplicar" exige confirmar=true — rode o dry-run antes' },
      { status: 400 },
    );
  }

  const perfilId = String(form.get("perfilId") ?? "");
  if (!perfilId) return NextResponse.json({ error: "perfilId é obrigatório" }, { status: 400 });

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "campo `arquivo` é obrigatório" }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `arquivo acima do teto de ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const perfilLinha = await prisma.perfilImportacao.findUnique({ where: { id: perfilId } });
  if (!perfilLinha) {
    return NextResponse.json({ error: "perfil de importação não encontrado" }, { status: 404 });
  }
  if (perfilLinha.empresaId !== EMPRESA) {
    // Perfil é da empresa que o criou. Usar o da Imobiliária para ler a base da
    // Corretora mapearia colunas por coincidência de nome.
    return NextResponse.json(
      { error: `perfil pertence à empresa "${perfilLinha.empresaId}", não a "${EMPRESA}"` },
      { status: 400 },
    );
  }
  if (!perfilLinha.ativo) {
    return NextResponse.json({ error: "perfil está inativo" }, { status: 400 });
  }

  const perfil = {
    formato: perfilLinha.formato,
    extracao: perfilLinha.extracao,
    mapeamentoColunas: perfilLinha.mapeamentoColunas,
    formatosValor: perfilLinha.formatosValor,
    dicionarios: perfilLinha.dicionarios,
  } as unknown as PerfilImportacaoConfig;

  const problemas = validarPerfil(perfil);
  if (problemas.length > 0) {
    // Perfil quebrado falha ANTES de ler o arquivo: ler para depois descobrir
    // que o mapeamento não presta gastaria a chamada de IA à toa.
    return NextResponse.json({ error: "perfil inválido", problemas }, { status: 400 });
  }

  const apiKey =
    perfil.formato === "pdf" || perfil.formato === "docx"
      ? ((await getConfig("ANTHROPIC_API_KEY")) ?? undefined)
      : undefined;
  if ((perfil.formato === "pdf" || perfil.formato === "docx") && !apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada (Integrações › Claude AI) — PDF e Word dependem dela." },
      { status: 400 },
    );
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer());

  try {
    const resultado = await executarImportacao(
      prisma,
      { nome: arquivo.name, conteudo },
      {
        modo,
        empresaId: EMPRESA,
        perfil,
        perfilImportacaoId: perfilLinha.id,
        parceiroPadrao: perfilLinha.fonte,
        iniciadoPorId: ctx.userId,
        loteImportacao: randomUUID(),
        extracao: { apiKey },
      },
    );
    return NextResponse.json(resultado);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[corretora/importar] falhou · modo=${modo} · arquivo=${arquivo.name}`, erro);
    return NextResponse.json({ error: mensagem }, { status: 422 });
  }
}
