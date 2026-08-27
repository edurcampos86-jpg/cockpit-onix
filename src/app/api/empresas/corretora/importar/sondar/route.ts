import { NextRequest, NextResponse } from "next/server";

import { guardAdminApi } from "@/lib/api-admin-guard";
import { extrair } from "@/lib/importacao/extracao";
import type { PerfilImportacaoConfig } from "@/lib/importacao/perfil";

/**
 * POST /api/empresas/corretora/importar/sondar
 *
 * ROTA NOVA. Lê o CABEÇALHO do arquivo e devolve os rótulos das colunas, mais
 * as primeiras linhas cruas. NÃO grava nada, NÃO cria `ImportJob`, NÃO toca em
 * `ContratoCorretora`.
 *
 * ── POR QUE É POSSÍVEL SONDAR SEM PERFIL ────────────────────────────────
 * `extrair()` nunca chama `validarPerfil` — ele só resolve COMO chegar às
 * células. E `extrairPlanilha` monta `celulas` a partir de TODOS os rótulos do
 * cabeçalho, ignorando `mapeamentoColunas`. Então um "perfil-sonda" com
 * mapeamento vazio, que a rota de importar recusaria, aqui revela o arquivo
 * inteiro. A sonda é montada aqui dentro e não sai desta função — nada é
 * gravado em `PerfilImportacao`.
 *
 * ── POR QUE SÓ xlsx E csv ───────────────────────────────────────────────
 * PDF e Word passam por IA: sondar cobraria uma extração inteira só para
 * descobrir nomes de coluna, e a IA devolve os rótulos que o perfil pediu, não
 * os que o arquivo tem — a sonda seria circular além de cara. Nesses formatos a
 * tela manda escolher um perfil existente, e diz por quê.
 *
 * Gate: `guardAdminApi`, o mesmo da rota de importar.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const AMOSTRA = 5;

export async function POST(req: NextRequest) {
  const negado = await guardAdminApi("empresas/corretora/importar/sondar");
  if (negado) return negado;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "corpo inválido — esta rota espera multipart/form-data com o campo `arquivo`" },
      { status: 400 },
    );
  }

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

  const formato = String(form.get("formato") ?? "").trim();
  if (formato !== "xlsx" && formato !== "csv") {
    return NextResponse.json(
      {
        error:
          "só dá para sondar planilha e CSV. PDF e Word são lidos por IA: escolha um perfil existente.",
      },
      { status: 400 },
    );
  }

  const linhaCabecalho = Number(form.get("linhaCabecalho") ?? 1) || 1;
  const aba = String(form.get("aba") ?? "").trim();
  const delimitador = String(form.get("delimitador") ?? "").trim();

  const sonda = {
    formato,
    extracao:
      formato === "xlsx"
        ? { tipo: "xlsx", linhaCabecalho, ...(aba ? { aba } : {}) }
        : { tipo: "csv", linhaCabecalho, ...(delimitador ? { delimitador } : {}) },
    // Vazios de propósito: a sonda não traduz nada, só mostra o que existe.
    mapeamentoColunas: {},
    formatosValor: {},
    dicionarios: {},
  } as PerfilImportacaoConfig;

  const conteudo = Buffer.from(await arquivo.arrayBuffer());

  try {
    const lido = await extrair({ nome: arquivo.name, conteudo }, sonda);

    // A união dos rótulos, não os da primeira linha: CSV com linha curta e
    // planilha com coluna vazia no topo esconderiam colunas reais.
    const rotulos: string[] = [];
    for (const linha of lido.linhas) {
      for (const rotulo of Object.keys(linha.celulas)) {
        if (!rotulos.includes(rotulo)) rotulos.push(rotulo);
      }
    }

    return NextResponse.json({
      arquivo: arquivo.name,
      formato,
      linhasLidas: lido.linhas.length,
      colunas: rotulos,
      amostra: lido.linhas.slice(0, AMOSTRA).map((l) => ({ numero: l.numero, celulas: l.celulas })),
      avisos: lido.avisos,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[corretora/importar/sondar] falhou · arquivo=${arquivo.name}`, erro);
    return NextResponse.json({ error: mensagem }, { status: 422 });
  }
}
