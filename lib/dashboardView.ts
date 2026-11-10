// Pure helpers of the Dashboard shell: the immutable list updates behind the
// optimistic editing handlers, the "last edit" header date and the keyboard
// navigation of the tab bar.
import type { Intervento, InterventoInput, RtiConfig } from './types';
import type { Filters } from './queries';

export const TABS = ['Overview', 'Quote RTI', 'Timeline', 'Distribuzione', 'Modalità fornitura', 'Stato IF / BO', 'Operativo', 'Dettaglio IF', 'Controlli'];
export const REGISTRO_TAB = 6;

// Most recent manual edit recorded on the data (null when none / unparsable).
export function lastEditDate(interventi: Intervento[]): Date | null {
  let max = -Infinity;
  for (const i of interventi) {
    if (!i.last_edited_at) continue;
    const t = new Date(i.last_edited_at).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return Number.isFinite(max) ? new Date(max) : null;
}

export const sumImporto = (IFs: Intervento[]): number => IFs.reduce((s, i) => s + i.importo, 0);

// RTI quota panels are meaningful only for a single fornitore in scope.
export const singleFornitore = (filters: Filters): string | undefined =>
  filters.forn?.length === 1 ? filters.forn[0] : undefined;

// --- optimistic list updates (never mutate the input) ------------------------
export const patchIntervento = (list: Intervento[], id: string, patch: InterventoInput): Intervento[] =>
  list.map((i) => (i.numero_if === id ? ({ ...i, ...patch } as Intervento) : i));

export const replaceIntervento = (list: Intervento[], id: string, next: Intervento): Intervento[] =>
  list.map((i) => (i.numero_if === id ? next : i));

export const removeIntervento = (list: Intervento[], id: string): Intervento[] =>
  list.filter((i) => i.numero_if !== id);

export const prependIntervento = (list: Intervento[], created: Intervento): Intervento[] => [created, ...list];

// Copy of the set with `id` added (on) or removed (off).
export function withId(set: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

// quotaVal after an RTI update: partner name -> contractual quota.
export function quotaValFromRti(current: Record<string, number>, rti: RtiConfig): Record<string, number> {
  const next = { ...current };
  rti.partners.forEach((p) => (next[p.name] = p.quota));
  return next;
}

// ARIA tab-pattern keyboard: arrows wrap around, Home/End jump to the ends.
// Returns the index to move to, or null when the key is not a navigation key.
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return current === last ? 0 : current + 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return current === 0 ? last : current - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return null;
}
