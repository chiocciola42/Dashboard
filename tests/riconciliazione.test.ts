import { describe, expect, it } from 'vitest';
import {
  MAX_IF,
  MAX_RIGHE,
  RiconciliazioneInputError,
  arrotonda,
  classifica,
  conta,
  esitoRti,
  ricostruisci,
  riconcilia,
  tariffeDa,
  type Esito,
  type RiconciliazioneInput,
} from '@/lib/riconciliazione';
import type { FornituraRiga, GdlRiga, Seniority } from '@/lib/types';

// Tariffe di gara e casi tratti da dati reali verificati (ricostruzione esatta dal file Aggregatore).
const SEN: Seniority[] = [
  { figura: 'Strategy Consultant', code: 'SC', gg: 0, tariffa: 527.16 },
  { figura: 'Health-Care Consultant Manager', code: 'HCM', gg: 0, tariffa: 421.73 },
  { figura: 'Health Care Consultant Senior', code: 'HCS', gg: 0, tariffa: 346.09 },
  { figura: 'Health Care Consultant Junior', code: 'HCJ', gg: 0, tariffa: 263.58 },
  { figura: 'Business Consultant Junior', code: 'BCJ', gg: 0, tariffa: 197.69 },
  { figura: 'Business Consultant Senior', code: 'BCS', gg: 0, tariffa: 267.02 },
];

const g = (numero_if: string, codice: string, figura: string | null, gg: number | null, azienda: string | null = 'Intellera'): GdlRiga => ({
  numero_if, codice, tipo: null, descrizione: null, figura, nome_risorsa: null, gg, azienda,
});
const f = (numero_if: string, codice: string | null, costo: number | null, fornitore: string | null = 'Intellera'): FornituraRiga => ({
  numero_if, num_linea: null, modalita: null, codice, descrizione: null, quantita: null, costo_unitario: null, costo_complessivo: costo, fornitore,
});
const input = (o: Partial<RiconciliazioneInput>): RiconciliazioneInput => ({ interventi: [], gdl: [], fornitura: [], seniority: SEN, ...o });
const trova = (esiti: Esito[], livello: Esito['livello'], chiave = '', numeroIf: string | null = null) =>
  esiti.find((e) => e.livello === livello && e.chiave === chiave && (numeroIf == null || e.numero_if === numeroIf)) as Esito;

// IF 20260488 MLS01 dal file reale: costo importato 41.151,82 €.
const MLS01: GdlRiga[] = [
  g('488', 'MLS01', 'Strategy Consultant', 4),
  g('488', 'MLS01', 'Health-Care Consultant Manager', 16),
  g('488', 'MLS01', 'Health Care Consultant Senior', 48),
  g('488', 'MLS01', 'Health Care Consultant Junior', 34),
  g('488', 'MLS01', 'Business Consultant Junior', 34),
];

describe('aritmetica e classificazione', () => {
  it('arrotonda ai centesimi', () => {
    expect(arrotonda(1.005 + 1e-9)).toBe(1.01);
    expect(arrotonda(41151.819999999996)).toBe(41151.82);
  });

  it('quadra entro 0,05 €, arrotondamento entro la soglia, altrimenti discrepanza (anche in negativo)', () => {
    expect(classifica(0.05, 1)).toBe('quadra');
    expect(classifica(-0.05, 1)).toBe('quadra');
    expect(classifica(0.06, 1)).toBe('arrotondamento');
    expect(classifica(-1, 1)).toBe('arrotondamento');
    expect(classifica(1.01, 1)).toBe('discrepanza');
    expect(classifica(-5000, 1.35)).toBe('discrepanza');
  });
});

describe('tariffeDa', () => {
  it('keeps only positive finite tariffs, matching figures with or without hyphen', () => {
    const t = tariffeDa([
      { figura: 'A', code: 'A', gg: 1, tariffa: 100 },
      { figura: 'B', code: 'B', gg: 1, tariffa: null },
      { figura: 'C', code: 'C', gg: 1, tariffa: 0 },
      { figura: 'D', code: 'D', gg: 1, tariffa: Number.NaN },
      { figura: 'Health-Care Manager', code: 'H', gg: 1, tariffa: 421.73 },
    ]);
    expect([...t.keys()].sort()).toEqual(['a', 'health care manager']);
    expect(t.get('health care manager')).toBe(421.73);
  });
});

