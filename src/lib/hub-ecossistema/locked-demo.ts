import { NOS_ECOSSISTEMA } from "@/lib/hub-ecossistema/nos";

/* ──────────────────────────────────────────────────────────────
 * Demonstração do estado "sem acesso" do hub — módulo PURO.
 *
 * Por que existe: `resolverNosDoHub` devolve tudo liberado enquanto não houver
 * mapeamento empresa→permissão, então HOJE não existe jeito de ver um nó
 * travado no app rodando. O estado foi desenhado, tem tooltip, tem cadeado, tem
 * clique morto — e ia para produção sem nunca ter sido visto fora de um
 * componente isolado. Foi exatamente o que a validação ao vivo não conseguiu
 * conferir.
 *
 * Esta chave existe para FECHAR ESSA LACUNA, não para virar controle de acesso:
 * é aparência, e `acesso.ts` já registra que `locked` não protege rota nenhuma.
 * Quando o RBAC real entrar, some daqui junto com o TODO.
 *
 * Uso: `HUB_LOCKED_DEMO=corporate,agro` (Config DB ou env). Ausente = nada
 * travado, que é o comportamento de sempre.
 * ────────────────────────────────────────────────────────────── */

export const HUB_LOCKED_DEMO_KEY = "HUB_LOCKED_DEMO";

/**
 * Ids de nó a mostrar travados, a partir do valor cru da chave.
 *
 * Só devolve ids que EXISTEM em `NOS_ECOSSISTEMA`. Um id digitado errado é
 * descartado em silêncio de propósito: a alternativa seria a tela quebrar por
 * causa de uma chave de demonstração, o que é pior que ela não travar nada.
 *
 * Aceita espaço em volta e ignora item vazio, pela mesma razão de
 * `EXPECTED_FLAGS_ON`: é valor digitado à mão numa caixa de texto.
 */
export function idsTravadosParaDemo(bruto: string | undefined | null): Set<string> {
  const texto = bruto?.trim();
  if (!texto) return new Set();

  const conhecidos = new Set(NOS_ECOSSISTEMA.map((n) => n.id));
  const pedidos = texto
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return new Set(pedidos.filter((id) => conhecidos.has(id)));
}
