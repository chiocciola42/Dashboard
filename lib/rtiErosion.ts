// Pure computation behind the RTI panel ("Quote RTI ed erosione"): how much of
// the contract ceiling and of each partner's quota is already committed, per
// year, and how that compares with a linear pace over the contract's life.
// No React, no DOM, and the clock is an argument, so every figure is testable.
import type { Intervento, Meta, RtiConfig } from './types';
import { C, FCOL, erosionRisk } from './format';
import { ripartisci, type QuotePartner } from './ripartizionePartner';

// A contract longer than this many calendar years is treated as invalid input
// (bounds the per-year buckets built below).
export const MAX_CONTRACT_YEARS = 50;

export const TOTAL_COLOR = C.ink;

export type QuotaErosion = {
  name: string;
  color: string;
  quota: number;
  pct: number;
  realEur: number | null;
  realPct: number | null;
  projectedPct: number | null;
  projectedEur: number | null;
};

export type SummaryRow = {
  label: string;
  color: string;
  quota: number;
  quotaPct: number;
  realEur: number | null;
  realPct: number | null;
  theoreticalTodayEur: number;
  projectedEur: number | null;
  projectedPct: number | null;
};

export type RtiErosion = {
  impByP: Record<string, number>;
  ceil: number;
  years: number[];
  impByYear: Record<number, number>;
  annualQuota: number;
  todayYear: number;
  totImpegnato: number;
  eroTotPct: number;
  totRisk: ReturnType<typeof erosionRisk>;
  residuo: number;
  fillW: number;
  contractStartMs: number;
  contractEndMs: number;
  nowMs: number;
  contractStarted: boolean;
  theoreticalTodayPct: number;
  projectedFactor: number;
  TOTAL_COLOR: string;
  totalRealPct: number | null;
  totalRealEur: number | null;
  totalProjectedPct: number | null;
  totalProjectedEur: number | null;
  quotaErosion: QuotaErosion[];
  summaryRows: SummaryRow[];
};

// Calendar years covered by [startYear, endYear]. Invalid or inverted ranges
// collapse to the start year alone; the span is capped at MAX_CONTRACT_YEARS.
export function contractYears(startYear: number, endYear: number): number[] {
  if (!Number.isFinite(startYear)) return [];
  const last = Number.isFinite(endYear) && endYear >= startYear ? endYear : startYear;
  const count = Math.min(last - startYear + 1, MAX_CONTRACT_YEARS);
  return Array.from({ length: count }, (_, i) => startYear + i);
}

// Commitments summed per partner name (partners without IFs stay at 0). With `quote`, an IF run
// by several companies is split between them by the cost of its supply lines.
export function sumByPartner(IFs: Intervento[], rti: RtiConfig, quote?: QuotePartner): Record<string, number> {
  const impByP: Record<string, number> = {};
  rti.partners.forEach((p) => (impByP[p.name] = 0));
  for (const i of IFs) {
    for (const [azienda, v] of ripartisci(i, quote)) {
      if (impByP[azienda] != null) impByP[azienda] += v;
    }
  }
  return impByP;
}

// Commitments grouped by the year of `data_inizio`; an IF without a start date
// (or starting outside the contract's years) counts in the first year.
export function sumByYear(IFs: Intervento[], years: number[]): Record<number, number> {
  const impByYear: Record<number, number> = {};
  years.forEach((y) => (impByYear[y] = 0));
  const startYear = years[0];
  IFs.forEach((i) => {
    const y = i.data_inizio ? new Date(i.data_inizio).getFullYear() : startYear;
    if (impByYear[y] != null) impByYear[y] += i.importo;
    else if (impByYear[startYear] != null) impByYear[startYear] += i.importo;
  });
  return impByYear;
}

export function computeRtiErosion(IFs: Intervento[], rti: RtiConfig, meta: Meta, nowMs: number, quote?: QuotePartner): RtiErosion {
  const ceil = rti.ceiling;
  const impByP = sumByPartner(IFs, rti, quote);

  const todayYear = new Date(nowMs).getFullYear();
  let years = contractYears(new Date(meta.contract_date).getFullYear(), new Date(meta.valid_to).getFullYear());
  if (years.length === 0) years = [todayYear];
  const annualQuota = ceil / years.length;
  const impByYear = sumByYear(IFs, years);

  const totImpegnato = IFs.reduce((s, i) => s + i.importo, 0);
  const eroTotPct = ceil ? (totImpegnato / ceil) * 100 : 0;
  const totRisk = erosionRisk(eroTotPct);
  const residuo = ceil - totImpegnato;
  const fillW = Math.min(100, Math.max(eroTotPct, 2));

  // Linear pace: 0% on the signing date, 100% on the expiry date, both read
  // straight from meta. The real line is projected at today's pace.
  const contractStartMs = new Date(meta.contract_date).getTime();
  const contractEndMs = new Date(meta.valid_to).getTime();
  const contractStarted = nowMs >= contractStartMs;
  const elapsedMs = Math.min(Math.max(nowMs, contractStartMs), contractEndMs) - contractStartMs;
  const totalContractMs = Math.max(1, contractEndMs - contractStartMs);
  const theoreticalTodayPct = Math.min(100, Math.max(0, (elapsedMs / totalContractMs) * 100));
  const projectedFactor = elapsedMs > 0 ? totalContractMs / elapsedMs : 1;

  // Two independent comparisons: the CONTRACT total (ceiling) vs total real
  // impegnato, and each PARTNER's quota vs that partner's own impegnato.
  const totalRealPct = contractStarted ? eroTotPct : null;
  const totalRealEur = contractStarted ? totImpegnato : null;
  const totalProjectedPct = totalRealPct != null ? totalRealPct * projectedFactor : null;
  const totalProjectedEur = totalRealEur != null ? totalRealEur * projectedFactor : null;

  const quotaErosion: QuotaErosion[] = rti.partners.map((p) => {
    const realEur = contractStarted ? impByP[p.name] || 0 : null;
    const realPct = realEur != null ? (p.quota ? (realEur / p.quota) * 100 : 0) : null;
    const projectedPct = realPct != null ? realPct * projectedFactor : null;
    const projectedEur = realEur != null ? realEur * projectedFactor : null;
    return { name: p.name, color: FCOL[p.name] || C.slateL, quota: p.quota, pct: p.pct, realEur, realPct, projectedPct, projectedEur };
  });

  const summaryRows: SummaryRow[] = [
    ...quotaErosion.map((s) => ({
      label: s.name,
      color: s.color,
      quota: s.quota,
      quotaPct: s.pct * 100,
      realEur: s.realEur,
      realPct: s.realPct,
      theoreticalTodayEur: s.quota * (theoreticalTodayPct / 100),
      projectedEur: s.projectedEur,
      projectedPct: s.projectedPct,
    })),
    {
      label: 'Totale contratto',
      color: TOTAL_COLOR,
      quota: ceil,
      quotaPct: 100,
      realEur: totalRealEur,
      realPct: totalRealPct,
      theoreticalTodayEur: ceil * (theoreticalTodayPct / 100),
      projectedEur: totalProjectedEur,
      projectedPct: totalProjectedPct,
    },
  ];

  return {
    impByP, ceil, years, impByYear, annualQuota, todayYear, totImpegnato, eroTotPct, totRisk, residuo, fillW,
    contractStartMs, contractEndMs, nowMs, contractStarted, theoreticalTodayPct, projectedFactor, TOTAL_COLOR,
    totalRealPct, totalRealEur, totalProjectedPct, totalProjectedEur, quotaErosion, summaryRows,
  };
}
