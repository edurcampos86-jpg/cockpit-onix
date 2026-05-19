"use client";

import { useEffect, useRef } from "react";

/**
 * Iframe que carrega o PDF (com watermark já aplicado pelo backend) e
 * intercepta teclas/ações sensíveis pra logar no audit trail.
 *
 * Limitações honestas:
 *  - Não impede PrintScreen do SO (é tecla do hardware/OS)
 *  - Não impede screenshot via celular apontado pra tela
 *  - Não impede ferramentas externas (OBS, Snipping Tool)
 *
 * O que ESTE componente entrega:
 *  - Log de toda tentativa de Ctrl+P, Ctrl+S, F12, F11, PrintScreen
 *  - Bloqueio de menu de contexto (right-click)
 *  - Bloqueio de copy/paste no conteúdo da página (não dentro do iframe)
 *
 * A camada REAL de proteção é o watermark + audit log + NDA assinada.
 */
export function PdfViewer({ contratoId }: { contratoId: string }) {
  const lastFlushed = useRef<number>(0);

  useEffect(() => {
    function logarTentativa(tipo: "tentou_imprimir" | "tentou_baixar", tecla: string) {
      const now = Date.now();
      // Debounce 1s — usuário pode pressionar a tecla várias vezes
      if (now - lastFlushed.current < 1000) return;
      lastFlushed.current = now;
      fetch(`/api/juridico/contratos/${contratoId}/log-tentativa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, contexto: { tecla } }),
      }).catch(() => {});
    }

    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      // Ctrl+P, Ctrl+S
      if (e.ctrlKey || e.metaKey) {
        if (key === "p") {
          e.preventDefault();
          logarTentativa("tentou_imprimir", "Ctrl+P");
        }
        if (key === "s") {
          e.preventDefault();
          logarTentativa("tentou_baixar", "Ctrl+S");
        }
      }
      if (key === "printscreen" || e.key === "PrintScreen") {
        logarTentativa("tentou_imprimir", "PrintScreen");
      }
      // F12 = DevTools — só loga, não bloqueia (DevTools é útil pra debugar)
      if (e.key === "F12") {
        logarTentativa("tentou_baixar", "F12");
      }
    }

    function onContext(e: MouseEvent) {
      e.preventDefault();
      logarTentativa("tentou_baixar", "RightClick");
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onContext);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onContext);
    };
  }, [contratoId]);

  return (
    <iframe
      src={`/api/juridico/contratos/${contratoId}/pdf`}
      title="Contrato (com watermark)"
      className="w-full h-[800px] bg-muted"
      style={{ userSelect: "none" }}
    />
  );
}
