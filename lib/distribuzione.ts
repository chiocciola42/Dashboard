// Aggregations behind the "Distribuzione IF" panel: by ambito, by ARIA referent
// and the seniority totals.
import type { Intervento, Seniority } from './types';

export const NON_CLASSIFICATO = 'Non classificato';
export const NO_REFERENTE = '—';

export type AmbitoAgg = { v: number; n: number };
export type RefAgg = { Intellera: number; Deloitte: number; Altro: number; n: number; tot: number };

// Value and IF count per ambito, biggest value first.
export function aggregateByAmbito(IFs: Intervento[]): [string, AmbitoAgg][] {
  const agg: Record<string, AmbitoAgg> = {};
  for (const i of IFs) {
    const k = i.ambito || NON_CLASSIFICATO;
    (agg[k] = agg[k] || { v: 0, n: 0 }).v += i.importo;
    agg[k].n++;
  }
  return Object.entries(agg).sort((a, b) => b[1].v - a[1].v);
}

// Value per ARIA referent split Intellera / Deloitte / other suppliers, biggest
// total first.
export function aggregateByReferente(IFs: Intervento[]): [string, RefAgg][] {
  const agg: Record<string, RefAgg> = {};
  for (const i of IFs) {
    const k = i.ref_aria || NO_REFERENTE;
    const o = (agg[k] = agg[k] || { Intellera: 0, Deloitte: 0, Altro: 0, n: 0, tot: 0 });
    if (i.fornitore === 'Intellera') o.Intellera += i.importo;
    else if (i.fornitore === 'Deloitte') o.Deloitte += i.importo;
    else o.Altro += i.importo;
    o.tot += i.importo;
    o.n++;
  }
  return Object.entries(agg).sort((a, b) => b[1].tot - a[1].tot);
}

export const totalImporto = (IFs: Intervento[]): number => IFs.reduce((s, i) => s + i.importo, 0);

export const totalGg = (seniority: Seniority[]): number => seniority.reduce((s, x) => s + x.gg, 0);

// "1.234,50 €", or an em dash when there is no tariff (null / 0).
export const formatTariffa = (t: number | null): string =>
  t ? t.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
