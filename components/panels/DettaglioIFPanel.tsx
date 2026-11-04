'use client';
import React, { useDeferredValue, useMemo, useState } from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import { EUR0 } from '@/lib/format';
import { exportMatrix, filterAndSort, nextSort, type SortKey } from '@/lib/dettaglioIF';
import { CopyTableButton } from '../export/ExportControls';
import IfTableView from './dettaglio/IfTableView';
import IfCardsView from './dettaglio/IfCardsView';
import { useMonthlyDetail } from './dettaglio/useMonthlyDetail';
import { downloadDettaglioCsv } from './dettaglio/downloadCsv';

function DettaglioIFPanel({
  IFs,
  canEdit = true,
  onSaveField,
  onOpenEdit,
  onOpenNew,
  onDelete,
  savingIds,
  highlightIds,
}: {
  IFs: Intervento[];
  canEdit?: boolean;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onOpenNew: () => void;
  onDelete: (numero_if: string) => void;
  savingIds: Set<string>;
  highlightIds: Set<string>;
}) {
  const [view, setView] = useState<'table' | 'card'>('table');
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q);
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: 'numero_if', dir: 1 });
  const { expanded, monthly, toggleMonthly } = useMonthlyDetail();

  const rows = useMemo(() => filterAndSort(IFs, deferredQ, sort.key, sort.dir), [IFs, deferredQ, sort]);
  const onSort = (k: SortKey) => setSort((cur) => nextSort(cur, k));
  const sumShown = rows.reduce((s, x) => s + x.importo, 0);

  return (
    <div className="panel on" data-p="7">
      <div className="phead">
        <h2>Dettaglio IF</h2>
        <p>Vista completa per intervento — Ambito, referenti, importi e stato dei documenti (PDC, verbali, BEF), come nel report Excel.</p>
      </div>
      <div className="tablecard">
        <div className="tbar">
          <h3>Interventi di Fornitura</h3>
          {canEdit && (
            <button className="addbtn" style={{ marginLeft: 8 }} onClick={onOpenNew}>
              + Nuovo IF
            </button>
          )}
          <input
            className="search"
            placeholder="Cerca IF, titolo, referente, ambito…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="seg2">
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} aria-pressed={view === 'table'}>
              📋 Tabella
            </button>
            <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')} aria-pressed={view === 'card'}>
              🗂️ Card
            </button>
          </div>
          <CopyTableButton
            getMatrix={() => exportMatrix(rows)}
            title="Copia tutti gli IF mostrati (tutte le colonne): incollali in un foglio Excel"
          />
          <button className="freset" onClick={() => downloadDettaglioCsv(rows)} style={{ borderColor: 'var(--petrol)', color: 'var(--petrol-d)' }}>
            ⤓ Esporta CSV
          </button>
          <div className="tot">
            Mostrati: <b>{rows.length}</b> · Valore: <b>€ {EUR0(sumShown)}</b>
          </div>
        </div>


        {view === 'table' ? (
          <IfTableView
            rows={rows}
            canEdit={canEdit}
            sortK={sort.key}
            sortDir={sort.dir}
            onSort={onSort}
            savingIds={savingIds}
            highlightIds={highlightIds}
            expanded={expanded}
            monthly={monthly}
            onToggleMonthly={toggleMonthly}
            onSaveField={onSaveField}
            onOpenEdit={onOpenEdit}
            onDelete={onDelete}
          />
        ) : (
          <IfCardsView
            rows={rows}
            canEdit={canEdit}
            savingIds={savingIds}
            highlightIds={highlightIds}
            monthly={monthly}
            onToggleMonthly={toggleMonthly}
            onSaveField={onSaveField}
            onOpenEdit={onOpenEdit}
            onDelete={onDelete}
          />
        )}
      </div>
      <div className="foot" style={{ marginTop: 10 }}>
        {canEdit ? (
          <>
            Modifica inline in entrambe le viste: clic su titoli, importi, date, modalità e azione richiesta · usa i menu per
            PDC/verbali/BEF · ✏️ per il form completo · 🗑️ per eliminare (soft-delete).
          </>
        ) : (
          <>Hai accesso in sola visualizzazione: i dati non sono modificabili. Puoi comunque cercare, ordinare ed esportare in CSV.</>
        )}
      </div>
    </div>
  );
}

export default React.memo(DettaglioIFPanel);
