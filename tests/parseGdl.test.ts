import { describe, expect, it } from 'vitest';
import { MAX_GDL_ROWS, ggFromCell, modalitaFromGdl, parseGdl, parseGdlRows, tipoFromCodice } from '@/lib/parsers/parseGdl';
import { parseAggregatore } from '@/lib/parsers/parseAggregatore';
import { parseFile } from '@/lib/parsers';
import { partnerName, readWorkbook } from '@/lib/parsers/util';
import { workbook, type Cell } from './helpers/xlsx';

const HEADER: Cell[] = ['File Sorgente', 'Cod. Milestone / Attività', 'Descrizione Milestone', 'Figure Professionali', 'Nome Risorsa', 'GG / Uomo', 'Azienda di Appartenenza', 'CV Allegato', 'Altri Allegati', 'Numero IF'];
const row = (o: { cod?: string; desc?: string; fig?: string | null; nome?: string | null; gg?: Cell; az?: string | null; ifn?: Cell }): Cell[] => [
  'C:\\Users\\x\\file.xlsx', o.cod ?? 'MLS01', o.desc ?? 'Milestone', o.fig === undefined ? 'Strategy Consultant' : o.fig, o.nome ?? null,
  o.gg === undefined ? 10 : o.gg, o.az === undefined ? 'Intellera Consulting S.p.A.' : o.az, null, null, o.ifn === undefined ? 20260001 : o.ifn,
];
const gdlBook = (rows: Cell[][], header: Cell[] = HEADER) => workbook({ 'GdL - Gruppo di Lavoro': [header, ...rows] });

describe('tipoFromCodice', () => {
  it('maps the activity code prefix to the kind of supply', () => {
    expect(tipoFromCodice('MLS01')).toBe('corpo');
    expect(tipoFromCodice('CAN02')).toBe('canone');
    expect(tipoFromCodice('CONS01')).toBe('consumo');
    expect(tipoFromCodice('mls03')).toBe('corpo');
  });

  it('unknown or missing codes have no kind', () => {
    expect(tipoFromCodice('XYZ01')).toBeNull();
    expect(tipoFromCodice('')).toBeNull();
    expect(tipoFromCodice(null)).toBeNull();
  });
});

describe('ggFromCell', () => {
  it('reads numbers and numeric text, including decimals', () => {
    expect(ggFromCell(76.5)).toBe(76.5);
    expect(ggFromCell(0)).toBe(0);
    expect(ggFromCell('33,3')).toBeCloseTo(33.3);
    expect(ggFromCell('1.234,5')).toBeCloseTo(1234.5);
  });

  it('REGRESSION: empty, unreadable or negative values are null, never 0', () => {
    for (const v of [null, undefined, '', '   ', 'n.d.', '-', -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ggFromCell(v), String(v)).toBeNull();
    }
  });
});

describe('partnerName', () => {
  it('recognises every RTI partner, Intellera included, whatever the legal form', () => {
    expect(partnerName('Intellera Consulting S.p.A.')).toBe('Intellera');
    expect(partnerName('Deloitte Consulting S.r.l. Società Benefit')).toBe('Deloitte');
    expect(partnerName('Accenture S.p.A.')).toBe('Accenture');
    expect(partnerName('GELLIFY srl')).toBe('Gellify');
  });

  it('an unknown company is null (not silently Intellera); blank is null', () => {
    expect(partnerName('Rossi & Figli Srl')).toBeNull();
    expect(partnerName('')).toBeNull();
    expect(partnerName(null)).toBeNull();
  });
});

