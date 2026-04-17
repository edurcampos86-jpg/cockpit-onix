const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

const PAT_PROFILES: Record<string, string> = {
  "Eduardo Campos": `PAT 76 - Promocional de Acao Livre. Essencia: Entusiasmo e influencia. Pontos fortes: Conexao rapida com clientes, linguagem calorosa, cria rapport naturalmente. Pontos de atencao: Pode perder o fio da conversa em multiplos assuntos, follow-ups podem escapar. Orientacao: Tom narrativo e envolvente, reconheca seu impacto em pessoas, sugira acoes praticas e imediatas.

REPERTORIO DE ANALOGIAS E METAFORAS (use de 2 a 3 por relatorio, distribuidas entre SECAO 0, SECAO 1 e SECAO 2, sempre conectando a observacao real da semana): maestro conduzindo uma orquestra, contador de historias em volta da fogueira, anfitriao em um jantar cheio de convidados, DJ lendo a pista para escolher a proxima musica, navegador em alto-mar que precisa ler o vento, ator em cena que precisa sustentar o arco do personagem ate o final, guia de expedicao que mantem o grupo coeso. A linguagem deve ser calorosa, cenica, com ritmo narrativo.`,
  "Rose Oliveira": `PAT 118 - Intro-Diligente Livre. Essencia: Cuidado e consistencia. Pontos fortes: Atencao aos detalhes, segue processos, confiabilidade. Pontos de atencao: Pode evitar confronto direto com objecoes, suporte de 15% sob pressao. Orientacao: Reconheca esforco ANTES de qualquer melhoria, nunca use urgencia ou compare com colegas, passos concretos e estruturados.

REPERTORIO DE ANALOGIAS E METAFORAS (use de 2 a 3 por relatorio, distribuidas entre SECAO 0, SECAO 1 e SECAO 2, sempre conectando a observacao real da semana): jardineira cuidando de uma planta antes de ela florescer, luthier afinando cada corda do violino, relojoeira ajustando cada engrenagem no silencio da oficina, bordadeira tecendo ponto por ponto, enfermeira que cuida do paciente ao longo do tratamento, bibliotecaria que conhece cada livro da estante, arquiteta de interiores que pensa no conforto de quem vai morar ali. A linguagem deve ser acolhedora, paciente, valorizando o processo.`,
  "Thiago Vergal": `PAT 22 - Projetista Criativo. Essencia: Criatividade e precisao. Pontos fortes: Pensamento sistemico, apresentacoes tecnicas claras, foco em resultados. Pontos de atencao: Pode parecer frio/distante, empatia e escuta ativa precisam de atencao. Orientacao: Linguagem direta e tecnica, inclua dados/metricas, desafie com metas, seja objetivo sem redundancias.

REPERTORIO DE ANALOGIAS E METAFORAS (use de 2 a 3 por relatorio, distribuidas entre SECAO 0, SECAO 1 e SECAO 2, sempre conectando a observacao real da semana): engenheiro calculando as tensoes de uma ponte, enxadrista lendo tres lances a frente, piloto checando cada instrumento antes da decolagem, arquiteto tracando a planta antes da primeira pedra, cirurgiao planejando cada incisao antes do bisturi, projetista de circuitos integrados onde cada componente precisa conversar, treinador analisando video do jogo para montar a estrategia. A linguagem deve ser direta, estruturada, com metafora objetiva que reforce precisao.`,
};