describe('ricostruisci', () => {
  const t = tariffeDa(SEN);

  it('REGRESSION: the milestone verified on real data reconstructs to the cent (41.151,82 €)', () => {
    const r = ricostruisci(MLS01, t);
    expect(r).toMatchObject({ ok: true, ricostruito: 41151.82 });
  });

  it('the rounding allowance is 0,01 € + Σ 0,005 × tariffa, per row', () => {
    const r = ricostruisci([g('1', 'X', 'Business Consultant Senior', 10), g('1', 'X', 'Strategy Consultant', 5)], t);
    expect(r).toMatchObject({ ok: true, ammesso: arrotonda(0.01 + 0.005 * 267.02 + 0.005 * 527.16) });
  });

  it('is not reconstructible without rows, with missing days or with a missing tariff', () => {
    expect(ricostruisci([], t)).toEqual({ ok: false, motivo: 'nessuna riga GdL' });
    expect(ricostruisci([g('1', 'X', 'Strategy Consultant', null)], t)).toEqual({ ok: false, motivo: 'giornate mancanti (1 riga)' });
    expect(ricostruisci([g('1', 'X', 'Strategy Consultant', 1), g('1', 'X', 'Strategy Consultant', null), g('1', 'X', 'Project Manager', 2), g('1', 'X', null, 1)], t)).toEqual({
      ok: false,
      motivo: 'giornate mancanti (1 riga)',
    });
    expect(ricostruisci([g('1', 'X', 'Project Manager', 2), g('1', 'X', 'Team Leader', 1), g('1', 'X', null, 3)], t)).toEqual({
      ok: false,
      motivo: 'tariffa mancante: (senza figura), Project Manager, Team Leader',
    });
  });

  it('a partial sum is never returned: one row without tariff makes the whole group not comparable', () => {
    const r = ricostruisci([g('1', 'X', 'Strategy Consultant', 4), g('1', 'X', 'Project Manager', 2)], t);
    expect(r.ok).toBe(false);
  });
});

describe('riconcilia — IF', () => {
  it('an IF whose amount equals Σ gg × tariffa squares', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '488', importo: 41151.82 }], gdl: MLS01 }));
    expect(trova(r.esiti, 'if')).toMatchObject({ stato: 'quadra', importato: 41151.82, ricostruito: 41151.82, differenza: 0 });
  });

  it('REGRESSION: days scaled to 9 months against costs for 6 months is a discrepancy of exactly +50% (IF 20260541)', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '541', importo: 8010.6 }], gdl: [g('541', 'CAN01', 'Business Consultant Senior', 45)] }));
    expect(trova(r.esiti, 'if')).toMatchObject({ stato: 'discrepanza', ricostruito: 12015.9, differenza: 4005.3 });
  });

  it('REGRESSION: a rounding of the days (33,33 instead of 33,3333) is absorbed, not reported', () => {
    // importo vero = 100/3 GG × 346,09 = 11.536,33; il foglio riporta 33,33 GG
    const r = riconcilia(input({ interventi: [{ numero_if: 'R', importo: 11536.33 }], gdl: [g('R', 'MLS01', 'Health Care Consultant Senior', 33.33)] }));
    expect(trova(r.esiti, 'if')).toMatchObject({ stato: 'arrotondamento' });
    expect((trova(r.esiti, 'if').differenza as number) < 0).toBe(true);
  });

  it('an IF without GdL rows, with missing days or without a tariff is not comparable, with the reason', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: 'A', importo: 10 }, { numero_if: 'B', importo: 20 }, { numero_if: 'C', importo: 30 }],
        gdl: [g('B', 'CAN01', 'Strategy Consultant', null), g('C', 'MLS01', 'Project Manager', 3)],
      }),
    );
    expect(trova(r.esiti, 'if', '', 'A')).toMatchObject({ stato: 'non_confrontabile', motivo: 'nessuna riga GdL', importato: 10 });
    expect(trova(r.esiti, 'if', '', 'B')).toMatchObject({ stato: 'non_confrontabile', motivo: 'giornate mancanti (1 riga)' });
    expect(trova(r.esiti, 'if', '', 'C')).toMatchObject({ stato: 'non_confrontabile', motivo: 'tariffa mancante: Project Manager' });
    expect(r.tariffeMancanti).toEqual(['Project Manager']);
  });

  it('with no tariffs at all nothing is comparable and every figure is reported as missing', () => {
    const r = riconcilia(input({ seniority: [], interventi: [{ numero_if: '488', importo: 41151.82 }], gdl: MLS01 }));
    expect(trova(r.esiti, 'if').stato).toBe('non_confrontabile');
    expect(r.tariffeMancanti).toHaveLength(5);
  });
});

