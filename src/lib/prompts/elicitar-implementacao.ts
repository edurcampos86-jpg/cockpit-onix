import type {
  SinaisTecnicos,
  TrocaElicitacao,
} from "./montar-prompt-entrega";

export const MAX_PERGUNTAS = 6;
export const MAX_RESPOSTA_CHARS = 4_000;

export type PerguntaComplementar = {
  id: string;
  pergunta: string;
  ajuda: string | null;
  obrigatoria: boolean;
};

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Valida e limita o que volta do navegador antes de entrar no prompt ou no banco. */
export function normalizarRespostas(v: unknown): TrocaElicitacao[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_PERGUNTAS)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const pergunta = texto(raw.pergunta, 300);
      const resposta = texto(raw.resposta, MAX_RESPOSTA_CHARS);
      return pergunta && resposta ? { pergunta, resposta } : null;
    })
    .filter((item): item is TrocaElicitacao => item !== null);
}

/**
 * As perguntas cobrem decisão, fluxo,
 * dados, critério de aceite e referência visual sem repetir o Golden Circle.
 */
export function perguntasFallback(temAnexos: boolean): PerguntaComplementar[] {
  const perguntas: PerguntaComplementar[] = [
    {
      id: "usuarios_fluxo",
      pergunta:
        "Quem vai usar essa melhoria e em qual momento exato da rotina ela entra?",
      ajuda: "Cite os papéis envolvidos e o que acontece imediatamente antes e depois.",
      obrigatoria: true,
    },
    {
      id: "resultado",
      pergunta: "Qual resultado concreto deve aparecer para o usuário no final?",
      ajuda: "Descreva a saída visível, não apenas a funcionalidade interna.",
      obrigatoria: true,
    },
    {
      id: "regras_dados",
      pergunta: "Quais dados, regras ou permissões essa solução precisa respeitar?",
      ajuda: "Inclua quem pode ver ou editar e de onde os dados vêm.",
      obrigatoria: true,
    },
    {
      id: "limites",
      pergunta: "O que precisa ficar fora desta primeira entrega?",
      ajuda: "Liste limites para evitar que a implementação cresça além do necessário.",
      obrigatoria: false,
    },
    {
      id: "aceite",
      pergunta: "Como você saberá, na prática, que a entrega ficou pronta e correta?",
      ajuda: "Dê de um a três critérios de aceite observáveis.",
      obrigatoria: true,
    },
  ];

  if (temAnexos) {
    perguntas.splice(3, 0, {
      id: "anexos",
      pergunta: "O que nos anexos deve ser mantido e o que precisa mudar?",
      ajuda: "Aponte elementos visuais, textos ou comportamentos importantes.",
      obrigatoria: false,
    });
  }
  return perguntas.slice(0, MAX_PERGUNTAS);
}

/** Sinais conservadores para o prompt final, sem inventar certeza. */
export function inferirSinaisFallback(conteudo: string): SinaisTecnicos {
  const t = conteudo.toLocaleLowerCase("pt-BR");
  const mexeMigration = /migration|migrar|coluna|tabela|schema|banco de dados/.test(t);
  const mexeRbac = /permiss|rbac|papel|acesso|admin|lideran/.test(t);
  const mexeUpload = /upload|anexo|arquivo|pdf|imagem|backblaze|b2/.test(t);
  const mexeIa = /\bia\b|inteligência artificial|claude|anthropic|prompt|modelo/.test(t);
  const soUi =
    /interface|tela|página|botão|modal|layout|ux|ui|responsiv/.test(t) &&
    !mexeMigration &&
    !mexeRbac &&
    !mexeUpload &&
    !mexeIa;

  return {
    mexeSchema: mexeMigration,
    mexeMigration,
    mexeRbac,
    mexeUpload,
    mexeIa,
    soUi,
    multiplasFrentes:
      [mexeMigration, mexeRbac, mexeUpload, mexeIa, soUi].filter(Boolean).length > 1,
  };
}
