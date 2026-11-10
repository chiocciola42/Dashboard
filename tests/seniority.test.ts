import { describe, expect, it } from 'vitest';
import { figuraKey, mergeTariffe } from '@/lib/seniority';
import type { Seniority } from '@/lib/types';

const s = (figura: string, gg: number, tariffa: number | null = null): Seniority => ({ figura, code: figura.slice(0, 3), gg, tariffa });

describe('figuraKey', () => {
  it('ignores case, hyphens and repeated spaces', () => {
    expect(figuraKey('Health-Care Consultant  Manager')).toBe(figuraKey('health care consultant manager'));
  });
});

describe('mergeTariffe — tariffe di gara: solo modifica manuale', () => {
  it('REGRESSION: tariffs set by hand survive an upload that carries none', () => {
    const merged = mergeTariffe([s('Project Manager', 10, 640), s('Strategy Consultant', 5, 400)], [s('Project Manager', 99), s('Strategy Consultant', 12)]);
    expect(merged.map((x) => [x.figura, x.gg, x.tariffa])).toEqual([['Project Manager', 99, 640], ['Strategy Consultant', 12, 400]]);
  });

  it('REGRESSION: a tariff present in the file NEVER overrides the one set by hand', () => {
    expect(mergeTariffe([s('PM', 1, 600)], [s('PM', 1, 650)])[0].tariffa).toBe(600);
  });

  it('the tariff of the file is used only for a figure that has none yet', () => {
    expect(mergeTariffe([s('PM', 1, null)], [s('PM', 1, 650)])[0].tariffa).toBe(650);
    expect(mergeTariffe([], [s('PM', 1, 650)])[0].tariffa).toBe(650);
  });

  it('matches the same figure written with or without hyphen', () => {
    expect(mergeTariffe([s('Health-Care Consultant Manager', 1, 700)], [s('Health Care Consultant Manager', 4)])[0].tariffa).toBe(700);
  });

  it('REGRESSION: a figure with a tariff that is missing from the file is kept (GG 0), never dropped', () => {
    const merged = mergeTariffe([s('Old', 7, 500), s('Gone', 3, null)], [s('New', 2)]);
    expect(merged).toEqual([s('New', 2, null), s('Old', 0, 500)]);
  });

  it('new figures stay without tariff; figures without tariff that leave the file leave the table', () => {
    expect(mergeTariffe([s('Old', 1, null)], [s('New', 2)])).toEqual([s('New', 2, null)]);
  });

  it('an empty upload gives an empty table (nothing is written); inputs are never mutated', () => {
    const existing = [s('PM', 1, 600)];
    const incoming = [s('PM', 2)];
    expect(mergeTariffe(existing, [])).toEqual([]);
    mergeTariffe(existing, incoming);
    expect(incoming[0].tariffa).toBeNull();
    expect(existing[0].gg).toBe(1);
  });
});
