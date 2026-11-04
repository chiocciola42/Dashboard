import { describe, expect, it } from 'vitest';
import {
  MAX_CONTRACT_YEARS,
  computeRtiErosion,
  contractYears,
  sumByPartner,
  sumByYear,
} from '@/lib/rtiErosion';
import { validateRtiForm } from '@/lib/rtiForm';
import type { Meta, RtiConfig } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

const meta: Meta = {
  cig: 'c', contratto: 'x', odag: 'o', generato: '',
  contract_date: '2024-01-01', valid_to: '2028-12-31', months: 60,
};
const rti: RtiConfig = {
  ceiling: 1_000_000,
  partners: [
    { name: 'Intellera', pct: 0.6, quota: 600_000, impegnato: 0 },
    { name: 'Deloitte', pct: 0.4, quota: 400_000, impegnato: 0 },
  ],
  tot_impegnato: 0,
  erosione_2026: 0,
};
const IFs = [
  makeIf({ numero_if: '1', fornitore: 'Intellera', importo: 150_000, data_inizio: '2025-06-01' }),
  makeIf({ numero_if: '2', fornitore: 'Deloitte', importo: 50_000, data_inizio: null }),
  makeIf({ numero_if: '3', fornitore: 'Altro', importo: 10_000, data_inizio: '2099-01-01' }),
];
const at = (iso: string) => Date.parse(iso);

describe('contractYears', () => {
  it('lists every calendar year, inclusive', () => {
    expect(contractYears(2024, 2026)).toEqual([2024, 2025, 2026]);
    expect(contractYears(2024, 2024)).toEqual([2024]);
  });

  it('collapses inverted or non-finite end years to the start year', () => {
    expect(contractYears(2030, 2024)).toEqual([2030]);
    expect(contractYears(2024, NaN)).toEqual([2024]);
  });

  it('returns nothing for a non-finite start and never exceeds MAX_CONTRACT_YEARS', () => {
    expect(contractYears(NaN, 2030)).toEqual([]);
    expect(contractYears(1000, 9999)).toHaveLength(MAX_CONTRACT_YEARS);
  });
});

describe('sumByPartner / sumByYear', () => {
  it('sums per RTI partner and ignores suppliers outside the RTI', () => {
    expect(sumByPartner(IFs, rti)).toEqual({ Intellera: 150_000, Deloitte: 50_000 });
  });

  it('buckets by start year; no/out-of-range date falls in the first year', () => {
    const years = [2024, 2025, 2026];
    expect(sumByYear(IFs, years)).toEqual({ 2024: 60_000, 2025: 150_000, 2026: 0 });
  });

  it('does not throw with an empty year list', () => {
    expect(sumByYear(IFs, [])).toEqual({});
  });
});

