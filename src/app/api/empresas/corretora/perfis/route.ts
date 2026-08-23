import { NextRequest, NextResponse } from "next/server";

import { guardAdminApi } from "@/lib/api-admin-guard";
import { CAMPOS_DESTINO } from "@/lib/importacao-ui/campos-destino";
import { ehFormatoArquivo, validarPerfil, type PerfilImportacaoConfig } from "@/lib/importacao/perfil";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/empresas/corretora/perfis
 *
 * ROTA NOVA, SÓ LEITURA. Devolve os perfis de importação da Corretora para a
 * tela montar o mapeamento sem adivinhar.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────────
 * A tela precisa saber, ANTES de enviar o arquivo, três coisas que só o perfil
 * responde: quais colunas ele já traduz, se ele lê a competência do arquivo, e
 * que vocabulário ele conhece. Sem isso a pessoa mapeia no escuro e descobre no
 * envio — que é justamente o momento em que descobrir sai caro.
 *
 * ── O QUE ELA NÃO DEVOLVE ───────────────────────────────────────────────
 * Perfis de outras empresas. `empresaId: "corretora"` é filtro de servidor, não
 * de tela: um perfil da Imobiliária mapearia colunas da base da Corretora por
 * coincidência de nome, e o dado cairia no campo errado sem erro nenhum.
 *
 * Gate: `guardAdminApi`, o mesmo da rota de importar. Ver o mapeamento é ver
 * como a base de uma empresa é montada.
 */

export const dynamic = "force-dynamic";

const EMPRESA = "corretora";

export async function GET() {
  const negado = await guardAdminApi("empresas/corretora/perfis");
  if (negado) return negado;

  const perfis = await prisma.perfilImportacao.findMany({
    where: { empresaId: EMPRESA },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      fonte: true,
      formato: true,
      ativo: true,
      extracao: true,
      mapeamentoColunas: true,
      formatosValor: true,
      dicionarios: true,
    },
  });

  return NextResponse.json({
    perfis: perfis.map((p) => ({
      ...p,
      // Calculado no servidor para a tela não repetir a regra: se o perfil já
      // lê a competência do arquivo, a tela NÃO deve oferecer o campo manual.
      leCompetenciaDoArquivo: Object.values(
        (p.mapeamentoColunas ?? {}) as Record<string, string>,
      ).includes("dataReferencia"),
    })),
  });
}

/**
 * POST /api/empresas/corretora/perfis
 *
 * CRIA um perfil de importação. Sem migration: `PerfilImportacao` já existe e
 * nasce vazia.
 *
 * ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────
 * Sem ela a tela de import só serve parceiro que JÁ tem perfil — e não havia
 * como criar o primeiro por lugar nenhum do sistema: o único
 * `perfilImportacao.create` do repositório vive em
 * `scripts/ensaio-import-corretora.ts`, que é script de ensaio. A tela nascia
 * sem uso: chega parceiro novo e o fluxo para antes de começar.
 *
 * ── A ESCRITA É REVERSÍVEL, E ISSO IMPORTA PARA A FAIXA ─────────────────
 * Criar perfil não toca em contrato nem em cliente. Perfil errado é perfil
 * desativado, e nada do que ele produziu existe até alguém rodar a
 * importação — que continua tendo ensaio antes.
 *
 * ── VALIDA COM A MESMA RÉGUA DA IMPORTAÇÃO ──────────────────────────────
 * `validarPerfil` roda ANTES do insert. Perfil quebrado gravado é pior que
 * perfil quebrado recusado: ele só falha na próxima importação, longe de quem
 * o quebrou.
 */
