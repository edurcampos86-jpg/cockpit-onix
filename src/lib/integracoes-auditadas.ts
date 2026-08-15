/**
 * O último veredito do auditor de integrações, publicado onde já se olha.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * `/api/cron/integration-audit` roda a cada 30 minutos, confere Google e BTG,
 * grava o resultado em `BtgSyncLog` (tipo `integration-audit`) e alerta no
 * Slack quando algo precisa de reconexão. Ele funciona.
 *
 * O problema é que a resposta dele só existe em dois lugares que ninguém abre
 * por hábito: o log do run no GitHub Actions e uma linha no banco. Em 15/08,
 * diagnosticar "o webhook do BTG parou por credencial?" custou abrir o log de
 * um run à mão para achar `{"integracao":"btg","status":"ok"}` — a resposta
 * estava pronta havia 30 minutos, e de novo 30 minutos antes disso.
 *
 * Sinal que existe e não é visto é sinal que não existe. Este módulo o move
 * para o `/api/health`, no mesmo padrão de `migrations-aplicadas.ts`.
 *
 * ── O QUE SAI, E O QUE NÃO SAI ───────────────────────────────────────────
 * Sai o que responde "a integração está sã?": quando rodou, se terminou bem,
 * quantas foram auditadas, quantas deram erro, e o `resumo` que o próprio
 * cron monta (`2 integr. · ok:2 recuperado:0 reconectar:0 …`).
 *
 * NÃO sai a coluna `erros`, mesmo quando preenchida: ela carrega
 * `{ conta, motivo }`, e `conta` é identificador de cliente. O health é
 * colado dentro de issue de incidente — o mesmo motivo que mantém a resposta
 * anônima byte-idêntica vale aqui.
 *
 * ── `idadeMinutos` é o campo que importa ─────────────────────────────────
 * `sucesso: true` de uma auditoria de anteontem não diz que a integração está
 * sã hoje; diz que estava. Com o cron a cada 30 min, idade muito maior que
 * isso significa que o próprio auditor parou — e aí o verde é do tipo que
 * engana.
 */
/*
 * Sem `server-only`, pelo mesmo motivo de `migrations-aplicadas.ts`: o pacote
 * estoura fora do bundler do Next e `npm test` roda em `tsx --test`. A parte
 * pura (`resumirAuditoria`) é justamente o que precisa de teste.
 */

/** A linha de `BtgSyncLog` que interessa, sem depender do cliente gerado. */
export type LinhaAuditoria = {
  iniciado: Date;
  finalizado: Date | null;
  sucesso: boolean;
  contasProcessadas: number;
  contasComErro: number;
  resumo: string | null;
};

export type EstadoIntegracoes = {
  /** `null` quando o auditor nunca rodou — diferente de "rodou e falhou". */
  ultima: string | null;
  /** `false` também quando a execução não terminou (`finalizado` nulo). */
  ok: boolean;
  /** Há quanto tempo, em minutos. O cron é de 30 em 30. */
  idadeMinutos: number | null;
  auditadas: number;
  comErro: number;
  /** O texto que o próprio cron monta. Sem identificador de cliente. */
  resumo: string | null;
};

/**
 * Parte pura: linha (ou ausência dela) → estado publicável.
 *
 * `agora` entra por parâmetro para o teste não depender do relógio.
 */
export function resumirAuditoria(
  linha: LinhaAuditoria | null,
  agora: Date,
): EstadoIntegracoes {
  if (!linha) {
    return {
      ultima: null,
      ok: false,
      idadeMinutos: null,
      auditadas: 0,
      comErro: 0,
      resumo: null,
    };
  }

  // `finalizado` nulo é execução interrompida: o cron cria a linha ANTES de
  // auditar e só depois a fecha. Contar isso como sucesso esconderia
  // exatamente o caso de o auditor ter morrido no meio.
  const terminou = linha.finalizado !== null;
  const referencia = linha.finalizado ?? linha.iniciado;

  return {
    ultima: referencia.toISOString(),
    ok: terminou && linha.sucesso && linha.contasComErro === 0,
    idadeMinutos: Math.max(
      0,
      Math.round((agora.getTime() - referencia.getTime()) / 60_000),
    ),
    auditadas: linha.contasProcessadas,
    comErro: linha.contasComErro,
    resumo: linha.resumo,
  };
}

