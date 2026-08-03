import "server-only";
import { prisma } from "./prisma";
import { pendenciasDe } from "./pendencias-cadastro";
import { sendSlackMessage } from "./integrations/slack";
import { sendWhatsappMessage } from "./integrations/datacrazy-send";
import { enviarEmail } from "./integrations/gmail-send";
import {
  assuntoEmail,
  mensagemPessoal,
  resumoSlack,
  type PendenciaPessoa,
} from "./lembrete-cadastro-core";

/**
 * Dispara o lembrete de cadastro pendente nos TRÊS canais de uma vez.
 *
 * A divisão de papéis não é simetria por simetria:
 *
 *  - WHATSAPP e E-MAIL vão para a PESSOA que tem a pendência — é cobrança
 *    individual, e cada um recebe só o que falta para si.
 *  - SLACK vai para o canal, com o PLACAR — é acompanhamento de quem conduz o
 *    saneamento. Repetir N mensagens individuais ali só faria ruído.
 *
 * O paradoxo que motiva os três canais: quem está sem telefone é exatamente
 * quem NÃO pode ser avisado por WhatsApp. O e-mail cobre esses; o WhatsApp
 * cobre quem tem número mas está com e-mail pessoal; o Slack garante que o
 * Eduardo veja o placar mesmo se os dois primeiros falharem.
 *
 * Cada envio é isolado: canal indisponível não derruba os outros, e o retorno
 * diz exatamente o que saiu. Silêncio de um canal nunca é reportado como
 * sucesso.
 */

export type ResultadoLembrete = {
  pendentes: number;
  whatsappEnviados: number;
  emailsEnviados: number;
  slackEnviado: boolean;
  /** Quem não recebeu por nenhum canal — precisa de cutucada manual. */
  semCanal: string[];
};

export async function dispararLembreteCadastro(params: {
  /** Conta Google que assina os e-mails (quem dispara). */
  userIdRemetente: string;
  baseUrl: string;
  /** true = não envia nada, só relata o que sairia. */
  dryRun?: boolean;
}): Promise<ResultadoLembrete> {
  const ativos = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    select: {
      nomeCompleto: true,
      apelido: true,
      status: true,
      cargoFamilia: true,
      codigoAssessorBtg: true,
      telefone: true,
      email: true,
    },
  });

  // Só telefone e e-mail entram no lembrete. "Sem código BTG" fica de fora de
  // propósito: quem resolve isso é o admin, não a pessoa — cobrar dela um
  // campo que ela não pode editar é ruído garantido.
  const pendentes = ativos
    .map((p) => {
      const d = pendenciasDe(p);
      return { pessoa: p, semTelefone: d.semTelefone, emailPessoal: d.emailPessoal };
    })
    .filter((x) => x.semTelefone || x.emailPessoal);

  const resultado: ResultadoLembrete = {
    pendentes: pendentes.length,
    whatsappEnviados: 0,
    emailsEnviados: 0,
    slackEnviado: false,
    semCanal: [],
  };

  for (const { pessoa, semTelefone, emailPessoal } of pendentes) {
    const dados: PendenciaPessoa = {
      nomeCompleto: pessoa.nomeCompleto,
      apelido: pessoa.apelido,
      semTelefone,
      emailPessoal,
    };
    const corpo = mensagemPessoal(dados, params.baseUrl);
    let algumCanal = false;

    // WhatsApp só para quem TEM número — quem não tem é justamente o alvo
    // principal do lembrete, e cai no e-mail.
    if (pessoa.telefone) {
      const ok = params.dryRun ? true : await sendWhatsappMessage(pessoa.telefone, corpo);
      if (ok) {
        resultado.whatsappEnviados++;
        algumCanal = true;
      }
    }

    if (pessoa.email) {
      const ok = params.dryRun
        ? true
        : await enviarEmail({
            userId: params.userIdRemetente,
            para: pessoa.email,
            assunto: assuntoEmail(dados),
            corpo,
          });
      if (ok) {
        resultado.emailsEnviados++;
        algumCanal = true;
      }
    }

    if (!algumCanal) resultado.semCanal.push(pessoa.nomeCompleto);
  }

  const textoSlack = resumoSlack(
    pendentes.map(({ pessoa, semTelefone, emailPessoal }) => ({
      nomeCompleto: pessoa.nomeCompleto,
      apelido: pessoa.apelido,
      semTelefone,
      emailPessoal,
    })),
    params.baseUrl,
  );
  resultado.slackEnviado = params.dryRun ? true : await sendSlackMessage(textoSlack);

  return resultado;
}
