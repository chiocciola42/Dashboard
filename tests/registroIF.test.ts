import { describe, expect, it } from 'vitest';
import { compareBy, eurPlain, matchesFields, toCsv } from '@/lib/ifTable';
import {
  REGISTRO_COLS,
  REGISTRO_PAGE,
  ST_TXT,
  buildRegistroCsv,
  exportHead,
  exportMatrix,
  exportRow,
  filterAndSortRegistro,
  isNumericKey,
  nextRegistroSort,
  registroViewKey,
  visibleCount,
} from '@/lib/registroIF';
import { makeIf } from './helpers/fixtures';

const A = makeIf({ numero_if: 'A', titolo: 'Alfa', importo: 100, revenue_anno: 5, ref_aria: 'Rossi' });
const B = makeIf({ numero_if: 'B', titolo: 'Beta "q"', importo: 2500.5, revenue_anno: 70, bdo: 'BDO-9', stato: 'approvato' });
const C = makeIf({ numero_if: 'C', titolo: 'gamma', importo: 30, revenue_anno: 0, modalita_if: 'A canone' });

describe('ifTable helpers', () => {
  it('eurPlain: decimal comma, no thousands separator, NaN -> 0,00', () => {
    expect(eurPlain(1234.5)).toBe('1234,50');
    expect(eurPlain(NaN)).toBe('0,00');
  });

  it('toCsv: BOM, ; separator, CRLF, doubled quotes', () => {
    const csv = toCsv([['a', 'b"c'], [1, 2]]);
    expect(csv).toBe('﻿"a";"b""c"\r\n"1";"2"');
    expect(toCsv([])).toBe('﻿');
  });

  it('matchesFields: blank query matches, case-insensitive, only the listed fields', () => {
    expect(matchesFields(A, '  ', ['titolo'])).toBe(true);
    expect(matchesFields(A, 'ALFA', ['titolo'])).toBe(true);
    expect(matchesFields(A, 'rossi', ['titolo'])).toBe(false);
    expect(matchesFields(A, 'rossi', ['titolo', 'ref_aria'])).toBe(true);
  });

  it('compareBy: numeric keys as numbers, text lowercase, null as empty, direction applied', () => {
    expect([A, B, C].sort(compareBy('importo', 1, ['importo'])).map((x) => x.numero_if)).toEqual(['C', 'A', 'B']);
    expect([A, B, C].sort(compareBy('importo', -1, ['importo'])).map((x) => x.numero_if)).toEqual(['B', 'A', 'C']);
    expect([C, B, A].sort(compareBy('titolo', 1, [])).map((x) => x.numero_if)).toEqual(['A', 'B', 'C']);
    expect([A, C].sort(compareBy('bdo', 1, [])).map((x) => x.numero_if)).toEqual(['A', 'C']);
    // same data sorted as text would put 100 before 30 ("1" < "3") — numeric must not
    expect([A, C].sort(compareBy('importo', 1, [])).map((x) => x.importo)).toEqual([100, 30]);
  });
});

describe('export shape', () => {
  it('header, columns and each row have the same width; the revenue header carries the year', () => {
    expect(exportHead(2027)).toContain('Revenue 2027');
    expect(exportRow(A)).toHaveLength(exportHead(2026).length);
    expect(exportMatrix([A, B], 2026)).toHaveLength(3);
  });

  it('row: blank fallbacks, document labels, Sì/No, plain-decimal amounts', () => {
    const r = exportRow(makeIf({ bdo: null, ambito: null, pdc: 'ok', v_sal: 'ko', bef: 'prog', subappalto: true, importo: 1234.5, revenue_anno: 10 }));
    expect(r[1]).toBe('');
    expect(r[3]).toBe('');
    expect(r.slice(13, 17)).toEqual([ST_TXT.ok, ST_TXT.nd, ST_TXT.ko, ST_TXT.prog]);
    expect(r[17]).toBe('1234,50');
    expect(r[18]).toBe('10,00');
    expect(r[19]).toBe('Sì');
    expect(exportRow(makeIf({ subappalto: false }))[19]).toBe('No');
  });

  it('exportRow takes a custom money formatter', () => {
    expect(exportRow(makeIf({ importo: 5 }), (n) => `E${n}`)[17]).toBe('E5');
  });

  it('CSV is the head plus one line per IF, in the order given (no re-sorting)', () => {
    const csv = buildRegistroCsv([B, A], 2026);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('"B"')).toBe(true);
    expect(lines[1]).toContain('"Beta ""q"""');
  });
});

describe('filterAndSortRegistro', () => {
  it('searches the registry fields only (not e.g. fornitore)', () => {
    expect(filterAndSortRegistro([A, B, C], 'rossi', 'importo', -1).map((x) => x.numero_if)).toEqual(['A']);
    expect(filterAndSortRegistro([A, B, C], 'bdo-9', 'importo', -1).map((x) => x.numero_if)).toEqual(['B']);
    expect(filterAndSortRegistro([A, B, C], 'canone', 'importo', -1).map((x) => x.numero_if)).toEqual(['C']);
    expect(filterAndSortRegistro([A, B, C], 'intellera', 'importo', -1)).toEqual([]);
  });

  it('sorts numerically by amount and by revenue, and does not mutate the input', () => {
    const input = [A, B, C];
    expect(filterAndSortRegistro(input, '', 'importo', -1).map((x) => x.numero_if)).toEqual(['B', 'A', 'C']);
    expect(filterAndSortRegistro(input, '', 'revenue_anno', 1).map((x) => x.numero_if)).toEqual(['C', 'A', 'B']);
    expect(input.map((x) => x.numero_if)).toEqual(['A', 'B', 'C']);
  });
});

describe('sorting state', () => {
  it('numeric columns are recognised; the table has 13 columns, amount last', () => {
    expect(isNumericKey('importo')).toBe(true);
    expect(isNumericKey('revenue_anno')).toBe(true);
    expect(isNumericKey('titolo')).toBe(false);
    expect(REGISTRO_COLS).toHaveLength(13);
    expect(REGISTRO_COLS[12][0]).toBe('importo');
  });

  it('nextRegistroSort flips the same column, starts text ascending and amounts descending', () => {
    expect(nextRegistroSort({ key: 'importo', dir: -1 }, 'importo')).toEqual({ key: 'importo', dir: 1 });
    expect(nextRegistroSort({ key: 'importo', dir: -1 }, 'titolo')).toEqual({ key: 'titolo', dir: 1 });
    expect(nextRegistroSort({ key: 'titolo', dir: 1 }, 'revenue_anno')).toEqual({ key: 'revenue_anno', dir: -1 });
  });
});

describe('paging', () => {
  it('the view key changes with search, sort and size', () => {
    const k = registroViewKey('a', 'importo', -1, 10);
    expect(registroViewKey('a', 'importo', -1, 10)).toBe(k);
    expect(registroViewKey('b', 'importo', -1, 10)).not.toBe(k);
    expect(registroViewKey('a', 'titolo', -1, 10)).not.toBe(k);
    expect(registroViewKey('a', 'importo', 1, 10)).not.toBe(k);
    expect(registroViewKey('a', 'importo', -1, 11)).not.toBe(k);
  });

  it('the stored limit only counts for the same view; otherwise back to one page', () => {
    expect(visibleCount({ key: 'k1', n: 600 }, 'k1')).toBe(600);
    expect(visibleCount({ key: 'k1', n: 600 }, 'k2')).toBe(REGISTRO_PAGE);
  });
});
