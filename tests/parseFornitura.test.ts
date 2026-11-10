import { describe, expect, it } from 'vitest';
import { MAX_FORNITURA_ROWS, modalitaFromCell, numberOrNull, parseFornitura, parseFornituraRows } from '@/lib/parsers/parseFornitura';
import { parseAggregatore } from '@/lib/parsers/parseAggregatore';
import { parseFile } from '@/lib/parsers';
import { readWorkbook } from '@/lib/parsers/util';
import { workbook, type Cell } from './helpers/xlsx';

const HEADER: Cell[] = ['File Sorgente', 'Num Linea', 'Modalità Fornitura', 'Cod. Milestone / Attività', 'Descrizione Prestazione', 'Quantità', 'Costo Unitario', 'Costo Complessivo', 'Fornitore', 'Numero IF'];
const row = (o: { linea?: Cell; mod?: Cell; cod?: Cell; desc?: Cell; qta?: Cell; unit?: Cell; tot?: Cell; forn?: Cell; ifn?: Cell }): Cell[] => [
  'C:\\Users\\x\\f.xlsx', o.linea ?? 1, o.mod ?? 'A_corpo', o.cod === undefined ? 'MLS01' : o.cod, o.desc ?? 'Prestazione', o.qta ?? 1, o.unit ?? 100, o.tot === undefined ? 100 : o.tot,
  o.forn === undefined ? 'Intellera Consulting S.p.A.' : o.forn, o.ifn === undefined ? 20260001 : o.ifn,
];
const book = (rows: Cell[][]) => workbook({ 'Oggetto Fornitura': [HEADER, ...rows] });

describe('modalitaFromCell', () => {
  it('reads every spelling found in the exports', () => {
    expect(modalitaFromCell('A_corpo')).toBe('corpo');
    expect(modalitaFromCell('A corpo')).toBe('corpo');
    expect(modalitaFromCell('A_canone')).toBe('canone');
    expect(modalitaFromCell('a  consumo')).toBe('consumo');
  });
  it('anything else is null', () => {
    expect(modalitaFromCell('boh')).toBeNull();
    expect(modalitaFromCell(null)).toBeNull();
    expect(modalitaFromCell('')).toBeNull();
  });
});

describe('numberOrNull', () => {
  it('reads numbers and numeric text', () => {
    expect(numberOrNull(41151.82)).toBe(41151.82);
    expect(numberOrNull('1.234,5')).toBeCloseTo(1234.5);
    expect(numberOrNull(0)).toBe(0);
  });
  it('REGRESSION: empty or unreadable values are null, never 0', () => {
    for (const v of [null, undefined, '', '  ', '-', 'n.d.', Number.NaN, Number.POSITIVE_INFINITY]) expect(numberOrNull(v), String(v)).toBeNull();
  });
});

describe('parseFornitura', () => {
  it('reads one row per cost line with kind, code, amounts and canonical supplier', () => {
    const rows = parseFornitura(readWorkbook(book([
      row({ mod: 'A_corpo', cod: 'MLS01', tot: 41151.82, unit: 41151.82 }),
      row({ linea: 2, mod: 'A canone', cod: 'CAN01', qta: 9, unit: 3029.485, tot: 27265.365, forn: 'Deloitte Consulting S.r.l.' }),
    ])));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ numero_if: '20260001', num_linea: '1', modalita: 'corpo', codice: 'MLS01', costo_complessivo: 41151.82, fornitore: 'Intellera' });
    expect(rows[1]).toMatchObject({ modalita: 'canone', quantita: 9, costo_unitario: 3029.485, costo_complessivo: 27265.365, fornitore: 'Deloitte' });
  });

  it('keeps a line without milestone code or cost (cost null, not 0); drops lines without IF', () => {
    const rows = parseFornitura(readWorkbook(book([row({ cod: null, tot: null }), row({ tot: 'n.d.' }), row({ ifn: null })])));
    expect(rows).toHaveLength(2);
    expect(rows[0].codice).toBeNull();
    expect(rows.map((r) => r.costo_complessivo)).toEqual([null, null]);
  });

  it('does not store the source file path', () => {
    expect(JSON.stringify(parseFornitura(readWorkbook(book([row({})]))))).not.toContain('Users');
  });

  it('an unknown supplier keeps its name; a missing one is null', () => {
    const rows = parseFornitura(readWorkbook(book([row({ forn: 'Rossi & Figli Srl' }), row({ forn: null })])));
    expect(rows.map((r) => r.fornitore)).toEqual(['Rossi & Figli Srl', null]);
  });

  it('a workbook without the sheet gives no rows; beyond the limit it fails explicitly', () => {
    expect(parseFornitura(readWorkbook(workbook({ Altro: [['a']] })))).toEqual([]);
    expect(() => parseFornituraRows(Array.from({ length: MAX_FORNITURA_ROWS + 1 }, () => ({})))).toThrow(/massimo/);
  });
});

describe('parseAggregatore carries the cost lines and keeps services out of the figures table', () => {
  const GDL: Cell[] = ['File Sorgente', 'Cod. Milestone / Attività', 'Descrizione Milestone', 'Figure Professionali', 'Nome Risorsa', 'GG / Uomo', 'Azienda di Appartenenza', 'Numero IF'];
  const book2 = workbook({
    'Oggetto Fornitura': [HEADER, row({ cod: 'CAN01', mod: 'A_canone', tot: 500 }), row({ cod: 'CAN02', mod: 'A_canone', tot: 0 })],
    'GdL - Gruppo di Lavoro': [
      GDL,
      ['f', 'CAN01', 'C', 'Strategy Consultant', null, 10, 'Intellera Consulting S.p.A.', 20260001],
      ['f', 'CAN02', 'C', 'Supporto in ambito Domanda socio-sanitaria', null, null, 'Intellera Consulting S.p.A.', 20260001],
    ],
  });

  it('returns fornitura rows next to gdl and seniority', () => {
    const r = parseAggregatore(book2);
    expect(r.fornitura).toHaveLength(2);
    expect(parseFile('Aggregatore_x.xlsx', book2).fornitura).toHaveLength(2);
  });

  it('REGRESSION: a service line with no days ("Supporto in ambito…") is not a professional figure', () => {
    const r = parseAggregatore(book2);
    expect(r.seniority.map((s) => s.figura)).toEqual(['Strategy Consultant']);
    expect(r.gdl).toHaveLength(2); // ma la riga resta nel GdL, segnalata come senza GG
    expect(r.gdl.find((x) => x.codice === 'CAN02')?.gg).toBeNull();
  });
});
