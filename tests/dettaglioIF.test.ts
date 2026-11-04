import { describe, expect, it } from 'vitest';
import {
  DETTAGLIO_COLS,
  EXPORT_HEAD,
  buildCsv,
  befMatrix,
  eurPlain,
  exportMatrix,
  exportRow,
  filterAndSort,
  matchesQuery,
  nextSort,
  pdcMatrix,
  periodKey,
  salMatrix,
  sortByPeriod,
  statusColor,
} from '@/lib/dettaglioIF';
import { makeIf } from './helpers/fixtures';

const A = makeIf({ numero_if: 'A', titolo: 'Alfa', fornitore: 'Intellera', importo: 100, ambito: 'Dati' });
const B = makeIf({ numero_if: 'B', titolo: 'Beta "q"', fornitore: 'Deloitte', importo: 2500.5, azione: 'Chiamare' });
const C = makeIf({ numero_if: 'C', titolo: 'gamma', fornitore: 'Intellera', importo: 30, bdo: 'BDO-9' });

describe('statusColor', () => {
  it('maps free-text states to traffic-light colors', () => {
    expect(statusColor('PDC Approvata')).toBe('var(--good)');
    expect(statusColor('Verbale Conforme')).toBe('var(--good)');
    expect(statusColor('ok')).toBe('var(--good)');
    expect(statusColor('Firmato')).toBe('var(--good)');
    expect(statusColor('Non conforme')).toBe('var(--bad)');
    expect(statusColor('Mancante')).toBe('var(--bad)');
    expect(statusColor('in lavorazione')).toBe('var(--amber-d)');
    expect(statusColor(null)).toBe('var(--slate-l)');
    expect(statusColor('')).toBe('var(--slate-l)');
  });

  it('REGRESSION: "non conforme" is bad even though it contains "conforme"', () => {
    expect(statusColor('Verbale NON CONFORME')).toBe('var(--bad)');
  });
});

describe('periodKey / sortByPeriod', () => {
  it('orders MM/YYYY chronologically across years, unparsable last', () => {
    expect(periodKey('01/2026')).toBe(202601);
    expect(periodKey('1/2026')).toBe(202601);
    expect(periodKey('12/2025')).toBeLessThan(periodKey('01/2026'));
    expect(periodKey(null)).toBe(Infinity);
    expect(periodKey('2026-01')).toBe(Infinity);
  });

  it('returns a sorted copy without mutating the input', () => {
    const rows = [{ p: '03/2026' }, { p: null }, { p: '01/2025' }, { p: '12/2025' }];
    const out = sortByPeriod(rows, (r) => r.p);
    expect(out.map((r) => r.p)).toEqual(['01/2025', '12/2025', '03/2026', null]);
    expect(rows.map((r) => r.p)).toEqual(['03/2026', null, '01/2025', '12/2025']);
  });
});

