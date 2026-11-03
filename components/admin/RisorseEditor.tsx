'use client';
import React, { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { EUR } from '@/lib/format';
import type { IfRisorsa } from '@/lib/types';
import { n } from '@/lib/adminHelpers';
import { NumInput, TextInput, TableBlock } from './shared';

// --- Risorse (giorni uomo / figure / gruppi / tariffe per IF) --------------
export default function RisorseEditor({ numeroIf, show }: { numeroIf: string; show: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<IfRisorsa[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError(false);
    fetchWithTimeout(`/api/admin/risorse/${encodeURIComponent(numeroIf)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (active) {
          setRows(d.risorse || []);
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

  const upd = (i: number, patch: Partial<IfRisorsa>) =>
    setRows((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(`/api/admin/risorse/${encodeURIComponent(numeroIf)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ risorse: rows }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setRows(d.risorse || []);
      show('Risorse salvate');
    } catch {
      show('Salvataggio non riuscito', true);
    } finally {
      setBusy(false);
    }
  };

  const totGg = rows.reduce((s, r) => s + n(r.gg), 0);
  const totImporto = rows.reduce((s, r) => s + n(r.gg) * n(r.tariffa_giornaliera), 0);

  return (
    <div className="card">
      <h3>Giorni uomo · figure · gruppi di lavoro · tariffe</h3>
      <div className="cap">
        Allocazione risorse dell&apos;IF. Totale giorni uomo: <b>{totGg.toLocaleString('it-IT')}</b> · Valore stimato: <b>{EUR(totImporto)}</b>
      </div>
      {!loaded ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Caricamento in corso…</span>
          <div className="skel skel-line w60" style={{ marginBottom: 8 }} aria-hidden />
          <div className="skel skel-line w80" style={{ marginBottom: 8 }} aria-hidden />
          <div className="skel skel-line w40" aria-hidden />
        </div>
      ) : loadError ? (
        <div style={{ color: 'var(--bad, #c0392b)', fontSize: 13 }}>
          Errore nel caricamento delle risorse. Riprova ricaricando la pagina.
        </div>
      ) : (
        <>
          <TableBlock copyTitle="Copia allocazione risorse per Excel">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Figura professionale</th>
                  <th>Sigla</th>
                  <th>Gruppo di lavoro</th>
                  <th style={{ textAlign: 'right' }}>Giorni uomo</th>
                  <th style={{ textAlign: 'right' }}>Tariffa gg (€)</th>
                  <th style={{ textAlign: 'right' }}>Valore (€)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><TextInput value={r.figura} onChange={(v) => upd(i, { figura: v })} /></td>
                    <td><TextInput value={r.sigla} width={90} onChange={(v) => upd(i, { sigla: v })} /></td>
                    <td><TextInput value={r.gruppo} onChange={(v) => upd(i, { gruppo: v })} /></td>
                    <td style={{ textAlign: 'right' }}><NumInput value={r.gg} step={0.5} width={90} onChange={(v) => upd(i, { gg: v })} /></td>
                    <td style={{ textAlign: 'right' }}><NumInput value={r.tariffa_giornaliera} width={110} onChange={(v) => upd(i, { tariffa_giornaliera: v })} /></td>
                    <td style={{ textAlign: 'right' }}>{EUR(n(r.gg) * n(r.tariffa_giornaliera))}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="ubtn bad" onClick={() => setRows((l) => l.filter((_, j) => j !== i))}>×</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ color: 'var(--muted)', padding: 14 }}>Nessuna risorsa allocata.</td></tr>
                )}
              </tbody>
            </table>
          </TableBlock>
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <button
              className="ubtn"
              onClick={() => setRows((l) => [...l, { numero_if: numeroIf, figura: '', sigla: '', gruppo: '', gg: 0, tariffa_giornaliera: 0 }])}
            >
              + Aggiungi risorsa
            </button>
            <button className="exp-save" disabled={busy} onClick={save}>💾 Salva risorse</button>
          </div>
        </>
      )}
    </div>
  );
}
