/**
 * Segmentação de transcrição em turnos de fala, e identificação de quais turnos
 * são do Eduardo.
 *
 * POR QUE ISSO EXISTE SEPARADO: o guia de voz descreve COMO O EDUARDO FALA. Se
 * a segmentação errar e um turno do cliente entrar no corpus, o guia passa a
 * descrever a voz do cliente — e ninguém percebe, porque o texto continua
 * plausível. Então a regra aqui é: na dúvida, DESCARTA. Cobertura menor e
 * honesta vale mais que corpus contaminado.
 *
 * As transcrições chegam de três fontes, com três convenções de rótulo:
 *   - Plaud (src/lib/integrations/plaud.ts:174)  → `${speaker}: texto`, onde
 *     speaker é o nome real, "Speaker N" ou "Desconhecido".
 *   - Datacrazy WhatsApp (src/lib/datacrazy.ts:420) → `VENDEDOR:` / `CLIENTE:`.
 *   - sync-drive (src/app/api/meetings/sync-drive/route.ts:47) → "Speaker N".
 */

export type Confianca = "nome" | "papel" | "eliminacao" | "indeterminado";

export interface Turno {
  /** Rótulo literal como apareceu na transcrição ("Eduardo", "Speaker 1", …). */
  rotulo: string;
  texto: string;
  /** `true` só quando a atribuição ao Eduardo é confiável (ver `confianca`). */
  ehEduardo: boolean;
  confianca: Confianca;
}

export interface ResultadoSegmentacao {
  turnos: Turno[];
  /** Rótulos distintos vistos, para diagnóstico de cobertura. */
  rotulos: string[];
  /** `true` quando a transcrição não tinha nenhum rótulo de falante. */
  semDiarizacao: boolean;
}

/** Linha `Rótulo: texto`. O rótulo é curto e sem pontuação final — evita casar
 *  com frase comum que contenha dois-pontos ("olha só: a conta é essa"). */
