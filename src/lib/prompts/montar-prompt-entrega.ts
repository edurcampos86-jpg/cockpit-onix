/**
 * Montador DETERMINÍSTICO do prompt de execução da Central de Implementações.
 *
 * Papel duplo:
 *  1. É o fallback quando a chamada à API do Claude falha (timeout, rate limit,
 *     chave ausente). Com os campos que o usuário já preencheu, monta o mesmo
 *     prompt — o usuário nunca fica sem prompt na mão.
 *  2. É o esqueleto que a IA preenche no caminho feliz: ela devolve os textos
 *     das seções (e os sinais técnicos), e a montagem final passa por aqui.
 *     Assim a metodologia não depende de a IA "lembrar" das regras do projeto.
 *
 * A metodologia vive em `template-entrega-onix.md` (versionado, editável sem
 * rebuild de UI). Este módulo só substitui placeholders — nenhuma regra de
 * entrega fica hardcoded aqui além dos lembretes técnicos condicionais, que são
 * fatos do repositório e não da metodologia.
 *
 * Módulo puro em termos de rede/banco, mas lê do disco → só server-side.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Sinais técnicos sobre a natureza da mudança. Vêm da elicitação com a IA
 * ("isso mexe em schema?", "afeta RBAC?") ou ficam todos falsos no fallback.
 * Cada sinal liga um lembrete técnico específico — o prompt não carrega aviso
 * que não se aplica, que é o que faz o leitor parar de ler os avisos.
 */
export type SinaisTecnicos = {
  mexeSchema?: boolean;
  mexeMigration?: boolean;
  mexeRbac?: boolean;
  mexeUpload?: boolean;
  mexeIa?: boolean;
  soUi?: boolean;
  multiplasFrentes?: boolean;
};

export type TrocaElicitacao = {
  pergunta: string;
  resposta: string;
};

export type AnexoPrompt = {
  nomeArquivo: string;
  /** Descrição do que o print mostra (a IA descreve; o fallback deixa null). */
  descricao?: string | null;
};

export type DadosPromptEntrega = {
  titulo?: string | null;
  empresaNome: string;
  tipo: string;
  pagina?: string | null;
  oQue: string;
  como?: string | null;
  porQue: string;
  elicitacao?: TrocaElicitacao[];
  anexos?: AnexoPrompt[];
  sinais?: SinaisTecnicos;
};

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "prompts",
  "template-entrega-onix.md",
);

/**
 * Lê e cacheia o template. Cache em memória: o arquivo é imutável dentro de um
 * deploy (a imagem Docker carrega o `src/` inteiro — ver Dockerfile, sem
 * `output: standalone`), então reler a cada request só gastaria I/O.
 */
let cache: string | null = null;

export function lerTemplate(): string {
  if (cache === null) cache = readFileSync(TEMPLATE_PATH, "utf8");
  return cache;
}

/**
 * Corpo do template sem o comentário HTML de manutenção — ele é para quem
 * mantém o arquivo, não para quem recebe o prompt. É este recorte que vale como
 * "o template" para substituição e para o teste de cobertura de placeholders
 * (o comentário cita `{{NOME}}` como exemplo e não deve contar).
 */
export function templateCorpo(): string {
  return lerTemplate().replace(/^<!--[\s\S]*?-->\n*/, "");
}

/** Só para os testes — força a releitura do disco. */
export function _limparCacheTemplate(): void {
  cache = null;
}

/**
 * Versão da metodologia, lida do comentário `VERSAO: n` no topo do .md.
 * Vai gravada junto do promptGerado para ficar claro com qual régua cada prompt
 * histórico foi produzido (a metodologia muda; os prompts antigos não).
 */
export function versaoTemplate(): number {
  const m = lerTemplate().match(/^\s*VERSAO:\s*(\d+)\s*$/m);
  return m ? Number(m[1]) : 0;
}

/** Placeholders que o template pode usar. O teste confere a cobertura. */
export const PLACEHOLDERS = [
  "TITULO",
  "LINHA_ORQUESTRA",
  "EMPRESA",
  "TIPO",
  "PAGINA",
  "O_QUE",
  "COMO",
  "POR_QUE",
  "BLOCO_ELICITACAO",
  "BLOCO_ANEXOS",
  "LEMBRETES",
] as const;

const LINHA_ORQUESTRA =
  "> **Coordenação interna:** `/orquestra-multiagente` (Maestro → Especialistas por frente → Auditor de Bancada → Auditor-Geral), porque a tarefa cruza mais de uma frente.";

/**
 * Lembretes técnicos do repositório. Os dois primeiros valem sempre (todo
 * trabalho no Cockpit passa por build local e pelo builder do Railway); o resto
 * entra conforme os sinais. Cada linha existe porque já custou um incidente.
 */
