import { describe, expect, it } from 'vitest';
import { MAX_CLASSIFICAZIONI, bdoFromCell, codeFor, parseAggregatore, readClassificazioni } from '@/lib/parsers/parseAggregatore';
import { readWorkbook } from '@/lib/parsers/util';
import { workbook, type Cell } from './helpers/xlsx';

const GEN_HEADER: Cell[] = ['Numero IF', 'Titolo Intervento', 'File Sorgente', 'Ref. Fornitore - Mail', 'Codice Ultimo BDO', 'Macro Classe', 'Importo Intervento'];
const ANAG_HEADER: Cell[] = ['Numero IF', 'Titolo Intervento', 'Ambito', 'Attivazione immediata', 'Note', 'Stato'];
const AMB_HEADER: Cell[] = ['Attivazione immediata', 'Ambito', 'Titolo Intervento', 'Numero IF', 'Colonna1'];

const gen = (ifn: Cell, bdo: Cell = 2026330001): Cell[] => [ifn, `Titolo ${ifn}`, `f${ifn}.xlsx`, 'x@y.it', bdo, 2, 100];

describe('bdoFromCell', () => {
  it('reads a numeric or textual code as an integer string', () => {
    expect(bdoFromCell(2026330502)).toBe('2026330502');
    expect(bdoFromCell('2026330502.0')).toBe('2026330502');
  });
  it('REGRESSION: the "-" placeholder and blanks are not a BDO', () => {
    for (const v of ['-', ' - ', '–', '—', '', null, undefined]) expect(bdoFromCell(v)).toBeNull();
  });
});

describe('REGRESSION: an IF whose BDO is the "-" placeholder has no purchase order', () => {
  it('is "non elaborato" without BO, while a real code is "approvato"', () => {
    const buf = workbook({ 'Generalità Intervento': [GEN_HEADER, gen(20260001, '-'), gen(20260002, null), gen(20260003, 2026330003)] });
    const [a, b, c] = parseAggregatore(buf).interventi;
    expect([a.bdo, a.has_bo, a.stato]).toEqual([null, false, 'non elaborato']);
    expect([b.bdo, b.has_bo, b.stato]).toEqual([null, false, 'non elaborato']);
    expect([c.bdo, c.has_bo, c.stato]).toEqual(['2026330003', true, 'approvato']);
  });
});

describe('readClassificazioni', () => {
  const wb = (sheets: Record<string, Cell[][]>) => readWorkbook(workbook(sheets));

  it('reads ambito and attivazione from Anagrafica IF', () => {
    const m = readClassificazioni(wb({ 'Anagrafica IF': [ANAG_HEADER, [20260001, 'T', 'Prevenzione', 'SI', null, 'Attiva']] }));
    expect(m.get('20260001')).toEqual({ ambito: 'Prevenzione', attivazione: 'SI' });
  });

  it('reads the Ambiti sheet when Anagrafica IF has no value', () => {
    const m = readClassificazioni(
      wb({
        'Anagrafica IF': [ANAG_HEADER, [20260001, 'T', null, null, null, 'Attiva']],
        Ambiti: [AMB_HEADER, ['NO', 'FSE e Presa in Carico', 'T', 20260001, null]],
      }),
    );
    expect(m.get('20260001')).toEqual({ ambito: 'FSE e Presa in Carico', attivazione: 'NO' });
  });

  it('Anagrafica IF wins over Ambiti, field by field', () => {
    const m = readClassificazioni(
      wb({
        'Anagrafica IF': [ANAG_HEADER, [20260001, 'T', 'Prevenzione', null, null, 'Attiva']],
        Ambiti: [AMB_HEADER, ['SI', 'Altro ambito', 'T', 20260001, null]],
      }),
    );
    expect(m.get('20260001')).toEqual({ ambito: 'Prevenzione', attivazione: 'SI' });
  });

  it('accepts "Sì" with accent and rejects anything that is neither SI nor NO', () => {
    const m = readClassificazioni(wb({ Ambiti: [AMB_HEADER, ['Sì', 'A', 'T', 1, null], ['boh', 'B', 'T', 2, null]] }));
    expect(m.get('1')?.attivazione).toBe('SI');
    expect(m.get('2')?.attivazione).toBeNull();
  });

  it('has nothing to read when neither sheet exists', () => {
    expect(readClassificazioni(wb({ Altro: [['x']] })).size).toBe(0);
  });

  it('fails explicitly on an oversized sheet', () => {
    const rows: Cell[][] = [AMB_HEADER];
    for (let i = 0; i <= MAX_CLASSIFICAZIONI; i++) rows.push(['NO', 'A', 'T', i + 1, null]);
    expect(() => readClassificazioni(wb({ Ambiti: rows }))).toThrow(/massimo/);
  });
});

describe('parseAggregatore classification', () => {
  it('REGRESSION: ambito and attivazione come from the filled-in sheets, not from "Macro Classe"', () => {
    const buf = workbook({
      'Generalità Intervento': [GEN_HEADER, gen(20260001), gen(20260002)],
      Ambiti: [AMB_HEADER, ['SI', 'Dematerializzazione prescrizioni e certificati', 'T', 20260001, null]],
    });
    const [a, b] = parseAggregatore(buf).interventi;
    expect(a).toMatchObject({ ambito: 'Dematerializzazione prescrizioni e certificati', attivazione: 'SI' });
    expect(b).toMatchObject({ ambito: null, attivazione: 'NO' });
  });

  it('REGRESSION: the summary table under the Ambiti list creates no phantom IF and no wrong ambito', () => {
    const buf = workbook({
      'Generalità Intervento': [GEN_HEADER, gen(20260001)],
      Ambiti: [
        AMB_HEADER,
        ['NO', 'Prevenzione', 'T', 20260001, null],
        [null, 'Ambito', 'N°IF', 'VALORE TOTALE', '% SUL TOTALE'],
        [null, 'Prevenzione', 10, 0, '#DIV/0!'],
      ],
    });
    const { interventi } = parseAggregatore(buf);
    expect(interventi).toHaveLength(1);
    expect(interventi[0].ambito).toBe('Prevenzione');
  });
});

describe('figure professionali', () => {
  it('REGRESSION: spellings that differ only by hyphen or case are one figure', () => {
    const buf = workbook({
      'GdL - Gruppo di Lavoro': [
        ['Figure Professionali', 'GG / Uomo', 'Numero IF'],
        ['Health-Care Consultant Manager', 10, 1],
        ['Health Care Consultant Manager', 5, 1],
        ['health care consultant  manager', 1, 2],
      ],
    });
    const { seniority } = parseAggregatore(buf);
    expect(seniority).toHaveLength(1);
    expect(seniority[0]).toMatchObject({ code: 'HCM', gg: 16 });
  });

  it('abbreviates Team Leader', () => {
    expect(codeFor('Team Leader')).toBe('TL');
  });
});
