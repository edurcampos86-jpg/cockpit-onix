import type { Prisma } from "@/generated/prisma/client";
import type {
  ExtracaoRica,
  FamiliaEntidade,
  HorizonteProjeto,
  IdentidadeExtraida,
  MemoravelEntidade,
  MetricaEntidade,
  ProjetoEntidade,
  SucessaoEntidade,
} from "@/lib/cockpit-reuniao/tipos";
import { HORIZONTES_PROJETO } from "@/lib/cockpit-reuniao/tipos";

/**
 * Writer dos FATOS RICOS da reunião → `ClienteFato` (Fase 1b-2b/1b-2c).
 *
 * Roda no MESMO `$transaction` da importação. Dois regimes por tipo de campo:
 *
 *   - TEXTO LIVRE (familia/projeto/metrica-qualitativa/memoravel/saude/sucessao/
 *     identidade-prosa): UPSERT por (clienteId, campo) — UMA linha viva por
 *     campo. Se já existe e o texto MUDOU, atualiza in-place (valorAnterior = o
 *     que estava, reuniaoId/dados/sensivel/vence/criadoEm = os novos); se não
 *     existe, cria. Dedup DETERMINÍSTICA: paráfrase do LLM no reimport não gera
 *     duplicata (1b-2c, substitui a normalização lexical reprovada).
 *   - NUMÉRICO/DETERMINÍSTICO (idade, métrica numérica): APPEND-ONLY — cada
 *     mudança é uma NOVA linha (timeline real), igual ao patrimônio (1a).
 *
 * Em ambos: só escreve se o valor MUDOU (comparação LITERAL vs. a linha mais
 * recente do campo); valor igual = no-op.
 *
 * Convenções travadas:
 *   - fonte = "reuniao" em todos.
 *   - Ausência NÃO apaga (R3): só grava em valor novo explícito; nunca deleta
 *     por silêncio (um campo que sumir do resumo simplesmente não recebe fato).
 *   - Patrimônio NÃO entra aqui — segue na 1a (`gravarFatosPatrimonio`) com a
 *     flag PERFIL_FATO_WRITE própria.
 *
 * Taxonomia → ClienteFato (categoria | campo | valor | dados | flags):
 *   identidade   → IDENTIDADE | "idade"/"profissao"/"origem"/"estadoCivil" | texto
 *   familia[]    → FAMILIA    | chave (familia:gustavo) | resumo | {nome, detalhe} | sensivel
 *   projetos[]   → PROJETO    | chave (projeto:...)     | descricao | {horizonte}
 *   metricas[]   → METRICA    | chave (despesaMensal)   | num-string|texto | {tipo}
 *   memoraveis[] → MEMORAVEL  | chave                   | descricao | vence
 *   saude        → SAUDE      | "saude:geral"           | texto | sensivel=true
 *   sucessao[]   → SUCESSAO   | chave (produto:...)     | descricao
 */

const HORIZONTES_VALIDOS = HORIZONTES_PROJETO.map((h) => h.value);

/** Uma linha candidata a virar fato (pré change-detection). */
type EntradaFato = {
  categoria: string;
  campo: string;
  valor: string;
  dados?: Prisma.InputJsonValue;
  sensivel?: boolean;
  vence?: Date | null;
  // true = NUMÉRICO/determinístico → APPEND-ONLY (nova linha por mudança,
  // timeline). Ausente/false = TEXTO LIVRE → UPSERT in-place por campo.
  appendOnly?: boolean;
};

function strOuUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function intNaoNegOuUndef(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.trunc(v));
}

