// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ControlliPanel from '@/components/panels/ControlliPanel';
import { LEGENDA, MAX_RIGHE_VISIBILI, ORDINE_CONFRONTI, ammesso, differenza, entita, esitiInVista, euro, filtra, ordina, righePerIf } from '@/components/panels/controlli/controlliView';
import { DASHBOARD_DATA_TAG, getDashboardData } from '@/lib/getDashboardData';
import { persistGdlFromUpload } from '@/lib/gdlStore';
import { persistFornituraFromUpload } from '@/lib/fornituraStore';
import { saveSeniority } from '@/lib/portfolio';
import { controlliDa, type Controlli, type Esito } from '@/lib/riconciliazione';
import type { FornituraRiga, GdlRiga } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

afterEach(cleanup);

const esito = (o: Partial<Esito> = {}): Esito => ({
  confronto: 'gen_gg', numero_if: 'A', controllo: 'Generalità contro Σ gg × tariffa', primo: 100, secondo: 100, differenza: 0, ammesso: 1, stato: 'quadra', motivo: null, ...o,
});
// I tre confronti di un IF: Generalità (g), Σ gg × tariffa (t), Σ Oggetto Fornitura (f).
const tre = (numero_if: string, g: number, t: number | null, f: number | null): Esito[] => {
  const e = (confronto: Esito['confronto'], primo: number | null, secondo: number | null, ammesso: number): Esito => {
    if (primo == null || secondo == null) return esito({ confronto, numero_if, primo, secondo, differenza: null, ammesso: null, stato: 'non_confrontabile', motivo: 'dato mancante' });
    const d = Math.round((secondo - primo) * 100) / 100;
    return esito({ confronto, numero_if, primo, secondo, differenza: d, ammesso, stato: d === 0 ? 'quadra' : Math.abs(d) <= ammesso ? 'arrotondamento' : 'discrepanza' });
  };
  return [e('gen_gg', g, t, 1), e('gen_forn', g, f, 0.05), e('gg_forn', t, f, 1)];
};
const controlli = (esiti: Esito[], o: Partial<Controlli> = {}): Controlli => ({ esiti, tariffeMancanti: [], righe: { gdl: esiti.length, fornitura: esiti.length }, errore: null, ...o });
const ifs = (...ids: string[]) => ids.map((numero_if) => makeIf({ numero_if }));

describe('controlliView', () => {
  it('formats amounts, signed differences and allowances', () => {
    expect(euro(null)).toBe('—');
    expect(euro(41151.82)).toContain('41.151,82');
    expect(euro(41151.82)).toMatch(/^€ /);
    expect(differenza(null)).toBe('—');
    expect(differenza(0)).toContain('0,00');
    expect(differenza(4005.3)).toBe('+€ 4.005,30');
    expect(differenza(-1737.37)).toBe('−€ 1.737,37');
    expect(euro(2963.93)).toBe('€ 2.963,93');
    expect(ammesso(3.13)).toMatch(/^± .*3,13/);
    expect(ammesso(null)).toBe('—');
  });

  it('names the entity compared', () => {
    expect(entita({ numero_if: 'A' })).toBe('IF A');
  });

  it('esitiInVista keeps only the outcomes of the IFs in view', () => {
    const tutti = [...tre('A', 100, 100, 100), ...tre('B', 100, 100, 100)];
    expect(esitiInVista(tutti, new Set(['B'])).every((e) => e.numero_if === 'B')).toBe(true);
    expect(esitiInVista(tutti, new Set(['B']))).toHaveLength(3);
  });

  it('righePerIf puts the three values side by side, one row per IF', () => {
    const [r] = righePerIf(tre('A', 100, 120, 90));
    expect(r).toMatchObject({ numero_if: 'A', generalita: 100, gg: 120, fornitura: 90, stato: 'discrepanza' });
    expect(ORDINE_CONFRONTI.map((k) => r.confronti[k].differenza)).toEqual([20, -10, -30]);
  });

  it('righePerIf: a missing value keeps the others, and the reason is listed once', () => {
    const [r] = righePerIf(tre('A', 100, null, 100));
    expect(r).toMatchObject({ generalita: 100, gg: null, fornitura: 100, stato: 'non_confrontabile', motivi: ['dato mancante'] });
  });

  it('the state of an IF is the worst of its three comparisons', () => {
    expect(righePerIf(tre('A', 100, 100, 100))[0].stato).toBe('quadra');
    expect(righePerIf(tre('A', 100, 100.5, 100))[0].stato).toBe('arrotondamento');
    expect(righePerIf(tre('A', 100, 100.5, null))[0].stato).toBe('non_confrontabile');
  });

  it('ordina puts the biggest discrepancy first, then non-comparable, rounding and what squares', () => {
    const rows = righePerIf([...tre('A', 100, 100, 100), ...tre('B', 100, 100.5, 100), ...tre('C', 100, 110, 100), ...tre('D', 100, null, 100), ...tre('E', 100, 5100, 100)]);
    expect(ordina(rows).map((x) => x.numero_if)).toEqual(['E', 'C', 'D', 'B', 'A']);
    expect(rows.map((x) => x.numero_if)).toEqual(['A', 'B', 'C', 'D', 'E']); // l'input non è modificato
  });

  it('filtra hides the IFs where all three comparisons square, unless asked', () => {
    const rows = righePerIf([...tre('A', 100, 100, 100), ...tre('B', 100, 110, 100)]);
    expect(filtra(rows, true).map((r) => r.numero_if)).toEqual(['B']);
    expect(filtra(rows, false)).toHaveLength(2);
  });

  it('the legend documents every column of the table, with formula and source', () => {
    expect(LEGENDA.map((l) => l.colonna)).toEqual([
      'Generalità',
      'Σ gg × tariffa',
      'Σ Oggetto Fornitura',
      'GG × profilo − Generalità',
      'Fornitura − Generalità',
      'Fornitura − GG × profilo',
      'Stato',
    ]);
    expect(LEGENDA.every((l) => l.formula && l.fonte)).toBe(true);
  });
});

