import { describe, expect, it } from 'vitest';
import { MAX_RIGHE_FORNITURA, quotePerIf, ripartisci } from '@/lib/ripartizionePartner';
import { sumByPartner, computeRtiErosion } from '@/lib/rtiErosion';
import { impegnatoPerPartner } from '@/lib/queries';
import { aggregateByReferente } from '@/lib/distribuzione';
import type { FornituraRiga, Intervento, Meta, RtiConfig } from '@/lib/types';

const riga = (o: Partial<FornituraRiga> = {}): FornituraRiga => ({
  numero_if: '1', num_linea: '1', modalita: 'corpo', codice: 'MLS01', descrizione: 'x', quantita: 1, costo_unitario: 1, costo_complessivo: 100, fornitore: 'Intellera', ...o,
});
const iff = (numero_if: string, fornitore: string, importo: number, o: Partial<Intervento> = {}) =>
  ({ numero_if, fornitore, importo, ref_aria: 'Rossi', data_inizio: '2026-04-01', ...o }) as Intervento;
const rti = (names: string[]): RtiConfig =>
  ({ ceiling: 1000, partners: names.map((name) => ({ name, quota: 500, pct: 50 })) }) as unknown as RtiConfig;
const meta = { contract_date: '2026-01-01', valid_to: '2027-12-31' } as Meta;

describe('quotePerIf', () => {
  it('splits an IF between the companies by line cost', () => {
    const q = quotePerIf([riga({ costo_complessivo: 300 }), riga({ fornitore: 'Deloitte', costo_complessivo: 100 })]);
    expect(q['1']).toEqual({ Intellera: 0.75, Deloitte: 0.25 });
  });

  it('adds up the lines of the same company', () => {
    const q = quotePerIf([riga({ costo_complessivo: 50 }), riga({ costo_complessivo: 50 }), riga({ fornitore: 'Deloitte', costo_complessivo: 100 })]);
    expect(q['1']).toEqual({ Intellera: 0.5, Deloitte: 0.5 });
  });

  it('skips the whole IF when one line cannot be attributed (no partial split)', () => {
    expect(quotePerIf([riga(), riga({ costo_complessivo: null })])).toEqual({});
    expect(quotePerIf([riga(), riga({ fornitore: null })])).toEqual({});
    expect(quotePerIf([riga({ costo_complessivo: -1 }), riga()])).toEqual({});
    expect(quotePerIf([riga({ costo_complessivo: Number.NaN })])).toEqual({});
  });

  it('skips an IF with zero total cost', () => {
    expect(quotePerIf([riga({ costo_complessivo: 0 })])).toEqual({});
  });

  it('keeps IFs independent: a bad IF does not affect the others', () => {
    const q = quotePerIf([riga({ numero_if: 'A', costo_complessivo: null }), riga({ numero_if: 'B' })]);
    expect(Object.keys(q)).toEqual(['B']);
  });

  it('a line after a skipped one does not resurrect the IF', () => {
    expect(quotePerIf([riga({ costo_complessivo: null }), riga(), riga()])).toEqual({});
  });

  it('fails explicitly beyond the size limit', () => {
    expect(() => quotePerIf(new Array(MAX_RIGHE_FORNITURA + 1).fill(riga()))).toThrow(/massimo/);
  });

  it('is empty for no lines', () => {
    expect(quotePerIf([])).toEqual({});
  });
});

describe('ripartisci', () => {
  const i = iff('1', 'Intellera', 1000);
  it('gives the whole amount to the IF supplier without a split', () => {
    expect(ripartisci(i)).toEqual([['Intellera', 1000]]);
    expect(ripartisci(i, {})).toEqual([['Intellera', 1000]]);
  });
  it('splits by the fractions and always adds up to the IF amount', () => {
    const parts = ripartisci(i, { '1': { Intellera: 0.25, Deloitte: 0.75 } });
    expect(parts).toEqual([['Intellera', 250], ['Deloitte', 750]]);
    expect(parts.reduce((s, [, v]) => s + v, 0)).toBeCloseTo(1000, 9);
  });
  it('ignores fractions that do not add up to 1 (corrupt input)', () => {
    expect(ripartisci(i, { '1': { Intellera: 0.2, Deloitte: 0.2 } })).toEqual([['Intellera', 1000]]);
  });
  it('follows a manually edited amount proportionally', () => {
    expect(ripartisci({ ...i, importo: 200 }, { '1': { Intellera: 0.5, Deloitte: 0.5 } })).toEqual([['Intellera', 100], ['Deloitte', 100]]);
  });
});

describe('consumers of the split', () => {
  const IFs = [iff('1', 'Intellera', 1000), iff('2', 'Intellera', 400)];
  const quote = { '1': { Intellera: 0.6, Deloitte: 0.4 } };
  const r = rti(['Intellera', 'Deloitte']);

  it('sumByPartner: the RTI quota follows the lines, not the IF supplier', () => {
    expect(sumByPartner(IFs, r)).toEqual({ Intellera: 1400, Deloitte: 0 });
    expect(sumByPartner(IFs, r, quote)).toEqual({ Intellera: 1000, Deloitte: 400 });
  });

  it('sumByPartner: a company outside the RTI is simply not counted in any quota', () => {
    expect(sumByPartner(IFs, rti(['Intellera']), quote)).toEqual({ Intellera: 1000 });
  });

  it('impegnatoPerPartner uses the same split', () => {
    expect(impegnatoPerPartner(IFs, r, quote)).toEqual({ Intellera: 1000, Deloitte: 400 });
  });

  it('computeRtiErosion: the total is unchanged, the per-partner real amounts move', () => {
    const now = Date.parse('2026-07-01');
    const plain = computeRtiErosion(IFs, r, meta, now);
    const split = computeRtiErosion(IFs, r, meta, now, quote);
    expect(split.totImpegnato).toBe(plain.totImpegnato);
    expect(split.quotaErosion.map((q) => q.realEur)).toEqual([1000, 400]);
    expect(plain.quotaErosion.map((q) => q.realEur)).toEqual([1400, 0]);
  });

  it('aggregateByReferente: splits the referent value across the companies and keeps the total', () => {
    const [[, o]] = aggregateByReferente(IFs, ['Intellera', 'Deloitte'], quote);
    expect(o.byPartner).toEqual({ Intellera: 1000, Deloitte: 400 });
    expect(o.fuoriRti).toBe(0);
    expect(o.tot).toBe(1400);
    expect(o.n).toBe(2);
  });

  it('aggregateByReferente: a company outside the RTI goes to "fuori RTI"', () => {
    const [[, o]] = aggregateByReferente(IFs, ['Intellera'], quote);
    expect(o.fuoriRti).toBe(400);
    expect(o.byPartner.Intellera + o.fuoriRti).toBe(o.tot);
  });
});
