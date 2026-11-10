import { describe, expect, it } from 'vitest';
import { MAX_IF_SINCRONIZZAZIONE, ifAssenti } from '@/lib/sincronizzaIf';

const a = (numero_if: string, edited_manually = false) => ({ numero_if, edited_manually });

describe('ifAssenti', () => {
  it('lists the active IFs the file does not contain', () => {
    const r = ifAssenti([a('1'), a('2'), a('3')], new Set(['1']), false);
    expect(r).toEqual({ archiviabili: ['2', '3'], preservati: [] });
  });

  it('nothing is absent when the file has every IF', () => {
    expect(ifAssenti([a('1')], new Set(['1', '9']), false)).toEqual({ archiviabili: [], preservati: [] });
  });

  it('protects manually edited IFs unless forced', () => {
    expect(ifAssenti([a('1', true), a('2')], new Set(), false)).toEqual({ archiviabili: ['2'], preservati: ['1'] });
    expect(ifAssenti([a('1', true), a('2')], new Set(), true)).toEqual({ archiviabili: ['1', '2'], preservati: [] });
  });

  it('is empty for an empty portfolio', () => {
    expect(ifAssenti([], new Set(['1']), false)).toEqual({ archiviabili: [], preservati: [] });
  });

  it('fails explicitly beyond the size limit', () => {
    const many = Array.from({ length: MAX_IF_SINCRONIZZAZIONE + 1 }, (_, i) => a(String(i)));
    expect(() => ifAssenti(many, new Set(), false)).toThrow(/massimo/);
  });
});
