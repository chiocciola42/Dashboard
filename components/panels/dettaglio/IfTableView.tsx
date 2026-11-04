'use client';
import React from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { DETTAGLIO_COLS, type MonthlyState, type SortKey } from '@/lib/dettaglioIF';
import IfTableRow from './IfTableRow';

// Sortable table view of the IFs.
export default function IfTableView({
  rows,
  canEdit,
  sortK,
  sortDir,
  onSort,
  savingIds,
  highlightIds,
  expanded,
  monthly,
  onToggleMonthly,
  onSaveField,
  onOpenEdit,
  onDelete,
}: {
  rows: Intervento[];
  canEdit: boolean;
  sortK: SortKey;
  sortDir: number;
  onSort: (k: SortKey) => void;
  savingIds: Set<string>;
  highlightIds: Set<string>;
  expanded: Set<string>;
  monthly: Record<string, MonthlyState>;
  onToggleMonthly: (numero_if: string) => void;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onDelete: (numero_if: string) => void;
}) {
  // monthly-detail toggle + data columns + optional actions column
  const colSpan = DETTAGLIO_COLS.length + 1 + (canEdit ? 1 : 0);
  return (
    <div className="tscroll">
      <table id="tbl-dif">
        <thead>
          <tr>
            <th aria-label="Dettaglio mensile" />
            {DETTAGLIO_COLS.map(([k, label]) => (
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
          {rows.map((x) => (
            <IfTableRow
              key={x.numero_if}
              x={x}
              canEdit={canEdit}
              saving={savingIds.has(x.numero_if)}
              hl={highlightIds.has(x.numero_if)}
              isOpen={expanded.has(x.numero_if)}
              monthlyState={monthly[x.numero_if] || 'loading'}
              colSpan={colSpan}
              onToggleMonthly={onToggleMonthly}
              onSaveField={onSaveField}
              onOpenEdit={onOpenEdit}
              onDelete={onDelete}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} style={{ color: 'var(--muted)', padding: 18 }}>
                Nessun IF in questa vista.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
