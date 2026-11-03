// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegistroPanel from '@/components/panels/RegistroPanel';
import RegistroRow from '@/components/panels/registro/RegistroRow';
import { confirmAndDelete, downloadCsvFile } from '@/components/panels/shared/tableActions';
import { REGISTRO_PAGE } from '@/lib/registroIF';
import { makeIf } from './helpers/fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const IFs = [
  makeIf({ numero_if: '20260001', titolo: 'Alfa', importo: 100, modalita_if: 'A corpo', ref_aria: 'Rossi' }),
  makeIf({ numero_if: '20260002', titolo: 'Beta', importo: 2500, modalita_if: 'A canone' }),
  makeIf({ numero_if: '20260003', titolo: 'Gamma', importo: 30, stato: 'approvato', has_bo: true }),
];
const mount = (over: Partial<React.ComponentProps<typeof RegistroPanel>> = {}) => {
  const handlers = { onSaveField: vi.fn(), onOpenEdit: vi.fn(), onOpenNew: vi.fn(), onDelete: vi.fn() };
  const utils = render(<RegistroPanel IFs={IFs} canEdit savingIds={new Set()} highlightIds={new Set()} anno={2026} {...handlers} {...over} />);
  return { ...utils, ...handlers };
};
const bodyIds = (container: HTMLElement) => [...container.querySelectorAll('tbody td.codecell:first-child')].map((e) => e.textContent);

describe('RegistroPanel — table', () => {
  it('default order is amount descending, with the count and total of the rows shown', () => {
    const { container } = mount();
    expect(bodyIds(container)).toEqual(['20260002', '20260001', '20260003']);
    expect(container.querySelector('.tot')?.textContent).toContain('Mostrati: 3');
    expect(container.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Importo');
  });

  it('typing in the search box filters the rows', async () => {
    const { container } = mount();
    fireEvent.change(screen.getByPlaceholderText(/Cerca IF/), { target: { value: 'rossi' } });
    await act(async () => {});
    expect(bodyIds(container)).toEqual(['20260001']);
    expect(container.querySelector('.tot')?.textContent).toContain('Mostrati: 1');
  });

  it('a search with no match shows the empty message spanning all columns', async () => {
    const { container } = mount();
    fireEvent.change(screen.getByPlaceholderText(/Cerca IF/), { target: { value: 'zzzz' } });
    await act(async () => {});
    expect(screen.getByText('Nessun IF in questa vista.').getAttribute('colspan')).toBe('14');
    expect(bodyIds(container)).toEqual([]);
  });

  it('clicking a header sorts by it, clicking again reverses', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('columnheader', { name: /Intervento/ }));
    expect(bodyIds(container)).toEqual(['20260001', '20260002', '20260003']); // Alfa, Beta, Gamma
    fireEvent.click(screen.getByRole('columnheader', { name: /Intervento/ }));
    expect(bodyIds(container)).toEqual(['20260003', '20260002', '20260001']);
    fireEvent.click(screen.getByRole('columnheader', { name: /Importo/ }));
    expect(bodyIds(container)).toEqual(['20260002', '20260001', '20260003']); // amount starts descending
  });

  it('read-only users get no actions column, no new-IF button, and plain values', () => {
    const { container } = mount({ canEdit: false });
    expect(screen.queryByText('+ Nuovo IF')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Azioni' })).toBeNull();
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('.inline-view')).toHaveLength(0);
  });
});

