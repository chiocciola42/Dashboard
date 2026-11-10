// Aggregations behind the "Distribuzione IF" panel: by ambito, by ARIA referent
// and the seniority totals.
import type { Intervento, Seniority } from './types';
import { ripartisci, type QuotePartner } from './ripartizionePartner';

export const NON_CLASSIFICATO = 'Non classificato';
export const NO_REFERENTE = '—';

export type AmbitoAgg = { v: number; n: number };
export const FUORI_RTI = 'Fuori RTI';
// Valore di un referente per azienda dell'RTI (una chiave per ogni partner configurato,
// anche a 0) più il valore dei fornitori che non fanno parte dell'RTI.
export type RefAgg = { byPartner: Record<string, number>; fuoriRti: number; n: number; tot: number };

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

// Value per ARIA referent split across ALL the RTI companies (`partnerNames`, in
// configuration order) plus "fuori RTI" for any other supplier; biggest total first.
export function aggregateByReferente(IFs: Intervento[], partnerNames: readonly string[], quote?: QuotePartner): [string, RefAgg][] {
  const known = new Set(partnerNames);
  const agg: Record<string, RefAgg> = {};
  for (const i of IFs) {
    const k = i.ref_aria || NO_REFERENTE;
    const o = (agg[k] = agg[k] || { byPartner: Object.fromEntries(partnerNames.map((n) => [n, 0])), fuoriRti: 0, n: 0, tot: 0 });
    for (const [azienda, v] of ripartisci(i, quote)) {
      if (known.has(azienda)) o.byPartner[azienda] += v;
      else o.fuoriRti += v;
    }
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