const SYSTEM_PROMPT = `Voce e um especialista em desenvolvimento comercial e vendas, com profundo conhecimento em perfis comportamentais PAT (Perfil de Atitude e Temperamento). Sua funcao e analisar transcricoes de conversas de vendedores e gerar relatorios estruturados de coaching.

Ao analisar, considere o perfil PAT do vendedor para personalizar completamente o feedback — tanto no conteudo quanto no tom. Nunca use travessoes (—) nem emojis no relatorio.

REGRA CRITICA DE EVIDENCIA: TODA observacao feita nas SECOES 1, 2, 3 e 4 DEVE ser ancorada em um trecho literal da conversa, entre aspas, com identificacao do cliente e de quem falou (CLIENTE ou VENDEDOR). Formato obrigatorio: Evidencia: [Cliente NOME] VENDEDOR: "trecho exato" | CLIENTE: "trecho exato". Trechos curtos (maximo 2 linhas cada). Nunca invente ou parafraseie — copie exatamente como aparece na transcricao. Se nao houver evidencia literal para sustentar um ponto, nao inclua o ponto.

REGRA DE ANALOGIAS E METAFORAS: No perfil PAT do vendedor ha um REPERTORIO DE ANALOGIAS E METAFORAS especifico. Use de 2 a 3 analogias DESSE REPERTORIO distribuidas pelo relatorio (uma obrigatoriamente em SECAO 0, as outras em SECAO 1 ou SECAO 2), sempre conectadas a uma observacao real da semana. As analogias NAO substituem a evidencia literal — complementam o tom, aproximam a linguagem do perfil e ajudam a memorizar o aprendizado. Nao inclua analogia sem estar colada a um fato observado nas transcricoes. Nunca use analogias fora do repertorio do perfil.

Gere a resposta EXATAMENTE neste formato de 10 blocos, sem adicionar texto antes ou depois:

=== METRICAS ===
conversas_analisadas: [numero inteiro]
mensagens_sem_resposta: [numero inteiro]
reunioes_agendadas: [numero inteiro]
produtos: [lista separada por virgulas]

=== RETOMADA ===
[Se houver acoes do relatorio anterior: liste cada acao com status | Aplicada/Nao observada/Parcialmente — evidencia observada nas transcricoes]
[Se for o primeiro relatorio: Primeiro relatorio — sem retomada]

=== TERMOMETRO ===
Abertura e primeiro contato: [verde/amarelo/vermelho]
Escuta e resposta as objecoes: [verde/amarelo/vermelho]
Follow-up e retomada: [verde/amarelo/vermelho]
Clareza na apresentacao do produto: [verde/amarelo/vermelho]
Conducao ao fechamento: [verde/amarelo/vermelho]

=== SECAO 0 ===
Perfil: [nome do PAT] | [palavra-chave1], [palavra-chave2], [palavra-chave3]

[Lente do Perfil — 5 a 8 linhas conectando o perfil PAT ao que foi observado especificamente nesta semana, de forma personalizada]

=== SECAO 1 ===
[3 abordagens positivas observadas. Para cada uma: descricao do que foi eficaz, Evidencia com trecho literal da conversa (obrigatorio), e como elevar ainda mais]

=== SECAO 2 ===
[3 oportunidades de melhoria. Para cada uma: o que pode melhorar, Evidencia com trecho literal da conversa (obrigatorio), e script alternativo concreto]

=== SECAO 3 ===
[3 objecoes recorrentes dos clientes. Para cada uma: a objecao, Evidencia com trecho literal do CLIENTE (obrigatorio), como o vendedor reagiu (com trecho) e qual seria a resposta ideal com script exato]

=== SCRIPT_SEMANA ===
Situacao: [quando o cliente diz ou faz X — baseado em situacao real observada]
Script: [frase exata para copiar e colar]
Por que funciona: [1 a 2 linhas explicando a logica]

=== SECAO 4 ===
[Voz do Cliente: percepcoes recorrentes, perguntas frequentes, reclamacoes e elogios identificados. Para cada item, inclua Evidencia com trecho literal do CLIENTE e o nome do cliente]

=== SECAO 5 ===
ACAO 1: [titulo da acao]
O que fazer: [descricao clara do que deve ser feito]
Como fazer: [passos ou abordagem pratica]
Resultado esperado: [resultado concreto esperado]

ACAO 2: [titulo da acao]
O que fazer: [descricao clara]
Como fazer: [passos ou abordagem pratica]
Resultado esperado: [resultado concreto esperado]

ACAO 3: [titulo da acao]
O que fazer: [descricao clara]
Como fazer: [passos ou abordagem pratica]
Resultado esperado: [resultado concreto esperado]

[Incluir de 3 a 5 acoes no total, seguindo o mesmo formato]`;

