# Tempo de ciclo das PRs — LINHA DE BASE pré-calibração

> **Medição: 2026-08-13.** Lote: as **40** PRs mergeadas mais recentes, de **#280**
> (2026-08-03) a **#325** (2026-08-12).
>
> 🔵 **Esta é a LINHA DE BASE, tirada ANTES da calibração de ago/2026.** Serve para
> comparação futura: qualquer afirmação de que o processo "ficou mais rápido" ou
> "ficou mais lento" se mede contra os números desta página, não contra memória.

Gerado por `scripts/metricas-ciclo.mjs`. Reproduzir:

```bash
node scripts/metricas-ciclo.mjs --limit 40           # via gh CLI
node scripts/metricas-ciclo.mjs --from cache.json    # sem gh (CI, container)
```

Ciclo = **`createdAt` → `mergedAt`**, em horas. É o tempo de vida da PR, não o
tempo de trabalho: uma PR aberta às 20h e mergeada às 21h marca 1 h mesmo que o
código tenha levado o dia.

## Por que mediana, e não média

| lote inteiro | valor |
|---|---|
| **mediana** | **1,2 h** |
| média | 6,1 h |

A média é **5× a mediana**. Não é ruído: é o efeito de poucas PRs de vida longa
(#303 com 47,4 h, #286 com 41,7 h) sobre um lote em que a maioria fecha em pouco
mais de uma hora. Usar a média como número do processo descreveria um ritmo que
**nenhuma PR típica tem**. A mediana é o número principal aqui e nas comparações
futuras; a média fica só para expor a distorção.

## Lote inteiro e os dois blocos

| bloco | n | mediana | média | p90 | mín – máx |
|---|---:|---:|---:|---:|---|
| todas | 40 | **1.2 h** | 6.1 h | 14.6 h | 0.0 h – 47.4 h (2.0 d) |
| 20 mais antigas | 20 | **1.2 h** | 5.9 h | 14.6 h | 0.0 h – 41.7 h (1.7 d) |
| 20 mais recentes | 20 | **1.2 h** | 6.4 h | 13.1 h | 0.7 h – 47.4 h (2.0 d) |

> ⚠️ **O corte em dois blocos não separa dois regimes.** As 40 PRs cabem em **10
> dias corridos** — as "20 mais antigas" vão de 03/08 a 09/08 e as "20 mais
> recentes" de 09/08 a 12/08. Com esse volume (≈4 PRs/dia), 40 PRs é uma
> **semana e meia**, não uma era. Mediana idêntica nos dois blocos (1,2 h) diz
> que a semana foi homogênea, e **não** que nada mudou desde junho.
>
> Para comparar com o regime anterior de verdade, o corte tem de ser por
> **data**, não por contagem — e aí o lote precisa subir para ~150 PRs
> (`--limit 150`). Fica registrado como o próximo passo desta medição.

## Por faixa de risco (heurística de caminho)

Regra da inferência, aplicada aos arquivos tocados: `prisma/**` ⇒ **vermelha** ·
só `docs/`, `.md`, `.github/` ou arquivo de teste ⇒ **verde** · resto ⇒
**amarela**.

> É **aproximação declarada**, não a alçada. A faixa da alçada
> (`docs/onix-co-estado.md`, "Política de alçadas") é declarada no prompt e
> conferida pelo auditor — a heurística aqui não vê RBAC nem segredo, e por isso
> classifica #289 (RBAC) como vermelha por acidente do `prisma/` e #285
> (segredo vazando em rota) como amarela. Serve para uma pergunta só: **migration
> custa mais caro que doc?**

| faixa | n | mediana | média | p90 | mín – máx |
|---|---:|---:|---:|---:|---|
| vermelha | 12 | **2.8 h** | 8.2 h | 14.6 h | 1.0 h – 41.7 h |
| amarela | 20 | **1.0 h** | 4.6 h | 13.1 h | 0.0 h – 24.4 h |
| verde | 8 | **1.0 h** | 7.0 h | 47.4 h | 0.7 h – 47.4 h |

**Resposta: sim, ~2,8×.** PR que toca `prisma/` tem mediana de 2,8 h contra 1,0 h
das outras duas faixas — e isso é o custo do gate certo funcionando (shadow-DB,
parada antes do merge), não atrito a remover.

Duas leituras que a mediana protege e a média perderia:

- **Verde tem p90 de 47,4 h** — o pior caso do lote inteiro é uma PR de
  documentação (#303), aberta e deixada de lado por dois dias. Faixa verde não é
  sinônimo de rápida: é sinônimo de barata para revisar. O que segura PR verde é
  atenção, não risco.
- **Amarela tem mín 0,0 h** (#291, mergeada no mesmo minuto em que foi aberta).
  PR de ciclo zero não é eficiência: é PR que nasceu já revisada em outro lugar,
  e o número de ciclo não descreve nada dela.

## PRs do lote

| # | mergeada | ciclo (h) | faixa | linhas | título |
|---:|---|---:|---|---:|---|
| 325 | 2026-08-12 | 0.7 | amarela | 340 | ci: aviso (não gate) de doc de estado desatualizada vs schema |
| 320 | 2026-08-12 | 1.0 | amarela | 370 | ci: guarda de NOT NULL sem DEFAULT, no padrão de script da #311 |
| 322 | 2026-08-12 | 0.8 | verde | 90 | ci(smoke): probe de /api/empresas/hierarquia com controle de proxy |
| 324 | 2026-08-12 | 0.7 | verde | 329 | test(empresas): conferirRaiz e planejarReparent, funções puras sem banco |
| 321 | 2026-08-12 | 0.9 | verde | 174 | test(hierarquia): trava ACOES_DO_POST contra as ações aceitas pelo POST |
| 317 | 2026-08-12 | 1.4 | amarela | 47 | fix(deploy): migration vira preDeployCommand, fora do start |
| 318 | 2026-08-12 | 1.2 | vermelha | 260 | feat(parceiros): AcordoComercialParceiro, comissão datada por produto (PR G) |
| 319 | 2026-08-12 | 1.2 | verde | 27 | docs(estado): registra que AcordoComercial não tem garantia de vigência única |
| 312 | 2026-08-12 | 14.9 | amarela | 380 | feat(parceiros): parceiro-core, travessia pura da árvore (Fase 1, PR F) |
| 316 | 2026-08-12 | 1.0 | amarela | 49 | feat(hierarquia): GET publica acoesDisponiveis, faltando e divergencias |
| 314 | 2026-08-12 | 1.0 | verde | 30 | ci(backup): SLACK_WEBHOOK_URL vira secret obrigatório em db-backup |
| 313 | 2026-08-12 | 1.0 | verde | 35 | docs(backup): PITR não está ativo, RTO nunca foi medido, dump é 3x menor |
| 303 | 2026-08-12 | 47.4 | verde | 381 | docs(onix-co): memória compartilhada do estado do projeto entre sessões |
| 310 | 2026-08-12 | 13.1 | vermelha | 68 | feat(parceiros): exclusividade de cliente por parceiro (Fase 1, PR D) |
| 311 | 2026-08-12 | 13.1 | amarela | 333 | test(ci): teste da guarda de drift do índice FTS, extraída para script |
| 308 | 2026-08-11 | 7.1 | vermelha | 169 | feat(parceiros): árvore de indicação + guarda anti-ciclo no banco (Fase 1, PR C) |
| 307 | 2026-08-11 | 6.5 | vermelha | 170 | feat(parceiros): vínculo ParceiroCliente datado (Fase 1, PR B) |
| 306 | 2026-08-11 | 5.8 | vermelha | 177 | feat(parceiros): Parceiro como entidade própria (Fase 1, PR A) |
| 302 | 2026-08-10 | 1.3 | vermelha | 379 | feat(origem-cliente): fecha o elo Indicacao → ClienteBackoffice |
| 299 | 2026-08-10 | 8.1 | amarela | 1564 | feat(pessoa-grupo): backfill em lotes, com dry-run e idempotência |
| 300 | 2026-08-10 | 8.0 | amarela | 120 | fix(agents): metadado só do agente da rota e casamento por segmento |
| 298 | 2026-08-09 | 0.4 | amarela | 233 | feat(agents): remove o Copiloto Onix; o botão de IA só monta onde há agente |
| 297 | 2026-08-09 | 0.1 | amarela | 1067 | feat(hierarquia): lista canônica de 5 filhas e ação seed-filhas idempotente |
| 296 | 2026-08-09 | 0.1 | amarela | 788 | feat(hierarquia): reparent pelo endpoint, com dry-run e rastro |
| 295 | 2026-08-09 | 2.8 | amarela | 410 | feat(hierarquia): guardas de pré-condição, rastro de autoria e ensaio ponta a ponta |
| 294 | 2026-08-09 | 3.9 | amarela | 76 | feat(nav): o logo da sidebar vira link de volta ao hub |
| 293 | 2026-08-09 | 9.4 | amarela | 87 | ci(migrations): guarda contra o drift do índice FTS + leitura do log de bootstrap |
| 289 | 2026-08-09 | 14.6 | vermelha | 1864 | feat(rbac): acesso por empresa — PessoaEmpresa, gate de página e auditoria |
| 286 | 2026-08-09 | 41.7 | vermelha | 5657 | feat(hub): Ecossistema Onix atrás de flag, /painel e flags observáveis |
| 292 | 2026-08-09 | 2.8 | vermelha | 593 | feat(pessoa-grupo): model da pessoa-titular, régua de união e log imutável de bootstrap |
| 291 | 2026-08-08 | 0.0 | amarela | 397 | feat(empresas): endpoint de bootstrap e leitura da hierarquia (Onix Co) |
| 290 | 2026-08-08 | 2.8 | verde | 36 | docs(agents): sugestões passam a seguir o Golden Circle (por quê → como → o quê) |
| 288 | 2026-08-07 | 1.0 | vermelha | 595 | feat(empresas): estrutura da hierarquia do grupo (Onix Co) — schema, migration e régua |
| 287 | 2026-08-07 | 0.1 | amarela | 931 | feat(recon): expõe métricas de identidade como endpoint autenticado read-only |
| 285 | 2026-08-06 | 0.2 | amarela | 895 | fix(segurança): exige admin nas rotas de config/diagnóstico e para de vazar fragmento de segredo |
| 284 | 2026-08-06 | 1.2 | amarela | 347 | feat(implementacoes): freio de custo no lote de RICE, card do GitHub e varredura de anexos órfãos |
| 283 | 2026-08-06 | 1.2 | vermelha | 1964 | feat(implementacoes): fluxo guiado — template de prompt, empresas, schema e rastreio do PR |
| 282 | 2026-08-04 | 0.2 | amarela | 158 | feat(time): histórico de cobrança na ficha, escalação aos 3 lembretes e getTimeStats enxuto |
| 281 | 2026-08-04 | 2.0 | vermelha | 343 | feat(time): botão de lembrete com preview, registro de envio e conserto do sidebar |
| 280 | 2026-08-03 | 24.4 | amarela | 782 | feat(time): foto no self-service, atalho /time/eu e lembrete nos três canais |

## Nota de procedência

🔎 Datas de `createdAt`/`mergedAt` vêm da API do GitHub. Tamanho e lista de
arquivos vieram do **commit de squash na `main`** (`git show --numstat`), que é
equivalente ao diff da PR porque o repositório usa squash merge — e é o que
`gh pr list --json additions,deletions,files` devolve quando o `gh` está
disponível. A medição em si não alcança produção e não depende dela.
