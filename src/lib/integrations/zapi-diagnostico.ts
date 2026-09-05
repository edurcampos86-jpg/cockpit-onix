/**
 * Diagnóstico do envio Z-API — módulo PURO (sem server-only, sem prisma, sem
 * fetch), no mesmo molde de `telefone.ts`, para ser testável sem subir o Next.
 *
 * Por que existe: `sendWhatsappMessage` devolvia `false` para causas
 * completamente diferentes — config ausente, número inválido, instância caída,
 * token vencido, erro de rede — e descartava status, corpo e exceção. A falha
 * chegava ao operador como "o alerta não funciona", sem pista de onde. O mesmo
 * comentário já estava escrito em `telefone.ts`, sobre o mesmo `false`.
 *
 * A parte delicada NÃO é formatar o texto: é NÃO VAZAR SEGREDO ao formatá-lo.
 * A URL da Z-API carrega instância e token no próprio caminho
 * (`/instances/{instance}/token/{token}/send-text`), e os dois lugares de onde
 * este módulo tira texto podem devolver essa URL de volta:
 *
 *   • o CORPO de erro da Z-API, que às vezes ecoa o recurso chamado;
 *   • a MENSAGEM da exceção de rede — o `fetch` do Node costuma montar
 *     "request to https://api.z-api.io/instances/AAA/token/BBB/... failed".
 *
 * Ou seja: logar o erro cru trocaria um bug silencioso por um vazamento de
 * credencial no log do Railway, que é retido e lido por ferramenta externa.
 * Daí `limparSegredos` ser obrigatório em todo caminho de log, e não opcional.
 */

/** Teto do corpo de erro no log. Diagnóstico cabe nisso; dump de HTML não. */
export const LIMITE_CORPO = 500;

/**
 * Troca cada segredo por `<omitido>` dentro do texto.
 *
 * Recebe os segredos como lista para o chamador não precisar lembrar quais
 * são: quem envia passa token, instância e client-token, e o que sair daqui
 * está limpo dos três. Valor vazio ou indefinido é ignorado — `split("")`
 * quebraria a string caractere a caractere e destruiria o log.
 *
 * Substituição literal (`split`/`join`), nunca regex: token e instância são
 * dados externos e podem conter `.`, `+`, `$` — compilar isso como padrão
 * daria match errado ou lançaria.
 */
export function limparSegredos(
  texto: string,
  segredos: readonly (string | undefined)[],
): string {
  return segredos.reduce<string>(
    (acc, seg) => (seg && seg.length >= 4 ? acc.split(seg).join("<omitido>") : acc),
    texto,
  );
}

/**
 * "5571997359025" → "…9025".
 *
 * O log precisa distinguir UM destinatário de outro e confirmar que o número
 * chegou formado; não precisa do número inteiro. Telefone de assessor e de
 * cliente passam por aqui (os alertas de cadência 12-4-2 mandam com
 * `phoneOverride`), então o log completo seria dado pessoal em texto claro.
 *
 * Menos de 5 dígitos vira só asteriscos: nesse tamanho os "últimos 4" seriam
 * quase o número todo, e um valor tão curto já é sinal de entrada malformada.
 */
export function mascararTelefone(phone: string): string {
  if (!phone) return "<vazio>";
  if (phone.length < 5) return "*".repeat(phone.length);
  return `…${phone.slice(-4)}`;
}

/**
 * Quais chaves faltaram, pelo NOME, quando o guard de configuração barra o
 * envio. Nunca devolve valor de nada.
 *
 * O caso do telefone é o que justifica a função existir em vez de uma lista
 * fixa: `phone` vazio significa coisas diferentes conforme a origem. Sem
 * override, faltou a chave `DATACRAZY_ALERTS_PHONE`; COM override, a chave
 * pode estar perfeita e quem veio malformado foi o telefone do destinatário
 * — mandar o operador conferir a variável de ambiente nesse caso é mandá-lo
 * para o lugar errado.
 */
export function chavesFaltantes(args: {
  temToken: boolean;
  temInstancia: boolean;
  temTelefone: boolean;
  usouOverride: boolean;
}): string[] {
  const faltando: string[] = [];
  if (!args.temToken) faltando.push("DATACRAZY_INSTANCE_TOKEN");
  if (!args.temInstancia) faltando.push("DATACRAZY_ALERTS_INSTANCE");
  if (!args.temTelefone) {
    faltando.push(
      args.usouOverride
        ? "telefone do destinatário (veio vazio ou sem dígitos utilizáveis)"
        : "DATACRAZY_ALERTS_PHONE",
    );
  }
  return faltando;
}

/** Corta o corpo em `LIMITE_CORPO`, marcando que houve corte. */
export function truncarCorpo(corpo: string, limite: number = LIMITE_CORPO): string {
  if (!corpo) return "<corpo vazio>";
  const uma = corpo.replace(/\s+/g, " ").trim();
  if (!uma) return "<corpo vazio>";
  return uma.length <= limite ? uma : `${uma.slice(0, limite)}… <cortado>`;
}
