/**
 * Núcleo PURO do auto-encerramento (sem prisma / sem server-only).
 *
 * Isola a decisão que importa — a qual cliente uma reunião pertence — do IO
 * de ler o cache e gravar a sugestão. Assim é unit-testável.
 *
 * O casamento é feito EXCLUSIVAMENTE por identificador forte: e-mail,
 * telefone, CPF/CNPJ e número da conta. Semelhança de nome foi removida de
 * propósito. A versão anterior fazia `titulo.includes(nomeNormalizado)`, o
 * que produzia falso positivo real e silencioso:
 *
 *   cliente "Ana"  casava com a reunião "Reunião Semana"
 *   cliente "Lima" casava com a reunião "Preclimatização"
 *
 * Atribuir a reunião ao cliente errado é pior do que não atribuir a ninguém,
 * ainda mais numa base de ~480 contas onde nome curto é comum.
 */

import { chaveConta } from "@/lib/backoffice/conta";

/** Tamanhos mínimos: número curto demais colide com qualquer coisa. */
export const MIN_DIGITOS_TELEFONE = 8;
export const MIN_DIGITOS_DOCUMENTO = 11; // CPF = 11, CNPJ = 14
export const MIN_DIGITOS_CONTA = 4;

export type ClienteIdentificado = { id: string; nome: string };

/** Só os campos do ClienteBackoffice que valem como identificador forte. */
export type ClienteIdentificadores = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  cpfCnpj?: string | null;
  numeroConta?: string | null;
};

export function soDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

/**
 * Índice identificador → cliente.
 *
 * Duas salvaguardas:
 *
 *  - Conta que começa com "0" fica de fora. Zero à esquerda se perde em
 *    export de planilha, então "0012345" e "12345" viram o mesmo número e o
 *    casamento deixa de ser confiável.
 *  - Identificador que aponta para mais de um cliente é DESCARTADO, não
 *    resolvido por desempate. `ambiguos` conta quantos foram, para o caso
 *    ficar visível em vez de mudo.
 */
export function construirIndice(clientes: ClienteIdentificadores[]): {
  indice: Map<string, ClienteIdentificado>;
  ambiguos: number;
} {
  const indice = new Map<string, ClienteIdentificado>();
  const ambiguos = new Set<string>();

  const registrar = (chave: string, cli: ClienteIdentificado) => {
    if (ambiguos.has(chave)) return;
    const existente = indice.get(chave);
    if (existente && existente.id !== cli.id) {
      indice.delete(chave);
      ambiguos.add(chave);
      return;
    }
    indice.set(chave, cli);
  };

  for (const c of clientes) {
    const cli: ClienteIdentificado = { id: c.id, nome: c.nome };

    const email = c.email?.trim().toLowerCase();
    if (email && email.includes("@")) registrar(email, cli);

    const tel = c.telefone ? soDigitos(c.telefone) : "";
    if (tel.length >= MIN_DIGITOS_TELEFONE) registrar(tel, cli);

    const doc = c.cpfCnpj ? soDigitos(c.cpfCnpj) : "";
    if (doc.length >= MIN_DIGITOS_DOCUMENTO) registrar(doc, cli);

    // Zero à esquerda é formatação do BTG, não identidade: a mesma conta
    // aparece zero-padded a 9 no export de arquivo e sem zeros na API.
    // chaveConta colapsa "002485047", "02485047" e "2485047" no mesmo valor.
    //
    // A versão anterior descartava do índice qualquer conta começando com "0",
    // por medo de ambiguidade. O efeito era o oposto do pretendido: a forma
    // CANÔNICA de persistência é padStart(9,"0") (ver conta.ts e
    // api/backoffice/clientes/route.ts), então toda conta com menos de 9
    // dígitos significativos começa com zero — e ficava de fora. Sobravam só
    // as contas naturalmente de 9 dígitos.
    const conta = chaveConta(c.numeroConta);
    if (conta.length >= MIN_DIGITOS_CONTA) registrar(conta, cli);
  }

  return { indice, ambiguos: ambiguos.size };
}

/**
 * Sequências numéricas do texto, normalizadas para dígitos.
 * Aceita separadores usuais (ponto, hífen, barra, espaço) para ler
 * "012.345.678-90" e "71 99999-8888" como um número só.
 */
export function numerosDoTexto(texto: string): string[] {
  const brutos = texto.match(/\d[\d.\-/\s]*\d/g) ?? [];
  const vistos = new Set<string>();
  for (const b of brutos) {
    const d = soDigitos(b);
    if (d.length >= MIN_DIGITOS_CONTA) vistos.add(d);
  }
  return [...vistos];
}

/**
 * Casa um evento a um cliente por identificador forte, ou devolve null.
 *
 * Ordem: e-mail primeiro — vem do convite e é o mais confiável —, depois os
 * números que aparecerem no título.
 */
export function casarCliente(
  evento: { titulo: string; participantes?: string[] },
  indice: Map<string, ClienteIdentificado>,
): ClienteIdentificado | null {
  for (const p of evento.participantes ?? []) {
    const hit = indice.get(p.trim().toLowerCase());
    if (hit) return hit;
  }
  for (const numero of numerosDoTexto(evento.titulo)) {
    // Duas tentativas porque o índice guarda chaves de tipos diferentes:
    // telefone e CPF/CNPJ entram como dígitos crus, conta entra sem zeros à
    // esquerda. Sem a segunda, um título escrito "conta 002485047" não
    // acharia a conta indexada como "2485047" — e vice-versa.
    const hit = indice.get(numero) ?? indice.get(chaveConta(numero));
    if (hit) return hit;
  }
  return null;
}
