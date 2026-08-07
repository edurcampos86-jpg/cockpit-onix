/* ──────────────────────────────────────────────────────────────
 * Registro das flags do Config DB — módulo PURO.
 *
 * Sem prisma, sem `server-only`, sem env: só a lista e as regras de leitura.
 * O estado de verdade (o que está ligado AGORA) mora em `estado.ts`, que é o
 * lado que toca banco. Esta separação é o que permite testar as regras.
 *
 * Por que existe: as flags nasceram cada uma no seu módulo
 * (`lib/<modulo>/flag.ts`, `instrumentation.ts`, rotas), e não havia lugar
 * nenhum que respondesse "quais existem e quais estão ligadas". A única forma
 * de saber era abrir `psql`. Este arquivo é essa lista.
 *
 * ALLOWLIST, e isso é uma regra de segurança, não organização: a tabela
 * `Config` guarda também SEGREDOS (DATACRAZY_TOKEN, ANTHROPIC_API_KEY,
 * DATACRAZY_WEBHOOK_SECRET, OUTLOOK_ICS_URL) e estado interno
 * (PIXEL_CAC_MATRIX, checkpoints do backfill). Nada disso entra aqui, e quem
 * lê o estado NUNCA varre a tabela — só busca estas chaves. Uma chave nova só
 * é exposta se alguém a escrever nesta lista de propósito.
 * ────────────────────────────────────────────────────────────── */

/**
 * Como o valor vira booleano. Os dois dialetos existem MESMO no código de hoje:
 *
 *   • `amplo`   — `1 | true | on | yes | sim`, a régua de `parseBoolFlag`,
 *                 copiada em 8 módulos `lib/<modulo>/flag.ts`;
 *   • `estrito` — `1 | true | on`, escrito inline em 4 lugares
 *                 (`instrumentation.ts`, `actions/reuniao-estruturada.ts`),
 *                 que NÃO aceitam `yes` nem `sim`.
 *
 * A diferença é real e silenciosa: gravar `sim` em `PERFIL_FATO_WRITE` deixa a
 * flag DESLIGADA, enquanto o mesmo `sim` em `HUB_ECOSSISTEMA` a liga. Guardar o
 * dialeto por flag é o que impede este registro de responder uma coisa
 * enquanto o código faz outra — se ele usasse uma régua só, mentiria em 4 das
 * 15. Unificar os dois dialetos é backlog próprio; enquanto não acontece, o
 * registro descreve a realidade em vez de a idealizar.
 */
export type DialetoBooleano = "amplo" | "estrito";

export type TipoFlag = "booleana" | "valor";

/**
 * Peso de virar a chave — o que decide se a tela pede confirmação.
 *
 * `alto` é toda flag cujo efeito NÃO é desfeito desligando de volta: as que
 * abrem caminho de ESCRITA (fatos de perfil, backfill em massa), as que ligam
 * SCHEDULER que sai chamando API externa, e a de CONTROLE DE ACESSO
 * (`RBAC_ENFORCEMENT`), onde errar esconde carteira de gente ou abre a de
 * todo mundo. Gate de UI é `normal`: liga, olha, desliga, nada aconteceu.
 */
export type ImpactoFlag = "alto" | "normal";

export type FlagRegistrada = {
  /** Chave em `Config.key`. */
  key: string;
  /** O que ela liga, em uma linha. */
  rotulo: string;
  /** Arquivo que consome — para achar o dono sem grep. */
  onde: string;
  tipo: TipoFlag;
  /** Só para `booleana`. */
  dialeto?: DialetoBooleano;
  /** Só para `booleana` — flags de valor não são alternáveis pela tela. */
  impacto?: ImpactoFlag;
  /** Só quando `impacto: "alto"`: o que exatamente acontece ao ligar. */
  aviso?: string;
};

const ACEITOS: Record<DialetoBooleano, readonly string[]> = {
  amplo: ["1", "true", "on", "yes", "sim"],
  estrito: ["1", "true", "on"],
};

