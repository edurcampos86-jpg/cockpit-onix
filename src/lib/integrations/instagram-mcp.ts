/**
 * Instagram MCP Integration
 * 
 * Coleta métricas do Instagram via MCP (Manus Connector Protocol)
 * e classifica posts por pilar, formato e tipo de CTA.
 * 
 * Analogia: É como o "extrato bancário" do seu portfólio de conteúdo.
 * Assim como um extrato mostra cada transação com data, valor e categoria,
 * este módulo coleta cada post com suas métricas e classifica por pilar editorial.
 */

import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

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

/**
 * Executa uma chamada ao MCP do Instagram
 */
function callInstagramMCP(tool: string, input: Record<string, unknown>): string {
  const inputJson = JSON.stringify(input)
  const result = execSync(
    `manus-mcp-cli tool call ${tool} --server instagram --input '${inputJson}'`,
    { encoding: 'utf-8', timeout: 30000 }
  )
  
  // Encontrar o arquivo de resultado mais recente
  const resultDir = '/tmp/manus-mcp'
  const files = fs.readdirSync(resultDir)
    .filter(f => f.startsWith('mcp_result_') && f.endsWith('.json'))
    .map(f => ({ name: f, time: fs.statSync(path.join(resultDir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time)
  
  if (files.length === 0) throw new Error('Nenhum resultado MCP encontrado')
  
  const content = fs.readFileSync(path.join(resultDir, files[0].name), 'utf-8')
  return content
}

/**
 * Obtém informações da conta do Instagram
 */
export async function getAccountInfo(): Promise<AccountInfo> {
  const raw = callInstagramMCP('get_account_info', {})
  
  // Parse do resultado em texto
  const followersMatch = raw.match(/Followers:\s*(\d+)/)
  const followingMatch = raw.match(/Following:\s*(\d+)/)
  const postsMatch = raw.match(/Posts:\s*(\d+)/)
  const usernameMatch = raw.match(/Username:\s*@?(\S+)/)
  const nameMatch = raw.match(/Name:\s*(.+)/)
  
  return {
    username: usernameMatch?.[1] || '',
    name: nameMatch?.[1]?.trim() || '',
    followers: parseInt(followersMatch?.[1] || '0'),
    following: parseInt(followingMatch?.[1] || '0'),
    posts: parseInt(postsMatch?.[1] || '0'),
  }
}

/**
 * Obtém lista de posts do Instagram
 */
export async function getPostList(limit: number = 20, cursor?: string): Promise<{
  posts: InstagramPostRaw[]
  nextCursor?: string
}> {
  const input: Record<string, unknown> = { limit }
  if (cursor) input.cursor = cursor
  
  const raw = callInstagramMCP('get_post_list', input)
  
  const posts: InstagramPostRaw[] = []
  const postBlocks = raw.split('--- Post').filter(b => b.trim().length > 0 && b.includes('ID:'))
  
  for (const block of postBlocks) {
    const idMatch = block.match(/ID:\s*(\d+)/)
    const typeMatch = block.match(/Type:\s*(\S+)/)
    const captionMatch = block.match(/Caption:\s*([\s\S]*?)(?=\nLink:|$)/)
    const linkMatch = block.match(/Link:\s*(\S+)/)
    const likesMatch = block.match(/Likes:\s*(\d+)/)
    const commentsMatch = block.match(/Comments:\s*(\d+)/)
    const postedMatch = block.match(/Posted:\s*(\S+)/)
    
    if (idMatch) {
      posts.push({
        id: idMatch[1],
        type: (typeMatch?.[1] || 'IMAGE') as InstagramPostRaw['type'],
        caption: captionMatch?.[1]?.trim(),
        permalink: linkMatch?.[1],
        likes: parseInt(likesMatch?.[1] || '0'),
        comments: parseInt(commentsMatch?.[1] || '0'),
        publishedAt: postedMatch?.[1] || new Date().toISOString(),
      })
    }
  }
  
  const cursorMatch = raw.match(/next page cursor to fetch the next page:\s*(\S+)/)
  
  return {
    posts,
    nextCursor: cursorMatch?.[1],
  }
}

/**
 * Obtém insights de um post específico
 */
export async function getPostInsights(postId: string): Promise<InstagramPostInsights> {
  const raw = callInstagramMCP('get_post_insights', { post_id: postId })
  
  const sharesMatch = raw.match(/shares:\s*(\d+)/)
  const commentsMatch = raw.match(/comments:\s*(\d+)/)
  const likesMatch = raw.match(/likes:\s*(\d+)/)
  const savedMatch = raw.match(/saved:\s*(\d+)/)
  const totalMatch = raw.match(/total_interactions:\s*(\d+)/)
  const reachMatch = raw.match(/reach:\s*(\d+)/)
  const viewsMatch = raw.match(/views:\s*(\d+)/)
  
  return {
    shares: parseInt(sharesMatch?.[1] || '0'),
    comments: parseInt(commentsMatch?.[1] || '0'),
    likes: parseInt(likesMatch?.[1] || '0'),
    saved: parseInt(savedMatch?.[1] || '0'),
    totalInteractions: parseInt(totalMatch?.[1] || '0'),
    reach: parseInt(reachMatch?.[1] || '0'),
    views: parseInt(viewsMatch?.[1] || '0'),
  }
}

/**
 * Classifica o pilar editorial de um post com base no caption e tipo
 * 
 * Analogia: É como classificar um ativo financeiro em uma categoria
 * (renda fixa, renda variável, imóveis, etc.) para análise de portfólio.
 */
export function classifyPilar(caption: string, type: string): 'P1' | 'P2' | 'P3' | 'P4' | null {
  if (!caption) return null
  
  const lower = caption.toLowerCase()
  
  // P4: Eduardo Pessoa (conteúdo pessoal, bastidores, viagens)
  const p4Keywords = ['tbt', 'aniversário', 'anos', 'viagem', 'família', 'bastidores', 
    'pessoal', 'história', 'memória', 'premiação', 'africa', 'capadócia', 'sun city',
    'palace', 'cassino', 'obrigado', 'legado pessoal', 'jornada', 'hoje faço']
  if (p4Keywords.some(kw => lower.includes(kw))) return 'P4'
  
  // P2: Casos Reais (Onix na Prática)
  const p2Keywords = ['onix em ação', 'onix na prática', 'caso real', 'cliente', 
    'médico que', 'dentista que', 'empresário que', 'episódio', 'ep1', 'ep2',
    'hemorragia financeira', 'sangria']
  if (p2Keywords.some(kw => lower.includes(kw))) return 'P2'
  
  // P3: Cenário e Alertas (notícias econômicas)
  const p3Keywords = ['itcmd', 'imposto', 'reforma', 'tributária', 'tributário', 
    'alerta', 'cenário', 'mercado', 'economia', 'taxa', 'selic', 'inflação',
    'previdência privada', 'pgbl', 'vgbl', 'fundo', 'atenção']
  if (p3Keywords.some(kw => lower.includes(kw))) return 'P3'
  
  // P1: Blindagem Patrimonial (educação financeira)
  const p1Keywords = ['blindagem', 'patrimônio', 'planejamento', 'proteção', 'sucessão',
    'investimento', 'renda fixa', 'diversificação', 'seguro', 'holding',
    'momento certo', 'armadilha', 'erro', 'dica', 'aprenda']
  if (p1Keywords.some(kw => lower.includes(kw))) return 'P1'
  
  return null
}

/**
 * Classifica o formato de um post
 */
export function classifyFormato(type: string): 'reel' | 'carrossel' | 'imagem' | 'stories' {
  switch (type) {
    case 'VIDEO': return 'reel'
    case 'CAROUSEL_ALBUM': return 'carrossel'
    case 'IMAGE': return 'imagem'
    default: return 'imagem'
  }
}

/**
 * Classifica o tipo de CTA de um post com base no caption
 * 
 * Analogia: É como identificar se um investimento tem objetivo de
 * crescimento (CTA Algoritmo), renda (CTA Explícito) ou reserva (CTA Implícito).
 */
export function classifyCTA(caption: string): 'explicito' | 'implicito' | 'identificacao' | 'algoritmo' | null {
  if (!caption) return null
  
  const lower = caption.toLowerCase()
  
  // CTA de Algoritmo: "Salva esse post", "Compartilha"
  const algorithmKeywords = ['salva esse post', 'salva para', 'compartilha com', 
    'compartilhe com', 'manda para alguém', 'manda pra alguém']
  if (algorithmKeywords.some(kw => lower.includes(kw))) return 'algoritmo'
  
  // CTA Explícito: "Manda BLINDAGEM no direct", "Me chama no direct"
  const explicitKeywords = ['no direct', 'no dm', 'me chama', 'manda blindagem', 
    'manda mensagem', 'link na bio', 'acesse o link', 'clique no link']
  if (explicitKeywords.some(kw => lower.includes(kw))) return 'explicito'
  
  // CTA de Identificação: reflexões, sem pedido de ação
  const identificationKeywords = ['você se identifica', 'isso te faz pensar', 
    'como você', 'qual é a sua', 'você também', 'me conta']
  if (identificationKeywords.some(kw => lower.includes(kw))) return 'identificacao'
  
  // CTA Implícito: conteúdo educativo sem CTA direto
  return 'implicito'
}

/**
 * Coleta posts da semana com insights e classificação
 * 
 * Analogia: É como fazer o "fechamento mensal" de um fundo de investimentos,
 * onde você coleta todas as transações, calcula a rentabilidade e classifica
 * cada ativo por categoria para análise de portfólio.
 */
export async function collectWeeklyPosts(
  weekStart: Date,
  weekEnd: Date
): Promise<InstagramPostClassified[]> {
  const allPosts: InstagramPostClassified[] = []
  let cursor: string | undefined
  
  do {
    const { posts, nextCursor } = await getPostList(50, cursor)
    cursor = nextCursor
    
    for (const post of posts) {
      const publishedAt = new Date(post.publishedAt)
      
      // Filtrar apenas posts da semana
      if (publishedAt >= weekStart && publishedAt <= weekEnd) {
        // Coletar insights
        let insights: InstagramPostInsights
        try {
          insights = await getPostInsights(post.id)
        } catch {
          insights = {
            shares: 0,
            comments: post.comments,
            likes: post.likes,
            saved: 0,
            totalInteractions: post.likes + post.comments,
            reach: 0,
            views: 0,
          }
        }
        
        const engagementRate = insights.reach > 0 
          ? (insights.totalInteractions / insights.reach) * 100 
          : 0
        const saveRate = insights.reach > 0 
          ? (insights.saved / insights.reach) * 100 
          : 0
        
        allPosts.push({
          ...post,
          insights,
          pilar: classifyPilar(post.caption || '', post.type),
          formato: classifyFormato(post.type),
          ctaType: classifyCTA(post.caption || ''),
          engagementRate,
          saveRate,
        })
      }
      
      // Se o post é mais antigo que weekStart, parar de buscar
      if (publishedAt < weekStart) {
        cursor = undefined
        break
      }
    }
  } while (cursor)
  
  return allPosts
}
