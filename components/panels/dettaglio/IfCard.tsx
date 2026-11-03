'use client';
import React from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { EUR0, dfmt } from '@/lib/format';
import { DOC_KEYS, DOC_LABELS, type MonthlyState } from '@/lib/dettaglioIF';
import InlineField from '../../editing/InlineField';
import StatusSelect from '../../editing/StatusSelect';
import DocPill from './DocPill';
import MonthlyDetail from './MonthlyDetail';
import { confirmAndDelete } from './downloadCsv';

// One IF as a card, with its collapsible monthly detail.
export default function IfCard({
  x,
  canEdit,
  saving,
  hl,
  monthlyState,
  onToggleMonthly,
  onSaveField,
  onOpenEdit,
  onDelete,
}: {
  x: Intervento;
  canEdit: boolean;
  saving: boolean;
  hl: boolean;
  monthlyState: MonthlyState;
  onToggleMonthly: (numero_if: string) => void;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onDelete: (numero_if: string) => void;
}) {
  return (
  <div key={x.numero_if} className={'difcard' + (hl ? ' row-saved' : '')} style={saving ? { opacity: 0.55 } : undefined}>
    <div className="difcard-head">
      <div>
        <span className="codecell">{x.numero_if}</span>
        {x.ambito && <span className="pill" style={{ marginLeft: 6 }}>{x.ambito}</span>}
        {x.subappalto && <span className="pill sub" style={{ marginLeft: 6 }}>sub</span>}
      </div>
      <span className={'pill f-' + x.fornitore}>{x.fornitore}</span>
    </div>
    <h4 className="difcard-title">{x.titolo}</h4>
    <div className="difcard-meta">
      <span>N° BO: <b>{x.bdo || '—'}</b></span>
      <span>Ref. ARIA: <b>{x.ref_aria || '—'}</b></span>
      <span>Ref. Fornitore: <b>{x.ref_fornitore || '—'}</b></span>
    </div>
    <div className="difcard-meta">
      <span>
        Inizio:{' '}
        {canEdit ? (
          <InlineField type="date" value={x.data_inizio} display={dfmt(x.data_inizio)} onSave={(v) => onSaveField(x.numero_if, { data_inizio: v || null })} />
        ) : (
          <b>{dfmt(x.data_inizio)}</b>
        )}
      </span>
      <span>
        Fine:{' '}
        {canEdit ? (
          <InlineField type="date" value={x.data_fine} display={dfmt(x.data_fine)} onSave={(v) => onSaveField(x.numero_if, { data_fine: v || null })} />
        ) : (
          <b>{dfmt(x.data_fine)}</b>
        )}
      </span>
      <span>
        Modalità:{' '}
        {canEdit ? (
          <InlineField value={x.modalita_if} onSave={(v) => onSaveField(x.numero_if, { modalita_if: v })} />
        ) : (
          <b>{x.modalita_if || '—'}</b>
        )}
      </span>
    </div>
    <div className="difcard-amount">
      {canEdit ? (
        <InlineField
          type="number"
          value={x.importo}
          display={'€ ' + EUR0(x.importo)}
          onSave={(v) => onSaveField(x.numero_if, { importo: Number(v) || 0 })}
        />
      ) : (
        '€ ' + EUR0(x.importo)
      )}
      <span className={'pill ' + (x.has_bo ? 'bo' : 'nobo')} style={{ marginLeft: 10 }}>
        {x.has_bo ? 'BO emesso' : 'In attesa'}
      </span>
    </div>
    <div className="difcard-docs">
      {DOC_KEYS.map((k) => (
        <div className="difcard-doc" key={k}>
          <span className="difcard-doc-label">{DOC_LABELS[k]}</span>
          {canEdit ? (
            <StatusSelect value={x[k]} disabled={saving} onChange={(v) => onSaveField(x.numero_if, { [k]: v })} />
          ) : (
            <DocPill v={x[k]} />
          )}
        </div>
      ))}
    </div>
    <div className="difcard-azione">
      <span className="difcard-doc-label">Azione Richiesta</span>
      {canEdit ? (
        <InlineField value={x.azione} onSave={(v) => onSaveField(x.numero_if, { azione: v || null })} />
      ) : (
        <span>{x.azione || '—'}</span>
      )}
    </div>
    <details
      className="difcard-monthly"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) onToggleMonthly(x.numero_if);
      }}
    >
      <summary>Dettaglio mensile PDC / SAL / BEF</summary>
      <MonthlyDetail state={monthlyState} />
    </details>
    {canEdit && (
      <div className="difcard-actions">
        <button className="iconbtn" title="Modifica completa" onClick={() => onOpenEdit(x)}>
          ✏️ Modifica
        </button>
        <button
          className="iconbtn"
          title="Elimina"
          onClick={() => confirmAndDelete(x.numero_if, onDelete)}
        >
          🗑️ Elimina
        </button>
      </div>
    )}
  </div>
  );
}
