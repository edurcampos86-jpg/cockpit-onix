import type { NextConfig } from "next";

/**
 * Headers de segurança aplicados a todas as rotas.
 *
 * - CSP: deny-by-default; permite recursos próprios + dados base64 para imagens
 *   geradas em runtime. Ajuste se adicionar CDN/script de terceiros.
 * - HSTS: 2 anos + preload (ative só após confirmar que toda subdomain serve HTTPS).
 * - X-Frame-Options/CSP frame-ancestors: bloqueia clickjacking.
 * - X-Content-Type-Options: bloqueia MIME sniffing.
 * - Referrer-Policy: limita vazamento de URL para terceiros.
 * - Permissions-Policy: nega APIs sensíveis do browser por padrão.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next 16 ainda injeta inline scripts no streaming SSR; precisamos liberar.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.anthropic.com https://*.googleapis.com https://*.btgpactual.com https://graph.facebook.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // APIs nunca devem ser cacheadas por proxies intermediários.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