export async function POST(req: NextRequest) {
  const negado = await guardAdminApi("empresas/corretora/perfis");
  if (negado) return negado;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corpo precisa ser JSON" }, { status: 400 });
  }

  const nome = texto(corpo.nome);
  const fonte = texto(corpo.fonte);
  const formato = texto(corpo.formato);
  const faltando = [
    nome ? null : "nome",
    fonte ? null : "fonte",
    formato ? null : "formato",
  ].filter(Boolean);
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `campos obrigatórios ausentes: ${faltando.join(", ")}` },
      { status: 400 },
    );
  }
  if (!ehFormatoArquivo(formato)) {
    return NextResponse.json(
      { error: `formato inválido: ${JSON.stringify(formato)}` },
      { status: 400 },
    );
  }

  const mapeamento = limpar(corpo.mapeamentoColunas);
  if (mapeamento === null || Object.keys(mapeamento).length === 0) {
    return NextResponse.json(
      { error: "mapeamentoColunas precisa ser um objeto { coluna: campo } não vazio" },
      { status: 400 },
    );
  }

  // Formato de valor: o que veio no corpo vence; o resto sai de
  // `formatoSugerido`. Sem isso, coluna de data mapeada chegaria como texto e
  // a linha seria recusada com um motivo que não aponta para a causa.
  const formatos: Record<string, string> = limpar(corpo.formatosValor) ?? {};
  for (const campo of new Set(Object.values(mapeamento))) {
    if (formatos[campo] !== undefined) continue;
    const sugerido = CAMPOS_DESTINO.find((c) => c.campo === campo)?.formatoSugerido;
    if (sugerido) formatos[campo] = sugerido;
  }

  const dicionarios: Record<string, Record<string, string>> = {};
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
      // Dicionário para campo que o mapeamento não produz é erro em
      // `validarPerfil`; recusar aqui dá a mensagem melhor.
      if (!Object.values(mapeamento).includes(campo)) {
        return NextResponse.json(
          { error: `dicionarios tem "${campo}", que nenhuma coluna mapeada produz` },
          { status: 400 },
        );
      }
      dicionarios[campo] = limpa;
    }
  }

  const extracao =
    corpo.extracao !== undefined && corpo.extracao !== null && typeof corpo.extracao === "object"
      ? (corpo.extracao as Record<string, unknown>)
      : // Padrão que serve xlsx e csv sem pedir nada à pessoa: primeira aba,
        // cabeçalho na linha 1. PDF e Word não têm padrão possível — a
        // estratégia muda tudo —, e por isso são recusados sem `extracao`.
        { tipo: formato, linhaCabecalho: 1 };
  if (extracao.tipo !== formato) {
    return NextResponse.json(
      { error: `extracao.tipo (${String(extracao.tipo)}) não bate com formato (${formato})` },
      { status: 400 },
    );
  }

  const perfil = {
    formato,
    extracao,
    mapeamentoColunas: mapeamento,
    formatosValor: formatos,
    dicionarios,
  } as unknown as PerfilImportacaoConfig;

  const problemas = validarPerfil(perfil);
  if (problemas.length > 0) {
    return NextResponse.json({ error: "perfil inválido", problemas }, { status: 400 });
  }

  // `@@unique([empresaId, nome])` — nome repetido é conflito, não erro 500.
  const jaExiste = await prisma.perfilImportacao.findFirst({
    where: { empresaId: EMPRESA, nome },
    select: { id: true },
  });
  if (jaExiste) {
    return NextResponse.json(
      { error: `já existe um perfil chamado "${nome}" na Corretora` },
      { status: 409 },
    );
  }

  const criado = await prisma.perfilImportacao.create({
    data: {
      nome,
      empresaId: EMPRESA,
      fonte,
      formato,
      // `Record<string, unknown>` não satisfaz `InputJsonValue`: o Prisma quer
      // uma árvore comprovadamente serializável. O round-trip por JSON prova.
      extracao: JSON.parse(JSON.stringify(extracao)),
      mapeamentoColunas: mapeamento,
      formatosValor: formatos,
      dicionarios,
      observacoes: texto(corpo.observacoes) || null,
    },
    select: { id: true, nome: true, fonte: true, formato: true, ativo: true },
  });

  return NextResponse.json({ perfil: criado }, { status: 201 });
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Copia só chaves seguras de um objeto vindo de JSON. */
function limpar(entrada: unknown): Record<string, string> | null {
  if (entrada === undefined) return {};
  if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(entrada as Record<string, unknown>)) {
    // `__proto__` e companhia vêm de JSON.parse como chave própria; copiar
    // para objeto literal escreveria no protótipo.
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (typeof v !== "string" || v === "") continue;
    saida[k] = v;
  }
  return saida;
}
