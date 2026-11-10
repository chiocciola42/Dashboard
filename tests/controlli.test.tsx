// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ControlliPanel from '@/components/panels/ControlliPanel';
import { MAX_RIGHE_VISIBILI, SCHEDE, ammesso, differenza, entita, esitiInVista, euro, filtra, intestazioni, ordina } from '@/components/panels/controlli/controlliView';
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
  confronto: 'gen_gg', numero_if: 'A', controllo: 'Generalità contro GG × profilo', primo: 100, secondo: 100, differenza: 0, ammesso: 1, stato: 'quadra', motivo: null, ...o,
});
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
    expect(entita(esito({ numero_if: 'A' }))).toBe('IF A');
  });

  it('there is one tab per comparison, and the column headers name its two terms', () => {
    expect(SCHEDE.map((s) => s.id)).toEqual(['tutti', 'gen_gg', 'forn_gen', 'forn_gg']);
    expect(intestazioni('tutti')).toEqual({ primo: 'Primo valore', secondo: 'Secondo valore' });
    expect(intestazioni('forn_gen')).toMatchObject({ primo: 'Σ Oggetto Fornitura', secondo: 'Generalità (Importo Previsto)' });
  });

  it('esitiInVista keeps only the outcomes of the IFs in view', () => {
    const tutti = [esito({ numero_if: 'A' }), esito({ numero_if: 'B' }), esito({ numero_if: 'B', confronto: 'forn_gg' })];
    expect(esitiInVista(tutti, new Set(['B'])).map((e) => e.numero_if)).toEqual(['B', 'B']);
  });

  it('ordina puts the biggest discrepancy first, then non-comparable, rounding and what squares', () => {
    const e = [
      esito({ numero_if: 'A', stato: 'quadra' }),
      esito({ numero_if: 'B', stato: 'arrotondamento', differenza: -1 }),
      esito({ numero_if: 'C', stato: 'discrepanza', differenza: 10 }),
      esito({ numero_if: 'D', stato: 'non_confrontabile', differenza: null }),
      esito({ numero_if: 'E', stato: 'discrepanza', differenza: -5000 }),
    ];
    expect(ordina(e).map((x) => x.numero_if)).toEqual(['E', 'C', 'D', 'B', 'A']);
    expect(e.map((x) => x.numero_if)).toEqual(['A', 'B', 'C', 'D', 'E']); // l'input non è modificato
  });

  it('filtra by comparison and, optionally, hides what squares', () => {
    const e = [esito({ stato: 'quadra' }), esito({ confronto: 'forn_gen', stato: 'discrepanza' }), esito({ confronto: 'forn_gg', stato: 'non_confrontabile' })];
    expect(filtra(e, 'tutti', true)).toHaveLength(2);
    expect(filtra(e, 'tutti', false)).toHaveLength(3);
    expect(filtra(e, 'forn_gen', false)).toHaveLength(1);
    expect(filtra(e, 'gen_gg', true)).toHaveLength(0);
  });
});

describe('ControlliPanel', () => {
  const base = [
    esito({ numero_if: 'A', stato: 'quadra' }),
    esito({ numero_if: 'B', stato: 'discrepanza', primo: 8010.6, secondo: 12015.9, differenza: 4005.3, ammesso: 3.13 }),
    esito({ numero_if: 'C', stato: 'arrotondamento', differenza: -1.15, ammesso: 1.74 }),
    esito({ numero_if: 'D', stato: 'non_confrontabile', primo: 5, secondo: null, differenza: null, ammesso: null, motivo: 'tariffa mancante: Team Leader' }),
    esito({ confronto: 'forn_gen', numero_if: 'B', stato: 'discrepanza', differenza: 5426.8 }),
  ];
  const mount = (c: Controlli, view = ifs('A', 'B', 'C', 'D')) => render(<ControlliPanel IFs={view} controlli={c} />);
  const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

  it('shows one tile per comparison with its discrepancies, and lists only what does not square by default', () => {
    mount(controlli(base));
    const tiles = document.querySelector('.kpis')?.textContent ?? '';
    expect(tiles).toContain('Generalità ↔ GG × profilo');
    expect(tiles).toContain('Fornitura ↔ Generalità');
    expect(tiles).toContain('Fornitura ↔ GG × profilo');
    expect(rows()).toHaveLength(4); // B, C, D di gen_gg e B di forn_gen; A quadra è nascosto
  });

  it('shows what squares too once asked', () => {
    mount(controlli(base));
    const before = rows().length;
    fireEvent.click(screen.getByLabelText(/Mostra anche i confronti che quadrano/));
    expect(rows().length).toBeGreaterThan(before);
    expect(screen.getAllByText('Quadra').length).toBeGreaterThan(0);
  });

  it('states are always written, never colour only; the reason of a non-comparable one is shown', () => {
    mount(controlli(base));
    expect(screen.getAllByText('Discrepanza').length).toBeGreaterThan(0);
    expect(screen.getByText('Arrotondamento')).toBeTruthy();
    expect(screen.getByText('tariffa mancante: Team Leader')).toBeTruthy();
  });

  it('a comparison tab restricts the table and names the two terms in the headers', () => {
    mount(controlli(base));
    fireEvent.click(screen.getByRole('button', { name: 'Fornitura ↔ Generalità' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('5.426,80');
    expect(screen.getByRole('columnheader', { name: 'Σ Oggetto Fornitura' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Generalità (Importo Previsto)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fornitura ↔ Generalità' }).getAttribute('aria-pressed')).toBe('true');
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
    mount(controlli([esito({ stato: 'quadra' })]), ifs('A'));
    expect(screen.getByText(/Nessun confronto da mostrare/)).toBeTruthy();
  });

  it('REGRESSION: bounds the rows rendered and says how many are hidden', () => {
    const many = Array.from({ length: MAX_RIGHE_VISIBILI + 25 }, (_, i) => esito({ numero_if: `I${i}`, stato: 'discrepanza' }));
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
    expect(controlliDa({ interventi: [{ numero_if: '5001', importo: 8010.6 }], gdl: [gdl('5001', 'CAN01', 'Business Consultant Senior', 45)], fornitura: [forn('5001', 'CAN01', 8010.6)], seniority: [{ figura: 'Business Consultant Senior', code: 'BCS', gg: 0, tariffa: 267.02 }] }).esiti.find((e) => e.confronto === 'forn_gg')).toMatchObject({ stato: 'discrepanza', differenza: 4005.3 });
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
