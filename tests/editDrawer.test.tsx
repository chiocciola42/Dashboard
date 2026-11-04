// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditDrawer from '@/components/editing/EditDrawer';
import { CheckField, SelectField, TextAreaField, TextField } from '@/components/editing/drawer/FormFields';
import type { Intervento } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

afterEach(cleanup);

const mount = (over: Partial<React.ComponentProps<typeof EditDrawer>> = {}) => {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(true);
  const utils = render(<EditDrawer open mode="new" initial={null} onClose={onClose} onSave={onSave} {...over} />);
  return { ...utils, onClose, onSave };
};
const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: RegExp | string, value: string) => fireEvent.change(field(label), { target: { value } });
const click = async (name: RegExp | string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('EditDrawer — open / close', () => {
  it('renders nothing while closed', () => {
    const { container } = mount({ open: false });
    expect(container.innerHTML).toBe('');
  });

  it('new mode: title, blank form, enabled IF number', () => {
    mount();
    expect(screen.getByText('Nuovo Intervento di Fornitura')).toBeTruthy();
    expect(field(/N° IF/).value).toBe('');
    expect(field(/N° IF/).disabled).toBe(false);
    expect(field(/Importo/).value).toBe('0');
  });

  it('edit mode: title with the IF number, form filled, IF number locked', () => {
    const iv = makeIf({ numero_if: '20269999', titolo: 'Alfa', importo: 1234.5, ambito: 'Dati' });
    mount({ mode: 'edit', initial: iv });
    expect(screen.getByText('Modifica IF 20269999')).toBeTruthy();
    expect(field(/N° IF/).value).toBe('20269999');
    expect(field(/N° IF/).disabled).toBe(true);
    expect(field(/Titolo/).value).toBe('Alfa');
    expect(field(/Importo/).value).toBe('1234.5');
    expect(field(/Ambito/).value).toBe('Dati');
  });

  it('X, Annulla and a click on the overlay close it; a click inside does not', () => {
    const { onClose, container } = mount();
    fireEvent.click(screen.getByLabelText('Chiudi'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(container.querySelector('.drawer-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(container.querySelector('.drawer') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('reopening discards unsaved edits and starts again from the IF', () => {
    const iv = makeIf({ numero_if: 'A', titolo: 'Alfa' });
    const { rerender, onClose, onSave } = mount({ mode: 'edit', initial: iv });
    type(/Titolo/, 'Modificato');
    expect(field(/Titolo/).value).toBe('Modificato');
    rerender(<EditDrawer open={false} mode="edit" initial={iv} onClose={onClose} onSave={onSave} />);
    rerender(<EditDrawer open mode="edit" initial={iv} onClose={onClose} onSave={onSave} />);
    expect(field(/Titolo/).value).toBe('Alfa');
  });

  it('opening for a different IF shows that IF', () => {
    const a = makeIf({ numero_if: 'A', titolo: 'Alfa' });
    const b = makeIf({ numero_if: 'B', titolo: 'Beta' });
    const { rerender, onClose, onSave } = mount({ mode: 'edit', initial: a });
    rerender(<EditDrawer open mode="edit" initial={b} onClose={onClose} onSave={onSave} />);
    expect(field(/Titolo/).value).toBe('Beta');
  });
});

describe('EditDrawer — saving', () => {
  it('sends the typed values (amount as number) as a new IF, then closes', async () => {
    const { onSave, onClose } = mount();
    type(/N° IF/, '2026777');
    type(/Titolo/, 'Nuovo titolo');
    type(/Importo/, '1500.25');
    fireEvent.change(screen.getByLabelText('Fornitore'), { target: { value: 'Deloitte' } });
    fireEvent.change(screen.getByLabelText('Modalità'), { target: { value: 'A canone' } });
    fireEvent.change(screen.getByLabelText('PDC'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByLabelText('BO emesso'));
    fireEvent.click(screen.getByLabelText('Subappalto'));
    await click('Salva');
    expect(onSave).toHaveBeenCalledTimes(1);
    const [input, isNew] = onSave.mock.calls[0];
    expect(isNew).toBe(true);
    expect(input).toMatchObject({ numero_if: '2026777', titolo: 'Nuovo titolo', importo: 1500.25, fornitore: 'Deloitte', modalita_if: 'A canone', pdc: 'ok', has_bo: true, subappalto: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('edit mode reports isNew = false', async () => {
    const { onSave } = mount({ mode: 'edit', initial: makeIf({ numero_if: 'A', titolo: 'Alfa' }) });
    await click('Salva');
    expect(onSave.mock.calls[0][1]).toBe(false);
  });

  it('an unparsable amount is sent as 0', async () => {
    const { onSave } = mount({ mode: 'edit', initial: makeIf({ numero_if: 'A', titolo: 'Alfa', importo: 10 }) });
    fireEvent.change(field(/Importo/), { target: { value: '' } });
    await click('Salva');
    expect(onSave.mock.calls[0][0].importo).toBe(0);
  });

  it('missing IF number or title: shows the error and does not save', async () => {
    const { onSave, onClose } = mount();
    await click('Salva');
    expect(screen.getByText('N° IF obbligatorio')).toBeTruthy();
    type(/N° IF/, '1');
    await click('Salva');
    expect(screen.getByText('Titolo obbligatorio')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('end date before start date is refused; fixing it clears the error on the next save', async () => {
    const { onSave } = mount();
    type(/N° IF/, '1');
    type(/Titolo/, 'T');
    type(/Data inizio/, '2026-05-10');
    type(/Data fine/, '2026-05-01');
    await click('Salva');
    expect(screen.getByText(/data di fine non può essere precedente/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    type(/Data fine/, '2026-05-20');
    await click('Salva');
    expect(screen.queryByText(/data di fine non può essere precedente/)).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a refused save keeps the drawer open, shows the error and lets the user retry', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { onClose } = mount({ onSave, mode: 'edit', initial: makeIf({ numero_if: 'A', titolo: 'Alfa' }) });
    await click('Salva');
    expect(screen.getByText('Salvataggio non riuscito')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(false);
    await click('Salva');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Salvataggio non riuscito')).toBeNull();
  });

  it('REGRESSION: a save that throws does not leave the drawer stuck in "Salvataggio…"', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const { onClose } = mount({ onSave, mode: 'edit', initial: makeIf({ numero_if: 'A', titolo: 'Alfa' }) });
    await click('Salva');
    expect(screen.getByText('Salvataggio non riuscito')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('while saving the buttons are locked, and a second click does not send twice', async () => {
    let release!: (v: boolean) => void;
    const onSave = vi.fn().mockReturnValue(new Promise<boolean>((r) => (release = r)));
    const { onClose } = mount({ onSave, mode: 'edit', initial: makeIf({ numero_if: 'A', titolo: 'Alfa' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    const saving = screen.getByRole('button', { name: 'Salvataggio…' }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saving);
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => release(true));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('EditDrawer — notes preview', () => {
  it('shows a rendered preview only when there are notes', () => {
    const { container } = mount();
    expect(container.querySelector('.note-preview')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Note operative/), { target: { value: '**forte**\n- uno\n- due' } });
    const preview = container.querySelector('.note-preview') as HTMLElement;
    expect(within(preview).getByText('Anteprima note')).toBeTruthy();
    expect(preview.querySelector('strong, b')?.textContent).toBe('forte');
    expect(preview.querySelectorAll('li')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText(/Note operative/), { target: { value: '' } });
    expect(container.querySelector('.note-preview')).toBeNull();
  });
});

describe('FormFields', () => {
  it('TextField: value as text (null -> empty), disabled, full-width class', () => {
    const onChange = vi.fn();
    const { container } = render(<TextField full disabled label="Nome" value={null} onChange={onChange} />);
    const label = container.querySelector('label') as HTMLElement;
    expect(label.className).toBe('full');
    const input = label.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.disabled).toBe(true);
  });

  it('TextField passes the typed text to onChange', () => {
    const onChange = vi.fn();
    render(<TextField label="Nome" value="a" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('SelectField: plain strings and {value,label} options, optional blank option', () => {
    const onChange = vi.fn();
    render(<SelectField blank label="Scelta" value="" onChange={onChange} options={['uno', { value: 'd', label: 'Due' }]} />);
    const select = screen.getByLabelText('Scelta') as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([['', '—'], ['uno', 'uno'], ['d', 'Due']]);
    fireEvent.change(select, { target: { value: 'd' } });
    expect(onChange).toHaveBeenCalledWith('d');
  });

  it('CheckField reports the boolean; TextAreaField the text', () => {
    const onCheck = vi.fn();
    const onText = vi.fn();
    render(<><CheckField label="Spunta" checked={false} onChange={onCheck} /><TextAreaField rows={3} label="Testo" value="x" onChange={onText} /></>);
    fireEvent.click(screen.getByLabelText('Spunta'));
    expect(onCheck).toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText('Testo'), { target: { value: 'y' } });
    expect(onText).toHaveBeenCalledWith('y');
    expect((screen.getByLabelText('Testo') as HTMLTextAreaElement).rows).toBe(3);
  });
});
