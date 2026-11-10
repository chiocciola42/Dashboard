import { describe, expect, it } from 'vitest';
import { figuraKey, mergeTariffe } from '@/lib/seniority';
import type { Seniority } from '@/lib/types';

const s = (figura: string, gg: number, tariffa: number | null = null): Seniority => ({ figura, code: figura.slice(0, 3), gg, tariffa });

describe('figuraKey', () => {
  it('ignores case, hyphens and repeated spaces', () => {
    expect(figuraKey('Health-Care Consultant  Manager')).toBe(figuraKey('health care consultant manager'));
  });
});

describe('mergeTariffe', () => {
  it('REGRESSION: tariffs set in admin survive an upload that carries none', () => {
    const merged = mergeTariffe([s('Project Manager', 10, 640), s('Strategy Consultant', 5, 400)], [s('Project Manager', 99), s('Strategy Consultant', 12)]);
    expect(merged.map((x) => [x.figura, x.gg, x.tariffa])).toEqual([['Project Manager', 99, 640], ['Strategy Consultant', 12, 400]]);
  });

  it('matches the same figure written with or without hyphen', () => {
    expect(mergeTariffe([s('Health-Care Consultant Manager', 1, 700)], [s('Health Care Consultant Manager', 4)])[0].tariffa).toBe(700);
  });

  it('a tariff present in the file wins over the stored one', () => {
    expect(mergeTariffe([s('PM', 1, 600)], [s('PM', 1, 650)])[0].tariffa).toBe(650);
  });

  it('new figures stay without tariff; figures missing from the file leave the table', () => {
    const merged = mergeTariffe([s('Old', 1, 500)], [s('New', 2)]);
    expect(merged).toEqual([s('New', 2, null)]);
  });

  it('an empty upload gives an empty table; inputs are never mutated', () => {
    const existing = [s('PM', 1, 600)];
    const incoming = [s('PM', 2)];
    expect(mergeTariffe(existing, [])).toEqual([]);
    mergeTariffe(existing, incoming);
    expect(incoming[0].tariffa).toBeNull();
    expect(existing[0].gg).toBe(1);
  });
});
