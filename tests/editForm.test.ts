import { describe, expect, it } from 'vitest';
import { DOC_FIELD_KEYS, DOC_FIELD_LABELS, EMPTY_FORM, FORNITORI, MODALITA_OPTIONS, formFor, toSubmitInput, validateForm } from '@/lib/editForm';
import { makeIf } from './helpers/fixtures';

const valid = { ...EMPTY_FORM, numero_if: '2026001', titolo: 'Titolo' };

describe('formFor', () => {
  it('a new IF starts from a fresh blank copy (never the shared constant)', () => {
    const a = formFor(null);
    expect(a).toEqual(EMPTY_FORM);
    expect(a).not.toBe(EMPTY_FORM);
    a.titolo = 'x';
    expect(EMPTY_FORM.titolo).toBe('');
  });

  it('editing copies the IF, so changes do not leak into the list', () => {
    const iv = makeIf({ numero_if: 'A', titolo: 'Alfa' });
    const f = formFor(iv);
    expect(f).toMatchObject({ numero_if: 'A', titolo: 'Alfa' });
    expect(f).not.toBe(iv);
    f.titolo = 'Beta';
    expect(iv.titolo).toBe('Alfa');
  });
});

describe('validateForm', () => {
  it('accepts a minimal valid form', () => {
    expect(validateForm(valid)).toBeNull();
  });

  it('requires the IF number, ignoring whitespace', () => {
    expect(validateForm({ ...valid, numero_if: '' })).toBe('N° IF obbligatorio');
    expect(validateForm({ ...valid, numero_if: '   ' })).toBe('N° IF obbligatorio');
    expect(validateForm({ ...valid, numero_if: undefined })).toBe('N° IF obbligatorio');
  });

  it('requires the title, ignoring whitespace', () => {
    expect(validateForm({ ...valid, titolo: '' })).toBe('Titolo obbligatorio');
    expect(validateForm({ ...valid, titolo: '  ' })).toBe('Titolo obbligatorio');
  });

  it('reports the IF number before the title', () => {
    expect(validateForm({ ...valid, numero_if: '', titolo: '' })).toBe('N° IF obbligatorio');
  });

  it('end date cannot precede the start date; equal or missing dates are fine', () => {
    const msg = 'La data di fine non può essere precedente alla data di inizio';
    expect(validateForm({ ...valid, data_inizio: '2026-05-01', data_fine: '2026-04-30' })).toBe(msg);
    expect(validateForm({ ...valid, data_inizio: '2026-05-01', data_fine: '2026-05-01' })).toBeNull();
    expect(validateForm({ ...valid, data_inizio: '2026-05-01', data_fine: '' })).toBeNull();
    expect(validateForm({ ...valid, data_inizio: '', data_fine: '2020-01-01' })).toBeNull();
  });
});

describe('toSubmitInput', () => {
  it('coerces the amount to a number; garbage becomes 0; other fields untouched', () => {
    expect(toSubmitInput({ ...valid, importo: '12.5' as never }).importo).toBe(12.5);
    expect(toSubmitInput({ ...valid, importo: 'abc' as never }).importo).toBe(0);
    expect(toSubmitInput({ ...valid, importo: NaN }).importo).toBe(0);
    expect(toSubmitInput({ ...valid, importo: undefined }).importo).toBe(0);
    expect(toSubmitInput({ ...valid, importo: 5 })).toMatchObject({ numero_if: '2026001', titolo: 'Titolo' });
  });

  it('does not mutate the form', () => {
    const f = { ...valid, importo: '7' as never };
    toSubmitInput(f);
    expect(f.importo).toBe('7');
  });
});

describe('option lists', () => {
  it('the default fornitore is in the list; four document fields are labelled', () => {
    expect(FORNITORI).toContain(EMPTY_FORM.fornitore);
    expect(MODALITA_OPTIONS).toContain('A canone + A corpo');
    expect(DOC_FIELD_KEYS.map((k) => DOC_FIELD_LABELS[k])).toEqual(['PDC', 'V. Apertura', 'V. SAL', 'BEF']);
  });
});
