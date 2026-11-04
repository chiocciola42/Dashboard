'use client';
import React from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { EUR0, dfmt } from '@/lib/format';
import { ST_TXT } from '@/lib/registroIF';
import InlineField from '../../editing/InlineField';
import StatusSelect from '../../editing/StatusSelect';
import { confirmAndDelete } from '../shared/tableActions';

// One IF as a row of the Operativo table (editable inline when `canEdit`).
export default function RegistroRow({
  x,
  canEdit,
  saving,
  hl,
  onSaveField,
  onOpenEdit,
  onDelete,
}: {
  x: Intervento;
  canEdit: boolean;
  saving: boolean;
  hl: boolean;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onDelete: (numero_if: string) => void;
}) {
  return (
    <tr key={x.numero_if} className={hl ? 'row-saved' : ''} style={saving ? { opacity: 0.55 } : undefined}>
      <td className="codecell">{x.numero_if}</td>
      <td className="codecell" style={{ color: 'var(--muted)' }}>
        {x.bdo || '—'}
      </td>
      <td className="tt">
        {/* <details> nativo: il titolo è troncato a 2 righe da CSS
            e il clic sulla cella (o Invio/Spazio da tastiera)
            espande il testo completo senza JS dedicato */}
        <details className="ttd">
          <summary title="Clic per espandere/comprimere il testo">
            <b>{x.titolo}</b>
            <span className="ref">
              {x.subappalto ? <span className="pill sub">sub</span> : null} ARIA: {x.ref_aria || '—'} · Int.:{' '}
              {x.ref_fornitore || '—'}
            </span>
          </summary>
        </details>
      </td>
      <td>
        {canEdit ? (
          <InlineField value={x.modalita_if} onSave={(v) => onSaveField(x.numero_if, { modalita_if: v })} />
        ) : (
          x.modalita_if || '—'
        )}
      </td>
      <td>
        {canEdit ? (
          <select
            className="stsel"
            value={x.attivazione || 'NO'}
            disabled={saving}
            onChange={(e) => onSaveField(x.numero_if, { attivazione: e.target.value })}
          >
            <option value="SI">SI</option>
            <option value="NO">NO</option>
          </select>
        ) : (
          x.attivazione || 'NO'
        )}
      </td>
      <td>
        {canEdit ? (
          <select
            className="stsel"
            value={x.stato}
            disabled={saving}
            onChange={(e) =>
              onSaveField(x.numero_if, { stato: e.target.value, has_bo: e.target.value === 'approvato' })
            }
          >
            <option value="approvato">approvato</option>
            <option value="non elaborato">non elab.</option>
          </select>
        ) : (
          x.stato
        )}
      </td>
      {(['pdc', 'v_apertura', 'v_sal', 'bef'] as const).map((k) => (
        <td key={k} style={{ textAlign: 'center' }}>
          {canEdit ? (
            <StatusSelect value={x[k]} disabled={saving} onChange={(v) => onSaveField(x.numero_if, { [k]: v })} />
          ) : (
            ST_TXT[x[k]]
          )}
        </td>
      ))}
      <td className="codecell" style={{ color: 'var(--muted)' }}>
        {canEdit ? (
          <InlineField type="date" value={x.data_inizio} display={dfmt(x.data_inizio)} onSave={(v) => onSaveField(x.numero_if, { data_inizio: v || null })} />
        ) : (
          dfmt(x.data_inizio)
        )}
      </td>
      <td className="codecell" style={{ color: 'var(--muted)' }}>
        {canEdit ? (
          <InlineField type="date" value={x.data_fine} display={dfmt(x.data_fine)} onSave={(v) => onSaveField(x.numero_if, { data_fine: v || null })} />
        ) : (
          dfmt(x.data_fine)
        )}
      </td>
      <td className="num">
        {canEdit ? (
          <InlineField type="number" value={x.importo} display={EUR0(x.importo)} onSave={(v) => onSaveField(x.numero_if, { importo: Number(v) || 0 })} />
        ) : (
          EUR0(x.importo)
        )}
      </td>
      {canEdit && (
        <td className="actcell">
          <button className="iconbtn" title="Modifica completa" onClick={() => onOpenEdit(x)}>
            ✏️
          </button>
          <button
            className="iconbtn"
            title="Elimina"
            onClick={() => confirmAndDelete(x.numero_if, onDelete)}
          >
            🗑️
          </button>
        </td>
      )}
    </tr>
  );
}