function venceParaData(iso: unknown): Date | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const d = new Date(iso.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Coerção defensiva do bloco rico vindo do cliente (não confiar no payload):
 * descarta entidade vazia, normaliza tipos e impõe a régua num/qualitativo.
 * Mesma régua da rota de extração — é o boundary de escrita.
 */
export function normalizarExtracaoRica(raw: unknown): ExtracaoRica {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const idRaw =
    o.identidade && typeof o.identidade === "object"
      ? (o.identidade as Record<string, unknown>)
      : {};
  const identidade: IdentidadeExtraida = {
    idade: intNaoNegOuUndef(idRaw.idade),
    profissao: strOuUndef(idRaw.profissao),
    origem: strOuUndef(idRaw.origem),
    estadoCivil: strOuUndef(idRaw.estadoCivil),
  };

  const familia: FamiliaEntidade[] = [];
  if (Array.isArray(o.familia)) {
    for (const it of o.familia) {
      if (!it || typeof it !== "object") continue;
      const f = it as Record<string, unknown>;
      const chave = strOuUndef(f.chave);
      const resumo = strOuUndef(f.resumo);
      const nome = strOuUndef(f.nome);
      if (!chave || !resumo) continue; // campo=chave e valor=resumo são obrigatórios p/ virar fato
      familia.push({
        chave,
        nome: nome ?? "",
        resumo,
        detalhe: strOuUndef(f.detalhe),
        sensivel: f.sensivel === true,
      });
    }
  }

  const projetos: ProjetoEntidade[] = [];
  if (Array.isArray(o.projetos)) {
    for (const it of o.projetos) {
      if (!it || typeof it !== "object") continue;
      const p = it as Record<string, unknown>;
      const chave = strOuUndef(p.chave);
      const descricao = strOuUndef(p.descricao);
      if (!chave || !descricao) continue;
      const h = typeof p.horizonte === "string" ? p.horizonte.trim() : "";
      const horizonte: HorizonteProjeto = HORIZONTES_VALIDOS.includes(
        h as HorizonteProjeto,
      )
        ? (h as HorizonteProjeto)
        : "medio";
      projetos.push({ chave, descricao, horizonte });
    }
  }

  const metricas: MetricaEntidade[] = [];
  if (Array.isArray(o.metricas)) {
    for (const it of o.metricas) {
      if (!it || typeof it !== "object") continue;
      const m = it as Record<string, unknown>;
      const chave = strOuUndef(m.chave);
      if (!chave) continue;
      const valorNumerico = intNaoNegOuUndef(m.valorNumerico);
      const valorTexto =
        valorNumerico === undefined ? strOuUndef(m.valorTexto) : undefined;
      if (valorNumerico === undefined && !valorTexto) continue; // métrica sem valor: descarta
      metricas.push({ chave, valorNumerico, valorTexto });
    }
  }

  const memoraveis: MemoravelEntidade[] = [];
  if (Array.isArray(o.memoraveis)) {
    for (const it of o.memoraveis) {
      if (!it || typeof it !== "object") continue;
      const m = it as Record<string, unknown>;
      const chave = strOuUndef(m.chave);
      const descricao = strOuUndef(m.descricao);
      if (!chave || !descricao) continue;
      const d = venceParaData(m.vence);
      memoraveis.push({
        chave,
        descricao,
        vence: d ? d.toISOString().slice(0, 10) : null,
      });
    }
  }

  const sucessao: SucessaoEntidade[] = [];
  if (Array.isArray(o.sucessao)) {
    for (const it of o.sucessao) {
      if (!it || typeof it !== "object") continue;
      const s = it as Record<string, unknown>;
      const chave = strOuUndef(s.chave);
      const descricao = strOuUndef(s.descricao);
      if (!chave || !descricao) continue;
      sucessao.push({ chave, descricao });
    }
  }

  return {
    identidade,
    familia,
    projetos,
    metricas,
    memoraveis,
    saude: typeof o.saude === "string" ? o.saude.trim() : "",
    sucessao,
  };
}

/** Monta as linhas candidatas a fato a partir da extração já normalizada. */
function montarEntradas(e: ExtracaoRica): EntradaFato[] {
  const out: EntradaFato[] = [];

  // IDENTIDADE — um fato por campo presente.
  const { idade, profissao, origem, estadoCivil } = e.identidade;
  if (idade != null) out.push({ categoria: "IDENTIDADE", campo: "idade", valor: String(idade), appendOnly: true });
  if (profissao) out.push({ categoria: "IDENTIDADE", campo: "profissao", valor: profissao });
  if (origem) out.push({ categoria: "IDENTIDADE", campo: "origem", valor: origem });
  if (estadoCivil) out.push({ categoria: "IDENTIDADE", campo: "estadoCivil", valor: estadoCivil });

  // FAMILIA — campo=chave, valor=resumo, dados={nome, detalhe}, sensivel da extração.
  for (const f of e.familia) {
    const dados: Record<string, string> = { nome: f.nome };
    if (f.detalhe) dados.detalhe = f.detalhe;
    out.push({ categoria: "FAMILIA", campo: f.chave, valor: f.resumo, dados, sensivel: f.sensivel });
  }

  // PROJETO — campo=chave, valor=descricao, dados={horizonte}.
  for (const p of e.projetos) {
    out.push({
      categoria: "PROJETO",
      campo: p.chave,
      valor: p.descricao,
      dados: { horizonte: p.horizonte },
    });
  }

  // METRICA — campo=chave, valor=num-string|texto, dados={tipo}.
  for (const m of e.metricas) {
    if (m.valorNumerico != null) {
      out.push({
        categoria: "METRICA",
        campo: m.chave,
        valor: String(m.valorNumerico),
        dados: { tipo: "numerico" },
        appendOnly: true, // métrica numérica = timeline determinística
      });
    } else if (m.valorTexto) {
      out.push({
        categoria: "METRICA",
        campo: m.chave,
        valor: m.valorTexto,
        dados: { tipo: "qualitativo" },
      });
    }
  }

  // MEMORAVEL — campo=chave, valor=descricao, vence (se houver).
  for (const m of e.memoraveis) {
    out.push({
      categoria: "MEMORAVEL",
      campo: m.chave,
      valor: m.descricao,
      vence: venceParaData(m.vence),
    });
  }

  // SAUDE — do PRÓPRIO cliente; sempre sensível.
  if (e.saude) {
    out.push({ categoria: "SAUDE", campo: "saude:geral", valor: e.saude, sensivel: true });
  }

  // SUCESSAO — campo=chave, valor=descricao.
  for (const s of e.sucessao) {
    out.push({ categoria: "SUCESSAO", campo: s.chave, valor: s.descricao });
  }

  return out;
}

export async function gravarFatosRicos(
  tx: Prisma.TransactionClient,
  args: { clienteId: string; reuniaoId: string; extracao: ExtracaoRica },
): Promise<void> {
  const { clienteId, reuniaoId, extracao } = args;

  for (const e of montarEntradas(extracao)) {
    // Linha mais recente do campo (find-then-update no MESMO tx → sem @@unique,
    // sem migration). `id` é necessário p/ o update in-place do texto livre.
    const ultimo = await tx.clienteFato.findFirst({
      where: { clienteId, campo: e.campo },
      orderBy: { criadoEm: "desc" },
      select: { id: true, valor: true },
    });

    // Comparação LITERAL: valor igual ao mais recente → no-op (vale p/ os 2 regimes).
    if (ultimo && ultimo.valor === e.valor) continue;

    if (e.appendOnly || !ultimo) {
      // Numérico (timeline) OU 1ª vez de um texto livre → CRIA nova linha.
      await tx.clienteFato.create({
        data: {
          clienteId,
          reuniaoId,
          categoria: e.categoria,
          campo: e.campo,
          valor: e.valor,
          valorAnterior: ultimo?.valor ?? null,
          dados: e.dados,
          fonte: "reuniao",
          sensivel: e.sensivel ?? false,
          vence: e.vence ?? null,
        },
      });
    } else {
      // Texto livre que já existe → UPSERT in-place (uma linha viva por campo).
      // valorAnterior = o que estava; reuniaoId aponta p/ a reunião ATUAL (A1).
      await tx.clienteFato.update({
        where: { id: ultimo.id },
        data: {
          reuniaoId,
          valor: e.valor,
          valorAnterior: ultimo.valor,
          dados: e.dados,
          sensivel: e.sensivel ?? false,
          vence: e.vence ?? null,
          criadoEm: new Date(),
        },
      });
    }
  }
}
