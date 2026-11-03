import { describe, expect, it } from 'vitest';
import { fmtCell, n, v12 } from '@/lib/adminHelpers';

describe('adminHelpers.n', () => {
  it('coerces numeric strings and numbers', () => {
    expect(n('12.5')).toBe(12.5);
    expect(n(7)).toBe(7);
    expect(n(-3)).toBe(-3);
  });

  it('maps garbage, empty, null and undefined to 0', () => {
    for (const v of ['', 'abc', null, undefined, NaN, {}]) expect(n(v)).toBe(0);
  });

  it('never returns a non-finite number', () => {
    expect(n(Infinity)).toBe(0);
    expect(n(-Infinity)).toBe(0);
  });
});

describe('adminHelpers.v12', () => {
  it('returns 12 zeros for missing input', () => {
    expect(v12()).toEqual(Array(12).fill(0));
    expect(v12(null)).toEqual(Array(12).fill(0));
  });

  it('pads short series and truncates long ones to exactly 12 slots', () => {
    expect(v12([1, 2, 3])).toEqual([1, 2, 3, ...Array(9).fill(0)]);
    expect(v12(Array.from({ length: 20 }, (_, i) => i + 1))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('sanitises non-numeric slots and does not mutate its input', () => {
    const input = [1, NaN, '3' as unknown as number];
    const out = v12(input);
    expect(out.slice(0, 3)).toEqual([1, 0, 3]);
    expect(input).toEqual([1, NaN, '3']);
  });

  it('ignores non-array values', () => {
    expect(v12('oops' as unknown as number[])).toEqual(Array(12).fill(0));
  });
});

describe('adminHelpers.fmtCell', () => {
  it('renders null/undefined as an em dash', () => {
    expect(fmtCell(null)).toBe('—');
    expect(fmtCell(undefined)).toBe('—');
  });

  it('serialises objects as JSON and stringifies scalars', () => {
    expect(fmtCell({ a: 1 })).toBe('{"a":1}');
    expect(fmtCell([1, 2])).toBe('[1,2]');
    expect(fmtCell(0)).toBe('0');
    expect(fmtCell(false)).toBe('false');
    expect(fmtCell('x')).toBe('x');
  });
});
