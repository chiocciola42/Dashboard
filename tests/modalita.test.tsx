// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModalitaPanel from '@/components/panels/ModalitaPanel';
import ModalitaTable from '@/components/panels/modalita/ModalitaTable';
import { buildModalitaBars, buildModalitaDonut } from '@/components/panels/modalita/modalitaHtml';
import { ALTRO_KEY, BUCKET_ORDER, aggregateModalita, modalitaKey } from '@/lib/modalita';
import { makeIf } from './helpers/fixtures';

afterEach(cleanup);

const IFs = [
  makeIf({ numero_if: '1', modalita_if: 'A corpo', importo: 100 }),
  makeIf({ numero_if: '2', modalita_if: 'A canone', importo: 250 }),
  makeIf({ numero_if: '3', modalita_if: 'A canone', importo: 50 }),
  makeIf({ numero_if: '4', modalita_if: 'A canone + A corpo', importo: 40 }),
  makeIf({ numero_if: '5', modalita_if: null, importo: 10 }),
];

describe('modalitaKey', () => {
  it('maps the three canonical labels exactly', () => {
    expect(modalitaKey('A corpo')).toBe('A_corpo');
    expect(modalitaKey('A canone')).toBe('A_canone');
    expect(modalitaKey('A consumo')).toBe('A_consumo');
  });

  it('compound, unknown, differently-cased and empty values go to "altro" (never double-counted)', () => {
    for (const v of ['A canone + A corpo', 'a corpo', 'boh', '', null]) expect(modalitaKey(v)).toBe(ALTRO_KEY);
  });
});

describe('aggregateModalita', () => {
  it('counts IF and sums value per bucket, in canonical order', () => {
    const { rows, tot } = aggregateModalita(IFs);
    expect(rows).toEqual([
      { mod: 'A_corpo', n: 1, costo: 100 },
      { mod: 'A_canone', n: 2, costo: 300 },
      { mod: ALTRO_KEY, n: 2, costo: 50 },
    ]);
    expect(tot).toBe(450);
    expect(rows.map((r) => r.mod)).toEqual(BUCKET_ORDER.filter((k) => rows.some((r) => r.mod === k)));
  });

  it('each IF lands in exactly one bucket', () => {
    const { rows } = aggregateModalita(IFs);
    expect(rows.reduce((s, r) => s + r.n, 0)).toBe(IFs.length);
  });

  it('empty portfolio: no rows and a non-zero denominator', () => {
    expect(aggregateModalita([])).toEqual({ rows: [], tot: 1 });
  });

  it('all-zero values keep a non-zero denominator (no NaN percentages)', () => {
    const { rows, tot } = aggregateModalita([makeIf({ modalita_if: 'A corpo', importo: 0 })]);
    expect(rows[0].costo).toBe(0);
    expect(tot).toBe(1);
  });

  it('a missing amount counts as 0', () => {
    const { rows } = aggregateModalita([makeIf({ modalita_if: 'A corpo', importo: undefined as never })]);
    expect(rows[0].costo).toBe(0);
  });
});

describe('chart builders', () => {
  it('show the empty states without data', () => {
    expect(buildModalitaDonut([], 1)).toContain('Nessun dato');
    expect(buildModalitaBars([])).toBe('');
  });

  it('bars carry the drill-down label of each modalità', () => {
    const { rows } = aggregateModalita(IFs);
    const bars = buildModalitaBars(rows);
    expect(bars).toContain('data-drill-mod="A corpo"');
    expect(bars).toContain('data-drill-mod="A canone"');
    expect(bars).toContain('data-drill-mod="Misto / Altro"');
  });
});

describe('ModalitaPanel', () => {
  it('lists every present modalità with count, total and share in the table', () => {
    render(<ModalitaPanel interventi={IFs} onDrillMod={() => {}} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('A canone');
    expect(rows[1].textContent).toContain('2');
    expect(rows[2].textContent).toContain('Misto / Altro');
  });

  it('shows the empty state with an empty portfolio', () => {
    render(<ModalitaPanel interventi={[]} onDrillMod={() => {}} />);
    expect(screen.getByText('Nessun dato')).toBeTruthy();
    expect(screen.queryAllByRole('row')).toHaveLength(1); // header only
  });

  it('clicking a table row drills into that modalità label', () => {
    const onDrillMod = vi.fn();
    render(<ModalitaPanel interventi={IFs} onDrillMod={onDrillMod} />);
    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByText('A canone').closest('tr') as HTMLElement);
    expect(onDrillMod).toHaveBeenCalledWith('A canone');
    fireEvent.click(within(table).getByText('Misto / Altro').closest('tr') as HTMLElement);
    expect(onDrillMod).toHaveBeenLastCalledWith('Misto / Altro');
  });

  it('clicking a bar of the chart drills too, and clicking elsewhere does not', () => {
    const onDrillMod = vi.fn();
    const { container } = render(<ModalitaPanel interventi={IFs} onDrillMod={onDrillMod} />);
    const bar = container.querySelector('[data-drill-mod="A corpo"]') as HTMLElement;
    expect(bar).not.toBeNull();
    fireEvent.click(bar);
    expect(onDrillMod).toHaveBeenCalledWith('A corpo');
    onDrillMod.mockClear();
    fireEvent.click(container.querySelector('.phead') as HTMLElement);
    expect(onDrillMod).not.toHaveBeenCalled();
  });
});

describe('ModalitaTable', () => {
  it('percentages are computed against the given total', () => {
    render(<ModalitaTable modalita={[{ mod: 'A_corpo', n: 1, costo: 25 }]} tot={100} onDrillMod={() => {}} />);
    expect(screen.getAllByRole('row')[1].textContent).toContain('25,0%');
  });
});
