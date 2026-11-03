import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RTIPanel from '@/components/panels/RTIPanel';
import RtiConfigForm from '@/components/panels/rti/RtiConfigForm';
import RtiSummaryTable from '@/components/panels/rti/RtiSummaryTable';
import { buildErosionProjectionChart, buildYearlyErosionChart } from '@/components/panels/rti/rtiCharts';
import { computeRtiErosion } from '@/lib/rtiErosion';
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
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

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
      'Composizione del RTI',
      'Erosione della quota per partner RTI',
      'Erosione per Anno',
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

  it('only offers the configuration form in edit mode', () => {
    expect(renderToStaticMarkup(<RTIPanel {...base} />)).not.toContain('Configura parametri RTI');
    expect(renderToStaticMarkup(<RTIPanel {...base} editMode />)).toContain('Configura parametri RTI');
  });

  it('highlights the selected partner and offers to reset', () => {
    const t = text(renderToStaticMarkup(<RTIPanel {...base} rtiSel="Intellera" />));
    expect(t).toContain('Stai vedendo la quota di Intellera');
    expect(text(renderToStaticMarkup(<RTIPanel {...base} />))).toContain('Clic su uno spicchio');
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

describe('SVG chart builders', () => {
  it('yearly chart: one bar per year, today marker only for a year in range', () => {
    const svg = buildYearlyErosionChart([2025, 2026, 2027], { 2025: 1e6, 2026: 2e6, 2027: 0 }, 1.5e6, 2026);
    expect((svg.match(/<rect /g) || []).length).toBe(3);
    expect(svg).toContain('>oggi<');
    expect(buildYearlyErosionChart([2025], { 2025: 1 }, 1, 2040)).not.toContain('>oggi<');
  });

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
