import { describe, expect, it } from 'vitest';
import {
  TABS,
  lastEditDate,
  nextTabIndex,
  patchIntervento,
  prependIntervento,
  quotaValFromRti,
  removeIntervento,
  replaceIntervento,
  singleFornitore,
  sumImporto,
  withId,
} from '@/lib/dashboardView';
import type { RtiConfig } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

const A = makeIf({ numero_if: 'A', importo: 100, titolo: 'a' });
const B = makeIf({ numero_if: 'B', importo: 50, titolo: 'b' });

describe('lastEditDate', () => {
  it('returns the most recent valid timestamp', () => {
    const d = lastEditDate([
      makeIf({ last_edited_at: '2026-01-01T00:00:00Z' }),
      makeIf({ last_edited_at: '2026-03-01T00:00:00Z' }),
      makeIf({ last_edited_at: null }),
      makeIf({ last_edited_at: 'garbage' }),
    ]);
    expect(d?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('is null when nothing was ever edited or nothing parses', () => {
    expect(lastEditDate([])).toBeNull();
    expect(lastEditDate([makeIf({ last_edited_at: null })])).toBeNull();
    expect(lastEditDate([makeIf({ last_edited_at: 'nope' })])).toBeNull();
  });
});

describe('sums and scope', () => {
  it('sumImporto totals the amounts', () => {
    expect(sumImporto([A, B])).toBe(150);
    expect(sumImporto([])).toBe(0);
  });

  it('singleFornitore is defined only for exactly one selected supplier', () => {
    expect(singleFornitore({})).toBeUndefined();
    expect(singleFornitore({ forn: [] })).toBeUndefined();
    expect(singleFornitore({ forn: ['X'] })).toBe('X');
    expect(singleFornitore({ forn: ['X', 'Y'] })).toBeUndefined();
  });
});

describe('optimistic list updates', () => {
  it('patchIntervento merges the patch into the matching IF only', () => {
    const out = patchIntervento([A, B], 'A', { titolo: 'nuovo' });
    expect(out[0].titolo).toBe('nuovo');
    expect(out[1]).toBe(B);
    expect(A.titolo).toBe('a');
  });

  it('replaceIntervento swaps one row, removeIntervento drops it, prependIntervento adds first', () => {
    const next = makeIf({ numero_if: 'A', titolo: 'server' });
    expect(replaceIntervento([A, B], 'A', next)[0]).toBe(next);
    expect(removeIntervento([A, B], 'A')).toEqual([B]);
    expect(prependIntervento([A], B).map((x) => x.numero_if)).toEqual(['B', 'A']);
  });

  it('are no-ops for an unknown id and never mutate the list', () => {
    const list = [A, B];
    expect(patchIntervento(list, 'Z', { titolo: 'x' })).toEqual(list);
    expect(removeIntervento(list, 'Z')).toEqual(list);
    expect(list).toEqual([A, B]);
  });

  it('withId adds / removes an id on a copy of the set', () => {
    const s = new Set(['a']);
    expect([...withId(s, 'b', true)]).toEqual(['a', 'b']);
    expect([...withId(s, 'a', false)]).toEqual([]);
    expect([...s]).toEqual(['a']);
  });

  it('quotaValFromRti overlays partner quotas on the previous map', () => {
    const rti = { ceiling: 1, partners: [{ name: 'X', pct: 1, quota: 9, impegnato: 0 }], tot_impegnato: 0, erosione_2026: 0 } as RtiConfig;
    expect(quotaValFromRti({ X: 1, Y: 2 }, rti)).toEqual({ X: 9, Y: 2 });
  });
});

describe('nextTabIndex', () => {
  const n = TABS.length;
  it('arrows move and wrap around', () => {
    expect(nextTabIndex('ArrowRight', 0, n)).toBe(1);
    expect(nextTabIndex('ArrowRight', n - 1, n)).toBe(0);
    expect(nextTabIndex('ArrowDown', 2, n)).toBe(3);
    expect(nextTabIndex('ArrowLeft', 0, n)).toBe(n - 1);
    expect(nextTabIndex('ArrowUp', 3, n)).toBe(2);
  });

  it('Home / End jump to the ends; other keys and an empty bar return null', () => {
    expect(nextTabIndex('Home', 4, n)).toBe(0);
    expect(nextTabIndex('End', 1, n)).toBe(n - 1);
    expect(nextTabIndex('Enter', 1, n)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });
});
