import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Anexos da sugestão: até 5 arquivos de 10 MB cada (ver
      // src/lib/implementacoes/anexos.ts → MAX_ANEXOS × MAX_ANEXO_BYTES).
      // O default do Next é 1 MB — sem isto, qualquer anexo acima de ~1 MB
      // falha ANTES da action rodar, com a mesma mensagem genérica.
      bodySizeLimit: "55mb",
    },
  },
  // Fase 4 (piloto) — namespacing de rotas por empresa.
  // /backoffice/* → /empresas/investimentos/* (Onix Investimentos).
  // permanent:false (307) DE PROPÓSITO durante o rollout: redirect temporário,
  // pra não cravar 308/301 cacheado no browser antes de validar em prod.
  // Promover a permanent:true (308) é um PR seguinte, só após confirmar.
  async redirects() {
    return [
      {
        source: "/backoffice",
        destination: "/empresas/investimentos",
        permanent: false,
      },
      {
        // :path* preserva o restante, incluindo a rota dinâmica clientes/:id
        source: "/backoffice/:path*",
        destination: "/empresas/investimentos/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
