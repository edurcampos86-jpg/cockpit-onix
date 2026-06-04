// Lógica dos perfis PAT (badges, lookup). O dado estático vive em @/content/pat-profiles.
import { PAT_PROFILES, type PatProfile } from "@/content/pat-profiles";

export function getPatProfile(vendedor: string): PatProfile | null {
  return PAT_PROFILES[vendedor] ?? null;
}

export function getPatBadgeColor(vendedor: string): { text: string; bg: string } {
  const profile = PAT_PROFILES[vendedor];
  if (!profile) return { text: "text-gray-600", bg: "bg-gray-100" };

  const map: Record<string, { text: string; bg: string }> = {
    "Eduardo Campos": { text: "text-amber-700", bg: "bg-amber-50" },
    "Rose Oliveira": { text: "text-violet-700", bg: "bg-violet-50" },
    "Thiago Vergal": { text: "text-sky-700", bg: "bg-sky-50" },
  };
  return map[vendedor] ?? { text: "text-gray-600", bg: "bg-gray-100" };
}
