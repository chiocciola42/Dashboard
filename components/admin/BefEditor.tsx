'use client';
import React, { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { EUR } from '@/lib/format';
import type { BefRow } from '@/lib/types';
import { n } from '@/lib/adminHelpers';
import { NumInput, TextInput, TableBlock } from './shared';

// --- BEF per IF ------------------------------------------------------------
export default function BefEditor({ numeroIf, show }: { numeroIf: string; show: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<BefRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError(false);
    fetchWithTimeout(`/api/admin/bef/${encodeURIComponent(numeroIf)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (active) {
          setRows(d.bef || []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [numeroIf]);

  const upd = (i: number, patch: Partial<BefRow>) =>
    setRows((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(`/api/admin/bef/${encodeURIComponent(numeroIf)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bef: rows }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setRows(d.bef || []);
      show('Dati BEF salvati');
    } catch {
      show('Salvataggio non riuscito', true);
    } finally {
      setBusy(false);
    }
  };

  const tot = rows.reduce((s, r) => s + n(r.importo_ricezione), 0);

  return (
    <div className="card">
      <h3>Dati BEF · IF {numeroIf}</h3>
      <div className="cap">Voci BEF dell&apos;intervento. Totale importi: <b>{EUR(tot)}</b></div>
      {!loaded ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Caricamento in corso…</span>
          <div className="skel skel-line w60" style={{ marginBottom: 8 }} aria-hidden />
          <div className="skel skel-line w80" style={{ marginBottom: 8 }} aria-hidden />
          <div className="skel skel-line w40" aria-hidden />
        </div>
      ) : loadError ? (
        <div style={{ color: 'var(--bad, #c0392b)', fontSize: 13 }}>
          Errore nel caricamento dei dati BEF. Riprova ricaricando la pagina.
        </div>
      ) : (
        <>
          <TableBlock copyTitle="Copia voci BEF per Excel">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Num. BO</th>
                  <th>Descrizione</th>
                  <th>Linea</th>
                  <th>Periodo</th>
                  <th>Fornitore reale</th>
                  <th style={{ textAlign: 'right' }}>Importo (€)</th>
                  <th>N. fattura</th>
                  <th>Data fattura</th>
                  <th>Data pagam.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><TextInput value={r.num_bdo} width={110} onChange={(v) => upd(i, { num_bdo: v })} /></td>
                    <td><TextInput value={r.descrizione} onChange={(v) => upd(i, { descrizione: v })} /></td>
                    <td><TextInput value={r.numero_linea_ordine} width={60} onChange={(v) => upd(i, { numero_linea_ordine: v })} /></td>
                    <td><TextInput value={r.periodo_competenza} width={100} onChange={(v) => upd(i, { periodo_competenza: v })} /></td>
                    <td><TextInput value={r.fornitore_reale} width={120} onChange={(v) => upd(i, { fornitore_reale: v })} /></td>
                    <td style={{ textAlign: 'right' }}><NumInput value={r.importo_ricezione} width={110} onChange={(v) => upd(i, { importo_ricezione: v })} /></td>
                    <td><TextInput value={r.num_fattura} width={100} onChange={(v) => upd(i, { num_fattura: v })} /></td>
                    <td><TextInput value={r.data_fattura} width={110} placeholder="AAAA-MM-GG" onChange={(v) => upd(i, { data_fattura: v })} /></td>
                    <td><TextInput value={r.data_pagamento} width={110} placeholder="AAAA-MM-GG" onChange={(v) => upd(i, { data_pagamento: v })} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="ubtn bad" onClick={() => setRows((l) => l.filter((_, j) => j !== i))}>×</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ color: 'var(--muted)', padding: 14 }}>Nessuna voce BEF.</td></tr>
                )}
              </tbody>
            </table>
          </TableBlock>
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <button
              className="ubtn"
              onClick={() =>
                setRows((l) => [
                  ...l,
                  { numero_if: numeroIf, num_bdo: '', descrizione: '', numero_linea_ordine: '', periodo_competenza: '', fornitore_reale: '', importo_ricezione: 0, num_fattura: '', data_fattura: '', data_pagamento: '' },
                ])
              }
            >
              + Aggiungi voce BEF
            </button>
            <button className="exp-save" disabled={busy} onClick={save}>💾 Salva BEF</button>
          </div>
        </>
      )}
    </div>
  );
}
