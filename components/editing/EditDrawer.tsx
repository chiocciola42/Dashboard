'use client';
import React, { useEffect, useState } from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { EMPTY_FORM, formFor, toSubmitInput, validateForm } from '@/lib/editForm';
import { renderNote } from './NotePreview';
import EditForm, { type SetField } from './drawer/EditForm';

export default function EditDrawer({
  open,
  mode,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: 'edit' | 'new';
  initial: Intervento | null;
  onClose: () => void;
  onSave: (input: InterventoInput, isNew: boolean) => Promise<boolean>;
}) {
  const [form, setForm] = useState<InterventoInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      setForm(formFor(initial));
    }
  }, [open, initial]);

  if (!open) return null;

  const set: SetField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (saving) return; // a second click while saving must not send twice
    setErr(null);
    const invalid = validateForm(form);
    if (invalid) return setErr(invalid);
    setSaving(true);
    try {
      const ok = await onSave(toSubmitInput(form), mode === 'new');
      if (ok) onClose();
      else setErr('Salvataggio non riuscito');
    } catch {
      setErr('Salvataggio non riuscito');
    } finally {
      // always released, even when onSave throws, so the drawer never stays locked
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{mode === 'new' ? 'Nuovo Intervento di Fornitura' : `Modifica IF ${initial?.numero_if}`}</h3>
          <button className="drawer-x" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <EditForm form={form} set={set} mode={mode} />
          {form.note_operative ? (
            <div className="note-preview">
              <div className="note-preview-lab">Anteprima note</div>
              {renderNote(String(form.note_operative))}
            </div>
          ) : null}
          {err && <div className="form-err">{err}</div>}
        </div>
        <div className="drawer-foot">
          <button className="addbtn" onClick={submit} disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
          <button className="clearbtn" onClick={onClose} disabled={saving}>
            Annulla
          </button>
        </div>
      </aside>
    </div>
  );
}
