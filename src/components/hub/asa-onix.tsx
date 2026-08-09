/* ──────────────────────────────────────────────────────────────
 * Asa do núcleo do hub — PLACEHOLDER.
 *
 * Desenho provisório até chegar o vetor oficial da marca. É de propósito
 * simples: cinco penas em traço, sem fill, sem gradiente, sem id interno
 * (dois <svg> na mesma página não colidem).
 *
 * Herda a cor via `currentColor`, então quem monta decide o dourado e o
 * tema claro/escuro não precisa de variante.
 *
 * Para trocar pelo vetor real: substituir os <path> mantendo a assinatura
 * (`className`) e o viewBox, ou trocar o viewBox junto — nenhum outro
 * arquivo depende das coordenadas daqui.
 * ────────────────────────────────────────────────────────────── */

export function AsaOnix({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 30"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* As origens são escalonadas ao longo da base (60→46 em x) em vez de
        * saírem todas do mesmo ponto: partindo juntas, as penas se fundem num
        * borrão e a asa lê como um traço só. */}
      <path d="M60 25 Q 33 20 4 3" strokeWidth="2.8" />
      <path d="M56.5 27 Q 32 23.5 11 11" strokeWidth="2.4" opacity="0.82" />
      <path d="M53 28.5 Q 33 26 19 18" strokeWidth="2" opacity="0.64" />
      <path d="M49.5 29.5 Q 36 28 27 23.5" strokeWidth="1.6" opacity="0.46" />
      <path d="M46 30 Q 39 29.5 34 27.5" strokeWidth="1.3" opacity="0.3" />
    </svg>
  );
}