describe('ControlliPanel', () => {
  const base = [...tre('A', 100, 100, 100), ...tre('B', 8010.6, 12015.9, 8010.6), ...tre('C', 100, 100.5, 100), ...tre('D', 5, null, 5)];
  const mount = (c: Controlli, view = ifs('A', 'B', 'C', 'D')) => render(<ControlliPanel IFs={view} controlli={c} />);
  const main = () => screen.getByRole('table', { name: /Confronto per IF/ });
  const rows = () => within(main()).getAllByRole('row').slice(1);

  it('is a single view: no tabs, one table with the three values and the three differences as columns', () => {
    mount(controlli(base));
    expect(screen.queryByRole('group', { name: /Confronto/ })).toBeNull();
    const heads = within(main()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['IF', 'Generalità', 'Σ gg × tariffa', 'Σ Oggetto Fornitura', 'GG × profilo − Generalità', 'Fornitura − Generalità', 'Fornitura − GG × profilo', 'Stato']);
  });

  it('shows one row per IF with the three amounts, hiding what squares by default', () => {
    mount(controlli(base));
    expect(rows()).toHaveLength(3); // B, C, D; A quadra è nascosto
    const b = rows().find((r) => r.textContent?.includes('IF B')) as HTMLElement;
    expect(b.textContent).toContain('8.010,60');
    expect(b.textContent).toContain('12.015,90');
    expect(b.textContent).toContain('+€ 4.005,30');
  });

  it('shows what squares too once asked', () => {
    mount(controlli(base));
    fireEvent.click(screen.getByLabelText(/Mostra anche i confronti che quadrano/));
    expect(rows()).toHaveLength(4);
    expect(screen.getAllByText('Quadra').length).toBeGreaterThan(0);
  });

  it('states are always written, never colour only; the reason of a non-comparable one is shown', () => {
    mount(controlli(base));
    expect(screen.getAllByText('Discrepanza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Arrotondamento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('dato mancante').length).toBeGreaterThan(0);
  });

  it('puts the formulas and sources summary at the bottom, after the table', () => {
    mount(controlli(base));
    const legenda = screen.getByTestId('legenda-controlli');
    expect(within(legenda).getByText('Formule e fonti')).toBeTruthy();
    expect(legenda.textContent).toContain('Foglio «GdL - Gruppo di Lavoro»');
    expect(legenda.textContent).toContain('Foglio «Oggetto Fornitura»');
    expect(legenda.textContent).toContain('Importo Previsto');
    expect(main().compareDocumentPosition(legenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('respects the filtered view: only the IFs in view', () => {
    mount(controlli(base), ifs('A'));
    fireEvent.click(screen.getByLabelText(/Mostra anche/));
    const text = rows().map((r) => r.textContent).join('|');
    expect(text).toContain('IF A');
    expect(text).not.toContain('IF B');
  });

  it('warns about the missing tariffs and says they are only changed by hand', () => {
    mount(controlli(base, { tariffeMancanti: ['Project Manager', 'Team Leader'] }));
    const notice = screen.getByTestId('tariffe-mancanti');
    expect(notice.textContent).toContain('Tariffe di gara mancanti');
    expect(notice.textContent).toContain('Project Manager, Team Leader');
    expect(notice.textContent).toContain('solo a mano');
  });

  it('shows the error when the imported data are inconsistent instead of hiding it', () => {
    mount(controlli([], { errore: 'GG non validi per l\'IF 7' }));
    expect(screen.getByRole('alert').textContent).toContain('Controlli non eseguiti');
    expect(screen.getByRole('alert').textContent).toContain('GG non validi');
  });

  it('with no data at all explains how to get some; with filters hiding everything says so', () => {
    const { unmount } = mount(controlli([], { righe: { gdl: 0, fornitura: 0 } }));
    expect(screen.getByText(/carica un file Aggregatore/)).toBeTruthy();
    unmount();
    mount(controlli(tre('A', 100, 100, 100)), ifs('A'));
    expect(screen.getByText(/Nessun confronto da mostrare/)).toBeTruthy();
  });

  it('REGRESSION: bounds the rows rendered and says how many are hidden', () => {
    const many = Array.from({ length: MAX_RIGHE_VISIBILI + 25 }, (_, i) => tre(`I${i}`, 100, 200, 100)).flat();
    mount(controlli(many), ifs(...many.map((e) => e.numero_if)));
    expect(rows()).toHaveLength(MAX_RIGHE_VISIBILI);
    expect(screen.getByText(new RegExp(`primi ${MAX_RIGHE_VISIBILI} di ${MAX_RIGHE_VISIBILI + 25}`))).toBeTruthy();
  });
});

// Dati reali verificati: milestone MLS01 dell'IF 20260488 = 41.151,82 €; IF 20260541 con giornate a 9 mesi.
describe('getDashboardData carries the reconciliation', () => {
  beforeEach(() => {
    const g = globalThis as Record<string, unknown>;
    for (const k of ['__ARIA_MEM__', '__ARIA_MESI__', '__ARIA_GDL__', '__ARIA_FORN__', '__ARIA_CFG__']) delete g[k];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const gdl = (numero_if: string, codice: string, figura: string, gg: number): GdlRiga => ({ numero_if, codice, tipo: 'corpo', descrizione: null, figura, nome_risorsa: null, gg, azienda: 'Intellera' });
  const forn = (numero_if: string, codice: string, costo: number): FornituraRiga => ({ numero_if, num_linea: '1', modalita: 'corpo', codice, descrizione: null, quantita: 1, costo_unitario: costo, costo_complessivo: costo, fornitore: 'Intellera' });

  it('is exported with the same cache tag as the rest of the payload', () => {
    expect(DASHBOARD_DATA_TAG).toBe('dashboard-data');
  });

  it('computes outcomes from the imported rows and the tariffs stored in the settings; never exposes resource names', async () => {
    await saveSeniority([{ figura: 'Business Consultant Senior', code: 'BCS', gg: 0, tariffa: 267.02 }]);
    await persistGdlFromUpload([{ ...gdl('5001', 'CAN01', 'Business Consultant Senior', 45), nome_risorsa: 'Mario Rossi' }]);
    await persistFornituraFromUpload([forn('5001', 'CAN01', 8010.6)]);
    const d = await getDashboardData();
    expect(d.controlli.errore).toBeNull();
    // l'IF 5001 non è nel portafoglio di base: non produce confronti
    expect(d.controlli.esiti.some((e) => e.numero_if === '5001')).toBe(false);
    expect(JSON.stringify(d.controlli)).not.toContain('Mario');
    expect(controlliDa({ interventi: [{ numero_if: '5001', importo: 8010.6 }], gdl: [gdl('5001', 'CAN01', 'Business Consultant Senior', 45)], fornitura: [forn('5001', 'CAN01', 8010.6)], seniority: [{ figura: 'Business Consultant Senior', code: 'BCS', gg: 0, tariffa: 267.02 }] }).esiti.find((e) => e.confronto === 'gen_gg')).toMatchObject({ stato: 'discrepanza', differenza: 4005.3 });
  });

  it('without tariffs the report lists the figures that need one; without rows it is empty, not an error', async () => {
    await persistGdlFromUpload([gdl('5002', 'MLS01', 'Figura Inventata', 4)]);
    const d = await getDashboardData();
    expect(d.controlli.tariffeMancanti).toContain('Figura Inventata');
    expect(d.controlli.righe).toEqual({ gdl: 1, fornitura: 0 });
    expect(d.controlli.errore).toBeNull();
  });

  it('inconsistent data become an explicit error in the report, not a crash', () => {
    const c = controlliDa({ interventi: [{ numero_if: 'X', importo: Number.NaN }], gdl: [], fornitura: [], seniority: [] });
    expect(c.errore).toMatch(/importo non valido/);
    expect(c.esiti).toEqual([]);
  });
});
