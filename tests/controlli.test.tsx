// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ControlliPanel from '@/components/panels/ControlliPanel';
import { MAX_RIGHE_VISIBILI, ammesso, differenza, entita, esitiInVista, euro, filtra, ordina } from '@/components/panels/controlli/controlliView';
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
  livello: 'if', numero_if: 'A', chiave: '', controllo: 'Σ gg × tariffa contro importo IF', importato: 100, ricostruito: 100, differenza: 0, ammesso: 1, stato: 'quadra', motivo: null, ...o,
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
    expect(entita(esito({ numero_if: 'A', chiave: 'MLS01' }))).toBe('IF A · MLS01');
    expect(entita(esito({ numero_if: 'A', chiave: '' }))).toBe('IF A');
    expect(entita(esito({ livello: 'rti', numero_if: null, chiave: '' }))).toBe('Contratto');
    expect(entita(esito({ livello: 'dati', numero_if: null, chiave: 'ORFANO' }))).toBe('ORFANO');
  });

  it('esitiInVista keeps the IFs in view, the notes without IF and recomputes the RTI on the view only', () => {
    const tutti = [
      esito({ numero_if: 'A', importato: 100, ricostruito: 100, ammesso: 1 }),
      esito({ numero_if: 'B', importato: 100, ricostruito: 150, differenza: 50, stato: 'discrepanza' }),
      esito({ livello: 'milestone', numero_if: 'B', chiave: 'MLS01' }),
      esito({ livello: 'rti', numero_if: null, importato: 200, ricostruito: 250, differenza: 50, stato: 'discrepanza' }),
      esito({ livello: 'dati', numero_if: null, chiave: 'ORFANO', stato: 'non_confrontabile' }),
    ];
    const vista = esitiInVista(tutti, new Set(['A']));
    expect(vista.filter((e) => e.livello === 'if').map((e) => e.numero_if)).toEqual(['A']);
    expect(vista.some((e) => e.livello === 'milestone')).toBe(false);
    expect(vista.find((e) => e.livello === 'rti')).toMatchObject({ importato: 100, ricostruito: 100, stato: 'quadra' });
    expect(vista.some((e) => e.livello === 'dati' && e.chiave === 'ORFANO')).toBe(true);
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

  it('filtra by level and, optionally, hides what squares', () => {
    const e = [esito({ stato: 'quadra' }), esito({ livello: 'milestone', stato: 'discrepanza' }), esito({ livello: 'azienda', stato: 'non_confrontabile' })];
    expect(filtra(e, 'tutti', true)).toHaveLength(2);
    expect(filtra(e, 'tutti', false)).toHaveLength(3);
    expect(filtra(e, 'milestone', false)).toHaveLength(1);
    expect(filtra(e, 'if', true)).toHaveLength(0);
  });
});

describe('ControlliPanel', () => {
  const base = [
    esito({ numero_if: 'A', stato: 'quadra' }),
    esito({ numero_if: 'B', stato: 'discrepanza', importato: 8010.6, ricostruito: 12015.9, differenza: 4005.3, ammesso: 3.13 }),
    esito({ numero_if: 'C', stato: 'arrotondamento', differenza: -1.15, ammesso: 1.74 }),
    esito({ numero_if: 'D', stato: 'non_confrontabile', importato: 5, ricostruito: null, differenza: null, ammesso: null, motivo: 'tariffa mancante: Team Leader' }),
    esito({ livello: 'milestone', numero_if: 'B', chiave: 'MLS02', stato: 'discrepanza', differenza: 5426.8 }),
  ];
  const mount = (c: Controlli, view = ifs('A', 'B', 'C', 'D')) => render(<ControlliPanel IFs={view} controlli={c} />);
  const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

  it('counts the IF outcomes in the tiles and lists only what does not square by default', () => {
    mount(controlli(base));
    const tiles = document.querySelector('.kpis')?.textContent ?? '';
    expect(tiles).toContain('Quadrano · IF1');
    expect(tiles).toContain('Discrepanze · IF1');
    expect(rows()).toHaveLength(4 + 1); // B, C, D, milestone + riga RTI non confrontabile?
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

  it('the level buttons restrict the table', () => {
    mount(controlli(base));
    fireEvent.click(screen.getByRole('button', { name: 'Milestone' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('MLS02');
    expect(rows()[0].textContent).toContain('5.426,80');
    expect(screen.getByRole('button', { name: 'Milestone' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('respects the filtered view: only the IFs in view and an RTI row recomputed on them', () => {
    mount(controlli(base), ifs('A'));
    fireEvent.click(screen.getByLabelText(/Mostra anche/));
    const text = rows().map((r) => r.textContent).join('|');
    expect(text).toContain('IF A');
    expect(text).not.toContain('IF B');
    expect(text).toContain('Contratto');
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
    fireEvent.click(screen.getByRole('button', { name: 'Milestone' }));
    expect(screen.getByText(/Nessun confronto da mostrare/)).toBeTruthy();
  });

  it('REGRESSION: bounds the rows rendered and says how many are hidden', () => {
    const many = Array.from({ length: MAX_RIGHE_VISIBILI + 25 }, (_, i) => esito({ numero_if: 'A', livello: 'milestone', chiave: `M${i}`, stato: 'discrepanza' }));
    mount(controlli(many));
    fireEvent.click(screen.getByRole('button', { name: 'Milestone' }));
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
    // l'IF 5001 non è nel portafoglio di base: compare come "IF del GdL assente"
    expect(d.controlli.esiti.some((e) => e.livello === 'dati' && e.chiave === '5001')).toBe(true);
    expect(JSON.stringify(d.controlli)).not.toContain('Mario');
    expect(controlliDa({ interventi: [{ numero_if: '5001', importo: 8010.6 }], gdl: [gdl('5001', 'CAN01', 'Business Consultant Senior', 45)], fornitura: [forn('5001', 'CAN01', 8010.6)], seniority: [{ figura: 'Business Consultant Senior', code: 'BCS', gg: 0, tariffa: 267.02 }] }).esiti.find((e) => e.livello === 'if')).toMatchObject({ stato: 'discrepanza', differenza: 4005.3 });
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
