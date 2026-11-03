// Aggregation behind the "Modalità fornitura" panel: IF count and value per
// contractual modality.
import type { Intervento } from './types';
import { C } from './format';

// Canonical modalità buckets. Matching is EXACT (not substring) so a compound
// value like "A canone + A corpo" is never double-counted into two buckets —
// it lands in ALTRO_KEY instead, same as null/unrecognized values.
export const ALTRO_KEY = 'A_altro';
export const MODLAB: Record<string, string> = {
  A_corpo: 'A corpo',
  A_canone: 'A canone',
  A_consumo: 'A consumo',
  [ALTRO_KEY]: 'Misto / Altro',
};
export const DESC: Record<string, string> = {
  A_corpo: 'Fatturazione a consegna milestone',
  A_canone: 'Fatturazione mensile ricorrente',
  A_consumo: 'Fatturazione a misura (GG/Uomo)',
  [ALTRO_KEY]: 'Modalità composte (es. canone + corpo) o non classificate',
};
export const MCOL: Record<string, string> = { A_corpo: C.petrol, A_canone: C.gold, A_consumo: C.slate, [ALTRO_KEY]: C.slateL };
export const MOD_TO_KEY: Record<string, string> = { 'A corpo': 'A_corpo', 'A canone': 'A_canone', 'A consumo': 'A_consumo' };
export const BUCKET_ORDER = ['A_corpo', 'A_canone', 'A_consumo', ALTRO_KEY];

export type ModalitaRow = { mod: string; n: number; costo: number };

// Bucket key of one IF's modalità (exact match, else the "altro" bucket).
export const modalitaKey = (modalita_if: string | null): string =>
  (modalita_if && MOD_TO_KEY[modalita_if]) || ALTRO_KEY;

// Rows in canonical order (empty buckets omitted) and the total value used as
// the denominator of the percentages (never 0, so it is always safe to divide).
export function aggregateModalita(interventi: Intervento[]): { rows: ModalitaRow[]; tot: number } {
  const agg: Record<string, { n: number; costo: number }> = {};
  for (const i of interventi) {
    const key = modalitaKey(i.modalita_if);
    if (!agg[key]) agg[key] = { n: 0, costo: 0 };
    agg[key].n += 1;
    agg[key].costo += i.importo || 0;
  }
  const rows = BUCKET_ORDER.filter((k) => agg[k]).map((k) => ({ mod: k, ...agg[k] }));
  const tot = rows.reduce((s, m) => s + m.costo, 0) || 1;
  return { rows, tot };
}