describe('riconcilia — milestone e azienda', () => {
  // Due milestone con costi SCAMBIATI: a livello IF le differenze si compensano.
  const gdl = [g('695', 'MLS06', 'Business Consultant Senior', 10), g('695', 'MLS09', 'Strategy Consultant', 5)];
  const fornitura = [f('695', 'MLS06', 2635.8), f('695', 'MLS09', 2670.2)];
  const interventi = [{ numero_if: '695', importo: 5306.0 }];

  it('REGRESSION: swapped milestones cancel out at IF level but are both reported at milestone level', () => {
    const r = riconcilia(input({ interventi, gdl, fornitura }));
    expect(trova(r.esiti, 'if')).toMatchObject({ stato: 'quadra' });
    expect(trova(r.esiti, 'milestone', 'MLS06')).toMatchObject({ stato: 'discrepanza', differenza: 34.4 });
    expect(trova(r.esiti, 'milestone', 'MLS09')).toMatchObject({ stato: 'discrepanza', differenza: -34.4 });
  });

  it('a milestone cost is the sum of its lines; a milestone with no cost, or a line without cost, is not comparable', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: 'M', importo: 0 }],
        gdl: [g('M', 'MLS01', 'Business Consultant Senior', 10), g('M', 'MLS02', 'Business Consultant Senior', 10), g('M', 'MLS03', 'Business Consultant Senior', 10)],
        fornitura: [f('M', 'MLS01', 1000), f('M', 'MLS01', 1670.2), f('M', 'MLS02', null)],
      }),
    );
    expect(trova(r.esiti, 'milestone', 'MLS01')).toMatchObject({ stato: 'quadra', importato: 2670.2 });
    expect(trova(r.esiti, 'milestone', 'MLS02')).toMatchObject({ stato: 'non_confrontabile' });
    expect(trova(r.esiti, 'milestone', 'MLS03')).toMatchObject({ stato: 'non_confrontabile', importato: null });
  });

  it('company level compares the days of a company with the cost lines of that supplier', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: 'Z', importo: 5306 }],
        gdl: [g('Z', 'MLS01', 'Business Consultant Senior', 10, 'Intellera'), g('Z', 'MLS01', 'Strategy Consultant', 5, 'Deloitte')],
        fornitura: [f('Z', 'MLS01', 2670.2, 'Intellera'), f('Z', 'MLS01', 2400, 'Deloitte')],
      }),
    );
    expect(trova(r.esiti, 'azienda', 'Intellera')).toMatchObject({ stato: 'quadra' });
    expect(trova(r.esiti, 'azienda', 'Deloitte')).toMatchObject({ stato: 'discrepanza', differenza: 235.8 });
  });

  it('a company with no cost lines is not comparable', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: 'Z', importo: 1 }], gdl: [g('Z', 'CAN01', 'Strategy Consultant', 1, 'Accenture')], fornitura: [f('Z', 'CAN01', 527.16, 'Intellera')] }));
    expect(trova(r.esiti, 'azienda', 'Accenture').stato).toBe('non_confrontabile');
  });
});

