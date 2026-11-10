import { describe, expect, it } from 'vitest';
import {
  MAX_IF,
  MAX_RIGHE,
  RiconciliazioneInputError,
  arrotonda,
  classifica,
  conta,
  ricostruisci,
  riconcilia,
  tariffeDa,
  type Confronto,
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

const trova = (esiti: Esito[], confronto: Confronto, numeroIf: string): Esito =>
  esiti.find((e) => e.confronto === confronto && e.numero_if === numeroIf) as Esito;

describe('riconcilia — i tre confronti per IF', () => {
  it('REGRESSION: an IF whose Generalità, Σ Oggetto Fornitura and Σ gg × profilo are the same squares on all three', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '488', importo: 41151.82 }], gdl: MLS01, fornitura: [f('488', 'MLS01', 41151.82)] }));
    expect(r.esiti.map((e) => e.confronto)).toEqual(['gen_gg', 'forn_gen', 'forn_gg']);
    expect(trova(r.esiti, 'gen_gg', '488')).toMatchObject({ stato: 'quadra', primo: 41151.82, secondo: 41151.82, differenza: 0 });
    expect(trova(r.esiti, 'forn_gen', '488')).toMatchObject({ stato: 'quadra', primo: 41151.82, secondo: 41151.82 });
    expect(trova(r.esiti, 'forn_gg', '488')).toMatchObject({ stato: 'quadra' });
  });

  it('REGRESSION: days for 9 months against costs and amount for 6 months: only the two comparisons with gg × profilo fail (IF 20260541)', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: '541', importo: 8010.6 }],
        gdl: [g('541', 'CAN01', 'Business Consultant Senior', 45)],
        fornitura: [f('541', 'CAN01', 8010.6)],
      }),
    );
    expect(trova(r.esiti, 'gen_gg', '541')).toMatchObject({ stato: 'discrepanza', primo: 8010.6, secondo: 12015.9, differenza: 4005.3 });
    expect(trova(r.esiti, 'forn_gen', '541')).toMatchObject({ stato: 'quadra' });
    expect(trova(r.esiti, 'forn_gg', '541')).toMatchObject({ stato: 'discrepanza', primo: 8010.6, secondo: 12015.9, differenza: 4005.3 });
  });

  it('Fornitura ↔ Generalità: the difference is secondo − primo = Generalità − Σ costi, tolerance 0,05 €', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: 'B', importo: 100 }], fornitura: [f('B', 'MLS01', 60), f('B', 'MLS02', 30)] }));
    expect(trova(r.esiti, 'forn_gen', 'B')).toMatchObject({ stato: 'discrepanza', primo: 90, secondo: 100, differenza: 10, ammesso: 0.05 });
    const q = riconcilia(input({ interventi: [{ numero_if: 'B', importo: 100.04 }], fornitura: [f('B', 'MLS01', 100)] }));
    expect(trova(q.esiti, 'forn_gen', 'B').stato).toBe('quadra');
  });

  it('the cost lines of an IF are summed, including lines without milestone code', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: 'A', importo: 100 }], fornitura: [f('A', 'MLS01', 60), f('A', null, 40)] }));
    expect(trova(r.esiti, 'forn_gen', 'A')).toMatchObject({ stato: 'quadra', primo: 100 });
  });

  it('REGRESSION: a rounding of the days (33,33 instead of 33,3333) is absorbed by the allowance, not reported', () => {
    // importo vero = 100/3 GG × 346,09 = 11.536,33; il foglio riporta 33,33 GG
    const r = riconcilia(input({ interventi: [{ numero_if: 'R', importo: 11536.33 }], gdl: [g('R', 'MLS01', 'Health Care Consultant Senior', 33.33)], fornitura: [f('R', 'MLS01', 11536.33)] }));
    expect(trova(r.esiti, 'gen_gg', 'R')).toMatchObject({ stato: 'arrotondamento' });
    expect(trova(r.esiti, 'forn_gg', 'R')).toMatchObject({ stato: 'arrotondamento' });
    expect((trova(r.esiti, 'gen_gg', 'R').differenza as number) < 0).toBe(true);
  });

  it('without cost lines the two comparisons with Oggetto Fornitura are not comparable; the third still runs', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '488', importo: 41151.82 }], gdl: MLS01 }));
    expect(trova(r.esiti, 'gen_gg', '488').stato).toBe('quadra');
    expect(trova(r.esiti, 'forn_gen', '488')).toMatchObject({ stato: 'non_confrontabile', primo: null, secondo: 41151.82, motivo: 'costi di fornitura assenti o incompleti' });
    expect(trova(r.esiti, 'forn_gg', '488')).toMatchObject({ stato: 'non_confrontabile', primo: null, motivo: 'costi di fornitura assenti o incompleti' });
  });

  it('a cost line without cost makes the whole sum unusable: never a partial sum', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: 'C', importo: 100 }], fornitura: [f('C', 'MLS01', 60), f('C', 'MLS02', null)] }));
    expect(trova(r.esiti, 'forn_gen', 'C')).toMatchObject({ stato: 'non_confrontabile', primo: null });
  });

  it('an IF without GdL rows, with missing days or without a tariff: only the comparisons using gg × profilo are not comparable, with the reason', () => {
    const r = riconcilia(
      input({
        interventi: [{ numero_if: 'A', importo: 10 }, { numero_if: 'B', importo: 20 }, { numero_if: 'C', importo: 30 }],
        gdl: [g('B', 'CAN01', 'Strategy Consultant', null), g('C', 'MLS01', 'Project Manager', 3)],
        fornitura: [f('A', 'X', 10), f('B', 'X', 20), f('C', 'X', 30)],
      }),
    );
    expect(trova(r.esiti, 'gen_gg', 'A')).toMatchObject({ stato: 'non_confrontabile', motivo: 'nessuna riga GdL', primo: 10, secondo: null });
    expect(trova(r.esiti, 'forn_gg', 'B')).toMatchObject({ stato: 'non_confrontabile', motivo: 'giornate mancanti (1 riga)', primo: 20 });
    expect(trova(r.esiti, 'gen_gg', 'C')).toMatchObject({ stato: 'non_confrontabile', motivo: 'tariffa mancante: Project Manager' });
    for (const id of ['A', 'B', 'C']) expect(trova(r.esiti, 'forn_gen', id).stato).toBe('quadra');
    expect(r.tariffeMancanti).toEqual(['Project Manager']);
  });

  it('with no tariffs at all no comparison with gg × profilo is possible and every figure is reported as missing', () => {
    const r = riconcilia(input({ seniority: [], interventi: [{ numero_if: '488', importo: 41151.82 }], gdl: MLS01 }));
    expect(trova(r.esiti, 'gen_gg', '488').stato).toBe('non_confrontabile');
    expect(r.tariffeMancanti).toHaveLength(5);
  });

  it('GdL or cost rows of an IF not in the portfolio produce no outcome', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: 'A', importo: 1 }], gdl: [g('ORFANO', 'MLS01', 'Strategy Consultant', 1)], fornitura: [f('ORFANO', 'MLS01', 5)] }));
    expect(r.esiti.every((e) => e.numero_if === 'A')).toBe(true);
  });

  it('conta counts outcomes by state, optionally for one comparison', () => {
    const r = riconcilia(input({ interventi: [{ numero_if: '541', importo: 8010.6 }], gdl: [g('541', 'CAN01', 'Business Consultant Senior', 45)], fornitura: [f('541', 'CAN01', 8010.6)] }));
    expect(conta(r.esiti, 'forn_gen')).toEqual({ quadra: 1, arrotondamento: 0, discrepanza: 0, non_confrontabile: 0 });
    expect(conta(r.esiti, 'gen_gg').discrepanza).toBe(1);
    expect(Object.values(conta(r.esiti)).reduce((n, x) => n + x, 0)).toBe(r.esiti.length);
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

  it('empty input gives no outcome, never an error', () => {
    const r = riconcilia(input({}));
    expect(r.esiti).toEqual([]);
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
