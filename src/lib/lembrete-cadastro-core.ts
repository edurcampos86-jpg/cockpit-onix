/**
 * Texto do lembrete de cadastro pendente — PURO, sem prisma e sem I/O.
 *
 * Separado do disparo porque é a parte que se erra: pluralização, o link certo
 * e dizer POR QUE aquilo importa. Um lembrete que só diz "preencha seu cadastro"
 * é ignorado; um que diz "sem telefone você não recebe alerta de cliente em
 * risco" é atendido.
 *
 * Os três canais recebem o MESMO conteúdo, em formatações diferentes: quem lê
 * no WhatsApp e depois no e-mail não pode achar que são pedidos distintos.
 */

export type PendenciaPessoa = {
  nomeCompleto: string;
  apelido: string | null;
  semTelefone: boolean;
  emailPessoal: boolean;
  /** Quantas vezes já foi cobrada. 0 = nunca. */
  vezes?: number;
};

/**
 * A partir de quantas cobranças o problema deixa de ser de sistema.
 *
 * Contagem, e não prazo, porque a janela de dedupe de 72h já embute tempo: três
 * cobranças significam pelo menos ~6 dias. Um limite por prazo puro puniria
 * quem entrou no time ontem tanto quanto quem ignora há duas semanas.
 */
export const LIMITE_COBRANCAS = 3;

/** Como chamar a pessoa: apelido quando existe, senão o primeiro nome. */
export function tratamento(p: { nomeCompleto: string; apelido: string | null }): string {
  return p.apelido || p.nomeCompleto.trim().split(/\s+/)[0] || p.nomeCompleto;
}

/**
 * O que falta, em linguagem de gente.
 *
 * Só lista o que REALMENTE falta para aquela pessoa — mandar a lista completa
 * para quem só está sem telefone faz o pedido parecer genérico e some com a
 * urgência do item que importa.
 */
export function itensPendentes(p: PendenciaPessoa): string[] {
  const itens: string[] = [];
  if (p.semTelefone) {
    itens.push("telefone (é por ele que chegam os alertas de cliente em risco no WhatsApp)");
  }
  if (p.emailPessoal) {
    itens.push("e-mail corporativo no lugar do pessoal (o pessoal não dá acesso e não é revogado na saída)");
  }
  return itens;
}

/** Mensagem individual — a mesma para WhatsApp e e-mail. */
export function mensagemPessoal(p: PendenciaPessoa, baseUrl: string): string {
  const itens = itensPendentes(p);
  const lista = itens.map((i) => `• ${i}`).join("\n");
  const verbo = itens.length === 1 ? "Falta" : "Faltam";
  return [
    `Oi, ${tratamento(p)}!`,
    "",
    `${verbo} ${itens.length === 1 ? "um item" : `${itens.length} itens`} no seu cadastro do Cockpit:`,
    lista,
    "",
    `Você mesmo resolve em ${baseUrl}/time/eu — leva menos de um minuto.`,
  ].join("\n");
}

/** Assunto do e-mail. Curto e específico, para não morrer na caixa de entrada. */
export function assuntoEmail(p: PendenciaPessoa): string {
  const itens = itensPendentes(p);
  if (itens.length === 1 && p.semTelefone) return "Cockpit: falta seu telefone";
  if (itens.length === 1 && p.emailPessoal) return "Cockpit: e-mail corporativo pendente";
  return "Cockpit: cadastro pendente";
}

/**
 * Resumo para o Slack — canal de ACOMPANHAMENTO, não de cobrança individual.
 *
 * Aqui o destinatário é quem conduz o saneamento, então o formato é de placar:
 * quantos faltam e quem. Repetir a mensagem individual N vezes no canal só
 * geraria ruído.
 */
export function resumoSlack(pendentes: PendenciaPessoa[], baseUrl: string): string {
  if (pendentes.length === 0) {
    return "✅ Cadastro do time completo — ninguém com telefone ou e-mail pendente.";
  }
  const linhas = pendentes.map((p) => {
    const faltas = [p.semTelefone && "telefone", p.emailPessoal && "e-mail pessoal"]
      .filter(Boolean)
      .join(" + ");
    const cobrancas = p.vezes && p.vezes > 1 ? ` (${p.vezes}ª cobrança)` : "";
    return `• ${tratamento(p)} — ${faltas}${cobrancas}`;
  });

  // ESCALAÇÃO. O lembrete resolve quem esquece; não resolve quem ignora. Sem
  // um limite, o loop roda para sempre e o Eduardo só descobre olhando ficha
  // por ficha. Aos LIMITE_COBRANCAS, o problema deixa de ser de sistema e vira
  // conversa dele com a pessoa — e o Slack é onde isso precisa aparecer.
  const reincidentes = pendentes.filter((p) => (p.vezes ?? 0) >= LIMITE_COBRANCAS);
  const bloco = reincidentes.length
    ? [
        "",
        `⚠️ ${reincidentes.length} ${reincidentes.length === 1 ? "pessoa" : "pessoas"} já ${reincidentes.length === 1 ? "foi cobrada" : "foram cobradas"} ${LIMITE_COBRANCAS}+ vezes sem resolver:`,
        ...reincidentes.map((p) => `• ${tratamento(p)} (${p.vezes}×) — lembrete não está funcionando, vale conversa direta`),
      ]
    : [];

  return [
    `📋 ${pendentes.length} ${pendentes.length === 1 ? "pessoa" : "pessoas"} com cadastro pendente:`,
    ...linhas,
    ...bloco,
    "",
    `Cada um resolve em ${baseUrl}/time/eu`,
  ].join("\n");
}
