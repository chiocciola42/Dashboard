// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilterBar from '@/components/FilterBar';
import DashboardTabs from '@/components/dashboard/DashboardTabs';
import FilterDropdown from '@/components/filter/FilterDropdown';
import { useChartTooltip } from '@/components/dashboard/useChartTooltip';
import { usePortfolioEditing } from '@/components/dashboard/usePortfolioEditing';
import { useToast } from '@/components/dashboard/useToast';
import { TABS } from '@/lib/dashboardView';
import type { DashboardData, RtiConfig } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fetchWithTimeout', () => ({ fetchWithTimeout: fetchMock }));

const res = (ok: boolean, body: unknown = {}, status = ok ? 200 : 500) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe('useToast', () => {
  beforeEach(() => vi.useFakeTimers());

  it('shows a toast and dismisses it after the default delay', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('ciao'));
    expect(result.current.toast).toEqual({ msg: 'ciao', bad: false });
    act(() => vi.advanceTimersByTime(2599));
    expect(result.current.toast).not.toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.toast).toBeNull();
  });

  it('REGRESSION: a newer toast is not hidden early by the older toast\'s timer', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('uno'));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.showToast('due', true));
    act(() => vi.advanceTimersByTime(1000)); // old timer would have fired here
    expect(result.current.toast).toEqual({ msg: 'due', bad: true });
    act(() => vi.advanceTimersByTime(1700));
    expect(result.current.toast).toBeNull();
  });

  it('honours a custom duration', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('lungo', true, 4000));
    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.toast?.msg).toBe('lungo');
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.toast).toBeNull();
  });

  it('clears its timer on unmount', () => {
    const { result, unmount } = renderHook(() => useToast());
    act(() => result.current.showToast('x'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useChartTooltip', () => {
  it('creates #tip on mount, follows [data-tip] on mousemove, and cleans up on unmount', () => {
    const { unmount } = renderHook(() => useChartTooltip());
    const tip = document.getElementById('tip') as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.style.display).toBe('none');

    const el = document.createElement('span');
    el.setAttribute('data-tip', 'Valore 42');
    document.body.appendChild(el);
    fireEvent.mouseMove(el, { clientX: 10, clientY: 10 });
    expect(tip.style.display).toBe('block');
    expect(tip.textContent).toBe('Valore 42');

    fireEvent.mouseMove(document.body);
    expect(tip.style.display).toBe('none');

    unmount();
    expect(document.getElementById('tip')).toBeNull();
    el.remove();
  });
});

const baseRti = { ceiling: 100, partners: [{ name: 'Intellera', pct: 1, quota: 100, impegnato: 0 }], tot_impegnato: 0, erosione_2026: 0 } as RtiConfig;
const makeInitial = (ifs = [makeIf({ numero_if: 'A', titolo: 'Alfa', importo: 10 }), makeIf({ numero_if: 'B', titolo: 'Beta', importo: 20 })]) =>
  ({ interventi: ifs, rti: baseRti, quota_val: { Intellera: 100 } }) as unknown as DashboardData;

function setup(initial = makeInitial()) {
  const showToast = vi.fn();
  const hook = renderHook((p: { initial: DashboardData }) => usePortfolioEditing({ initial: p.initial, anno: 2026, showToast }), {
    initialProps: { initial },
  });
  return { ...hook, showToast };
}

describe('usePortfolioEditing — onSaveField', () => {
  it('applies the patch optimistically, then keeps the server row and flashes it', async () => {
    const server = makeIf({ numero_if: 'A', titolo: 'Dal server', importo: 10 });
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (release = r)));
    const { result } = setup();

    let p!: Promise<void>;
    act(() => { p = result.current.onSaveField('A', { titolo: 'Ottimistico' }); });
    expect(result.current.interventi[0].titolo).toBe('Ottimistico');
    expect(result.current.savingIds.has('A')).toBe(true);

    await act(async () => { release(res(true, { updated: server })); await p; });
    expect(result.current.interventi[0].titolo).toBe('Dal server');
    expect(result.current.savingIds.has('A')).toBe(false);
    expect(result.current.highlightIds.has('A')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/interventi/A');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ titolo: 'Ottimistico', anno: 2026 });
  });

  it('rolls back and reports when the server refuses', async () => {
    fetchMock.mockResolvedValueOnce(res(false, {}, 500));
    const { result, showToast } = setup();
    await act(async () => { await result.current.onSaveField('A', { titolo: 'X' }); });
    expect(result.current.interventi[0].titolo).toBe('Alfa');
    expect(showToast).toHaveBeenCalledWith('Salvataggio non riuscito', true);
    expect(result.current.savingIds.size).toBe(0);
  });

  it('rolls back on a network error / timeout', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const { result, showToast } = setup();
    await act(async () => { await result.current.onSaveField('A', { titolo: 'X' }); });
    expect(result.current.interventi[0].titolo).toBe('Alfa');
    expect(showToast).toHaveBeenCalledWith('Salvataggio non riuscito', true);
    expect(result.current.savingIds.size).toBe(0);
  });

  it('on 401/403 shows the "session expired" message instead of the generic one', async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValueOnce(res(false, {}, status));
      const { result, showToast } = setup();
      await act(async () => { await result.current.onSaveField('A', { titolo: 'X' }); });
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith('Sessione scaduta: effettua di nuovo il login', true, 4000);
      expect(result.current.interventi[0].titolo).toBe('Alfa');
    }
  });
});

