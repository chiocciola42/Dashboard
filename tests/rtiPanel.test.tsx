import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RTIPanel from '@/components/panels/RTIPanel';
import RtiConfigForm from '@/components/panels/rti/RtiConfigForm';
import RtiSummaryTable from '@/components/panels/rti/RtiSummaryTable';
import { buildErosionProjectionChart } from '@/components/panels/rti/rtiCharts';
import { computeRtiErosion } from '@/lib/rtiErosion';
import { ChartInputError } from '@/lib/chartKit';
import { chartRtiBullets } from '@/lib/chartsInsight';
import type { Meta, RtiConfig } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

const meta: Meta = {
  cig: 'c', contratto: 'x', odag: 'o', generato: '',
  contract_date: '2024-03-01', valid_to: '2029-02-28', months: 60,
};
const rti: RtiConfig = {
  ceiling: 10_000_000,
  partners: [
    { name: 'Intellera', pct: 0.65, quota: 6_500_000, impegnato: 0 },
    { name: 'Deloitte', pct: 0.2, quota: 2_000_000, impegnato: 0 },
  ],
  tot_impegnato: 0,
  erosione_2026: 0,
};
const IFs = [
  makeIf({ numero_if: '1', fornitore: 'Intellera', importo: 900_000, data_inizio: '2025-02-01' }),
  makeIf({ numero_if: '2', fornitore: 'Deloitte', importo: 300_000, data_inizio: null }),
];
const quotaVal = { Intellera: 6_500_000, Deloitte: 2_000_000 };
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const base = { IFs, rti, meta, quotaVal, filtersForn: undefined, rtiSel: null, setRtiSel: () => {}, editMode: false, onUpdateRti: () => {} };

describe('RTIPanel', () => {
  it('renders every chart card and the numeric summary', () => {
    const t = text(renderToStaticMarkup(<RTIPanel {...base} />));
    for (const s of [
      "Quanta quota hanno consumato tutte le aziende dell'RTI rispetto al tempo trascorso?",
      'Erosione teorica vs reale del massimale (%)',
      'Erosione teorica vs reale del massimale (valore)',
      'Erosione teorica vs reale delle quote per azienda (%)',
      'Erosione teorica vs reale delle quote per azienda (valore)',
      'Riepilogo numerico',
    ]) expect(t).toContain(s);
  });

  it('shows the totals computed from the IFs (1,2 M su 10 M)', () => {
    const t = text(renderToStaticMarkup(<RTIPanel {...base} />));
    expect(t).toContain('Impegnato totale € 1,20 Mln');
    expect(t).toContain('Residuo € 8,80 Mln');
  });

  it('REGRESSION: an IF split between two companies moves the quota consumed, not the total', () => {
    const quote = { '1': { Intellera: 0.5, Deloitte: 0.5 } };
    const plain = renderToStaticMarkup(<RTIPanel {...base} />);
    const split = renderToStaticMarkup(<RTIPanel {...base} quote={quote} />);
    expect(text(split)).toContain('Impegnato totale € 1,20 Mln');
    expect(split).not.toBe(plain);
    const e = computeRtiErosion(IFs, rti, meta, Date.now(), quote);
    expect(e.quotaErosion.map((q) => q.realEur)).toEqual([450_000, 750_000]);
  });

  it('only offers the configuration form in edit mode', () => {
    expect(renderToStaticMarkup(<RTIPanel {...base} />)).not.toContain('Configura parametri RTI');
    expect(renderToStaticMarkup(<RTIPanel {...base} editMode />)).toContain('Configura parametri RTI');
  });

  it('highlights the selected partner and offers to reset', () => {
    const t = text(renderToStaticMarkup(<RTIPanel {...base} rtiSel="Intellera" />));
    expect(t).toContain('Stai vedendo la quota di Intellera');
    expect(text(renderToStaticMarkup(<RTIPanel {...base} />))).toContain("Clic su un'azienda");
  });

  it('uses the filtered supplier as the selection when it has a quota', () => {
    const t = text(renderToStaticMarkup(<RTIPanel {...base} filtersForn="Deloitte" />));
    expect(t).toContain('Stai vedendo la quota di Deloitte');
  });

  it('flags a ceiling overrun', () => {
    const over = [makeIf({ numero_if: '9', fornitore: 'Intellera', importo: 12_000_000 })];
    expect(text(renderToStaticMarkup(<RTIPanel {...base} IFs={over} />))).toContain('Sforamento € 2,00 Mln');
  });
});