/**
 * A flag está ligada? Reproduz EXATAMENTE o que o módulo dono faz — inclusive
 * o `trim().toLowerCase()` que os dois dialetos aplicam antes de comparar.
 * Ausente, vazia ou valor não reconhecido ⇒ desligada (default OFF em todas).
 */
export function flagLigada(
  valor: string | undefined,
  dialeto: DialetoBooleano = "amplo",
): boolean {
  if (!valor) return false;
  return ACEITOS[dialeto].includes(valor.trim().toLowerCase());
}

/** Valores que cada dialeto aceita — exposto para o teste e para a UI explicar. */
export function valoresAceitos(dialeto: DialetoBooleano): readonly string[] {
  return ACEITOS[dialeto];
}

/**
 * Todas as flags do Config DB. Conferida contra o código em 2026-08: cada
 * entrada tem um `getConfig(<key>)` real no arquivo apontado em `onde`.
 */
export const FLAGS_REGISTRADAS: readonly FlagRegistrada[] = [
  // ── Telas atrás de gate ──────────────────────────────────────
  {
    key: "HUB_ECOSSISTEMA",
    rotulo: "Hub Ecossistema Onix na rota raiz",
    onde: "src/lib/hub-ecossistema/flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "COCKPIT_REUNIAO",
    rotulo: "Aba Cockpit de Reunião na ficha do cliente",
    onde: "src/lib/cockpit-reuniao/flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "PERMISSOES_UI",
    rotulo: "Tela Configurações › Permissões",
    onde: "src/lib/permissoes/flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "IMPLEMENTACOES_INLINE",
    rotulo: "Botão flutuante 'Sugerir implementação'",
    onde: "src/lib/implementacoes/inline-flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    /* O nome sugere um número, mas é booleana: liga/desliga a 2ª linha
     * "parado há Xd" na coluna Saldo Conta. Registrado assim de propósito —
     * é justamente o tipo de chave que alguém tentaria preencher com "30". */
    key: "CLIENTES_SALDO_PARADO_DIAS",
    rotulo: "Exibe 'parado há X dias' na coluna Saldo Conta (booleana, apesar do nome)",
    onde: "src/lib/backoffice/saldo-parado-flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "CLIENTES_ATENCAO_INLINE",
    rotulo: "Fusão do estado de atenção na coluna Presença",
    onde: "src/lib/painel-atencao/service.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },

  // ── Comportamento de backend ─────────────────────────────────
  {
    key: "RBAC_ENFORCEMENT",
    rotulo: "Enforcement de escopo RBAC por CGE",
    onde: "src/lib/rbac.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "alto",
    aviso:
      "Passa a FILTRAR clientes por CGE em todas as listas e fichas. Ligado com carteira mal configurada, some cliente da tela de quem deveria ver; desligado, todo mundo volta a ver tudo.",
  },
  {
    key: "PAINEL_ATENCAO_BACKEND",
    rotulo: "Backend do Painel de Atenção ao Cliente",
    onde: "src/lib/painel-atencao/service.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "PERFIL_FATO_LEITURA",
    rotulo: "Leitura de fatos de perfil na ficha",
    onde: "src/lib/cockpit-reuniao/perfil-leitura-flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "PENDENCIAS_ABERTAS",
    rotulo: "Pendências abertas de reunião",
    onde: "src/lib/cockpit-reuniao/pendencias-flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "normal",
  },
  {
    key: "IMPORT_REUNIAO_IDEMPOTENTE",
    rotulo: "Reimportar reunião atualiza em vez de duplicar",
    onde: "src/lib/cockpit-reuniao/import-idempotencia-flag.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "alto",
    aviso:
      "Muda a semântica do import: reimportar a MESMA reunião passa a atualizar o registro existente em vez de criar outro.",
  },
  {
    key: "BACKFILL_CONVERSAS_ENABLED",
    rotulo: "Rota de backfill de conversas DataCrazy",
    onde: "src/app/api/backoffice/backfill-conversas/route.ts",
    tipo: "booleana",
    dialeto: "amplo",
    impacto: "alto",
    aviso:
      "Abre a rota de backfill, que varre a API da DataCrazy e ESCREVE conversas e mensagens em massa. Rodada indevida polui a base e consome cota da API.",
  },

  // ── Dialeto ESTRITO: não aceitam `yes` nem `sim` ─────────────
  {
    key: "PERFIL_FATO_WRITE",
    rotulo: "Escrita de fatos de perfil (patrimônio)",
    onde: "src/app/actions/reuniao-estruturada.ts",
    tipo: "booleana",
    dialeto: "estrito",
    impacto: "alto",
    aviso:
      "Passa a GRAVAR fatos de perfil a cada reunião estruturada. Desligar depois não apaga o que já foi escrito.",
  },
  {
    key: "PERFIL_FATO_RICO_WRITE",
    rotulo: "Escrita dos fatos ricos de perfil",
    onde: "src/app/actions/reuniao-estruturada.ts",
    tipo: "booleana",
    dialeto: "estrito",
    impacto: "alto",
    aviso:
      "Passa a GRAVAR os fatos ricos de perfil. Desligar depois não apaga o que já foi escrito.",
  },
  {
    key: "DATACRAZY_POLL_INPROCESS",
    rotulo: "Scheduler in-process do poll DataCrazy",
    onde: "src/instrumentation.ts",
    tipo: "booleana",
    dialeto: "estrito",
    impacto: "alto",
    aviso:
      "Liga o scheduler dentro do processo: passa a chamar a API da DataCrazy em intervalo fixo e a escrever no banco, sem passar por cron.",
  },
  {
    key: "BTG_FRESHNESS_INPROCESS",
    rotulo: "Scheduler in-process do freshness BTG",
    onde: "src/instrumentation.ts",
    tipo: "booleana",
    dialeto: "estrito",
    impacto: "alto",
    aviso:
      "Liga o scheduler de freshness BTG dentro do processo, com chamada externa e escrita a cada 30 min.",
  },

  // ── Tunáveis (valor, não liga/desliga) ───────────────────────
  {
    key: "LIMIAR_VACUO_DIAS",
    rotulo: "Teto de vácuo em dias (default 3650 = sem teto)",
    onde: "src/lib/painel-atencao/service.ts",
    tipo: "valor",
  },
  {
    key: "BACKFILL_CONVERSAS_LOCK_TTL_MIN",
    rotulo: "TTL do lock do backfill, em minutos (default 10)",
    onde: "src/app/api/backoffice/backfill-conversas/route.ts",
    tipo: "valor",
  },
] as const;

/** As chaves do registro — é ESTA lista que limita o que se lê do Config. */
export const CHAVES_REGISTRADAS: readonly string[] = FLAGS_REGISTRADAS.map((f) => f.key);

/**
 * A flag booleana com esta chave, ou `null`.
 *
 * É a FRONTEIRA DE SEGURANÇA da escrita: sem esta checagem, um POST em
 * `/api/configuracoes/flags` com `{ key: "DATACRAZY_TOKEN" }` sobrescreveria o
 * segredo com "1" — a tabela `Config` é a mesma. Devolver `null` fora do
 * registro é o que torna a rota incapaz de tocar em qualquer coisa que não
 * seja uma flag conhecida.
 *
 * Recusa também `tipo: "valor"`: `LIMIAR_VACUO_DIAS` é um número, e gravar "1"
 * ali mudaria o teto de vácuo para 1 dia em vez de "ligar" coisa nenhuma.
 */
export function flagAlternavel(key: string): FlagRegistrada | null {
  const flag = FLAGS_REGISTRADAS.find((f) => f.key === key);
  if (!flag || flag.tipo !== "booleana") return null;
  return flag;
}

/**
 * Valor a gravar para ligar/desligar. Sempre `"1"`/`"0"` porque os DOIS
 * dialetos os aceitam — a tela nunca escreve `sim`, que ligaria uma flag ampla
 * e deixaria uma estrita desligada.
 */
export function valorParaGravar(ligada: boolean): "1" | "0" {
  return ligada ? "1" : "0";
}