describe('usePortfolioEditing — drawer save', () => {
  it('create: prepends the created IF and returns true', async () => {
    const created = makeIf({ numero_if: 'N', titolo: 'Nuovo' });
    fetchMock.mockResolvedValueOnce(res(true, { created }));
    const { result, showToast } = setup();
    let ok = false;
    await act(async () => { ok = await result.current.onSaveDrawer({ numero_if: 'N', titolo: 'Nuovo' }, true); });
    expect(ok).toBe(true);
    expect(result.current.interventi.map((i) => i.numero_if)).toEqual(['N', 'A', 'B']);
    expect(showToast).toHaveBeenCalledWith('Intervento creato');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/interventi');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('create: surfaces the server error message and returns false', async () => {
    fetchMock.mockResolvedValueOnce(res(false, { error: 'Duplicato' }, 409));
    const { result, showToast } = setup();
    let ok = true;
    await act(async () => { ok = await result.current.onSaveDrawer({ numero_if: 'A', titolo: 'x' }, true); });
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Duplicato', true);
    expect(result.current.interventi).toHaveLength(2);
  });

  it('create: falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('x'); } } as unknown as Response);
    const { result, showToast } = setup();
    await act(async () => { await result.current.onSaveDrawer({ numero_if: 'A', titolo: 'x' }, true); });
    expect(showToast).toHaveBeenCalledWith('Creazione non riuscita', true);
  });

  it('edit: replaces the row with the server version', async () => {
    const updated = makeIf({ numero_if: 'A', titolo: 'Aggiornato' });
    fetchMock.mockResolvedValueOnce(res(true, { updated }));
    const { result, showToast } = setup();
    let ok = false;
    await act(async () => { ok = await result.current.onSaveDrawer({ numero_if: 'A', titolo: 'Aggiornato' }, false); });
    expect(ok).toBe(true);
    expect(result.current.interventi[0].titolo).toBe('Aggiornato');
    expect(showToast).toHaveBeenCalledWith('Modifiche salvate');
  });

  it('edit: refusal returns false and leaves the list untouched', async () => {
    fetchMock.mockResolvedValueOnce(res(false, {}, 500));
    const { result, showToast } = setup();
    let ok = true;
    await act(async () => { ok = await result.current.onSaveDrawer({ numero_if: 'A', titolo: 'x' }, false); });
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Salvataggio non riuscito', true);
    expect(result.current.interventi[0].titolo).toBe('Alfa');
  });

  it('a network error is reported as "Errore di rete" and returns false', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const { result, showToast } = setup();
    let ok = true;
    await act(async () => { ok = await result.current.onSaveDrawer({ numero_if: 'A', titolo: 'x' }, false); });
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Errore di rete', true);
  });
});