/* ── A quebra por integração ──────────────────────────────────────────────
 *
 * `resumirAuditoria` responde "a última rodada do auditor foi bem?" — uma
 * idade só, a da rodada. Isso bastava com 2 integrações e deixa de bastar com
 * 6: uma rodada verde de 10 minutos atrás não diz que a linha do Datacrazy
 * está verde, e é o Datacrazy que mantém `ultimoContatoAt` vivo.
 *
 * A quebra vem de `IntegracaoAuditoria` (uma linha por chave, atualizada a
 * cada rodada), agregada POR INTEGRAÇÃO — nunca por chave. A chave é
 * `google:<userId>`: publicá-la exporia identificador de usuário no health,
 * que é colado dentro de issue de incidente. Aqui sai só o nome da
 * integração, quantas contas, quantas ok, o pior status e a MAIOR idade.
 *
 * Pior status, não o mais comum: com 3 contas Google, 2 ok e 1 precisando de
 * reconsentimento, o número que importa é o 1.
 */

/** Linha de `IntegracaoAuditoria` que interessa. Sem `chave`, sem `userId`. */
export type LinhaIntegracao = {
  integracao: string;
  status: string;
  updatedAt: Date;
};

export type EstadoDeUmaIntegracao = {
  integracao: string;
  contas: number;
  ok: number;
  /** O PIOR status entre as contas dessa integração. */
  status: string;
  /** Da conta auditada há mais tempo — a que denuncia probe parado. */
  idadeMinutos: number;
};

/** Da melhor pra pior. Índice maior ganha na hora de escolher o pior. */
const GRAVIDADE = ["ok", "refresh_recuperado", "transitorio", "precisa_reconectar"];

function pior(a: string, b: string): string {
  return GRAVIDADE.indexOf(b) > GRAVIDADE.indexOf(a) ? b : a;
}

export function resumirPorIntegracao(
  linhas: LinhaIntegracao[],
  agora: Date,
): EstadoDeUmaIntegracao[] {
  const porNome = new Map<string, EstadoDeUmaIntegracao>();

  for (const l of linhas) {
    const idade = Math.max(
      0,
      Math.round((agora.getTime() - l.updatedAt.getTime()) / 60_000),
    );
    const atual = porNome.get(l.integracao);
    if (!atual) {
      porNome.set(l.integracao, {
        integracao: l.integracao,
        contas: 1,
        ok: l.status === "ok" ? 1 : 0,
        status: l.status,
        idadeMinutos: idade,
      });
      continue;
    }
    atual.contas++;
    if (l.status === "ok") atual.ok++;
    atual.status = pior(atual.status, l.status);
    atual.idadeMinutos = Math.max(atual.idadeMinutos, idade);
  }

  // Ordem estável por nome: o health é comparado entre dois momentos com
  // diff de texto, e ordem que muda sozinha vira ruído no diff.
  return [...porNome.values()].sort((a, b) => a.integracao.localeCompare(b.integracao));
}

/* Por que este módulo NÃO recebe o cliente Prisma:
 *
 * A primeira versão recebia, com uma interface estrutural mínima, e não
 * type-checava — `findFirst` do cliente gerado é genérico em
 * `SelectSubset<T, …>` e não casa com assinatura simplificada sem `any`.
 * Insistir custaria um cast, e cast aqui é pior que a alternativa: quem lê o
 * módulo passaria a confiar num tipo que ninguém verifica.
 *
 * A consulta fica no chamador, com o cliente real e tipado; aqui fica só a
 * decisão — que é a parte com regra e a parte que o teste alcança. É a mesma
 * divisão de `compararMigrations` em `migrations-aplicadas.ts`.
 *
 * Consulta esperada, em `src/app/api/health/route.ts`:
 *
 *     prisma.btgSyncLog.findFirst({
 *       where: { tipo: "integration-audit" },
 *       orderBy: { iniciado: "desc" },
 *       select: { iniciado: true, finalizado: true, sucesso: true,
 *                 contasProcessadas: true, contasComErro: true, resumo: true },
 *     })
 */
