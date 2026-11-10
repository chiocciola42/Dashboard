// Tabella figure professionali (seniority): GG per figura dal caricamento e tariffa €/GG di gara.
// Le tariffe di gara si modificano SOLO a mano (admin o database): un caricamento non le cambia
// e non le rimuove mai. L'upload ricostruisce la tabella da zero con tariffa vuota, quindi qui la
// si ricompone mantenendo ogni tariffa già impostata.
import type { Seniority } from './types';

// Chiave di confronto fra due scritture della stessa figura ("Health-Care Consultant
// Manager" e "Health Care Consultant Manager" sono la stessa figura).
export const figuraKey = (figura: string): string => figura.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

// Regole:
//  - una tariffa esistente VINCE sempre su quella del file (il file non è una fonte di tariffe);
//  - la tariffa del file si usa solo per una figura che non ne ha ancora una;
//  - una figura con tariffa che non compare nel file resta in tabella (GG a 0): perderla
//    significherebbe cancellare un dato inserito a mano;
//  - le figure senza tariffa che escono dal file escono dalla tabella, come prima.
export function mergeTariffe(existing: readonly Seniority[], incoming: readonly Seniority[]): Seniority[] {
  if (incoming.length === 0) return [];
  const known = new Map<string, number>();
  for (const s of existing) {
    if (s.tariffa != null) known.set(figuraKey(s.figura), s.tariffa);
  }
  const merged = incoming.map((s) => ({ ...s, tariffa: known.get(figuraKey(s.figura)) ?? s.tariffa ?? null }));
  const present = new Set(incoming.map((s) => figuraKey(s.figura)));
  const kept = existing.filter((s) => s.tariffa != null && !present.has(figuraKey(s.figura))).map((s) => ({ ...s, gg: 0 }));
  return [...merged, ...kept];
}
