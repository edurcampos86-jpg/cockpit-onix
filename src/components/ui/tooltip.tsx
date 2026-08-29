"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

/**
 * Tooltip com popup NÃO-interativo por padrão.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ──────────────────────────────────────────
 * Relatado em produção (ago/2026), na tela /configuracoes/flags: passar o
 * mouse no selo de origem de uma flag abre o tooltip, ele se sobrepõe ao
 * interruptor ao lado — e o clique no interruptor não acontece. Sem erro,
 * sem faixa vermelha: o clique simplesmente pousa no tooltip.
 *
 * A causa está no Base UI 1.3.0, e é por desenho. `TooltipPositioner` só
 * aplica `pointerEvents: 'none'` quando
 *
 *     !open || trackCursorAxis === 'both' || disableHoverablePopup
 *
 * (`tooltip/positioner/TooltipPositioner.js:68-71`). Com o tooltip ABERTO e
 * `disableHoverablePopup` no default `false`, o popup fica com
 * `pointer-events: auto`, portalado e em `z-50` — acima de qualquer controle
 * que ele cubra. Ele intercepta o clique porque tem permissão para isso.
 *
 * ── POR QUE O DEFAULT MUDA AQUI, E NÃO CASO A CASO ───────────────────────
 * Nenhum tooltip deste projeto tem conteúdo interativo: são frases, `code` e
 * atalhos. Um popup informativo que rouba clique do controle vizinho é bug em
 * qualquer tela, não só naquela — e o próximo tooltip perto de um botão
 * repetiria o defeito sem ninguém ligar os pontos.
 *
 * `disableHoverablePopup` é a chave da própria biblioteca para isso: além de
 * devolver `pointer-events: none` ao positioner, ela desliga o `safePolygon()`
 * do trigger (`tooltip/trigger/TooltipTrigger.js:72`), que existe para deixar
 * o cursor viajar até o popup.
 *
 * O QUE SE PERDE: não dá mais para levar o mouse para dentro do tooltip (para
 * selecionar o texto, por exemplo). É a troca aceita — conteúdo de tooltip
 * aqui é para ler, não para manipular.
 *
 * Continua sobrescrevível: `<Tooltip disableHoverablePopup={false}>` devolve o
 * comportamento antigo para o dia em que algum popup precisar ser hoverável.
 */
function Tooltip({
  disableHoverablePopup = true,
  ...props
}: TooltipPrimitive.Root.Props) {
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disableHoverablePopup={disableHoverablePopup}
      {...props}
    />
  )
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
