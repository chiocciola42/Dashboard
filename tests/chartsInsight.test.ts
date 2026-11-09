import { describe, expect, it } from 'vitest';
import {
  ChartInputError,
  assertFinite,
  assertMaxLen,
  assertSameLength,
  cumulative,
  eurCompact,
  linearScale,
  niceCeil,
} from '@/lib/chartKit';
import {
  chartBillingGap,
  chartFunnel,
  chartPareto,
  chartRevenuePace,
  chartSeniority,
  chartShareCompare,
  foldTail,
  funnelFromStats,
  paretoCutoff,
  seniorityCost,
} from '@/lib/chartsInsight';
import { funnelStats } from '@/lib/stato';
import { makeIf } from './helpers/fixtures';

const count = (html: string, s: string) => html.split(s).length - 1;
const L3 = ['Gen', 'Feb', 'Mar'];

describe('chartKit', () => {
  it('linearScale maps the domain to the range and tolerates a degenerate domain', () => {
    const s = linearScale(0, 10, 100, 0);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
    expect(linearScale(5, 5, 7, 99)(5)).toBe(7);
  });

  it('niceCeil rounds up to 1/2/2.5/5/10 steps and never returns 0', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-4)).toBe(1);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(1200)).toBe(2000);
    expect(niceCeil(2.2)).toBe(2.5);
    expect(niceCeil(10)).toBe(10);
  });

  it('eurCompact picks k / M and keeps the sign', () => {
    expect(eurCompact(950)).toBe('€ 950');
    expect(eurCompact(12_000)).toBe('€ 12 k');
    expect(eurCompact(1_250_000)).toBe('€ 1,3 M');
    expect(eurCompact(-2_000_000)).toBe('€ -2,0 M');
  });

  it('cumulative sums in order', () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]);
    expect(cumulative([])).toEqual([]);
  });

  it('asserts fail early with ChartInputError', () => {
    expect(() => assertSameLength('x', [1], [1, 2])).toThrow(ChartInputError);
    expect(() => assertFinite('x', [1, NaN])).toThrow(ChartInputError);
    expect(() => assertFinite('x', [Infinity])).toThrow(ChartInputError);
    expect(() => assertMaxLen('x', 401)).toThrow(ChartInputError);
    expect(() => assertMaxLen('x', 400)).not.toThrow();
  });
});

describe('chartRevenuePace', () => {
  const base = { labels: L3, plan: [10, 20, 30], actual: [8, 25, 0], periodLabel: '2031' };

  it('draws planned and actual cumulatives, the delta against plan and one hover column per period', () => {
    const html = chartRevenuePace({ ...base, lastActual: 1, todayLabel: 'oggi' });
    expect(html).toContain('Consuntivato');
    expect(html).toContain('vs competenza a oggi');
    expect(html).toContain('>oggi<');
    expect(count(html, 'class="seg"')).toBe(3);
    expect(html).toContain('Gen 2031 · Revenue');
    expect(html).not.toContain('NaN');
  });

  it('colours a positive delta as good and a negative one as bad', () => {
    expect(chartRevenuePace({ ...base, lastActual: 1 })).toContain('+€ 3');
    expect(chartRevenuePace({ ...base, actual: [1, 1, 0], lastActual: 1 })).toContain('−€ 28');
  });

  it('draws no actual line and no marker when no period has elapsed (future year)', () => {
    const html = chartRevenuePace({ ...base, lastActual: -1, todayLabel: 'oggi' });
    expect(html).not.toContain('Consuntivato €');
    expect(html).not.toContain('>oggi<');
    expect(html).toContain('non ancora disponibile');
  });

  it('clamps lastActual to the last period', () => {
    expect(() => chartRevenuePace({ ...base, lastActual: 99 })).not.toThrow();
  });

  it('empty input gives the empty state; inconsistent input throws', () => {
    expect(chartRevenuePace({ labels: [], plan: [], actual: [], lastActual: -1 })).toContain('Nessun dato');
    expect(() => chartRevenuePace({ ...base, actual: [1] , lastActual: 0 })).toThrow(ChartInputError);
    expect(() => chartRevenuePace({ ...base, plan: [1, NaN, 3], lastActual: 0 })).toThrow(ChartInputError);
  });

  it('REGRESSION: all-zero data does not produce NaN', () => {
    const html = chartRevenuePace({ labels: L3, plan: [0, 0, 0], actual: [0, 0, 0], lastActual: 2 });
    expect(html).not.toContain('NaN');
  });
});