describe('computeRtiErosion', () => {
  it('computes totals, residual and risk against the ceiling', () => {
    const e = computeRtiErosion(IFs, rti, meta, at('2026-07-01'));
    expect(e.totImpegnato).toBe(210_000);
    expect(e.eroTotPct).toBeCloseTo(21, 6);
    expect(e.residuo).toBe(790_000);
    expect(e.years).toEqual([2024, 2025, 2026, 2027, 2028]);
    expect(e.annualQuota).toBe(200_000);
    expect(e.fillW).toBeCloseTo(21, 6);
  });

  it('flags an overrun as negative residual with the bar capped at 100%', () => {
    const big = [makeIf({ numero_if: '9', fornitore: 'Intellera', importo: 1_500_000 })];
    const e = computeRtiErosion(big, rti, meta, at('2026-07-01'));
    expect(e.residuo).toBe(-500_000);
    expect(e.fillW).toBe(100);
    expect(e.totRisk.level).toBe('over');
  });

  it('avoids dividing by zero with a zero ceiling or zero quota', () => {
    const zero = { ...rti, ceiling: 0, partners: [{ ...rti.partners[0], quota: 0 }] };
    const e = computeRtiErosion(IFs, zero, meta, at('2026-07-01'));
    expect(e.eroTotPct).toBe(0);
    expect(e.quotaErosion[0].realPct).toBe(0);
    expect(Number.isFinite(e.fillW)).toBe(true);
  });

  it('theoretical pace is linear: 0% at signing, 100% at expiry, clamped outside', () => {
    expect(computeRtiErosion(IFs, rti, meta, at('2023-01-01')).theoreticalTodayPct).toBe(0);
    expect(computeRtiErosion(IFs, rti, meta, at('2040-01-01')).theoreticalTodayPct).toBe(100);
    const mid = computeRtiErosion(IFs, rti, meta, (at('2024-01-01') + at('2028-12-31')) / 2);
    expect(mid.theoreticalTodayPct).toBeCloseTo(50, 6);
  });

  it('projects at the current pace: halfway through the contract doubles the real value', () => {
    const half = (at('2024-01-01') + at('2028-12-31')) / 2;
    const e = computeRtiErosion(IFs, rti, meta, half);
    expect(e.projectedFactor).toBeCloseTo(2, 6);
    expect(e.totalProjectedEur).toBeCloseTo(420_000, 4);
    expect(e.totalProjectedPct).toBeCloseTo(42, 6);
    expect(e.quotaErosion[0].projectedEur).toBeCloseTo(300_000, 4);
  });

  it('before the contract starts there is no real/projected value (null, not 0)', () => {
    const e = computeRtiErosion(IFs, rti, meta, at('2023-06-01'));
    expect(e.contractStarted).toBe(false);
    expect(e.totalRealPct).toBeNull();
    expect(e.totalProjectedEur).toBeNull();
    expect(e.quotaErosion.every((q) => q.realEur === null && q.projectedPct === null)).toBe(true);
    expect(e.projectedFactor).toBe(1);
  });

  it('summary has one row per partner plus the contract total', () => {
    const e = computeRtiErosion(IFs, rti, meta, at('2026-07-01'));
    expect(e.summaryRows.map((r) => r.label)).toEqual(['Intellera', 'Deloitte', 'Totale contratto']);
    const total = e.summaryRows[2];
    expect(total.quota).toBe(1_000_000);
    expect(total.quotaPct).toBe(100);
    expect(total.theoreticalTodayEur).toBeCloseTo(1_000_000 * (e.theoreticalTodayPct / 100), 4);
  });

  it('survives invalid contract dates without throwing', () => {
    const bad = { ...meta, contract_date: 'boh', valid_to: '???' };
    const e = computeRtiErosion(IFs, rti, bad, at('2026-07-01'));
    expect(e.years).toEqual([2026]);
    expect(Number.isFinite(e.annualQuota)).toBe(true);
  });
});

describe('validateRtiForm', () => {
  it('accepts valid values, including the boundaries', () => {
    expect(validateRtiForm({ mass: 0, intPct: 0, delPct: 100 })).toBeNull();
    expect(validateRtiForm({ mass: 5_000_000, intPct: 100, delPct: 0 })).toBeNull();
  });

  it('rejects a negative or non-finite ceiling', () => {
    expect(validateRtiForm({ mass: -1, intPct: 50, delPct: 50 })).toMatch(/massimale/);
    expect(validateRtiForm({ mass: NaN, intPct: 50, delPct: 50 })).toMatch(/massimale/);
  });

  it('rejects Intellera out of 0..100 and the derived Deloitte share', () => {
    expect(validateRtiForm({ mass: 1, intPct: 101, delPct: 0 })).toMatch(/Intellera/);
    expect(validateRtiForm({ mass: 1, intPct: -5, delPct: 105 })).toMatch(/Intellera/);
    expect(validateRtiForm({ mass: 1, intPct: 50, delPct: 150 })).toMatch(/Deloitte/);
    expect(validateRtiForm({ mass: 1, intPct: 50, delPct: NaN })).toMatch(/Deloitte/);
  });
});
