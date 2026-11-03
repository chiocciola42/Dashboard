'use client';
import React, { useDeferredValue, useMemo, useState } from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { EUR0 } from '@/lib/format';
import {
  REGISTRO_PAGE,
  buildRegistroCsv,
  exportMatrix,
  filterAndSortRegistro,
  nextRegistroSort,
  registroViewKey,
  visibleCount,
  type SortKey,
} from '@/lib/registroIF';
import { CopyTableButton } from '../export/ExportControls';
import RegistroTable from './registro/RegistroTable';
import { downloadCsvFile } from './shared/tableActions';

// Re-exported for tests: the Excel matrix and the page size.
export { exportMatrix, REGISTRO_PAGE };

function RegistroPanel({
  IFs,
  canEdit = true,
  onSaveField,
  onOpenEdit,
  onOpenNew,
  onDelete,
  savingIds,
  highlightIds,
  anno,
}: {
  IFs: Intervento[];
  canEdit?: boolean;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onOpenNew: () => void;
  onDelete: (numero_if: string) => void;
  savingIds: Set<string>;
  highlightIds: Set<string>;
  // Calendar year of the revenue column.
  anno: number;
}) {
  const [q, setQ] = useState('');
  // The input echoes keystrokes instantly; re-filtering/sorting the table runs
  // at deferred priority so typing never stutters on long registries.
  const deferredQ = useDeferredValue(q);
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: 'importo', dir: -1 });

  const rows = useMemo(() => filterAndSortRegistro(IFs, deferredQ, sort.key, sort.dir), [IFs, deferredQ, sort]);

  // Il limite si azzera da solo quando cambiano ricerca, ordinamento o dati.
  const viewKey = registroViewKey(deferredQ, sort.key, sort.dir, IFs.length);
  const [shown, setShown] = useState({ key: viewKey, n: REGISTRO_PAGE });
  const visibleN = visibleCount(shown, viewKey);
  const visibleRows = rows.length > visibleN ? rows.slice(0, visibleN) : rows;

  const onSort = (k: SortKey) => setSort((cur) => nextRegistroSort(cur, k));
  const sumShown = rows.reduce((s, x) => s + x.importo, 0);

  return (
    <div className="panel on" data-p="6">
      <div className="phead">
        <h2>Operativo</h2>
        <p>Registro IF con stato di lavorazione (PDC, verbali, BEF), filtrabile, ordinabile ed editabile.</p>
      </div>
      <div className="tablecard">
        <div className="tbar">
          <h3>Interventi di Fornitura</h3>
          {canEdit && (
            <button className="addbtn" style={{ marginLeft: 8 }} onClick={onOpenNew}>
              + Nuovo IF
            </button>
          )}
          <input className="search" placeholder="Cerca IF, titolo, referente, ambito…" value={q} onChange={(e) => setQ(e.target.value)} />
          <CopyTableButton
            getMatrix={() => exportMatrix(rows, anno)}
            title="Copia tutte le righe mostrate (tutte le colonne): incollale in un foglio Excel"
          />
          <button className="freset" onClick={() => downloadCsvFile('Registro_IF.csv', buildRegistroCsv(rows, anno))} style={{ borderColor: 'var(--petrol)', color: 'var(--petrol-d)' }}>
            ⤓ Esporta CSV
          </button>
          <div className="tot">
            Mostrati: <b>{rows.length}</b> · Valore: <b>€ {EUR0(sumShown)}</b>
          </div>
        </div>
        <RegistroTable
          rows={rows}
          visibleRows={visibleRows}
          canEdit={canEdit}
          sortK={sort.key}
          sortDir={sort.dir}
          onSort={onSort}
          savingIds={savingIds}
          highlightIds={highlightIds}
          onSaveField={onSaveField}
          onOpenEdit={onOpenEdit}
          onDelete={onDelete}
        />
        {rows.length > visibleRows.length && (
          <div className="foot" style={{ marginTop: 8, textAlign: 'center' }}>
            Visualizzate {visibleRows.length} righe su {rows.length} ·{' '}
            <button
              type="button"
              className="btn"
              onClick={() => setShown({ key: viewKey, n: visibleN + REGISTRO_PAGE })}
            >
              Mostra altre {Math.min(REGISTRO_PAGE, rows.length - visibleRows.length)}
            </button>
          </div>
        )}
      </div>
      <div className="foot" style={{ marginTop: 10 }}>
        {canEdit ? (
          <>
            Modifica inline: clic su modalità, importo o date · usa i menu per stato/PDC/verbali · ✏️ per il form completo ·
            🗑️ per eliminare (soft-delete). Le modifiche manuali non vengono sovrascritte dal successivo upload Excel (salvo
            <span className="mono"> ?force=true</span>).
          </>
        ) : (
          <>Hai accesso in sola visualizzazione: i dati non sono modificabili. Puoi comunque cercare, ordinare ed esportare in CSV.</>
        )}
      </div>
    </div>
  );
}

// Memoized: only the active tab is mounted, but edits elsewhere in the
// Dashboard (toasts, drawer, saving flags) re-render the parent — memo skips
// re-rendering the panel when its own data/props are unchanged.
export default React.memo(RegistroPanel);
