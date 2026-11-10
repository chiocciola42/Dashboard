// Tabella figure professionali (seniority): GG per figura dal caricamento e tariffa €/GG
// impostata in admin. L'upload ricostruisce la tabella da zero con tariffa vuota: senza
// questa fusione ogni caricamento cancellerebbe le tariffe già inserite.
import type { Seniority } from './types';

// Chiave di confronto fra due scritture della stessa figura ("Health-Care Consultant
// Manager" e "Health Care Consultant Manager" sono la stessa figura).
export const figuraKey = (figura: string): string => figura.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

// Le figure caricate mantengono la tariffa già nota quando il file non ne porta una.
// Una tariffa presente nel file ha sempre la precedenza. Le figure che non compaiono
// più nel file escono dalla tabella, come prima.
export function mergeTariffe(existing: readonly Seniority[], incoming: readonly Seniority[]): Seniority[] {
  if (incoming.length === 0) return [];
  const known = new Map<string, number>();
  for (const s of existing) {
    if (s.tariffa != null) known.set(figuraKey(s.figura), s.tariffa);
  }
  return incoming.map((s) => ({ ...s, tariffa: s.tariffa ?? known.get(figuraKey(s.figura)) ?? null }));
}