describe('RtiSummaryTable', () => {
  it('renders one row per company plus the total, with signed deltas', () => {
    const e = computeRtiErosion(IFs, rti, meta, Date.now());
    const h = renderToStaticMarkup(<RtiSummaryTable summaryRows={e.summaryRows} theoreticalTodayPct={e.theoreticalTodayPct} meta={meta} />);
    expect((h.match(/<tr>/g) || []).length).toBe(1 + 3);
    expect(text(h)).toContain('Totale contratto');
    expect(text(h)).toMatch(/[+-]\d+\.\d p\.p\./);
  });

  it('shows dashes before the contract starts', () => {
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const e = computeRtiErosion(IFs, rti, meta, Date.now());
    const h = renderToStaticMarkup(<RtiSummaryTable summaryRows={e.summaryRows} theoreticalTodayPct={e.theoreticalTodayPct} meta={meta} />);
    expect(text(h)).toContain('—');
  });
});

describe('RtiConfigForm', () => {
  it('starts collapsed with a single trigger button', () => {
    const h = renderToStaticMarkup(<RtiConfigForm rti={rti} onUpdate={() => {}} />);
    expect(text(h)).toContain('Configura parametri RTI');
    expect(h).not.toContain('<input');
  });
});

describe('RTI bullet chart (all partners)', () => {
  const five = {
    ...rti,
    partners: [
      { name: 'Intellera', pct: 0.45, quota: 4_500_000, impegnato: 0 },
      { name: 'Deloitte', pct: 0.25, quota: 2_500_000, impegnato: 0 },
      { name: 'Gellify', pct: 0.12, quota: 1_200_000, impegnato: 0 },
      { name: 'PGMD', pct: 0.1, quota: 1_000_000, impegnato: 0 },
      { name: 'Accenture', pct: 0.08, quota: 800_000, impegnato: 0 },
    ],
  };
  const ifs5 = five.partners.map((p, i) => makeIf({ numero_if: `f${i}`, fornitore: p.name, importo: p.quota * 0.5 }));

  it('draws one drillable row per configured partner plus the total, not only Intellera and Deloitte', () => {
    const html = renderToStaticMarkup(<RTIPanel {...base} rti={five} IFs={ifs5} />);
    for (const n of ['Intellera', 'Deloitte', 'Gellify', 'PGMD', 'Accenture']) {
      expect(html).toContain(`data-drill-rti="${n}"`);
    }
    expect(text(html)).toContain('Totale contratto');
  });

  it('a partner added in the configuration appears without code changes', () => {
    const six = { ...five, partners: [...five.partners, { name: 'Nuova', pct: 0.05, quota: 500_000, impegnato: 0 }] };
    expect(renderToStaticMarkup(<RTIPanel {...base} rti={six} IFs={ifs5} />)).toContain('data-drill-rti="Nuova"');
  });

  it('clicking a row selects the partner through the existing selection hook', () => {
    const html = renderToStaticMarkup(<RTIPanel {...base} rti={five} IFs={ifs5} rtiSel="Gellify" />);
    expect(text(html)).toContain('Stai vedendo la quota di Gellify');
  });

  it('shows dashes instead of bars before the contract starts', () => {
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const html = renderToStaticMarkup(<RTIPanel {...base} rti={five} IFs={ifs5} />);
    expect(text(html)).toContain('tempo trascorso 0%');
    expect(html).not.toContain('NaN');
  });

  it('builder validates its input and handles no partners', () => {
    const row = { name: 'T', color: '#111', quota: 1, realEur: 1, realPct: 50, projectedPct: 80, projectedEur: 2 };
    expect(chartRtiBullets({ ceiling: 1, partners: [], rows: [], elapsedPct: 10 })).toContain('Nessun partner');
    expect(() => chartRtiBullets({ ceiling: 1, partners: [], rows: [{ ...row, realPct: NaN }], elapsedPct: 10 })).toThrow(ChartInputError);
    expect(() => chartRtiBullets({ ceiling: 1, partners: [], rows: Array(21).fill(row), elapsedPct: 10 })).toThrow(ChartInputError);
    const html = chartRtiBullets({ ceiling: 1, partners: [], rows: [row, { ...row, realPct: 150, projectedPct: 200 }], elapsedPct: 250 });
    expect(html).not.toContain('NaN');
    expect(html).toContain('tempo trascorso 100%');
  });
});

describe('SVG chart builders', () => {
  it('projection chart: draws a real and projected line per company with data', () => {
    const t0 = Date.parse('2024-01-01'), t1 = Date.parse('2029-01-01'), now = Date.parse('2026-07-01');
    const svg = buildErosionProjectionChart(t0, t1, now, [
      { name: 'A', color: '#111', theoreticalEnd: 100, realToday: 20 },
      { name: 'B', color: '#222', theoreticalEnd: 100, realToday: null },
    ], 'pct', true);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('stroke="#111"');
    expect(svg).not.toContain('r="5.5" fill="#222"');
    expect(svg).toContain('>oggi<');
  });

  it('projection chart: degenerate dates do not produce NaN coordinates', () => {
    const t = Date.parse('2026-01-01');
    const svg = buildErosionProjectionChart(t, t, t, [{ name: 'A', color: '#111', theoreticalEnd: 100, realToday: 10 }], 'pct', false);
    expect(svg).not.toContain('NaN');
  });
});
