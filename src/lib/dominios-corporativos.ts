/**
 * Domínios corporativos do grupo Onix — PURO (sem server-only, sem prisma),
 * para poder ser importado por client component.
 *
 * Por que existe: `Pessoa.email` é `@unique` e é o vínculo com o login
 * (`Pessoa.userId` → `User`). Ou seja, é identidade, não campo de contato. E
 * hoje 3 das 20 pessoas versionadas em recover-team-data.ts usam @gmail.com
 * nesse campo.
 *
 * O problema de conta pessoal como identidade tem três lados, todos concretos:
 *
 *  1. Não se revoga. Quando alguém sai, o e-mail corporativo é desligado pelo
 *     admin do domínio; o Gmail continua funcionando, e continua sendo a chave
 *     de login e de recuperação de senha no Cockpit.
 *  2. Não cruza com nada. Os relatórios do BTG trazem `E-mail Assessor` sempre
 *     no domínio corporativo — conta pessoal nunca vai casar.
 *  3. Não identifica a empresa. Três domínios distintos convivem no grupo
 *     (capital, imobiliária, corretora) e o domínio é o que diz de qual braço
 *     a pessoa é.
 *
 * A lista é constante em código, não Config: mudar domínio corporativo é
 * evento raro e estrutural (envolve DNS, e-mail, contrato). Se um dia virar
 * rotina, migra para Config sem mudar a assinatura das funções.
 */

/** Domínios em uso hoje pelo grupo (todos verificados em produção). */
export const DOMINIOS_CORPORATIVOS = [
  "onixcapital.com.br",
  "oniximob.com",
  "onxcorretora.com.br",
] as const;

/** Domínio de um e-mail, em minúsculas. "" se não houver "@". */
export function dominioDoEmail(email: string | null | undefined): string {
  const t = (email ?? "").trim().toLowerCase();
  const at = t.lastIndexOf("@");
  if (at < 0) return "";
  return t.slice(at + 1);
}

/**
 * O e-mail é de um domínio do grupo?
 *
 * Aceita subdomínio (`@ti.onixcapital.com.br`) porque continua sendo um
 * domínio que a empresa controla e revoga. Não aceita sufixo colado
 * (`@fakeonixcapital.com.br`), que é de outro dono — daí a checagem do ponto.
 */
export function isEmailCorporativo(email: string | null | undefined): boolean {
  const d = dominioDoEmail(email);
  if (!d) return false;
  return DOMINIOS_CORPORATIVOS.some((c) => d === c || d.endsWith(`.${c}`));
}

/** Para mensagem de erro e placeholder: "onixcapital.com.br, oniximob.com ou onxcorretora.com.br". */
export function listaDominiosCorporativos(): string {
  const d = [...DOMINIOS_CORPORATIVOS];
  const ultimo = d.pop();
  return `${d.join(", ")} ou ${ultimo}`;
}
