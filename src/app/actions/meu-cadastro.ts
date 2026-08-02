"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { uploadContrato } from "@/lib/b2/upload";
import { chaveFotoPessoa } from "@/lib/time-foto";

/**
 * Self-service do próprio cadastro — o ÚNICO caminho de escrita do /time aberto
 * a quem não é admin.
 *
 * Por que existe: 17 das 19 pessoas ativas estão sem telefone, e telefone
 * deixou de ser dado cadastral quando virou o canal dos alertas de risco de
 * evasão (#268). Todo o resto do /time é `requireAdmin()`, então "cada um
 * preenche o seu" era literalmente impossível: só o Eduardo conseguia editar,
 * e ele teria de coletar 17 números um a um.
 *
 * O escopo é deliberadamente mínimo, porque é uma superfície nova:
 *
 *  - UM campo. Só `telefone`. Nada de cargo, e-mail, CPF ou hierarquia — os
 *    campos que definem acesso e identidade seguem só com admin.
 *  - A PRÓPRIA pessoa, sempre. O alvo do update sai de `ctx.pessoa.id`, que vem
 *    da sessão. Nada de id no formulário: sem id vindo do cliente não há como
 *    editar a ficha de outra pessoa, nem por engano nem de propósito.
 *  - Sem apagar. Limpar o telefone desliga o alerta de alguém em silêncio; para
 *    isso, admin. Aqui só se troca por outro número válido.
 *
 * A foto entrou depois pela mesma porta e com os mesmos limites: é o outro dado
 * que só a própria pessoa tem à mão, e não define acesso nem identidade.
 */

export type MeuCadastroResult = { ok: true } | { ok: false; error: string };

export async function atualizarMeuTelefone(
  formData: FormData,
): Promise<MeuCadastroResult> {
  // getAuthContext já redireciona para /login quando não há sessão.
  const ctx = await getAuthContext();

  // User sem Pessoa é caso real (usuário "support" técnico, ver auth-helpers):
  // não há ficha própria para editar.
  if (!ctx.pessoa) {
    return { ok: false, error: "Seu login não está vinculado a uma ficha do time" };
  }

  const bruto = typeof formData.get("telefone") === "string"
    ? String(formData.get("telefone")).trim()
    : "";
  const digitos = bruto.replace(/\D+/g, "");

  if (!digitos) {
    return { ok: false, error: "Informe o telefone — para remover, fale com o admin" };
  }
  // 10 = fixo com DDD, 11 = celular com DDD. Mesma régua do aviso do
  // TelefoneField, para a tela e o servidor não discordarem.
  if (digitos.length < 10 || digitos.length > 11) {
    return { ok: false, error: "Telefone incompleto — DDD + número (10 ou 11 dígitos)" };
  }

  await prisma.pessoa.update({
    // Da SESSÃO, nunca do formulário.
    where: { id: ctx.pessoa.id },
    // Guarda o valor mascarado, igual ao que updatePessoa grava — as duas
    // portas de escrita não podem produzir formatos diferentes. A normalização
    // para a Z-API acontece no envio (integrations/telefone.ts).
    data: { telefone: bruto },
  });

  revalidatePath("/time");
  revalidatePath(`/time/${ctx.pessoa.id}`);
  return { ok: true };
}


/* ──────────────────────────────────────────────────────────────────────────
   FOTO
   ────────────────────────────────────────────────────────────────────────── */

const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Troca a foto da PRÓPRIA ficha.
 *
 * Mesmas três travas do telefone: um campo, a própria pessoa (id da sessão,
 * nunca do formulário) e sem apagar.
 *
 * A chave no B2 é DERIVADA do id da pessoa (ver ../../lib/time-foto), não
 * sorteada e não vinda do cliente: assim não há como escrever por cima da foto
 * de outra pessoa, e trocar a foto sobrescreve a anterior em vez de acumular
 * lixo no bucket.
 *
 * `fotoUrl` guarda o caminho da rota que serve a imagem, com `?v=` para furar
 * o cache do browser — sem isso, quem troca a foto continua vendo a antiga.
 */
export async function atualizarMinhaFoto(
  formData: FormData,
): Promise<MeuCadastroResult> {
  const ctx = await getAuthContext();
  if (!ctx.pessoa) {
    return { ok: false, error: "Seu login não está vinculado a uma ficha do time" };
  }

  const arquivo = formData.get("foto");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, error: "Escolha uma imagem" };
  }
  if (!TIPOS_IMAGEM.includes(arquivo.type)) {
    return { ok: false, error: "Formato não aceito — use JPG, PNG ou WEBP" };
  }
  if (arquivo.size > MAX_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `Imagem de ${mb} MB — o limite é 2 MB` };
  }

  const body = Buffer.from(await arquivo.arrayBuffer());
  await uploadContrato({
    key: chaveFotoPessoa(ctx.pessoa.id),
    body,
    contentType: arquivo.type,
    metadata: { pessoaId: ctx.pessoa.id },
  });

  await prisma.pessoa.update({
    where: { id: ctx.pessoa.id },
    data: { fotoUrl: `/api/time/${ctx.pessoa.id}/foto?v=${Date.now()}` },
  });

  revalidatePath("/time");
  revalidatePath(`/time/${ctx.pessoa.id}`);
  return { ok: true };
}
