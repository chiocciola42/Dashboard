import { describe, expect, it } from 'vitest';
import {
  MOD_DOMAIN,
  buildPills,
  clearKey,
  computeDomains,
  computeFacets,
  filterOptionsByQuery,
  removePill,
  setBool,
  setSingle,
  toggleMulti,
  uniq,
} from '@/lib/filterBar';
import { AMBITO_NON_CLASSIFICATO } from '@/lib/queries';
import { makeIf } from './helpers/fixtures';

const IFs = [
  makeIf({ numero_if: '1', fornitore: 'Intellera', ambito: 'Dati', stato: 'attivo', ref_aria: 'R1', ref_fornitore: 'F1', modalita_if: 'A corpo' }),
  makeIf({ numero_if: '2', fornitore: 'Deloitte', ambito: null, stato: 'chiuso', ref_aria: 'R2', ref_fornitore: 'F2', modalita_if: 'A canone' }),
  makeIf({ numero_if: '3', fornitore: 'Intellera', ambito: 'Cloud', stato: 'attivo', ref_aria: null, ref_fornitore: null, modalita_if: 'A consumo' }),
];

describe('uniq', () => {
  it('drops empties and duplicates and sorts with Italian collation', () => {
    expect(uniq(['b', null, 'a', 'b', '', 'è', 'e'])).toEqual(['a', 'b', 'e', 'è']);
  });
});

describe('immutable filter updates', () => {
  it('toggleMulti adds, removes, and unsets the key when it becomes empty', () => {
    const f1 = toggleMulti({}, 'forn', 'A');
    expect(f1).toEqual({ forn: ['A'] });
    const f2 = toggleMulti(f1, 'forn', 'B');
    expect(f2.forn).toEqual(['A', 'B']);
    const f3 = toggleMulti(f2, 'forn', 'A');
    expect(f3.forn).toEqual(['B']);
    expect(toggleMulti(f3, 'forn', 'B').forn).toBeUndefined();
  });

  it('never mutates the filters it receives', () => {
    const f = { forn: ['A'], mod: 'X' };
    toggleMulti(f, 'forn', 'B');
    clearKey(f, 'mod');
    setSingle(f, 'mod', 'Y');
    setBool(f, 'att', true);
    expect(f).toEqual({ forn: ['A'], mod: 'X' });
  });

  it('clearKey removes only that key', () => {
    expect(clearKey({ forn: ['A'], mod: 'X' }, 'mod')).toEqual({ forn: ['A'] });
  });

  it('setSingle clears the key on an empty value; setBool toggles "SI"/undefined', () => {
    expect(setSingle({}, 'mod', 'A corpo').mod).toBe('A corpo');
    expect(setSingle({ mod: 'A corpo' }, 'mod', '').mod).toBeUndefined();
    expect(setBool({}, 'bo', true).bo).toBe('SI');
    expect(setBool({ bo: 'SI' }, 'bo', false).bo).toBeUndefined();
  });
});

describe('computeDomains', () => {
  it('only lists suppliers present in the data, in the configured order', () => {
    const d = computeDomains(IFs, ['Intellera', 'Deloitte', 'Altro']);
    expect(d.forn).toEqual(['Intellera', 'Deloitte']);
  });

  it('collapses empty ambito into the "non classificato" bucket and skips null refs', () => {
    const d = computeDomains(IFs, []);
    expect(d.amb).toContain(AMBITO_NON_CLASSIFICATO);
    expect(d.amb).toContain('Dati');
    expect(d.ref).toEqual(['R1', 'R2']);
    expect(d.refint).toEqual(['F1', 'F2']);
    expect(d.stato).toEqual(['attivo', 'chiuso']);
  });
});

describe('computeFacets', () => {
  const d = computeDomains(IFs, ['Intellera', 'Deloitte']);

  it('with no filters, counts each option over the whole portfolio', () => {
    const f = computeFacets(IFs, {}, d);
    expect(f.fornOpts).toEqual([{ value: 'Intellera', count: 2 }, { value: 'Deloitte', count: 1 }]);
    expect(f.statoOpts).toEqual([{ value: 'attivo', count: 2 }, { value: 'chiuso', count: 1 }]);
    expect(f.modOpts.map((o) => o.value)).toEqual(MOD_DOMAIN);
    expect(f.modOpts.map((o) => o.count)).toEqual([1, 1, 1]);
  });

  it('counts an option against the OTHER active filters only', () => {
    const f = computeFacets(IFs, { forn: ['Deloitte'], stato: ['attivo'] }, d);
    // forn is counted ignoring its own filter, but honouring stato=attivo
    expect(f.fornOpts).toEqual([{ value: 'Intellera', count: 2 }, { value: 'Deloitte', count: 0 }]);
    // stato is counted ignoring its own filter, but honouring forn=Deloitte
    expect(f.statoOpts).toEqual([{ value: 'attivo', count: 0 }, { value: 'chiuso', count: 1 }]);
  });

  it('every option of an empty portfolio has count 0', () => {
    const f = computeFacets([], {}, computeDomains([], ['Intellera']));
    expect(f.fornOpts).toEqual([]);
    expect(f.modOpts.every((o) => o.count === 0)).toBe(true);
  });
});

describe('filterOptionsByQuery', () => {
  const opts = [{ value: 'Alfa', count: 1 }, { value: 'Beta', count: 0 }];
  it('is case-insensitive and keeps everything for an empty query', () => {
    expect(filterOptionsByQuery(opts, '')).toBe(opts);
    expect(filterOptionsByQuery(opts, 'ALF')).toEqual([opts[0]]);
    expect(filterOptionsByQuery(opts, 'zzz')).toEqual([]);
  });
});

describe('pills', () => {
  it('builds one pill per active value, in dimension order, then single/boolean filters', () => {
    const pills = buildPills({ stato: ['attivo'], forn: ['A', 'B'], mod: 'A corpo', att: 'SI', bo: 'SI', sub: 'SI' });
    expect(pills.map((p) => p.id)).toEqual(['forn-A', 'forn-B', 'stato-attivo', 'mod', 'att', 'bo', 'sub']);
    expect(pills[0].text).toBe('Fornitore: A');
    expect(pills[3].text).toBe('Modalità: A corpo');
  });

  it('is empty without filters', () => {
    expect(buildPills({})).toEqual([]);
  });

  it('removePill unticks one value of a multi pill, or clears a single/boolean key', () => {
    const f = { forn: ['A', 'B'], mod: 'X', att: 'SI' };
    const [a, , mod, att] = buildPills(f);
    expect(removePill(f, a)).toEqual({ forn: ['B'], mod: 'X', att: 'SI' });
    expect(removePill(f, mod)).toEqual({ forn: ['A', 'B'], att: 'SI' });
    expect(removePill(f, att)).toEqual({ forn: ['A', 'B'], mod: 'X' });
    expect(removePill({ forn: ['A'] }, buildPills({ forn: ['A'] })[0]).forn).toBeUndefined();
  });
});
