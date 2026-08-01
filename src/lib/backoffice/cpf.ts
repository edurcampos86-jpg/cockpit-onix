/**
 * Normalização e validação de CPF — PURA (sem server-only, sem prisma), para
 * ser usada tanto no server quanto num client component.
 *
 * Por que existe: o CPF de `Pessoa` (/time) não é dado cadastral decorativo —
 * é a chave que o Eduardo usa para cruzar uma pessoa com os relatórios do BTG.
 * Chave de cruzamento só funciona se as duas pontas estiverem no MESMO
 * formato, e hoje só uma ponta estava garantida:
 *
 *  - GRAVAÇÃO já era canônica: `criarPessoa`/`atualizarPessoa` chamam
 *    `digits()` antes de persistir (src/app/actions/time.ts), então o banco
 *    guarda 11 dígitos sem pontuação — o mesmo formato cru que o BTG exporta.
 *  - BUSCA não era: `listPessoas` fazia `cpf: { contains: busca }` com o texto
 *    literal (src/lib/team.ts). Quem digitasse "097.146.005-10" — exatamente o
 *    formato que o placeholder do formulário sugere — não encontrava ninguém,
 *    porque no banco está "09714600510". A busca falhava em silêncio: devolve
 *    "nenhuma pessoa encontrada", que é indistinguível de "essa pessoa não
 *    existe".
 *  - ENTRADA também não: o campo era texto puro, sem máscara e sem conferir os
 *    dígitos verificadores. Um dígito trocado passa direto, vira chave única no
 *    banco e nunca casa com o BTG — e ninguém descobre, porque um CPF errado é
 *    visualmente idêntico a um certo.
 *
 * Mesma forma do que já se fez para conta (./conta.ts) e telefone
 * (../integrations/telefone.ts): normalizar na entrada, comparar por chave,
 * formatar só na exibição.
 */

/**
 * Chave canônica para PERSISTIR e COMPARAR: só dígitos.
 *
 * Zeros à esquerda são preservados — em CPF eles são identidade, não
 * formatação (ao contrário de numeroConta, ./conta.ts). "09714600510" e
 * "9714600510" são documentos diferentes.
 */
export function chaveCpf(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D+/g, "");
}

/**
 * Dígitos verificadores (módulo 11) — o que separa "11 dígitos" de "um CPF".
 *
 * Rejeita também as sequências repetidas ("00000000000", "11111111111"), que
 * passam no cálculo por construção mas não são documentos válidos. Isso inclui
 * o "00000000000" usado como placeholder em prisma/seed.ts e nos scripts de
 * teste — de propósito: é justamente o valor que não deve virar chave de
 * cruzamento com o BTG.
 */
export function cpfValido(valor: string | null | undefined): boolean {
  const d = chaveCpf(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  for (const corte of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(d[corte])) return false;
  }
  return true;
}

/** "09714600510" → "097.146.005-10". Devolve a entrada intacta se não couber. */
export function formatarCpf(valor: string | null | undefined): string {
  const d = chaveCpf(valor);
  if (d.length !== 11) return valor ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Máscara PROGRESSIVA, para uso enquanto se digita.
 *
 * Diferente de `formatarCpf`, que só formata o documento completo: aqui cada
 * tecla precisa devolver algo coerente, senão o campo "trava" visualmente até
 * o 11º dígito.
 */
export function mascararCpf(valor: string | null | undefined): string {
  const d = chaveCpf(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