describe('parseGdl', () => {
  it('reads one row per activity, figure and resource with its kind, GG and company', () => {
    const rows = parseGdl(readWorkbook(gdlBook([
      row({ cod: 'MLS01', fig: 'Health Care Consultant Senior', gg: 48 }),
      row({ cod: 'CAN02', fig: 'Program Manager', gg: 63, az: 'Deloitte Consulting S.r.l. Società Benefit' }),
      row({ cod: 'CONS01', fig: 'Business Consultant Senior', nome: 'Mario Rossi', gg: 90, az: 'Accenture S.p.A.' }),
    ])));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ numero_if: '20260001', codice: 'MLS01', tipo: 'corpo', figura: 'Health Care Consultant Senior', gg: 48, azienda: 'Intellera', nome_risorsa: null });
    expect(rows[1]).toMatchObject({ tipo: 'canone', azienda: 'Deloitte', gg: 63 });
    expect(rows[2]).toMatchObject({ tipo: 'consumo', azienda: 'Accenture', nome_risorsa: 'Mario Rossi' });
  });

  it('REGRESSION: identical rows of the same figure are different people and are all kept', () => {
    const rows = parseGdl(readWorkbook(gdlBook([row({ gg: 52 }), row({ gg: 52 }), row({ gg: 52 })])));
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + (r.gg ?? 0), 0)).toBe(156);
  });

  it('keeps a row without GG as null; drops rows with no IF or no figure', () => {
    const rows = parseGdl(readWorkbook(gdlBook([
      row({ gg: null }),
      row({ gg: 'n.d.' }),
      row({ ifn: null }),
      row({ fig: null }),
    ])));
    expect(rows.map((r) => r.gg)).toEqual([null, null]);
  });

  it('does not store the source file path (it carries a local user path)', () => {
    const rows = parseGdl(readWorkbook(gdlBook([row({})])));
    expect(JSON.stringify(rows)).not.toContain('Users');
  });

  it('an unknown company keeps its name; a missing one is null', () => {
    const rows = parseGdl(readWorkbook(gdlBook([row({ az: 'Rossi & Figli Srl' }), row({ az: null })])));
    expect(rows.map((r) => r.azienda)).toEqual(['Rossi & Figli Srl', null]);
  });

  it('reads the columns by header, whatever their order, case or accents', () => {
    const header: Cell[] = ['numero if', 'GG / UOMO', 'figure professionali', 'cod. milestone / attivita', 'azienda di appartenenza'];
    const rows = parseGdl(readWorkbook(gdlBook([[20260009, 12, 'Project Manager', 'CAN01', 'Accenture S.p.A.']], header)));
    expect(rows).toEqual([{ numero_if: '20260009', codice: 'CAN01', tipo: 'canone', descrizione: null, figura: 'Project Manager', nome_risorsa: null, gg: 12, azienda: 'Accenture' }]);
  });

  it('a workbook without the sheet gives no rows', () => {
    expect(parseGdl(readWorkbook(workbook({ Altro: [['a']] })))).toEqual([]);
  });

  it('fails explicitly beyond the size limit', () => {
    const rows = Array.from({ length: MAX_GDL_ROWS + 1 }, () => ({}));
    expect(() => parseGdlRows(rows)).toThrow(/massimo/);
  });
});

describe('parseAggregatore / parseFile carry the GdL rows', () => {
  const book = gdlBook([row({ fig: 'Strategy Consultant', gg: 10 }), row({ fig: 'Strategy Consultant', gg: 6 }), row({ fig: 'Project Manager', gg: 4, ifn: 20260002 })]);

  it('returns gdl rows next to the seniority totals, with the same GG', () => {
    const r = parseAggregatore(book);
    expect(r.gdl).toHaveLength(3);
    const total = r.gdl.reduce((s, x) => s + (x.gg ?? 0), 0);
    expect(r.seniority.reduce((s, x) => s + x.gg, 0)).toBe(total);
  });

  it('is exposed by parseFile for an Aggregatore upload', () => {
    const parsed = parseFile('Aggregatore_Dati_ARIA.xlsm', book);
    expect(parsed.kind).toBe('aggregatore');
    expect(parsed.gdl).toHaveLength(3);
  });
});

describe('modalitaFromGdl', () => {
  const r = (numero_if: string, tipo: 'corpo' | 'canone' | 'consumo' | null) => ({ numero_if, codice: null, tipo, descrizione: null, figura: 'X', nome_risorsa: null, gg: 1, azienda: null });

  it('a single kind gives its label, several kinds are combined in a fixed order', () => {
    const m = modalitaFromGdl([r('A', 'canone'), r('A', 'canone'), r('B', 'consumo'), r('C', 'canone'), r('C', 'corpo')]);
    expect(m.get('A')).toBe('A canone');
    expect(m.get('B')).toBe('A consumo');
    expect(m.get('C')).toBe('A corpo + A canone');
  });

  it('IFs without any recognised code are absent; no rows give an empty map', () => {
    expect(modalitaFromGdl([r('A', null)]).has('A')).toBe(false);
    expect(modalitaFromGdl([]).size).toBe(0);
  });
});

describe('parseAggregatore completes the missing modalità from the GdL', () => {
  const generalita: Cell[] = ['File Sorgente', 'Numero IF', 'Titolo Intervento', 'Importo Intervento'];
  const oggetto: Cell[] = ['File Sorgente', 'Modalità Fornitura', 'Fornitore'];
  const book = (modalita: string | null) =>
    workbook({
      'Generalità Intervento': [generalita, ['f1', 20260001, 'Uno', 1000]],
      'Oggetto Fornitura': [oggetto, ['f1', modalita, 'Intellera Consulting S.p.A.']],
      'GdL - Gruppo di Lavoro': [HEADER, row({ cod: 'CAN01', ifn: 20260001 }), row({ cod: 'CAN02', ifn: 20260001 })],
    });

  it('fills a missing modalità with the one found in the GdL codes', () => {
    expect(parseAggregatore(book(null)).interventi[0].modalita_if).toBe('A canone');
  });

  it('REGRESSION: a modalità already reported by "Oggetto Fornitura" is never replaced', () => {
    expect(parseAggregatore(book('A_corpo')).interventi[0].modalita_if).toBe('A corpo');
  });
});