describe('usePortfolioEditing — onDelete', () => {
  it('removes the IF optimistically and keeps it removed on success', async () => {
    fetchMock.mockResolvedValueOnce(res(true));
    const { result, showToast } = setup();
    await act(async () => { await result.current.onDelete('A'); });
    expect(result.current.interventi.map((i) => i.numero_if)).toEqual(['B']);
    expect(showToast).toHaveBeenCalledWith('IF A eliminato');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('restores the IF when the server refuses, and on a network error', async () => {
    fetchMock.mockResolvedValueOnce(res(false, {}, 500)).mockRejectedValueOnce(new Error('x'));
    const { result, showToast } = setup();
    await act(async () => { await result.current.onDelete('A'); });
    expect(result.current.interventi).toHaveLength(2);
    await act(async () => { await result.current.onDelete('A'); });
    expect(result.current.interventi).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith('Eliminazione non riuscita', true);
  });
});

describe('usePortfolioEditing — RTI and sync', () => {
  it('onUpdateRti merges the server RTI and updates the quotas', async () => {
    const updated = { ...baseRti, ceiling: 200, partners: [{ name: 'Intellera', pct: 1, quota: 200, impegnato: 0 }] };
    fetchMock.mockResolvedValueOnce(res(true, { rti: updated }));
    const { result, showToast } = setup();
    await act(async () => { await result.current.onUpdateRti({ massimale_totale: 200, quota_intellera_pct: 100, quota_deloitte_pct: 0 }); });
    expect(result.current.rti.ceiling).toBe(200);
    expect(result.current.quotaVal).toEqual({ Intellera: 200 });
    expect(showToast).toHaveBeenCalledWith('Parametri RTI aggiornati');
  });

  it('onUpdateRti reports failure and keeps the current RTI', async () => {
    fetchMock.mockResolvedValueOnce(res(false, {}, 500));
    const { result, showToast } = setup();
    await act(async () => { await result.current.onUpdateRti({ massimale_totale: 1, quota_intellera_pct: 1, quota_deloitte_pct: 99 }); });
    expect(result.current.rti.ceiling).toBe(100);
    expect(showToast).toHaveBeenCalledWith('Aggiornamento RTI non riuscito', true);
  });

  it('re-syncs from a new `initial` payload (e.g. after router.refresh())', () => {
    const { result, rerender } = setup();
    expect(result.current.interventi).toHaveLength(2);
    rerender({ initial: makeInitial([makeIf({ numero_if: 'Z', titolo: 'Zeta' })]) });
    expect(result.current.interventi.map((i) => i.numero_if)).toEqual(['Z']);
  });

  it('highlight is cleared after the flash delay', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(res(true, { updated: makeIf({ numero_if: 'A' }) }));
    const { result } = setup();
    await act(async () => { await result.current.onSaveField('A', { titolo: 'x' }); });
    expect(result.current.highlightIds.has('A')).toBe(true);
    act(() => vi.advanceTimersByTime(1400));
    expect(result.current.highlightIds.has('A')).toBe(false);
  });
});

describe('DashboardTabs', () => {
  it('renders an ARIA tablist with only the active tab focusable', () => {
    render(<DashboardTabs tab={2} onSelect={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(TABS.length);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(tabs[2].tabIndex).toBe(0);
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });

  it('click selects; arrows wrap, Home/End jump, and focus follows', () => {
    const onSelect = vi.fn();
    render(<DashboardTabs tab={0} onSelect={onSelect} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[3]);
    expect(onSelect).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(TABS.length - 1);
    expect(document.activeElement).toBe(tabs[TABS.length - 1]);
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith(TABS.length - 1);
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
    onSelect.mockClear();
    fireEvent.keyDown(tabs[0], { key: 'a' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('FilterDropdown', () => {
  const options = [{ value: 'Alfa', count: 2 }, { value: 'Beta', count: 0 }, { value: 'Gamma', count: 1 }];

  it('opens on click, lists options with counts, disables empty ones, closes on Escape', () => {
    render(<FilterDropdown label="Stato" options={options} selected={[]} multiple onToggle={() => {}} onClear={() => {}} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Filtro Stato/ }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect((screen.getByLabelText(/Beta/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Alfa/) as HTMLInputElement).disabled).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps an already-selected option enabled even with count 0, so it can be removed', () => {
    render(<FilterDropdown label="Stato" options={options} selected={['Beta']} multiple onToggle={() => {}} onClear={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filtro Stato: 1 selezionati/ }));
    expect((screen.getByLabelText(/Beta/) as HTMLInputElement).disabled).toBe(false);
  });

  it('closes on an outside click', () => {
    render(<div><span data-testid="out">out</span><FilterDropdown label="Stato" options={options} selected={[]} multiple onToggle={() => {}} onClear={() => {}} /></div>);
    fireEvent.click(screen.getByRole('button', { name: /Filtro Stato/ }));
    fireEvent.mouseDown(screen.getByTestId('out'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('calls onToggle with the option value', () => {
    const onToggle = vi.fn();
    render(<FilterDropdown label="Stato" options={options} selected={[]} multiple onToggle={onToggle} onClear={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filtro Stato/ }));
    fireEvent.click(screen.getByLabelText(/Gamma/));
    expect(onToggle).toHaveBeenCalledWith('Gamma');
  });

  it('shows a search box only for long lists and filters by it', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `Voce${i}`, count: 1 }));
    render(<FilterDropdown label="Ref" options={many} selected={[]} multiple onToggle={() => {}} onClear={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filtro Ref/ }));
    const search = screen.getByLabelText('Cerca in Ref');
    fireEvent.change(search, { target: { value: 'voce3' } });
    expect(screen.getByLabelText(/Voce3/)).toBeTruthy();
    expect(screen.queryByLabelText(/Voce4/)).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('Nessuna opzione')).toBeTruthy();
  });

  it('single-select offers "Tutte" which calls onClear', () => {
    const onClear = vi.fn();
    render(<FilterDropdown label="Modalità" options={options} selected={['Alfa']} multiple={false} onToggle={() => {}} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: /Filtro Modalità/ }));
    fireEvent.click(screen.getByLabelText('Tutte'));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('FilterBar', () => {
  const IFs = [
    makeIf({ numero_if: '1', fornitore: 'Intellera', stato: 'attivo' }),
    makeIf({ numero_if: '2', fornitore: 'Deloitte', stato: 'chiuso' }),
  ];
  const mount = (filters = {}, viewCount = 2, setFilters = vi.fn()) => {
    render(<FilterBar interventi={IFs} fornitoriFilter={['Intellera', 'Deloitte']} filters={filters} setFilters={setFilters} viewCount={viewCount} viewTot={0} />);
    return setFilters;
  };

  it('picking an option sets that filter', () => {
    const setFilters = mount();
    fireEvent.click(screen.getByRole('button', { name: /Filtro Fornitore/ }));
    fireEvent.click(within(screen.getByRole('listbox')).getByLabelText(/Intellera/));
    expect(setFilters).toHaveBeenCalledWith({ forn: ['Intellera'] });
  });

  it('shows one removable pill per active value, a clear-all, and no empty state when there are results', () => {
    const setFilters = mount({ forn: ['Intellera'], stato: ['attivo'] });
    expect(screen.getAllByRole('button', { name: /Rimuovi filtro/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi filtro Fornitore: Intellera' }));
    expect(setFilters).toHaveBeenLastCalledWith({ stato: ['attivo'], forn: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi tutti i filtri' }));
    expect(setFilters).toHaveBeenLastCalledWith({});
    expect(screen.queryByText('Nessun risultato con i filtri selezionati.')).toBeNull();
  });

  it('with active filters and zero results, shows the empty state with a way out', () => {
    const setFilters = mount({ forn: ['Intellera'] }, 0);
    expect(screen.getByText('Nessun risultato con i filtri selezionati.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi filtri' }));
    expect(setFilters).toHaveBeenCalledWith({});
  });

  it('no pills nor clear-all without filters, even with zero results', () => {
    mount({}, 0);
    expect(screen.queryByRole('button', { name: 'Rimuovi tutti i filtri' })).toBeNull();
    expect(screen.queryByText('Nessun risultato con i filtri selezionati.')).toBeNull();
  });

  it('the attivazione toggle sets and unsets "SI"; secondary toggles hide behind "Più filtri"', () => {
    const setFilters = mount();
    fireEvent.click(screen.getByRole('switch', { name: 'Att. imm.' }));
    expect(setFilters).toHaveBeenLastCalledWith({ att: 'SI' });
    expect(screen.queryByRole('switch', { name: 'Con BO' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostra filtri secondari' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Subappalto' }));
    expect(setFilters).toHaveBeenLastCalledWith({ sub: 'SI' });
    expect(screen.getByRole('switch', { name: 'Con BO' })).toBeTruthy();
  });

  it('announces the live result count', () => {
    mount({}, 7);
    expect(screen.getByText('7').closest('.fcount')?.textContent).toContain('IF');
  });
});
