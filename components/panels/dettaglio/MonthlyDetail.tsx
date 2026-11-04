'use client';
import React from 'react';
import { EUR0 } from '@/lib/format';
import type { Matrix } from '@/lib/exportTable';
import {
  type MonthlyState,
  befMatrix,
  pdcMatrix,
  salMatrix,
  sortByPeriod,
  statusColor,
} from '@/lib/dettaglioIF';
import { CopyTableButton } from '../../export/ExportControls';

// Titolo di una colonna del dettaglio mensile con il pulsante di copia: le tre
// tabelle sono piccole ma restano dati che finiscono in Excel come le altre.
function MonthlyHead({ title, matrix }: { title: string; matrix: Matrix | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <h5>{title}</h5>
      {matrix && (
        <CopyTableButton
          style={{ marginLeft: 'auto' }}
          label="Copia"
          title={`Copia "${title}" per Excel`}
          getMatrix={() => matrix}
        />
      )}
    </div>
  );
}

// One column of the monthly grid: title + copy button, then the table or the
// empty message.
function MonthlyColumn({
  title,
  matrix,
  head,
  rows,
  emptyMsg,
}: {
  title: string;
  matrix: Matrix | null;
  head: string[];
  rows: React.ReactNode[];
  emptyMsg: string;
}) {
  return (
    <div className="monthly-col">
      <MonthlyHead title={title} matrix={matrix} />
      {rows.length ? (
        <table className="monthly-tbl">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      ) : (
        <div className="monthly-empty">{emptyMsg}</div>
      )}
    </div>
  );
}

// Dettaglio mensile per BO: PDC (report_pdc), Verbali SAL (verbali_sal) e BEF
// (bef_records), caricati on-demand dalla riga/card espansa.
export default function MonthlyDetail({ state }: { state: MonthlyState }) {
  if (state === 'loading') return <div className="monthly-empty">Caricamento dettaglio mensile…</div>;
  if (state === 'error') return <div className="monthly-empty">Impossibile caricare il dettaglio mensile.</div>;
  const pdc = sortByPeriod(state.pdc, (r) => r.periodo_pdc);
  const sal = sortByPeriod(state.sal, (r) => r.periodo_competenza);
  const bef = sortByPeriod(state.bef, (r) => r.periodo_competenza);
  return (
    <div className="monthly-grid">
      <MonthlyColumn
        title="PDC mensile"
        matrix={pdcMatrix(pdc)}
        head={['Periodo', 'Stato', 'Codice']}
        emptyMsg="Nessuna PDC registrata per questo BO."
        rows={pdc.map((r, i) => (
          <tr key={i}>
            <td>{r.periodo_pdc || '—'}</td>
            <td style={{ color: statusColor(r.stato_pdc) }}>{r.stato_pdc || '—'}</td>
            <td className="codecell">{r.codice_pdc || '—'}</td>
          </tr>
        ))}
      />
      <MonthlyColumn
        title="Verbali SAL mensili"
        matrix={salMatrix(sal)}
        head={['Periodo', 'Stato verbale', 'Conforme']}
        emptyMsg="Nessun verbale SAL registrato per questo BO."
        rows={sal.map((r, i) => (
          <tr key={i}>
            <td>{r.periodo_competenza || '—'}</td>
            <td style={{ color: statusColor(r.stato_verbale) }}>{r.stato_verbale || '—'}</td>
            <td style={{ color: statusColor(r.conforme) }}>{r.conforme || '—'}</td>
          </tr>
        ))}
      />
      <MonthlyColumn
        title="BEF mensili"
        matrix={befMatrix(bef)}
        head={['Periodo', 'Importo', 'Fattura']}
        emptyMsg="Nessun BEF registrato per questo IF."
        rows={bef.map((r, i) => (
          <tr key={i}>
            <td>{r.periodo_competenza || '—'}</td>
            <td className="num">{r.importo_ricezione != null ? EUR0(r.importo_ricezione) : '—'}</td>
            <td style={{ color: r.num_fattura ? 'var(--good)' : 'var(--slate-l)' }}>{r.num_fattura || 'fatturabile'}</td>
          </tr>
        ))}
      />
    </div>
  );
}
