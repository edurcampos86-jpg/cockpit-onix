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
 *
 * DEDUPE: quem já foi cobrado nas últimas `janelaHoras` é pulado. O risco real
 * não é esquecer de cobrar — é disparar duas vezes no mesmo dia, WhatsApp e
 * e-mail para o time inteiro, sem desfazer. `forcar: true` ignora a janela,
 * para o caso legítimo de reenviar depois de corrigir a mensagem.
 */

/** 3 dias: cobrar de novo antes disso é assédio, depois disso é acompanhamento. */
export const JANELA_LEMBRETE_HORAS = 72;

export type ResultadoLembrete = {
  pendentes: number;
  whatsappEnviados: number;
  emailsEnviados: number;
  slackEnviado: boolean;
  /** Quem não recebeu por nenhum canal — precisa de cutucada manual. */
  semCanal: string[];
  /** Pulados por já terem sido cobrados dentro da janela. */
  pulados: Array<{ nome: string; horasAtras: number; vezes: number }>;
};

export async function dispararLembreteCadastro(params: {
  /** Conta Google que assina os e-mails (quem dispara). */
  userIdRemetente: string;
  baseUrl: string;
  /** true = não envia nada, só relata o que sairia. */
  dryRun?: boolean;
  /** Ignora a janela de dedupe. Para reenvio deliberado. */
  forcar?: boolean;
}): Promise<ResultadoLembrete> {
  const ativos = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    select: {
      id: true,
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
    pulados: [],
  };

  const agora = Date.now();
  const logs = await prisma.lembreteCadastroLog.findMany({
    where: { pessoaId: { in: pendentes.map((x) => x.pessoa.id) } },
  });
  const logPorPessoa = new Map(logs.map((l) => [l.pessoaId, l]));

  for (const { pessoa, semTelefone, emailPessoal } of pendentes) {
    const log = logPorPessoa.get(pessoa.id);
    if (log && !params.forcar) {
      const horasAtras = (agora - log.enviadoEm.getTime()) / 36e5;
      if (horasAtras < JANELA_LEMBRETE_HORAS) {
        resultado.pulados.push({
          nome: pessoa.nomeCompleto,
          horasAtras: Math.round(horasAtras),
          vezes: log.vezes,
        });
        continue;
      }
    }

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

    if (!algumCanal) {
      resultado.semCanal.push(pessoa.nomeCompleto);
      continue;
    }

    // Só carimba disparo BEM-SUCEDIDO: se nada saiu, a próxima tentativa não
    // pode ser bloqueada pelo dedupe.
    if (!params.dryRun) {
      const canais = [
        pessoa.telefone ? "whatsapp" : null,
        pessoa.email ? "email" : null,
      ]
        .filter(Boolean)
        .join("+");
      const quais = [semTelefone && "telefone", emailPessoal && "email-pessoal"]
        .filter(Boolean)
        .join("+");
      await prisma.lembreteCadastroLog.upsert({
        where: { pessoaId: pessoa.id },
        create: {
          pessoaId: pessoa.id,
          enviadoEm: new Date(),
          canais,
          pendencias: quais,
        },
        update: {
          enviadoEm: new Date(),
          canais,
          pendencias: quais,
          vezes: { increment: 1 },
        },
      });
    }
  }

  // O placar leva o CONTADOR de cada um: é o que permite a escalação de quem
  // já foi cobrado LIMITE_COBRANCAS vezes sem resolver. `+1` para quem recebeu
  // agora, porque o upsert acima já incrementou no banco mas o log em memória é
  // o de antes do disparo.
  const textoSlack = resumoSlack(
    pendentes.map(({ pessoa, semTelefone, emailPessoal }) => {
      const log = logPorPessoa.get(pessoa.id);
      const jaTinha = log?.vezes ?? 0;
      const pulado = resultado.pulados.some((x) => x.nome === pessoa.nomeCompleto);
      const semCanal = resultado.semCanal.includes(pessoa.nomeCompleto);
      const incremento = params.dryRun || pulado || semCanal ? 0 : 1;
      return {
        nomeCompleto: pessoa.nomeCompleto,
        apelido: pessoa.apelido,
        semTelefone,
        emailPessoal,
        vezes: jaTinha + incremento,
      };
    }),
    params.baseUrl,
  );
  resultado.slackEnviado = params.dryRun ? true : await sendSlackMessage(textoSlack);

  return resultado;
}
