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
  crossingPosition,
  hasBillableSeries,
  lagMonths,
  chartFunnel,
  chartPareto,
  chartReferenti,
  chartRevenuePace,
  chartSeniority,
  chartShareCompare,
  foldReferenti,
  foldTail,
  maxDeviation,
  funnelFromStats,
  hasActualSeries,
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

  it('REGRESSION: with no consuntivato at all the revenue is still drawn (solid up to today, dashed after)', () => {
    for (const actual of [null, undefined, [0, 0, 0]]) {
      const html = chartRevenuePace({ ...base, actual, lastActual: 1, todayLabel: 'oggi' });
      expect(html).toContain('Maturata € 30');
      expect(html).toContain("dell'anno");
      expect(html).toContain('stroke-dasharray="6 4"'); // mesi futuri
      expect(html).not.toContain('Consuntivato €');
      expect(html).not.toContain('NaN');
      expect(count(html, '<rect')).toBeGreaterThanOrEqual(3 + 3); // 3 barre + 3 colonne hover
    }
  });

  it('adds the consuntivato line and its delta only when the series has data', () => {
    const html = chartRevenuePace({ ...base, lastActual: 1, todayLabel: 'oggi' });
    expect(html).toContain('Consuntivato € 33');
    expect(html).toContain('+€ 3 vs competenza');
    expect(html).toContain('>oggi<');
    expect(html).toContain('Consuntivato: € 8');
    expect(chartRevenuePace({ ...base, actual: [1, 1, 0], lastActual: 1 })).toContain('−€ 28 vs competenza');
  });

  it('hasActualSeries needs at least one positive value', () => {
    expect(hasActualSeries(null)).toBe(false);
    expect(hasActualSeries([0, 0])).toBe(false);
    expect(hasActualSeries([0, 3])).toBe(true);
  });

  it('a future year draws the whole revenue as forecast, with no marker', () => {
    const html = chartRevenuePace({ ...base, lastActual: -1, todayLabel: 'oggi' });
    expect(html).not.toContain('Maturata');
    expect(html).not.toContain('>oggi<');
    expect(html).toContain('Anno € 60');
    expect(html).toContain('periodo non ancora trascorso');
  });

  it('a past year is drawn fully solid', () => {
    const html = chartRevenuePace({ ...base, lastActual: 2 });
    expect(html).toContain('Maturata € 60');
    expect(html).toContain('100,0% dell\'anno');
  });

  it('clamps lastActual to the last period', () => {
    expect(() => chartRevenuePace({ ...base, lastActual: 99 })).not.toThrow();
  });

  it('empty input gives the empty state; inconsistent input throws', () => {
    expect(chartRevenuePace({ labels: [], plan: [], lastActual: -1 })).toContain('Nessun dato');
    expect(() => chartRevenuePace({ ...base, actual: [1], lastActual: 0 })).toThrow(ChartInputError);
    expect(() => chartRevenuePace({ ...base, plan: [1, NaN, 3], lastActual: 0 })).toThrow(ChartInputError);
  });

  it('REGRESSION: all-zero data does not produce NaN', () => {
    expect(chartRevenuePace({ labels: L3, plan: [0, 0, 0], lastActual: 2 })).not.toContain('NaN');
  });
});

describe('lag helpers', () => {
  const cum = [100, 200, 300, 400]; // revenue cumulata per periodo

  it('crossingPosition interpolates where the revenue had reached the value', () => {
    expect(crossingPosition(cum, 250, 3)).toBeCloseTo(1.5);
    expect(crossingPosition(cum, 300, 3)).toBeCloseTo(2);
  });

  it('is null when not measurable and equal to `last` when the value reached the revenue', () => {
    expect(crossingPosition(cum, 0, 3)).toBeNull();
    expect(crossingPosition(cum, 50, 3)).toBeNull(); // già sotto il primo periodo
    expect(crossingPosition(cum, 999, 3)).toBe(3);
    expect(crossingPosition(cum, 250, -1)).toBeNull();
    expect(crossingPosition(cum, 250, 9)).toBeNull();
  });

  it('lagMonths converts periods to months and never goes negative', () => {
    expect(lagMonths(cum, 250, 3)).toBeCloseTo(1.5);
    expect(lagMonths(cum, 250, 3, 3)).toBeCloseTo(4.5); // trimestri
    expect(lagMonths(cum, 999, 3)).toBe(0);
    expect(lagMonths(cum, 0, 3)).toBeNull();
  });

  it('hasBillableSeries needs at least one positive value', () => {
    expect(hasBillableSeries(null)).toBe(false);
    expect(hasBillableSeries([0, 0])).toBe(false);
    expect(hasBillableSeries([0, 2])).toBe(true);
  });
});

