'use client';
import React, { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { buildFormulaCsv } from '@/lib/formulaCatalog';

// ---------------------------------------------------------------------------
// 5. Export (database → Excel · formule dei calcoli → CSV)
// ---------------------------------------------------------------------------
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 800);
}

export default function ExportSection({ show }: { show: (m: string, bad?: boolean) => void }) {
  const [busyXlsx, setBusyXlsx] = useState(false);

  const exportDbXlsx = async () => {
    setBusyXlsx(true);
    try {
      const res = await fetchWithTimeout('/api/admin/db/export');
      if (!res.ok) {
        // The endpoint returns JSON on error (403/503/500) and a binary
        // workbook on success — surface the server message when present.
        let msg = 'Export non riuscito';
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch {
          /* non-JSON body: keep the generic message */
        }
        show(msg, true);
        return;
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `Database_ARIA_SISS_${stamp}.xlsx`);
      show('Export database completato');
    } catch {
      show('Export non riuscito', true);
    } finally {
      setBusyXlsx(false);
    }
  };

  const exportFormuleCsv = () => {
    try {
      const csv = buildFormulaCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const stamp = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `Formule_calcoli_dashboard_${stamp}.csv`);
      show('Export formule completato');
    } catch {
      show('Export non riuscito', true);
    }
  };

  return (
    <>
      <div className="card">
        <h3>Export completo del database (Excel)</h3>
        <div className="cap">
          Scarica un file <b>.xlsx</b> con una copia integrale di tutte le tabelle del database:
          un foglio per tabella (intestazioni di colonna e contenuto completo delle righe) più un
          foglio indice riepilogativo. I dati vengono scritti dentro il file scaricato (nessun
          collegamento al database); le colonne JSON sono serializzate come testo.
        </div>
        <button className="exp-save" disabled={busyXlsx} onClick={exportDbXlsx}>
          {busyXlsx ? 'Generazione in corso…' : '⤓ Esporta database (.xlsx)'}
        </button>
      </div>

      <div className="card">
        <h3>Export delle formule di calcolo (CSV)</h3>
        <div className="cap">
          Scarica un file <b>.csv</b> che documenta, per i tab <b>1 Overview</b>, <b>2 Quote RTI</b>,{' '}
          <b>3 Timeline</b> e <b>4 Distribuzione</b>, ogni valore calcolato con la relativa formula,
          una spiegazione e i campi/tabelle di origine. Serve a capire esattamente come vengono
          ricavati i numeri mostrati.
        </div>
        <button className="exp-save" onClick={exportFormuleCsv}>
          ⤓ Esporta formule (.csv)
        </button>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
          Colonne: Pagina · Sezione · Elemento/Valore · Formula · Spiegazione · Sorgenti dati.
        </div>
      </div>
    </>
  );
}
