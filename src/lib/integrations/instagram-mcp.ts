/**
 * Instagram MCP Integration via Proxy
 *
 * Coleta métricas do Instagram via proxy HTTP que acessa o MCP do Instagram.
 * O proxy roda no ambiente Manus e expõe os dados via API REST segura.
 *
 * Analogia: É como o "extrato bancário" do seu portfólio de conteúdo.
 * Assim como um extrato mostra cada transação com data, valor e categoria,
 * este módulo coleta cada post com suas métricas e classifica por pilar editorial.
 */

export interface InstagramPostRaw {
  id: string
  type: 'VIDEO' | 'CAROUSEL_ALBUM' | 'IMAGE'
  caption?: string
  permalink?: string
  likes: number
  comments: number
  publishedAt: string
}

export interface InstagramPostInsights {
  shares: number
  comments: number
  likes: number
  saved: number
  totalInteractions: number
  reach: number
  views: number
}

export interface InstagramPostClassified extends InstagramPostRaw {
  insights: InstagramPostInsights
  pilar: 'P1' | 'P2' | 'P3' | 'P4' | null
  formato: 'reel' | 'carrossel' | 'imagem' | 'stories' | null
  ctaType: 'explicito' | 'implicito' | 'identificacao' | 'algoritmo' | null
  engagementRate: number
  saveRate: number
}

export interface AccountInfo {
  username: string
  name: string
  followers: number
  following: number
  posts: number
}

// Configuração do proxy
const PROXY_BASE_URL = process.env.INSTAGRAM_MCP_PROXY_URL || 'https://7890-iy7vpn8nxm398b0aib1c8-eb987d40.sg1.manus.computer'
const PROXY_TOKEN = process.env.INSTAGRAM_MCP_PROXY_TOKEN || 'cockpit-onix-mcp-proxy-2026'

/**
 * Faz uma requisição autenticada ao proxy do Instagram MCP
 */
async function proxyFetch(path: string): Promise<unknown> {
  const url = `${PROXY_BASE_URL}${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PROXY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    // Timeout de 30 segundos
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Proxy retornou ${res.status}: ${text}`)
  }

  return res.json()
}

/**
 * Classifica o pilar editorial com base na caption do post
 * P1 = Blindagem Patrimonial (educativo técnico)
 * P2 = Casos Reais / Onix em Ação
 * P3 = Cenário e Alertas (ITCMD, previdência, etc.)
 * P4 = Eduardo Pessoa (TBT, viagens, bastidores)
 */
function classificarPilar(caption: string): 'P1' | 'P2' | 'P3' | 'P4' | null {
  if (!caption) return null
  const lower = caption.toLowerCase()

  // P4: Eduardo Pessoa (TBT, viagens, bastidores)
  if (/\btbt\b|throwback|viagem|bastidores|aniversário|cassino|áfrica|capadócia|sun city|palace|lost city|prêmio|liberdade|planejei|conquist/.test(lower)) {
    return 'P4'
  }

  // P2: Casos Reais / Onix em Ação
  if (/onix em ação|onix na prática|caso real|médico que|hemorragia financeira|cirurgião|estancando|sangria|episódio/.test(lower)) {
    return 'P2'
  }

  // P3: Cenário e Alertas
  if (/itcmd|imposto sobre|alerta|previdência|pgbl|vgbl|reforma|tributar|governo|lei |projeto de lei|regulament|cvm|anbima|selic|inflação|ipca/.test(lower)) {
    return 'P3'
  }

  // P1: Blindagem Patrimonial (padrão para conteúdo técnico)
  if (/blindagem|patrimônio|planejamento|sucessão|holding|proteção|inventário|testamento|doação|usufruto|offshore|trust|previdência privada|seguro de vida/.test(lower)) {
    return 'P1'
  }

  return null
}

/**
 * Classifica o formato do post
 */
function classificarFormato(type: string): 'reel' | 'carrossel' | 'imagem' | 'stories' | null {
  switch (type) {
    case 'VIDEO': return 'reel'
    case 'CAROUSEL_ALBUM': return 'carrossel'
    case 'IMAGE': return 'imagem'
    default: return null
  }
}

/**
 * Classifica o tipo de CTA com base na caption
 */
function classificarCTA(caption: string): 'explicito' | 'implicito' | 'identificacao' | 'algoritmo' | null {
  if (!caption) return null
  const lower = caption.toLowerCase()

  // CTA explícito: "comente X", "salve", "compartilhe", "mande mensagem"
  if (/comente[^.]*\"|salve este|compartilhe|mande mensagem|me chama no direct|clique no link|acesse o link|link na bio/.test(lower)) {
    return 'explicito'
  }

  // CTA de identificação: "você se identifica?", "isso acontece com você?"
  if (/você se identifica|isso acontece|você também|já passou por|se você é|para quem/.test(lower)) {
    return 'identificacao'
  }

  // CTA de algoritmo: "marque alguém", "salva pra não perder"
  if (/marque alguém|marca alguém|salva pra|salve para não|manda pra|passa pra frente/.test(lower)) {
    return 'algoritmo'
  }

  // CTA implícito: pergunta no final, reflexão
  if (/\?$|\? $|me conta|o que você acha|qual a sua|você sabia/.test(lower)) {
    return 'implicito'
  }

  return null
}

/**
 * Busca informações da conta do Instagram
 */
export async function getAccountInfo(): Promise<AccountInfo> {
  const data = await proxyFetch('/account') as AccountInfo
  return data
}

/**
 * Coleta posts da semana com insights e classificação
 */
export async function collectWeeklyPosts(
  weekStart: Date,
  weekEnd: Date
): Promise<InstagramPostClassified[]> {
  // Buscar posts recentes (últimos 30 para garantir cobertura da semana)
  const data = await proxyFetch('/posts?limit=30') as { posts: InstagramPostRaw[]; nextCursor?: string }
  const rawPosts = data.posts || []

  // Filtrar posts do período
  const weekPosts = rawPosts.filter(post => {
    const publishedAt = new Date(post.publishedAt)
    return publishedAt >= weekStart && publishedAt <= weekEnd
  })

  // Se não houver posts no período exato, usar os últimos 7 posts como fallback
  const postsToAnalyze = weekPosts.length > 0 ? weekPosts : rawPosts.slice(0, 7)

  // Coletar insights para cada post
  const classifiedPosts: InstagramPostClassified[] = []

  for (const post of postsToAnalyze) {
    let insights: InstagramPostInsights = {
      shares: 0,
      comments: post.comments,
      likes: post.likes,
      saved: 0,
      totalInteractions: post.likes + post.comments,
      reach: 0,
      views: 0,
    }

    try {
      const insightsData = await proxyFetch(`/posts/${post.id}/insights`) as InstagramPostInsights
      insights = insightsData
    } catch (err) {
      console.warn(`Não foi possível coletar insights para post ${post.id}:`, err)
    }

    // Calcular métricas derivadas
    const totalEngagements = insights.likes + insights.comments + insights.shares + insights.saved
    const engagementRate = insights.reach > 0
      ? (totalEngagements / insights.reach) * 100
      : 0
    const saveRate = insights.reach > 0
      ? (insights.saved / insights.reach) * 100
      : 0

    classifiedPosts.push({
      ...post,
      insights,
      pilar: classificarPilar(post.caption || ''),
      formato: classificarFormato(post.type),
      ctaType: classificarCTA(post.caption || ''),
      engagementRate: Math.round(engagementRate * 100) / 100,
      saveRate: Math.round(saveRate * 100) / 100,
    })
  }

  return classifiedPosts
}
