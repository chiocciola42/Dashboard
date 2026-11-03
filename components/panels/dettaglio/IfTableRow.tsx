'use client';
import React from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { EUR0, dfmt } from '@/lib/format';
import { DOC_KEYS, type MonthlyState } from '@/lib/dettaglioIF';
import InlineField from '../../editing/InlineField';
import StatusSelect from '../../editing/StatusSelect';
import DocPill from './DocPill';
import MonthlyDetail from './MonthlyDetail';
import { confirmAndDelete } from './downloadCsv';

// One IF as a table row, plus its expandable monthly-detail row.
export default function IfTableRow({
  x,
  canEdit,
  saving,
  hl,
  isOpen,
  monthlyState,
  colSpan,
  onToggleMonthly,
  onSaveField,
  onOpenEdit,
  onDelete,
}: {
  x: Intervento;
  canEdit: boolean;
  saving: boolean;
  hl: boolean;
  isOpen: boolean;
  monthlyState: MonthlyState;
  colSpan: number;
  onToggleMonthly: (numero_if: string) => void;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onDelete: (numero_if: string) => void;
}) {
  return (
      <>
      <tr className={hl ? 'row-saved' : ''} style={saving ? { opacity: 0.55 } : undefined}>
        <td>
          <button
            className="iconbtn"
            title="Dettaglio mensile PDC / SAL / BEF"
            aria-expanded={isOpen}
            onClick={() => onToggleMonthly(x.numero_if)}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        </td>
        <td>{x.ambito || '—'}</td>
        <td className="codecell">{x.numero_if}</td>
        <td className="codecell" style={{ color: 'var(--muted)' }}>
          {x.bdo || '—'}
        </td>
        <td className="tt">
          <details className="ttd">
            <summary title="Clic per espandere/comprimere il testo">
              <b>{x.titolo}</b>
              {x.subappalto && <span className="pill sub" style={{ marginLeft: 6 }}>sub</span>}
            </summary>
          </details>
        </td>
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
        <td>{x.ref_aria || '—'}</td>
        <td>{x.ref_fornitore || '—'}</td>
        <td>
          <span className={'pill f-' + x.fornitore}>{x.fornitore}</span>
        </td>
        <td className="num">
          {canEdit ? (
            <InlineField type="number" value={x.importo} display={EUR0(x.importo)} onSave={(v) => onSaveField(x.numero_if, { importo: Number(v) || 0 })} />
          ) : (
            EUR0(x.importo)
          )}
        </td>
        <td>
          {canEdit ? (
            <InlineField value={x.modalita_if} onSave={(v) => onSaveField(x.numero_if, { modalita_if: v })} />
          ) : (
            x.modalita_if || '—'
          )}
        </td>
        <td style={{ textAlign: 'center' }}>
          <span className={'pill ' + (x.has_bo ? 'bo' : 'nobo')}>{x.has_bo ? 'BO emesso' : 'In attesa'}</span>
        </td>
        {DOC_KEYS.map((k) => (
          <td key={k} style={{ textAlign: 'center' }}>
            {canEdit ? (
              <StatusSelect value={x[k]} disabled={saving} onChange={(v) => onSaveField(x.numero_if, { [k]: v })} />
            ) : (
              <DocPill v={x[k]} />
            )}
          </td>
        ))}
        <td>
          {canEdit ? (
            <InlineField value={x.azione} onSave={(v) => onSaveField(x.numero_if, { azione: v || null })} className="tt" />
          ) : (
            x.azione || '—'
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
      {isOpen && (
        <tr data-export-ignore>
          <td colSpan={colSpan} className="monthly-row">
            <MonthlyDetail state={monthlyState} />
          </td>
        </tr>
      )}
      </>
  );
}
