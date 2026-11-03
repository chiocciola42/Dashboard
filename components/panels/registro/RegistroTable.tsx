'use client';
import React from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { REGISTRO_COLS, type SortKey } from '@/lib/registroIF';
import RegistroRow from './RegistroRow';

// Sortable table of the visible rows (`rows` is the full filtered list: it only
// decides whether to show the empty message).
export default function RegistroTable({
  rows,
  visibleRows,
  canEdit,
  sortK,
  sortDir,
  onSort,
  savingIds,
  highlightIds,
  onSaveField,
  onOpenEdit,
  onDelete,
}: {
  rows: Intervento[];
  visibleRows: Intervento[];
  canEdit: boolean;
  sortK: SortKey;
  sortDir: number;
  onSort: (k: SortKey) => void;
  savingIds: Set<string>;
  highlightIds: Set<string>;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onDelete: (numero_if: string) => void;
}) {
  return (
    <div className="tscroll noxscroll">
      <table id="tbl">
        <thead>
          <tr>
            {REGISTRO_COLS.map(([k, label]) => (
              <th
                key={k}
                className={k === 'titolo' ? 'thtt' : undefined}
                onClick={() => onSort(k)}
                style={{ cursor: 'pointer' }}
                aria-sort={sortK === k ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'}
              >
                {label}
                {sortK === k && <span aria-hidden="true"> {sortDir === 1 ? '▲' : '▼'}</span>}
              </th>
            ))}
            {canEdit && <th>Azioni</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((x) => (
            <RegistroRow
              key={x.numero_if}
              x={x}
              canEdit={canEdit}
              saving={savingIds.has(x.numero_if)}
              hl={highlightIds.has(x.numero_if)}
              onSaveField={onSaveField}
              onOpenEdit={onOpenEdit}
              onDelete={onDelete}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 14 : 13} style={{ color: 'var(--muted)', padding: 18 }}>
                Nessun IF in questa vista.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