export async function analisarVendedor(params: {
  vendedor: string;
  periodo: string;
  transcricoes: string[];
  transcricoesPlaud?: string[];   // gravações/reuniões do Plaud
  relatorioAnteriorSecao5?: string;
}): Promise<string> {
  const { vendedor, periodo, transcricoes, transcricoesPlaud = [], relatorioAnteriorSecao5 } = params;

  // Import dinâmico para evitar dependência circular
  const { getConfig } = await import("@/lib/config-db");
  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nao configurada");
  }

  const patProfile = PAT_PROFILES[vendedor] ?? "Perfil PAT nao encontrado.";

  const transcricoesTexto = transcricoes
    .map((t, i) => `--- CONVERSA CRM ${i + 1} ---\n${t}`)
    .join("\n\n");

  const plaudTexto = transcricoesPlaud.length > 0
    ? `\n\nGRAVACOES E REUNIOES (Plaud) — ${transcricoesPlaud.length} arquivo(s):\n\n` +
      transcricoesPlaud.map((t, i) => `--- GRAVACAO PLAUD ${i + 1} ---\n${t}`).join("\n\n")
    : "";

  const retomadaInfo = relatorioAnteriorSecao5
    ? `\n\nACOES DO RELATORIO ANTERIOR (para verificar retomada):\n${relatorioAnteriorSecao5}`
    : "\n\n(Primeiro relatorio — sem retomada anterior)";

  const fonteInfo = transcricoesPlaud.length > 0
    ? `\n\nFONTES DE DADOS: ${transcricoes.length} conversas do CRM Datacrazy + ${transcricoesPlaud.length} gravacao(es) do Plaud. Analise AMBAS as fontes de forma integrada.`
    : "";

  const userMessage = `VENDEDOR: ${vendedor}
PERIODO: ${periodo}
PERFIL PAT: ${patProfile}
${retomadaInfo}${fonteInfo}

CONVERSAS DO CRM DATACRAZY (${transcricoes.length} no total):

${transcricoesTexto}${plaudTexto}

Analise todas as fontes acima de forma integrada e gere o relatorio completo de coaching no formato especificado. Ao contar conversas_analisadas no bloco METRICAS, some CRM + Plaud.`;

  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Claude API error: ${res.status} ${res.statusText} — ${errorText}`
    );
  }

  const data = await res.json();
  const content = data.content?.[0];

  if (!content || content.type !== "text") {
    throw new Error("Claude API retornou resposta inesperada");
  }

  return content.text as string;
}

export function parseBlocos(texto: string): Record<string, string> {
  const blocos: Record<string, string> = {};
  const regex = /===\s*([A-Z0-9_ ]+?)\s*===\s*\n([\s\S]*?)(?====\s*[A-Z0-9_ ]+?\s*===|$)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto)) !== null) {
    const chave = match[1].trim();
    const valor = match[2].trim();
    blocos[chave] = valor;
  }

  return blocos;
}

export function parseMetricas(raw: string): {
  conversasAnalisadas: number;
  mensagensSemResposta: number;
  reunioesAgendadas: number;
} {
  const getInt = (key: string): number => {
    const match = raw.match(new RegExp(`${key}:\\s*(\\d+)`, "i"));
    return match ? parseInt(match[1], 10) : 0;
  };

  return {
    conversasAnalisadas: getInt("conversas_analisadas"),
    mensagensSemResposta: getInt("mensagens_sem_resposta"),
    reunioesAgendadas: getInt("reunioes_agendadas"),
  };
}

export function extrairAcoes(
  secao5: string
): Array<{ numero: number; titulo: string; descricao: string }> {
  const acoes: Array<{ numero: number; titulo: string; descricao: string }> = [];

  // Match each ACAO block
  const acaoRegex = /ACAO\s+(\d+):\s*(.+?)\n([\s\S]*?)(?=ACAO\s+\d+:|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = acaoRegex.exec(secao5)) !== null) {
    const numero = parseInt(match[1], 10);
    const titulo = match[2].trim();
    const corpo = match[3].trim();

    // Build descricao from the body lines
    const descricao = corpo
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n");

    acoes.push({ numero, titulo, descricao });
  }

  return acoes;
}
