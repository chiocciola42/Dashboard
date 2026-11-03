// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DistribuzionePanel from '@/components/panels/DistribuzionePanel';
import { buildAmbCount, buildAmbVal, buildRefStack, buildSenDonut, PAL } from '@/components/panels/distribuzione/distribuzioneHtml';
import {
  NON_CLASSIFICATO,
  NO_REFERENTE,
  aggregateByAmbito,
  aggregateByReferente,
  formatTariffa,
  totalGg,
  totalImporto,
} from '@/lib/distribuzione';
import type { Seniority } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

afterEach(cleanup);

const IFs = [
  makeIf({ numero_if: '1', ambito: 'Dati', ref_aria: 'Rossi', fornitore: 'Intellera', importo: 1000 }),
  makeIf({ numero_if: '2', ambito: 'Dati', ref_aria: 'Rossi', fornitore: 'Deloitte', importo: 500 }),
  makeIf({ numero_if: '3', ambito: null, ref_aria: null, fornitore: 'Altro', importo: 70 }),
  makeIf({ numero_if: '4', ambito: 'Cloud', ref_aria: 'Bianchi', fornitore: 'Intellera', importo: 2000 }),
];
const sen: Seniority[] = [
  { figura: 'Senior Dev', code: 'SD', gg: 1200, tariffa: 450.5 },
  { figura: 'Junior Dev', code: 'JD', gg: 30, tariffa: null },
];

describe('aggregateByAmbito', () => {
  it('sums value and counts IF per ambito, biggest value first, blank ambito bucketed', () => {
    expect(aggregateByAmbito(IFs)).toEqual([
      ['Cloud', { v: 2000, n: 1 }],
      ['Dati', { v: 1500, n: 2 }],
      [NON_CLASSIFICATO, { v: 70, n: 1 }],
    ]);
  });

  it('empty input gives no buckets; counts add up to the number of IF', () => {
    expect(aggregateByAmbito([])).toEqual([]);
    expect(aggregateByAmbito(IFs).reduce((s, [, a]) => s + a.n, 0)).toBe(IFs.length);
  });
});

describe('aggregateByReferente', () => {
  it('splits each referent by supplier, biggest total first, blank referent bucketed', () => {
    const r = aggregateByReferente(IFs);
    expect(r.map(([k]) => k)).toEqual(['Bianchi', 'Rossi', NO_REFERENTE]);
    expect(r[1][1]).toEqual({ Intellera: 1000, Deloitte: 500, Altro: 0, n: 2, tot: 1500 });
    expect(r[2][1]).toEqual({ Intellera: 0, Deloitte: 0, Altro: 70, n: 1, tot: 70 });
  });

  it('total equals the sum of the three supplier columns', () => {
    for (const [, o] of aggregateByReferente(IFs)) expect(o.tot).toBe(o.Intellera + o.Deloitte + o.Altro);
  });
});

describe('totals and formatting', () => {
  it('totalImporto / totalGg', () => {
    expect(totalImporto(IFs)).toBe(3570);
    expect(totalImporto([])).toBe(0);
    expect(totalGg(sen)).toBe(1230);
    expect(totalGg([])).toBe(0);
  });

  it('formatTariffa: two decimals and €, dash for null/0', () => {
    expect(formatTariffa(450.5)).toContain('450,50');
    expect(formatTariffa(450.5).endsWith(' €')).toBe(true);
    expect(formatTariffa(null)).toBe('—');
    expect(formatTariffa(0)).toBe('—');
  });
});

describe('chart builders', () => {
  it('empty states', () => {
    expect(buildAmbCount([])).toContain('Nessun IF in questa vista');
    expect(buildAmbVal([])).toContain('Nessun IF');
    expect(buildRefStack([])).toContain('Nessun IF');
    expect(buildSenDonut([])).toContain('Nessun dato');
  });

  it('long labels are truncated with an ellipsis', () => {
    const long = 'X'.repeat(60);
    const html = buildAmbCount([[long, { v: 1, n: 1 }]]);
    // visible label is cut to 34 chars (33 + ellipsis); the tooltip keeps the full name
    expect(html).toContain('>' + 'X'.repeat(33) + '…</div>');
    expect(html).toContain('data-tip="' + long);
  });

  it('seniority donut cycles the palette when there are more figures than colors', () => {
    const many = Array.from({ length: PAL.length + 3 }, (_, i) => ({ figura: `F${i}`, code: `C${i}`, gg: i + 1, tariffa: null }));
    expect(() => buildSenDonut(many)).not.toThrow();
    expect(buildSenDonut(many)).toContain(PAL[0]);
  });

  it('seniority tooltip shows the tariff only when there is one', () => {
    const html = buildSenDonut(sen);
    expect(html).toContain('450,50');
  });
});

describe('DistribuzionePanel', () => {
  const mount = (distSub = 0, setDistSub = vi.fn(), ifs = IFs, seniority = sen) =>
    render(<DistribuzionePanel IFs={ifs} seniority={seniority} distSub={distSub} setDistSub={setDistSub} />);

  it('marks only the selected sub-panel and sub-tab as active', () => {
    for (const sub of [0, 1, 2]) {
      const { container, unmount } = mount(sub);
      const panels = [...container.querySelectorAll('.subpanel')];
      expect(panels).toHaveLength(3);
      expect(panels.map((p) => p.classList.contains('on'))).toEqual([0, 1, 2].map((i) => i === sub));
      const tabs = [...container.querySelectorAll('.subtabs button')];
      expect(tabs.map((b) => b.classList.contains('on'))).toEqual([0, 1, 2].map((i) => i === sub));
      unmount();
    }
  });

  it('clicking a sub-tab selects it', () => {
    const setDistSub = vi.fn();
    mount(0, setDistSub);
    fireEvent.click(screen.getByRole('button', { name: '4c — Per Seniority' }));
    expect(setDistSub).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: '4b — Per Referente ARIA' }));
    expect(setDistSub).toHaveBeenLastCalledWith(1);
  });

  it('ambito table: rows ordered by value, with percentage on the total', () => {
    const { container } = mount(0);
    const rows = within(container.querySelectorAll('table')[0] as HTMLElement).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual(['Cloud', 'Dati', NON_CLASSIFICATO]);
    expect(rows[0].textContent).toContain('56,0%'); // 2000 / 3570
  });

  it('empty portfolio: "Nessun dato" rows and no percentage division by zero', () => {
    const { container } = mount(0, vi.fn(), [], []);
    const tables = container.querySelectorAll('table');
    expect(within(tables[0] as HTMLElement).getByText('Nessun dato')).toBeTruthy();
    expect(within(tables[1] as HTMLElement).getByText('Nessun dato')).toBeTruthy();
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });

  it('referent table shows dashes for suppliers with no value and bold totals', () => {
    const { container } = mount(1);
    const rows = within(container.querySelectorAll('table')[1] as HTMLElement).getAllByRole('row').slice(1);
    const bianchi = rows[0].querySelectorAll('td');
    expect(bianchi[0].textContent).toBe('Bianchi');
    expect(bianchi[2].textContent).toBe('—'); // no Deloitte value
    expect(bianchi[3].querySelector('b')).not.toBeNull();
    expect(bianchi[4].textContent).toBe('1');
  });

  it('seniority table lists every figure with its tariff or a dash', () => {
    const { container } = mount(2);
    const rows = within(container.querySelectorAll('table')[2] as HTMLElement).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Senior Dev');
    expect(rows[0].textContent).toContain('450,50 €');
    expect(rows[1].textContent).toContain('—');
  });
});
