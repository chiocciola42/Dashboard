'use client';
import React from 'react';
import type { DocStatus, InterventoInput } from '@/lib/types';
import { DOC_FIELD_KEYS, DOC_FIELD_LABELS, FORNITORI, MODALITA_OPTIONS } from '@/lib/editForm';
import { DOC_OPTIONS } from '../StatusSelect';
import { CheckField, SelectField, TextAreaField, TextField } from './FormFields';

export type SetField = <K extends keyof InterventoInput>(k: K, v: InterventoInput[K]) => void;

// The grid of fields of the IF edit drawer. The IF number is locked when editing.
export default function EditForm({ form, set, mode }: { form: InterventoInput; set: SetField; mode: 'edit' | 'new' }) {
  return (
    <div className="formgrid">
      <TextField label="N° IF *" value={form.numero_if} disabled={mode === 'edit'} onChange={(v) => set('numero_if', v)} />
      <TextField label="N° BO" value={form.bdo} onChange={(v) => set('bdo', v)} />
      <TextField full label="Titolo Intervento *" value={form.titolo} onChange={(v) => set('titolo', v)} />
      <TextField label="Ambito" value={form.ambito} onChange={(v) => set('ambito', v)} />
      <SelectField label="Fornitore" value={String(form.fornitore ?? 'Intellera')} options={FORNITORI} onChange={(v) => set('fornitore', v)} />
      <TextField label="Ref. ARIA" value={form.ref_aria} onChange={(v) => set('ref_aria', v)} />
      <TextField label="Ref. Fornitore" value={form.ref_fornitore} onChange={(v) => set('ref_fornitore', v)} />
      <TextField label="Importo (€)" type="number" step="0.01" value={form.importo ?? 0} onChange={(v) => set('importo', Number(v))} />
      <SelectField blank label="Modalità" value={String(form.modalita_if ?? '')} options={MODALITA_OPTIONS} onChange={(v) => set('modalita_if', v)} />
      <SelectField
        label="Attivazione immediata"
        value={String(form.attivazione ?? 'NO')}
        options={[{ value: 'SI', label: 'SI' }, { value: 'NO', label: 'NO' }]}
        onChange={(v) => set('attivazione', v)}
      />
      <SelectField
        label="Stato BO"
        value={String(form.stato ?? 'non elaborato')}
        options={[{ value: 'approvato', label: 'approvato' }, { value: 'non elaborato', label: 'non elaborato' }]}
        onChange={(v) => set('stato', v)}
      />
      <CheckField label="BO emesso" checked={!!form.has_bo} onChange={(v) => set('has_bo', v)} />
      {DOC_FIELD_KEYS.map((k) => (
        <SelectField
          key={k}
          label={DOC_FIELD_LABELS[k]}
          value={form[k] as DocStatus}
          options={DOC_OPTIONS}
          onChange={(v) => set(k, v as DocStatus)}
        />
      ))}
      <TextField type="date" label="Data assegnazione" value={form.data_assegnazione} onChange={(v) => set('data_assegnazione', v)} />
      <TextField type="date" label="Data inizio" value={form.data_inizio} onChange={(v) => set('data_inizio', v)} />
      <TextField type="date" label="Data fine" value={form.data_fine} onChange={(v) => set('data_fine', v)} />
      <CheckField label="Subappalto" checked={!!form.subappalto} onChange={(v) => set('subappalto', v)} />
      <TextField full label="Azione richiesta" value={form.azione} onChange={(v) => set('azione', v)} />
      <TextAreaField
        rows={4}
        label={
          <>
            Note operative <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(supporta **grassetto** ed elenchi “- ”)</span>
          </>
        }
        value={form.note_operative}
        onChange={(v) => set('note_operative', v)}
      />
    </div>
  );
}