describe('export shape', () => {
  it('eurPlain uses a decimal comma, no thousands separator', () => {
    expect(eurPlain(1234.5)).toBe('1234,50');
    expect(eurPlain(0)).toBe('0,00');
    expect(eurPlain(NaN)).toBe('0,00');
  });

  it('header, columns and each row have the same width', () => {
    expect(EXPORT_HEAD).toHaveLength(DETTAGLIO_COLS.length);
    expect(exportRow(A)).toHaveLength(EXPORT_HEAD.length);
    expect(exportMatrix([A, B])).toHaveLength(3);
    expect(DETTAGLIO_COLS.map(([, l]) => l)).toEqual(EXPORT_HEAD);
  });

  it('exportRow renders the BO state and blank fallbacks', () => {
    const r = exportRow(makeIf({ has_bo: true, ambito: null, bdo: null, azione: null }));
    expect(r[0]).toBe('');
    expect(r[2]).toBe('');
    expect(r[11]).toBe('BO emesso');
    expect(r[16]).toBe('');
    expect(exportRow(makeIf({ has_bo: false }))[11]).toBe('In attesa');
  });

  it('buildCsv: BOM, ; separator, CRLF, quotes doubled', () => {
    const csv = buildCsv([B]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(EXPORT_HEAD.map((h) => `"${h}"`).join(';'));
    expect(lines[1]).toContain('"Beta ""q"""');
    expect(lines[1]).toContain('"2500,50"');
  });

  it('buildCsv with no rows is just the header', () => {
    expect(buildCsv([]).slice(1).split('\r\n')).toHaveLength(1);
  });
});

describe('monthly matrices', () => {
  it('are null when there is nothing to copy', () => {
    expect(pdcMatrix([])).toBeNull();
    expect(salMatrix([])).toBeNull();
    expect(befMatrix([])).toBeNull();
  });

  it('PDC / SAL rows fall back to empty strings', () => {
    expect(pdcMatrix([{ periodo_pdc: null, stato_pdc: 'x', codice_pdc: null } as never])).toEqual([
      ['Periodo', 'Stato', 'Codice'],
      ['', 'x', ''],
    ]);
    expect(salMatrix([{ periodo_competenza: '01/2026', stato_verbale: null, conforme: 'Si' } as never])).toEqual([
      ['Periodo', 'Stato verbale', 'Conforme'],
      ['01/2026', '', 'Si'],
    ]);
  });

  it('BEF: plain-decimal amount, "fatturabile" when not invoiced, blank amount when null', () => {
    expect(
      befMatrix([
        { periodo_competenza: '01/2026', importo_ricezione: 10.5, num_fattura: null },
        { periodo_competenza: null, importo_ricezione: null, num_fattura: 'F9' },
      ] as never),
    ).toEqual([
      ['Periodo', 'Importo', 'Fattura'],
      ['01/2026', '10,50', 'fatturabile'],
      ['', '', 'F9'],
    ]);
  });
});

describe('matchesQuery / filterAndSort', () => {
  it('empty or blank query matches everything; matching is case-insensitive over text fields', () => {
    expect(matchesQuery(A, '')).toBe(true);
    expect(matchesQuery(A, '   ')).toBe(true);
    expect(matchesQuery(A, 'ALFA')).toBe(true);
    expect(matchesQuery(A, 'dati')).toBe(true);
    expect(matchesQuery(C, 'bdo-9')).toBe(true);
    expect(matchesQuery(B, 'chiamare')).toBe(true);
    expect(matchesQuery(A, 'inesistente')).toBe(false);
  });

  it('sorts text case-insensitively, ascending and descending', () => {
    expect(filterAndSort([C, B, A], '', 'titolo', 1).map((x) => x.numero_if)).toEqual(['A', 'B', 'C']);
    expect(filterAndSort([A, B, C], '', 'titolo', -1).map((x) => x.numero_if)).toEqual(['C', 'B', 'A']);
  });

  it('sorts the amount numerically, not lexicographically', () => {
    expect(filterAndSort([A, B, C], '', 'importo', 1).map((x) => x.importo)).toEqual([30, 100, 2500.5]);
    expect(filterAndSort([A, B, C], '', 'importo', -1).map((x) => x.importo)).toEqual([2500.5, 100, 30]);
  });

  it('filters then sorts, and does not mutate the input array', () => {
    const input = [C, B, A];
    const out = filterAndSort(input, 'intellera', 'numero_if', 1);
    expect(out.map((x) => x.numero_if)).toEqual(['A', 'C']);
    expect(input.map((x) => x.numero_if)).toEqual(['C', 'B', 'A']);
  });

  it('treats null sort values as empty strings', () => {
    const out = filterAndSort([A, C], '', 'bdo', 1);
    expect(out.map((x) => x.numero_if)).toEqual(['A', 'C']);
  });
});

describe('nextSort', () => {
  it('flips direction on the same column', () => {
    expect(nextSort({ key: 'titolo', dir: 1 }, 'titolo')).toEqual({ key: 'titolo', dir: -1 });
    expect(nextSort({ key: 'titolo', dir: -1 }, 'titolo')).toEqual({ key: 'titolo', dir: 1 });
  });

  it('a new column starts ascending, the amount starts descending', () => {
    expect(nextSort({ key: 'titolo', dir: -1 }, 'ambito')).toEqual({ key: 'ambito', dir: 1 });
    expect(nextSort({ key: 'titolo', dir: 1 }, 'importo')).toEqual({ key: 'importo', dir: -1 });
  });
});