const LINHA_COM_ROTULO = /^\s*([\p{Lu}][\p{L}\p{N} .'’_-]{0,39}?)\s*:\s*(.+)$/u;

/** Cabeçalho injetado por quem monta o corpus (ex.: "[PLAUD — … | … | …]"). */
const CABECALHO = /^\s*\[.*\]\s*$/;

const ROTULO_EDUARDO = /(^|\b)(eduardo|edu\b|e\.?\s?campos|eduardorcampos)/i;
const ROTULO_VENDEDOR = /^(vendedor|assessor|consultor)$/i;
const ROTULO_CLIENTE = /^(cliente|contato|lead)$/i;
const ROTULO_ANONIMO = /^(speaker|falante|locutor|participante)\s*\d*$|^desconhecido$/i;

/** Nomes de outros membros do time — nunca podem ser confundidos com Eduardo. */
const OUTROS_DO_TIME = /(thiago|vergal|rose|oliveira|adriely|rodrigo)/i;

function normalizar(rotulo: string): string {
  return rotulo.trim().replace(/\s+/g, " ");
}

/**
 * Quebra a transcrição em turnos. Não decide ainda de quem é cada turno quando
 * o rótulo é anônimo — isso é `atribuirEduardo`, que precisa do contexto da
 * reunião (participantes) para tentar a eliminação.
 */
export function segmentarTurnos(transcricao: string): ResultadoSegmentacao {
  const linhas = transcricao.split(/\r?\n/);
  const turnos: Turno[] = [];
  const rotulos = new Set<string>();
  let atual: Turno | null = null;

  for (const linha of linhas) {
    if (!linha.trim() || CABECALHO.test(linha)) continue;

    const m = linha.match(LINHA_COM_ROTULO);
    if (m) {
      const rotulo = normalizar(m[1]!);
      rotulos.add(rotulo);
      atual = {
        rotulo,
        texto: m[2]!.trim(),
        ehEduardo: false,
        confianca: "indeterminado",
      };
      turnos.push(atual);
      continue;
    }

    // Continuação do turno anterior (quebra de linha dentro da mesma fala).
    if (atual) {
      atual.texto += ` ${linha.trim()}`;
    } else {
      // Texto antes de qualquer rótulo: transcrição sem diarização.
      atual = {
        rotulo: "",
        texto: linha.trim(),
        ehEduardo: false,
        confianca: "indeterminado",
      };
      turnos.push(atual);
    }
  }

  return {
    turnos,
    rotulos: [...rotulos],
    semDiarizacao: rotulos.size === 0,
  };
}

export interface ContextoReuniao {
  /** `Meeting.vendedor` — quando é o Eduardo, `VENDEDOR:` vira fala dele. */
  vendedorEhEduardo: boolean;
  /** `Meeting.participants` já separado; usado só para eliminação. */
  participantes?: string[];
}

/**
 * Marca os turnos do Eduardo, em três níveis de confiança — e deixa o resto
 * como `indeterminado`, que o corpus descarta.
 *
 * 1. `nome`      — o rótulo traz o nome dele.
 * 2. `papel`     — rótulo `VENDEDOR`/`ASSESSOR` numa reunião atribuída a ele.
 * 3. `eliminacao`— exatamente dois falantes, um deles identificado como o
 *                  cliente pelo nome; sobra um, e a reunião é dele.
 */
export function atribuirEduardo(
  resultado: ResultadoSegmentacao,
  ctx: ContextoReuniao,
): ResultadoSegmentacao {
  const { turnos } = resultado;

  for (const t of turnos) {
    if (!t.rotulo) continue;
    if (OUTROS_DO_TIME.test(t.rotulo) && !ROTULO_EDUARDO.test(t.rotulo)) continue;
    if (ROTULO_EDUARDO.test(t.rotulo)) {
      t.ehEduardo = true;
      t.confianca = "nome";
    } else if (ctx.vendedorEhEduardo && ROTULO_VENDEDOR.test(t.rotulo)) {
      t.ehEduardo = true;
      t.confianca = "papel";
    }
  }

  if (turnos.some((t) => t.ehEduardo)) return resultado;
  if (!ctx.vendedorEhEduardo) return resultado;

  // Eliminação: dois falantes, um claramente o cliente.
  const distintos = [...new Set(turnos.map((t) => t.rotulo).filter(Boolean))];
  if (distintos.length !== 2) return resultado;

  const nomesCliente = (ctx.participantes ?? [])
    .map((p) => p.trim())
    .filter((p) => p && !ROTULO_EDUARDO.test(p) && !OUTROS_DO_TIME.test(p));

  const ehCliente = (rotulo: string) =>
    ROTULO_CLIENTE.test(rotulo) ||
    nomesCliente.some((n) => mesmaPessoa(n, rotulo));

  const clientes = distintos.filter(ehCliente);
  if (clientes.length !== 1) return resultado;

  const sobra = distintos.find((r) => r !== clientes[0])!;
  // Só elimina se o que sobrou for anônimo. Rótulo nomeado que não é o Eduardo
  // é outra pessoa, não ele com o nome errado.
  if (!ROTULO_ANONIMO.test(sobra)) return resultado;

  for (const t of turnos) {
    if (t.rotulo === sobra) {
      t.ehEduardo = true;
      t.confianca = "eliminacao";
    }
  }
  return resultado;
}

/** Casamento frouxo de nome: primeiro nome igual já basta para "é o cliente". */
export function mesmaPessoa(a: string, b: string): boolean {
  const chave = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .split(/\s+/)[0] ?? "";
  const ka = chave(a);
  const kb = chave(b);
  return ka.length >= 3 && ka === kb;
}

/** Só o texto do Eduardo, na ordem, para alimentar métricas e o corpus. */
export function falasDoEduardo(resultado: ResultadoSegmentacao): string[] {
  return resultado.turnos.filter((t) => t.ehEduardo).map((t) => t.texto);
}