function montarLembretes(sinais: SinaisTecnicos = {}): string {
  const linhas: string[] = [
    "- Rodar `npm run lint` e `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (exit 0) antes de abrir cada PR.",
    "- Builder do Railway é **Dockerfile/Railpack**. **Nunca forçar Nixpacks** — `nixPkgs` sobrescreve os pacotes do builder e apaga o node (`npm: command not found`).",
  ];

  if (sinais.mexeSchema || sinais.mexeMigration) {
    linhas.push(
      "- Migration validada em **shadow-DB** (banco descartável local) antes do merge. `prisma validate` só checa sintaxe — não basta.",
      "- **Nunca** `prisma db push` contra banco remoto. Conferir que `DATABASE_URL` aponta para `localhost` antes de qualquer escrita.",
      "- Em toda migration nova: **remover manualmente o `DROP` espúrio do índice `PainelEmailAI`** que o `prisma migrate dev` gera por drift.",
      "- `prisma migrate deploy` roda no startCommand de todo deploy — a migration aplica em produção no instante do merge na `main`. Planejar o rollback antes.",
    );
  }
  if (sinais.mexeRbac) {
    linhas.push(
      "- Passar por `getAuthContext()` / `isAdmin()` (`src/lib/auth-helpers.ts`). Rota sem permissão responde igual a not-found — não vazar existência do recurso.",
    );
  }
  if (sinais.mexeUpload) {
    linhas.push(
      "- Upload reusa o **Backblaze B2** já configurado (`src/lib/b2/upload.ts`, gate `b2ContratosConfigurado()`). Não introduzir outro provedor de storage.",
      "- Ao deletar um registro com anexos, apagar os objetos no B2 **antes** — o `onDelete: Cascade` limpa as linhas, não o bucket.",
    );
  }
  if (sinais.mexeIa) {
    linhas.push(
      "- A chave da Anthropic vem de `getConfig(\"ANTHROPIC_API_KEY\")` (Config DB primeiro, env como fallback) — ler `process.env` direto quebra em produção.",
      "- Saída estruturada por `tool_use` com `input_schema` travado, e revalidação no servidor. Nunca confiar só no schema.",
    );
  }
  if (sinais.soUi) {
    linhas.push(
      "- Mudança de UI significativa entra atrás de **feature flag** até validar em produção.",
    );
  }

  return linhas.join("\n");
}

function montarBlocoElicitacao(trocas: TrocaElicitacao[] = []): string {
  if (trocas.length === 0) return "";
  const corpo = trocas
    .map((t) => `- **${t.pergunta.trim()}** ${t.resposta.trim()}`)
    .join("\n");
  return `## Detalhes levantados\n\n${corpo}\n`;
}

function montarBlocoAnexos(anexos: AnexoPrompt[] = []): string {
  if (anexos.length === 0) return "";
  const corpo = anexos
    .map((a) =>
      a.descricao?.trim()
        ? `- \`${a.nomeArquivo}\` — ${a.descricao.trim()}`
        : `- \`${a.nomeArquivo}\``,
    )
    .join("\n");
  return `## Contexto visual (anexos)\n\nO usuário anexou print(s) na sugestão. Pedir os arquivos ao usuário antes de assumir o layout:\n\n${corpo}\n`;
}

/** Texto para campo vazio — o prompt nunca sai com seção em branco e sem aviso. */
const NAO_INFORMADO = "_(não informado pelo usuário)_";

function ou(valor: string | null | undefined, fallback: string): string {
  const t = (valor ?? "").trim();
  return t.length > 0 ? t : fallback;
}

/**
 * Substitui os placeholders e normaliza o espaçamento: blocos opcionais vazios
 * não podem deixar buraco de 3+ linhas em branco no meio do markdown.
 */
export function montarPromptEntrega(d: DadosPromptEntrega): string {
  const sinais = d.sinais ?? {};

  const valores: Record<(typeof PLACEHOLDERS)[number], string> = {
    TITULO: ou(d.titulo, `${d.tipo} — ${d.empresaNome}`),
    LINHA_ORQUESTRA: sinais.multiplasFrentes ? LINHA_ORQUESTRA : "",
    EMPRESA: d.empresaNome,
    TIPO: d.tipo,
    PAGINA: ou(d.pagina, "não informada"),
    O_QUE: ou(d.oQue, NAO_INFORMADO),
    COMO: ou(d.como, NAO_INFORMADO),
    POR_QUE: ou(d.porQue, NAO_INFORMADO),
    BLOCO_ELICITACAO: montarBlocoElicitacao(d.elicitacao),
    BLOCO_ANEXOS: montarBlocoAnexos(d.anexos),
    LEMBRETES: montarLembretes(sinais),
  };

  return templateCorpo()
    .replace(/\{\{(\w+)\}\}/g, (bruto, chave: string) =>
      chave in valores ? valores[chave as keyof typeof valores] : bruto,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .concat("\n");
}
