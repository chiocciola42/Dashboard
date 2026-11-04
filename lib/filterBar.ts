// Pure logic of the global filter bar: option domains, faceted counts, the
// immutable updates applied to `Filters` and the "applied filter" pills.
import type { Intervento } from './types';
import { filterInterventi, matchesMod, AMBITO_NON_CLASSIFICATO, type Filters } from './queries';

export type Opt = { value: string; count: number };
export type MultiKey = 'forn' | 'ref' | 'refint' | 'amb' | 'stato';
export type BoolKey = 'att' | 'bo' | 'sub';

export const MOD_DOMAIN = ['A corpo', 'A canone', 'A consumo'];

// Multi-select dimensions in display (= priority) order.
export const MULTI_DIMENSIONS: { key: MultiKey; label: string }[] = [
  { key: 'forn', label: 'Fornitore' },
  { key: 'stato', label: 'Stato' },
  { key: 'amb', label: 'Ambito' },
  { key: 'ref', label: 'Ref. ARIA' },
  { key: 'refint', label: 'Ref. Intellera' },
];

// Distinct non-empty values, sorted with the Italian collation.
export const uniq = (arr: (string | null)[]): string[] =>
  [...new Set(arr)].filter(Boolean).sort((a, b) => (a as string).localeCompare(b as string, 'it')) as string[];

// --- immutable filter updates ------------------------------------------------
export function toggleMulti(filters: Filters, key: MultiKey, value: string): Filters {
  const cur = filters[key] ?? [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return { ...filters, [key]: next.length ? next : undefined };
}

export function clearKey(filters: Filters, key: keyof Filters): Filters {
  const f = { ...filters };
  delete f[key];
  return f;
}

export const setSingle = (filters: Filters, key: 'mod', value: string): Filters => ({
  ...filters,
  [key]: value || undefined,
});

export const setBool = (filters: Filters, key: BoolKey, on: boolean): Filters => ({
  ...filters,
  [key]: on ? 'SI' : undefined,
});

// --- option domains and faceted counts ---------------------------------------
export type Domains = {
  forn: string[];
  ref: string[];
  refint: string[];
  amb: string[];
  stato: string[];
};

// Full option sets (so options that yield 0 results can still render disabled).
export function computeDomains(interventi: Intervento[], fornitoriFilter: string[]): Domains {
  return {
    forn: fornitoriFilter.filter((f) => interventi.some((i) => i.fornitore === f)),
    ref: uniq(interventi.map((i) => i.ref_aria)),
    refint: uniq(interventi.map((i) => i.ref_fornitore)),
    amb: uniq(interventi.map((i) => i.ambito || AMBITO_NON_CLASSIFICATO)),
    stato: uniq(interventi.map((i) => i.stato)),
  };
}

export type FacetedOptions = {
  fornOpts: Opt[];
  statoOpts: Opt[];
  ambOpts: Opt[];
  refOpts: Opt[];
  refintOpts: Opt[];
  modOpts: Opt[];
};

// Each option is counted against all OTHER active filters, so the number reads
// "results if I also pick this"; 0 means the option is disabled in the UI.
export function computeFacets(interventi: Intervento[], filters: Filters, d: Domains): FacetedOptions {
  const facet = (key: MultiKey, domain: string[], get: (i: Intervento) => string | null): Opt[] => {
    const base = filterInterventi(interventi, { ...filters, [key]: undefined });
    const counts: Record<string, number> = {};
    for (const i of base) {
      const v = get(i);
      if (v != null) counts[v] = (counts[v] || 0) + 1;
    }
    return domain.map((v) => ({ value: v, count: counts[v] || 0 }));
  };
  const modBase = filterInterventi(interventi, { ...filters, mod: undefined });
  return {
    fornOpts: facet('forn', d.forn, (i) => i.fornitore),
    statoOpts: facet('stato', d.stato, (i) => i.stato),
    ambOpts: facet('amb', d.amb, (i) => i.ambito || AMBITO_NON_CLASSIFICATO),
    refOpts: facet('ref', d.ref, (i) => i.ref_aria),
    refintOpts: facet('refint', d.refint, (i) => i.ref_fornitore),
    modOpts: MOD_DOMAIN.map((v) => ({
      value: v,
      count: modBase.filter((i) => matchesMod(i.modalita_if, v)).length,
    })),
  };
}

// Case-insensitive substring search inside a dropdown; empty query = all.
export function filterOptionsByQuery(options: Opt[], q: string): Opt[] {
  if (!q) return options;
  const needle = q.toLowerCase();
  return options.filter((o) => o.value.toLowerCase().includes(needle));
}

// --- applied-filter pills ----------------------------------------------------
export type Pill = { id: string; text: string; key: keyof Filters; value?: string };

export function buildPills(filters: Filters): Pill[] {
  const pills: Pill[] = [];
  for (const d of MULTI_DIMENSIONS) {
    for (const v of filters[d.key] ?? []) {
      pills.push({ id: `${d.key}-${v}`, text: `${d.label}: ${v}`, key: d.key, value: v });
    }
  }
  if (filters.mod) pills.push({ id: 'mod', text: `Modalità: ${filters.mod}`, key: 'mod' });
  if (filters.att) pills.push({ id: 'att', text: 'Solo attivazione immediata', key: 'att' });
  if (filters.bo) pills.push({ id: 'bo', text: 'Con BO emesso', key: 'bo' });
  if (filters.sub) pills.push({ id: 'sub', text: 'Con subappalto', key: 'sub' });
  return pills;
}

// Removing a multi-value pill unticks that one value; any other pill clears its key.
export function removePill(filters: Filters, pill: Pill): Filters {
  return pill.value !== undefined ? toggleMulti(filters, pill.key as MultiKey, pill.value) : clearKey(filters, pill.key);
}