describe('chartBillingGap', () => {
  const base = { labels: L3, revenue: [100, 100, 100], billed: [60, 50, 0], billedName: 'Fatturato emesso (BEF)', periodLabel: '2031' };

  it('shows the amount still to invoice at the last elapsed period', () => {
    const html = chartBillingGap({ ...base, lastActual: 1, todayLabel: 'oggi' });
    expect(html).toContain('Da fatturare ad oggi');
    expect(html).toContain('€ 90'); // 200 maturata - 110 fatturata
    expect(html).toContain('da fatturare');
    expect(html).toContain('>oggi<');
    expect(count(html, 'class="seg"')).toBe(3);
  });

  it('draws the planned invoicing as a dashed third line only when provided', () => {
    const without = chartBillingGap({ ...base, lastActual: 1 });
    const withPlan = chartBillingGap({ ...base, lastActual: 1, planBilled: [70, 70, 0] });
    expect(count(withPlan, 'stroke-dasharray="6 4"')).toBe(count(without, 'stroke-dasharray="6 4"') + 1);
  });

  it('a future period range shows only revenue and a hover note', () => {
    const html = chartBillingGap({ ...base, lastActual: -1 });
    expect(html).not.toContain('Da fatturare ad oggi');
    expect(html).toContain('periodo non ancora trascorso');
  });

  it('validates its input', () => {
    expect(chartBillingGap({ labels: [], revenue: [], billed: [], billedName: 'x', lastActual: -1 })).toContain('Nessun dato');
    expect(() => chartBillingGap({ ...base, billed: [1], lastActual: 0 })).toThrow(ChartInputError);
    expect(() => chartBillingGap({ ...base, planBilled: [1], lastActual: 0 })).toThrow(ChartInputError);
  });
});

describe('funnel', () => {
  const IFs = [
    makeIf({ numero_if: '1', importo: 100, stato: 'approvato', has_bo: true, attivazione: 'SI' }),
    makeIf({ numero_if: '2', importo: 200, stato: 'approvato', has_bo: true, attivazione: 'NO' }),
    makeIf({ numero_if: '3', importo: 300, stato: 'approvato', has_bo: false }),
    makeIf({ numero_if: '4', importo: 400, stato: 'non elaborato', has_bo: true, attivazione: 'SI' }),
  ];

  it('funnelStats nests the steps: each is a subset of the previous one', () => {
    const [tot, appr, bo, att] = funnelStats(IFs);
    expect(tot).toEqual({ n: 4, v: 1000 });
    expect(appr).toEqual({ n: 3, v: 600 });
    expect(bo).toEqual({ n: 2, v: 300 });
    expect(att).toEqual({ n: 1, v: 100 });
    expect(funnelStats([])[0]).toEqual({ n: 0, v: 0 });
  });

  it('a missing amount counts as 0', () => {
    expect(funnelStats([makeIf({ importo: undefined as never })])[0]).toEqual({ n: 1, v: 0 });
  });

  it('funnelFromStats labels the four steps and only "Approvati" drills by stato', () => {
    const steps = funnelFromStats(funnelStats(IFs));
    expect(steps.map((s) => s.label)).toEqual(['IF totali', 'Approvati', 'Approvati con BO', 'BO e attivati']);
    expect(steps.filter((s) => s.drillStato).map((s) => s.drillStato)).toEqual(['approvato']);
    expect(() => funnelFromStats([{ n: 1, v: 1 }])).toThrow(ChartInputError);
  });

  it('chartFunnel writes the loss between consecutive steps and the drill hook', () => {
    const html = chartFunnel(funnelFromStats(funnelStats(IFs)));
    expect(html).toContain('−1 IF');
    expect(html).toContain('persi');
    expect(html).toContain('data-drill-stato="approvato"');
    expect(count(html, 'data-drill-stato')).toBe(1);
    expect(html).not.toContain('NaN');
  });

  it('empty portfolio gives the empty state; zero-value steps fall back to counts', () => {
    expect(chartFunnel(funnelFromStats(funnelStats([])))).toContain('Nessun IF');
    const zero = chartFunnel(funnelFromStats(funnelStats([makeIf({ importo: 0 }), makeIf({ importo: 0, stato: 'approvato' })])));
    expect(zero).not.toContain('NaN');
  });
});

