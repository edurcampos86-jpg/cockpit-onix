import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { guardAdminApi } from "@/lib/api-admin-guard";
import { getAuthContext } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { executarImportacao, type ModoImportacao } from "@/lib/corretora/executar-importacao";
import { CAMPOS_DESTINO } from "@/lib/importacao-ui/campos-destino";
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
 *   competencia (string) "AAAA-MM" ou "AAAA-MM-DD" — de que mês é o relatório.
 *                        Obrigatória, exceto quando o perfil mapeia a coluna.
 *   parceiroPadrao (string) opcional — de qual seguradora é o relatório. Vazio
 *                        usa a `fonte` do perfil. Vale só nas linhas em que a
 *                        coluna `parceiro` vier vazia.
 *   mapeamentoColunas (string) opcional — JSON `{ "Coluna": "campo" }`. Quando
 *                        vem, substitui o mapeamento gravado no perfil (e passa
 *                        por `validarPerfil` igual). É o que faz a tela de
 *                        mapeamento valer alguma coisa antes de o perfil ser
 *                        salvo.
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

  // MAPEAMENTO DA TELA — override opcional, e o motivo é que sem ele a tela de
  // mapeamento seria decorativa: o plano sairia do perfil gravado, não do que a
  // pessoa acabou de arrastar. Vem como JSON no mesmo multipart.
  //
  // Não é atalho para pular validação: o resultado passa por `validarPerfil`
  // igual, logo abaixo. Um mapeamento torto é recusado antes de o arquivo ser
  // lido, como sempre foi.
  const mapeamentoCru = String(form.get("mapeamentoColunas") ?? "").trim();
  let mapeamentoDaTela: Record<string, string> | null = null;
  if (mapeamentoCru) {
    try {
      const parsed: unknown = JSON.parse(mapeamentoCru);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("não é um objeto");
      }
      mapeamentoDaTela = {};
      for (const [origem, destino] of Object.entries(parsed as Record<string, unknown>)) {
        // `__proto__` e companhia vêm de JSON.parse como chave própria; copiar
        // para objeto literal escreveria no protótipo.
        if (origem === "__proto__" || origem === "constructor" || origem === "prototype") continue;
        if (typeof destino !== "string" || destino === "") continue;
        mapeamentoDaTela[origem] = destino;
      }
    } catch {
      return NextResponse.json(
        { error: "mapeamentoColunas precisa ser um JSON de { coluna: campo }" },
        { status: 400 },
      );
    }
    if (Object.keys(mapeamentoDaTela).length === 0) {
      return NextResponse.json(
        { error: "mapeamentoColunas veio vazio — nenhuma coluna apontaria para campo nenhum" },
        { status: 400 },
      );
    }
  }

  // Quando o mapeamento vem da tela, `formatosValor` e `dicionarios` do perfil
  // precisam ser PODADOS: `validarPerfil` recusa formato ou dicionário
  // declarado para campo que o mapeamento não produz (`perfil.ts`), e recusa
  // com razão — é sintoma de rename esquecido de um lado só.
  //
  // Sem esta poda, "ignorar esta coluna" na tela vira 400 com jargão de
  // servidor, num caminho que a tela oferece e não tem como consertar.
  const destinosDaTela = mapeamentoDaTela ? new Set(Object.values(mapeamentoDaTela)) : null;
  const podar = <T,>(objeto: unknown): Record<string, T> => {
    const entrada = (objeto ?? {}) as Record<string, T>;
    if (!destinosDaTela) return entrada;
    return Object.fromEntries(
      Object.entries(entrada).filter(([campo]) => destinosDaTela.has(campo)),
    );
  };

  // E o inverso: campo mapeado na tela que o perfil não declara chegaria como
  // TEXTO — data vira linha rejeitada, valor vira `null` gravado em silêncio.
  // `formatoSugerido` de `campos-destino` preenche a lacuna; o que o perfil já
  // declara continua vencendo, porque ele conhece o parceiro e a lista não.
  const formatos = podar<string>(perfilLinha.formatosValor);
  if (destinosDaTela) {
    for (const campo of destinosDaTela) {
      if (formatos[campo] !== undefined) continue;
      const sugerido = CAMPOS_DESTINO.find((c) => c.campo === campo)?.formatoSugerido;
      if (sugerido) formatos[campo] = sugerido;
    }
  }

  const perfil = {
    formato: perfilLinha.formato,
    extracao: perfilLinha.extracao,
    mapeamentoColunas: mapeamentoDaTela ?? perfilLinha.mapeamentoColunas,
    formatosValor: formatos,
    dicionarios: podar<Record<string, string>>(perfilLinha.dicionarios),
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

  // COMPETÊNCIA — de que mês é este relatório, não quando ele foi enviado.
  // Sem ela, reimportar um arquivo antigo reverteria valores da carteira em
  // silêncio; com ela, o motor ignora o que é mais velho e diz quantas linhas
  // ignorou. O perfil pode trazê-la por coluna; aí o campo é dispensável.
  const competenciaCrua = String(form.get("competencia") ?? "").trim();
  let dataReferencia: Date | undefined;
  if (competenciaCrua) {
    // "2026-08" vira o primeiro dia do mês, ao meio-dia UTC — mesma convenção
    // de `valores.ts`, para que GMT-3 não empurre a data para o mês anterior.
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(competenciaCrua);
    if (!m) {
      return NextResponse.json(
        { error: 'competencia deve ser "AAAA-MM" ou "AAAA-MM-DD"' },
        { status: 400 },
      );
    }
    dataReferencia = new Date(
      Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1, 12, 0, 0),
    );
    if (Number.isNaN(dataReferencia.getTime())) {
      return NextResponse.json({ error: `competencia inexistente: ${competenciaCrua}` }, { status: 400 });
    }
  }

  // PARCEIRO — de qual seguradora é este relatório.
  //
  // O padrão continua sendo a `fonte` do perfil. O campo existe porque um
  // perfil serve N parceiros: o layout da planilha é o mesmo e só muda quem
  // emitiu. Isto é FALLBACK por linha, não sobrescrita — quando o perfil mapeia
  // a coluna `parceiro`, o motor usa o valor da linha e este valor só preenche
  // as células vazias (`texto(c.parceiro) ?? parceiroPadrao`).
  const parceiroPadrao = String(form.get("parceiroPadrao") ?? "").trim() || perfilLinha.fonte;

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
        parceiroPadrao,
        iniciadoPorId: ctx.userId,
        loteImportacao: randomUUID(),
        dataReferencia,
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