describe('RegistroPanel — paging', () => {
  const many = Array.from({ length: REGISTRO_PAGE * 2 + 50 }, (_, i) => makeIf({ numero_if: `Z${String(i).padStart(5, '0')}`, titolo: `T${i}`, importo: 1000 - i }));

  it('renders one page, then 200 more per click, and the button shrinks to what is left', () => {
    const { container } = mount({ IFs: many, canEdit: false });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(REGISTRO_PAGE);
    expect(screen.getByText(/Visualizzate 200 righe su 450/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostra altre 200' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(400);
    fireEvent.click(screen.getByRole('button', { name: 'Mostra altre 50' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(450);
    expect(screen.queryByRole('button', { name: /Mostra altre/ })).toBeNull();
  });

  it('changing the sort goes back to the first page', () => {
    const { container } = mount({ IFs: many, canEdit: false });
    fireEvent.click(screen.getByRole('button', { name: 'Mostra altre 200' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(400);
    fireEvent.click(screen.getByRole('columnheader', { name: /^IF/ }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(REGISTRO_PAGE);
  });

  it('the total still counts every row, not just the visible page', () => {
    const { container } = mount({ IFs: many, canEdit: false });
    expect(container.querySelector('.tot')?.textContent).toContain('Mostrati: 450');
  });
});

describe('RegistroPanel — editing', () => {
  it('"+ Nuovo IF" and the edit button call the handlers', () => {
    const { onOpenNew, onOpenEdit, container } = mount();
    fireEvent.click(screen.getByText('+ Nuovo IF'));
    expect(onOpenNew).toHaveBeenCalled();
    fireEvent.click(container.querySelector('tbody tr .actcell button[title="Modifica completa"]') as HTMLElement);
    expect(onOpenEdit).toHaveBeenCalledWith(expect.objectContaining({ numero_if: '20260002' }));
  });

  it('inline amount edit: Enter saves the number; an unchanged value does not save', () => {
    const { onSaveField, container } = mount();
    const row = container.querySelector('tbody tr') as HTMLElement; // 20260002, importo 2500
    fireEvent.click(row.querySelector('td.num .inline-view') as HTMLElement);
    const input = row.querySelector('td.num input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSaveField).toHaveBeenCalledWith('20260002', { importo: 3000 });
  });

  it('inline amount edit: confirming without changing the value does not save', () => {
    const { onSaveField, container } = mount();
    const row = container.querySelector('tbody tr') as HTMLElement;
    fireEvent.click(row.querySelector('td.num .inline-view') as HTMLElement);
    fireEvent.keyDown(row.querySelector('td.num input') as HTMLElement, { key: 'Enter' });
    expect(onSaveField).not.toHaveBeenCalled();
  });

  it('inline amount edit: Escape cancels', () => {
    const { onSaveField, container } = mount();
    const row = container.querySelector('tbody tr') as HTMLElement;
    fireEvent.click(row.querySelector('td.num .inline-view') as HTMLElement);
    const input = row.querySelector('td.num input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSaveField).not.toHaveBeenCalled();
    expect(row.querySelector('td.num input')).toBeNull();
  });

  it('inline date edit: clearing the date saves null', () => {
    const withDate = [makeIf({ numero_if: 'D1', data_inizio: '2026-02-01' })];
    const { onSaveField, container } = mount({ IFs: withDate });
    const cell = [...container.querySelectorAll('tbody td.codecell')].find((c) => c.querySelector('.inline-view')) as HTMLElement;
    fireEvent.click(cell.querySelector('.inline-view') as HTMLElement);
    const input = cell.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSaveField).toHaveBeenCalledWith('D1', { data_inizio: null });
  });

  it('the stato select keeps has_bo in step with the chosen state', () => {
    const { onSaveField, container } = mount();
    const row = container.querySelector('tbody tr') as HTMLElement;
    const selects = row.querySelectorAll('select.stsel');
    const stato = [...selects].find((s) => [...(s as HTMLSelectElement).options].some((o) => o.value === 'approvato')) as HTMLSelectElement;
    fireEvent.change(stato, { target: { value: 'approvato' } });
    expect(onSaveField).toHaveBeenCalledWith('20260002', { stato: 'approvato', has_bo: true });
    fireEvent.change(stato, { target: { value: 'non elaborato' } });
    expect(onSaveField).toHaveBeenLastCalledWith('20260002', { stato: 'non elaborato', has_bo: false });
  });

  it('attivazione and document-status selects send only their own field', () => {
    const { onSaveField, container } = mount();
    const row = container.querySelector('tbody tr') as HTMLElement;
    const selects = [...row.querySelectorAll('select.stsel')] as HTMLSelectElement[];
    const att = selects.find((s) => [...s.options].some((o) => o.value === 'SI')) as HTMLSelectElement;
    fireEvent.change(att, { target: { value: 'SI' } });
    expect(onSaveField).toHaveBeenCalledWith('20260002', { attivazione: 'SI' });
    const pdc = selects.find((s) => [...s.options].some((o) => o.value === 'ko')) as HTMLSelectElement;
    fireEvent.change(pdc, { target: { value: 'ko' } });
    expect(onSaveField).toHaveBeenLastCalledWith('20260002', { pdc: 'ko' });
  });

  it('a saving row has its controls disabled', () => {
    const { container } = mount({ savingIds: new Set(['20260002']) });
    const row = container.querySelector('tbody tr') as HTMLElement;
    expect(row.getAttribute('style')).toContain('opacity');
    expect([...row.querySelectorAll('select')].every((s) => (s as HTMLSelectElement).disabled)).toBe(true);
  });

  it('delete asks for confirmation first', () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirm);
    window.confirm = confirm;
    const { onDelete, container } = mount();
    const del = container.querySelector('tbody tr button[title="Elimina"]') as HTMLElement;
    fireEvent.click(del);
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith('20260002');
    expect(confirm.mock.calls[0][0]).toContain('20260002');
  });
});

describe('RegistroPanel — CSV export', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('"Esporta CSV" downloads Registro_IF.csv with the rows as shown', () => {
    let csvText = '';
    let blobType = '';
    class CapturingBlob extends Blob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        csvText = String(parts[0]);
        blobType = opts?.type ?? '';
      }
    }
    vi.stubGlobal('Blob', CapturingBlob);
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Esporta CSV/ }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(blobType).toBe('text/csv;charset=utf-8');
    expect(csvText.startsWith('\uFEFF')).toBe(true);
    const lines = csvText.slice(1).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[1].startsWith('"20260002"')).toBe(true); // amount-desc order, as on screen
    act(() => vi.advanceTimersByTime(900));
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('RegistroRow', () => {
  it('highlights a just-saved row', () => {
    const { container } = render(
      <table><tbody><RegistroRow x={IFs[0]} canEdit={false} saving={false} hl onSaveField={() => {}} onOpenEdit={() => {}} onDelete={() => {}} /></tbody></table>,
    );
    expect(container.querySelector('tr')?.className).toBe('row-saved');
    expect(within(container as HTMLElement).getByText('Alfa')).toBeTruthy();
  });
});

describe('tableActions', () => {
  it('confirmAndDelete only deletes after confirmation', () => {
    const onDelete = vi.fn();
    window.confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    confirmAndDelete('X1', onDelete);
    expect(onDelete).not.toHaveBeenCalled();
    confirmAndDelete('X1', onDelete);
    expect(onDelete).toHaveBeenCalledWith('X1');
  });

  it('downloadCsvFile names the file and cleans up its temporary link', () => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL: () => 'blob:y', revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('file.csv');
      expect(document.body.contains(this)).toBe(true);
    });
    downloadCsvFile('file.csv', 'x');
    expect(click).toHaveBeenCalled();
    vi.advanceTimersByTime(900);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.useRealTimers();
  });
});