describe('chartShareCompare', () => {
  const rows = [
    { label: 'A corpo', color: '#111', n: 2, v: 100, drill: 'A corpo' },
    { label: 'A canone', color: '#222', n: 1, v: 300 },
  ];

  it('draws one segment per row on each bar, with percentages and the drill hook only where given', () => {
    const html = chartShareCompare(rows);
    expect(count(html, 'class="seg"')).toBe(4);
    expect(count(html, 'data-drill-mod')).toBe(2);
    expect(html).toContain('66,7%'); // 2 su 3 IF
    expect(html).toContain('75,0%'); // 300 su 400
  });

  it('empty or zero-total input gives the empty state', () => {
    expect(chartShareCompare([])).toContain('Nessun dato');
    expect(chartShareCompare([{ label: 'x', color: '#1', n: 1, v: 0 }])).toContain('Nessun dato');
  });

  it('skips zero-width segments', () => {
    const html = chartShareCompare([...rows, { label: 'Zero', color: '#333', n: 0, v: 50 }]);
    expect(count(html, 'class="seg"')).toBe(5);
  });
});

describe('chartPareto', () => {
  const rows = [
    { label: 'Cloud', v: 800, n: 3 },
    { label: 'Dati', v: 150, n: 2 },
    { label: 'Altro', v: 50, n: 1 },
  ];

  it('paretoCutoff returns the first index reaching the share', () => {
    expect(paretoCutoff([80, 15, 5])).toBe(0);
    expect(paretoCutoff([40, 40, 20])).toBe(1);
    expect(paretoCutoff([0, 0])).toBe(-1);
    expect(paretoCutoff([])).toBe(-1);
  });

  it('foldTail bounds the number of rows and preserves the totals', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `A${i}`, v: 1, n: 1 }));
    const folded = foldTail(many, 12);
    expect(folded).toHaveLength(12);
    expect(folded[11]).toEqual({ label: 'Altri 19', v: 19, n: 19 });
    expect(folded.reduce((s, r) => s + r.v, 0)).toBe(30);
    expect(foldTail(rows)).toEqual(rows);
  });

  it('draws bars, dots, cumulative share and the 80% marker', () => {
    const html = chartPareto(rows);
    expect(count(html, 'class="seg"')).toBe(3);
    expect(html).toContain('80,0%');
    expect(html).toContain("oltre l'80% del valore");
    expect(html).toContain('100,0%');
  });

  it('caps the dots per row and shows the remainder as text', () => {
    const html = chartPareto([{ label: 'Big', v: 10, n: 20 }, { label: 'x', v: 5, n: 1 }]);
    expect(count(html, '<circle')).toBe(12 + 1);
    expect(html).toContain('+8');
  });

  it('long labels are truncated; the tooltip keeps the full name; special characters are escaped', () => {
    const html = chartPareto([{ label: '<b>' + 'x'.repeat(50), v: 1, n: 1 }]);
    expect(html).not.toContain('<b>');
    expect(html).toContain('…</text>');
  });

  it('empty or all-zero input gives the empty state', () => {
    expect(chartPareto([])).toContain('Nessun dato');
    expect(chartPareto([{ label: 'x', v: 0, n: 1 }])).toContain('Nessun dato');
  });
});

describe('chartSeniority', () => {
  it('sorts by GG, shows tariff and cost, and a dash when there is no tariff', () => {
    const html = chartSeniority([
      { label: 'Junior', code: 'J', gg: 10, tariffa: null },
      { label: 'Senior', code: 'S', gg: 100, tariffa: 500 },
    ]);
    expect(html.indexOf('Senior')).toBeLessThan(html.indexOf('Junior'));
    expect(html).toContain('€ 500');
    expect(html).toContain('Costo € 50.000');
    expect(count(html, '>—</text>')).toBe(2);
  });

  it('seniorityCost is null without tariff', () => {
    expect(seniorityCost(10, 100)).toBe(1000);
    expect(seniorityCost(10, null)).toBeNull();
    expect(seniorityCost(10, 0)).toBeNull();
  });

  it('empty or all-zero input gives the empty state', () => {
    expect(chartSeniority([])).toContain('Nessun dato');
    expect(chartSeniority([{ label: 'x', code: 'x', gg: 0, tariffa: 1 }])).toContain('Nessun dato');
  });
});