describe('chartBillingGap', () => {
  const base = { labels: L3, revenue: [100, 100, 100], billed: [60, 50, 0], billedName: 'Fatturato emesso (BEF)', periodLabel: '2031' };

  it('without the fatturabile series it keeps the revenue vs invoiced comparison', () => {
    const html = chartBillingGap({ ...base, lastActual: 1, todayLabel: 'oggi' });
    expect(html).toContain('Da fatturare ad oggi');
    expect(html).toContain('€ 90'); // 200 maturata - 110 fatturata
    expect(html).toContain('>oggi<');
    expect(html).not.toContain('Fatturabile reale');
    expect(count(html, 'class="seg"')).toBe(3);
  });

  it('with the fatturabile series it draws the third line, both gaps and the lag', () => {
    const html = chartBillingGap({ ...base, billable: [90, 80, 0], lastActual: 1, todayLabel: 'oggi' });
    expect(html).toContain('Fatturabile € 170');
    expect(html).toContain('Revenue non ancora fatturabile');
    expect(html).toContain('€ 30'); // 200 - 170
    expect(html).toContain('Fatturabile non ancora fatturato');
    expect(html).toContain('€ 60'); // 170 - 110
    expect(html).toContain('Ritardo revenue → fattura');
    expect(html).toContain('mesi di ritardo');
    expect(html).toContain('Fatturabile reale: € 90');
    expect(html).not.toContain('NaN');
  });

  it('the lag is expressed in months also for quarterly periods', () => {
    const html = chartBillingGap({ ...base, billable: [90, 80, 0], lastActual: 1, monthsPerPeriod: 3 });
    expect(html).toMatch(/≈ \d+,\d mesi di ritardo/);
  });

  it('an all-zero fatturabile series is treated as absent', () => {
    expect(chartBillingGap({ ...base, billable: [0, 0, 0], lastActual: 1 })).not.toContain('Fatturabile reale');
  });

  it('planned invoicing is a dashed line without the fatturabile series and only a tooltip line with it', () => {
    const plan = { planBilled: [70, 70, 0] };
    const without = chartBillingGap({ ...base, lastActual: 1 });
    const alone = chartBillingGap({ ...base, ...plan, lastActual: 1 });
    expect(count(alone, 'stroke-dasharray="6 4"')).toBe(count(without, 'stroke-dasharray="6 4"') + 1);
    const withF = chartBillingGap({ ...base, ...plan, billable: [90, 80, 0], lastActual: 1 });
    expect(count(withF, 'stroke-dasharray="6 4"')).toBe(count(without, 'stroke-dasharray="6 4"'));
    expect(withF).toContain('Fatturazione a piano: € 70');
  });

  it('a future period range shows only revenue and a hover note', () => {
    const html = chartBillingGap({ ...base, billable: [1, 1, 1], lastActual: -1 });
    expect(html).not.toContain('Da fatturare ad oggi');
    expect(html).not.toContain('Ritardo revenue');
    expect(html).toContain('periodo non ancora trascorso');
  });

  it('invoiced above fatturabile (periods without a readable competence) does not twist the areas', () => {
    const html = chartBillingGap({ ...base, billable: [10, 10, 0], lastActual: 1 });
    expect(html).not.toContain('NaN');
    expect(html).toContain('Fatturabile non ancora fatturato');
  });

  it('validates its input', () => {
    expect(chartBillingGap({ labels: [], revenue: [], billed: [], billedName: 'x', lastActual: -1 })).toContain('Nessun dato');
    expect(() => chartBillingGap({ ...base, billed: [1], lastActual: 0 })).toThrow(ChartInputError);
    expect(() => chartBillingGap({ ...base, planBilled: [1], lastActual: 0 })).toThrow(ChartInputError);
    expect(() => chartBillingGap({ ...base, billable: [1], lastActual: 0 })).toThrow(ChartInputError);
    expect(() => chartBillingGap({ ...base, billable: [1, NaN, 1], lastActual: 0 })).toThrow(ChartInputError);
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

describe('chartReferenti', () => {
  const partners = [
    { name: 'Intellera', color: '#111', pct: 0.5 },
    { name: 'Deloitte', color: '#222', pct: 0.3 },
    { name: 'Gellify', color: '#333', pct: 0.2 },
  ];
  const row = (label: string, i: number, d: number, g: number, f = 0) => ({
    label, byPartner: { Intellera: i, Deloitte: d, Gellify: g }, fuoriRti: f, n: 2, tot: i + d + g + f,
  });

  it('draws one segment per company with value, plus the quota bar, the portfolio row and the quota boundaries', () => {
    const html = chartReferenti(partners, [row('Rossi', 500, 300, 200), row('Bianchi', 100, 100, 800)]);
    expect(count(html, 'class="seg"')).toBe(3 + 3 + 3); // 2 referenti + portafoglio, 3 segmenti
    expect(html).toContain('Quota contratto');
    expect(html).toContain('Totale portafoglio');
    expect(html).toContain('Gellify');
    expect(count(html, 'stroke-dasharray="3 3"')).toBe(2); // confini fra 3 aziende
    expect(html).not.toContain('NaN');
  });

  it('REGRESSION: every RTI company is drawn, not only Intellera and Deloitte', () => {
    const five = ['Intellera', 'Deloitte', 'Gellify', 'PGMD', 'Accenture'].map((name, i) => ({ name, color: `#${i}${i}${i}`, pct: 0.2 }));
    const byPartner = Object.fromEntries(five.map((p) => [p.name, 100]));
    const html = chartReferenti(five, [{ label: 'Rossi', byPartner, fuoriRti: 0, n: 5, tot: 500 }]);
    for (const p of five) expect(html).toContain(`Rossi · ${p.name}`);
  });

  it('suppliers outside the RTI get their own "Fuori RTI" segment, with quota 0', () => {
    const html = chartReferenti(partners, [row('Rossi', 500, 300, 100, 100)]);
    expect(html).toContain('Rossi · Fuori RTI');
    expect(html).toContain('Quota contrattuale 0,0%');
  });

  it('maxDeviation picks the company furthest from its quota; none without value', () => {
    const segs = [
      { name: 'A', color: '#1', v: 80, quotaPct: 50 },
      { name: 'B', color: '#2', v: 20, quotaPct: 50 },
    ];
    expect(maxDeviation(segs, 100)).toEqual({ name: 'A', pp: 30 });
    expect(maxDeviation(segs, 0)).toBeNull();
  });

  it('flags in the chart a deviation of 10 points or more', () => {
    expect(chartReferenti(partners, [row('Rossi', 900, 50, 50)])).toContain('Intellera +40 p.p.');
  });

  it('foldReferenti bounds the rows and keeps the totals', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`R${i}`, 1, 1, 1));
    const folded = foldReferenti(rows, ['Intellera', 'Deloitte', 'Gellify']);
    expect(folded).toHaveLength(15);
    expect(folded[14].label).toBe('Altri 16 referenti');
    expect(folded[14].tot).toBe(48);
    expect(folded.reduce((s, r) => s + r.tot, 0)).toBe(90);
    expect(foldReferenti(rows.slice(0, 3), ['Intellera'])).toHaveLength(3);
  });

  it('a referent with zero total draws no segments and no NaN; empty input gives the empty state', () => {
    const html = chartReferenti(partners, [row('Zero', 0, 0, 0), row('Rossi', 5, 3, 2)]);
    expect(html).not.toContain('NaN');
    expect(count(html, 'class="seg"')).toBe(3 + 3);
    expect(chartReferenti(partners, [])).toContain('Nessun IF');
    expect(chartReferenti([], [row('Rossi', 1, 1, 1)])).toContain('Nessun IF');
  });

  it('validates its input and escapes labels', () => {
    expect(() => chartReferenti(partners, [row('X', NaN, 0, 0)])).toThrow(ChartInputError);
    expect(chartReferenti(partners, [row('<b>x', 1, 1, 1)])).not.toContain('<b>x');
  });
});