describe('riconcilia — RTI e dati', () => {
  it('RTI sums only the comparable IFs and carries their allowances', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: '488', importo: 41151.82 }, { numero_if: '541', importo: 8010.6 }, { numero_if: 'X', importo: 999 }],
        gdl: [...MLS01, g('541', 'CAN01', 'Business Consultant Senior', 45)],
      }),
    );
    const rti = trova(r.esiti, 'rti');
    expect(rti.importato).toBe(49162.42);
    expect(rti.ricostruito).toBe(53167.72);
    expect(rti.differenza).toBe(4005.3);
    expect(rti.stato).toBe('discrepanza');
    expect(rti.motivo).toBe('2 IF confrontabili su 3');
  });

  it('esitoRti can be recomputed on any subset of IF outcomes (filtered view)', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '488', importo: 41151.82 }, { numero_if: '541', importo: 8010.6 }], gdl: [...MLS01, g('541', 'CAN01', 'Business Consultant Senior', 45)] }));
    const soloQuadra = r.esiti.filter((e) => e.livello === 'if' && e.numero_if === '488');
    expect(esitoRti(soloQuadra).stato).toBe('quadra');
    expect(esitoRti([]).stato).toBe('non_confrontabile');
  });

  it('data level: the IF amount must equal the sum of its cost lines, and gaps are reported', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: 'A', importo: 100 }, { numero_if: 'B', importo: 100 }, { numero_if: 'C', importo: 100 }, { numero_if: 'D', importo: 100 }],
        gdl: [g('ORFANO', 'MLS01', 'Strategy Consultant', 1)],
        fornitura: [f('A', 'MLS01', 60), f('A', 'MLS02', 40), f('B', 'MLS01', 90), f('C', 'MLS01', null), f('D', null, 100)],
      }),
    );
    const dati = (id: string) => r.esiti.find((e) => e.livello === 'dati' && e.numero_if === id && e.controllo.startsWith('Importo')) as Esito;
    expect(dati('A')).toMatchObject({ stato: 'quadra', differenza: 0 });
    expect(dati('B')).toMatchObject({ stato: 'discrepanza', differenza: -10 });
    expect(dati('C')).toMatchObject({ stato: 'non_confrontabile' });
    expect(dati('D')).toMatchObject({ stato: 'quadra' });
    expect(r.esiti.find((e) => e.controllo === 'Linee di fornitura senza codice milestone')).toMatchObject({ importato: 100, stato: 'non_confrontabile' });
    expect(r.esiti.find((e) => e.controllo === 'IF del GdL assente in «Generalità»')).toMatchObject({ numero_if: null, chiave: 'ORFANO' });
  });

  it('conta counts outcomes by state, optionally for one level', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '488', importo: 41151.82 }, { numero_if: '541', importo: 8010.6 }], gdl: [...MLS01, g('541', 'CAN01', 'Business Consultant Senior', 45)] }));
    expect(conta(r.esiti, 'if')).toEqual({ quadra: 1, arrotondamento: 0, discrepanza: 1, non_confrontabile: 0 });
    expect(Object.values(conta(r.esiti)).reduce((s, n) => s + n, 0)).toBe(r.esiti.length);
  });
});

describe('proprietà e confini', () => {
  it('REGRESSION: tariffs and inputs are never modified', () => {
    const sen = SEN.map((s) => Object.freeze({ ...s }));
    const gdl = MLS01.map((x) => Object.freeze({ ...x }));
    const inp = Object.freeze({ interventi: Object.freeze([{ numero_if: '488', importo: 41151.82 }]), gdl: Object.freeze(gdl), fornitura: Object.freeze([]), seniority: Object.freeze(sen) });
    expect(() => riconcilia(inp as RiconciliazioneInput)).not.toThrow();
    expect(sen.map((s) => s.tariffa)).toEqual(SEN.map((s) => s.tariffa));
  });

  it('empty input gives only the RTI and data outcomes, never an error', () => {
    const r = riconcilia(input({}));
    expect(r.esiti.map((e) => e.livello)).toEqual(['rti']);
    expect(r.esiti[0].stato).toBe('non_confrontabile');
    expect(r.righe).toEqual({ gdl: 0, fornitura: 0 });
  });

  it('rejects invalid input explicitly', () => {
    expect(() => riconcilia(input({ interventi: [{ numero_if: 'A', importo: Number.NaN }] }))).toThrow(RiconciliazioneInputError);
    expect(() => riconcilia(input({ gdl: [g('A', 'X', 'Strategy Consultant', -1)] }))).toThrow(RiconciliazioneInputError);
    expect(() => riconcilia(input({ gdl: [g('A', 'X', 'Strategy Consultant', Number.POSITIVE_INFINITY)] }))).toThrow(RiconciliazioneInputError);
    expect(() => riconcilia(input({ fornitura: [f('A', 'X', Number.NaN)] }))).toThrow(RiconciliazioneInputError);
  });

  it('rejects inputs beyond the size limits', () => {
    expect(() => riconcilia(input({ interventi: new Array(MAX_IF + 1).fill({ numero_if: 'A', importo: 1 }) }))).toThrow(/massimo/);
    expect(() => riconcilia(input({ gdl: new Array(MAX_RIGHE + 1).fill(g('A', 'X', 'Strategy Consultant', 1)) }))).toThrow(/massimo/);
    expect(() => riconcilia(input({ fornitura: new Array(MAX_RIGHE + 1).fill(f('A', 'X', 1)) }))).toThrow(/massimo/);
  });
});
