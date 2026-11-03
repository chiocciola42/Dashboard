// Pure logic of the IF edit drawer: blank form, option lists, validation and
// the payload sent on save.
import type { Intervento, InterventoInput } from './types';

export const EMPTY_FORM: InterventoInput = {
  numero_if: '',
  bdo: '',
  titolo: '',
  ambito: '',
  fornitore: 'Intellera',
  ref_aria: '',
  ref_fornitore: '',
  importo: 0,
  modalita_if: '',
  attivazione: 'NO',
  stato: 'non elaborato',
  has_bo: false,
  pdc: 'nd',
  v_apertura: 'nd',
  v_sal: 'nd',
  bef: 'nd',
  subappalto: false,
  data_assegnazione: '',
  data_inizio: '',
  data_fine: '',
  azione: '',
  note_operative: '',
};

export const FORNITORI = ['Intellera', 'Deloitte', 'Gellify', 'PGMD', 'Accenture'];
export const MODALITA_OPTIONS = ['A corpo', 'A canone', 'A consumo', 'A canone + A corpo'];

// Labels of the four document-status fields.
export const DOC_FIELD_LABELS = { pdc: 'PDC', v_apertura: 'V. Apertura', v_sal: 'V. SAL', bef: 'BEF' } as const;
export const DOC_FIELD_KEYS = ['pdc', 'v_apertura', 'v_sal', 'bef'] as const;

// A fresh copy of the form for the drawer: the IF being edited, or a blank one.
export const formFor = (initial: Intervento | null): InterventoInput =>
  initial ? { ...initial } : { ...EMPTY_FORM };

// First validation error (as a message), or null when the form can be saved.
export function validateForm(form: InterventoInput): string | null {
  if (!form.numero_if || !String(form.numero_if).trim()) return 'N° IF obbligatorio';
  if (!form.titolo || !String(form.titolo).trim()) return 'Titolo obbligatorio';
  // Cross-field: la data di fine non può precedere quella di inizio.
  if (form.data_inizio && form.data_fine && String(form.data_fine) < String(form.data_inizio)) {
    return 'La data di fine non può essere precedente alla data di inizio';
  }
  return null;
}

// What is sent on save: the amount is always a number (garbage becomes 0).
export const toSubmitInput = (form: InterventoInput): InterventoInput => ({
  ...form,
  importo: Number(form.importo) || 0,
});
