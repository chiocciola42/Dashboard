'use client';
import React, { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { aggregate, type Calendar } from '@/lib/fiscal';
import { EUR } from '@/lib/format';
import type { Intervento } from '@/lib/types';
import { TableBlock } from './shared';
import IfDetail from './IfDetail';

// ---------------------------------------------------------------------------
// 3. IF / BO (master-detail)
// ---------------------------------------------------------------------------
export default function IfBoSection({
  ifs0,
  anno0,
  anni0,
  show,
}: {
  ifs0: Intervento[];
  anno0: number;
  anni0: number[];
  show: (m: string, bad?: boolean) => void;
}) {
  const [ifs, setIfs] = useState<Intervento[]>(ifs0);
  // Monthly profiles belong to a calendar year: pick it, and the list (and the
  // editor below) reload with that year's revenue and consuntivazione.
  const [anno, setAnno] = useState(anno0);
  const [anni, setAnni] = useState<number[]>(anni0);
  const [newYear, setNewYear] = useState('');
  const [loadingYear, setLoadingYear] = useState(false);
  const changeYear = async (y: number) => {
    setLoadingYear(true);
    try {
      const res = await fetchWithTimeout(`/api/interventi?anno=${y}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIfs(data.interventi as Intervento[]);
      setAnno(y);
      setAnni((list) => (list.includes(y) ? list : [...list, y].sort((a, b) => a - b)));
    } catch {
      show('Caricamento dell\'anno non riuscito', true);
    } finally {
      setLoadingYear(false);
    }
  };
  const addYear = () => {
    const y = Number(newYear);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      show('Anno non valido (2000–2100)', true);
      return;
    }
    setNewYear('');
    void changeYear(y);
  };
  const [selId, setSelId] = useState<string | null>(ifs0[0]?.numero_if ?? null);
  const [cal, setCal] = useState<Calendar>('solare');

  const sel = ifs.find((i) => i.numero_if === selId) || null;

  const onUpdated = (u: Intervento) =>
    setIfs((list) => list.map((i) => (i.numero_if === u.numero_if ? u : i)));

  // per-IF annual rollups for the summary table
  const annual = (arr: number[] | null | undefined) =>
    aggregate(arr, cal, 'annuale')[0]?.value ?? 0;

  return (
    <>
      <div className="card">
        <h3>Revenue e consuntivazione per IF / BO</h3>
        <div className="cap">Totali annuali per intervento. Seleziona un IF per modificarne il dettaglio.</div>
        <div className="seg2 small" style={{ marginBottom: 12, marginLeft: 0, display: 'inline-flex' }} aria-label="Anno dei profili mensili">
          {anni.map((y) => (
            <button key={y} className={y === anno ? 'on' : ''} disabled={loadingYear} onClick={() => void changeYear(y)}>
              {y}
            </button>
          ))}
        </div>
        <div style={{ display: 'inline-flex', gap: 6, marginLeft: 12, marginBottom: 12, alignItems: 'center' }}>
          <input
            type="number"
            placeholder="Nuovo anno"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            style={{ width: 110, fontFamily: 'inherit', fontSize: 13, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px' }}
          />
          <button className="ubtn" onClick={addYear} disabled={loadingYear}>
            Aggiungi anno
          </button>
        </div>
        <div className="seg2 small" style={{ marginBottom: 12 }}>
          <button className={cal === 'solare' ? 'on' : ''} onClick={() => setCal('solare')}>Anno solare</button>
          <button className={cal === 'fiscale' ? 'on' : ''} onClick={() => setCal('fiscale')}>Anno fiscale (Set–Ago)</button>
        </div>
        <TableBlock copyTitle="Copia revenue e consuntivazione per IF/BO per Excel">
          <table className="datatable">
            <thead>
              <tr>
                <th>IF</th>
                <th>Titolo</th>
                <th>Fornitore</th>
                <th>BO</th>
                <th style={{ textAlign: 'right' }}>Revenue {cal === 'fiscale' ? 'fisc.' : 'sol.'}</th>
                <th style={{ textAlign: 'right' }}>Consuntiv.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ifs.map((i) => (
                <tr key={i.numero_if} className={i.numero_if === selId ? 'selrow' : ''}>
                  <td className="mono">{i.numero_if}</td>
                  <td title={i.titolo}>{i.titolo.length > 42 ? i.titolo.slice(0, 41) + '…' : i.titolo}</td>
                  <td>{i.fornitore}</td>
                  <td>{i.has_bo ? '✔' : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{EUR(annual(i.rev_mesi))}</td>
                  <td style={{ textAlign: 'right' }}>{EUR(annual(i.cons_mesi))}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="ubtn" onClick={() => setSelId(i.numero_if)}>
                      Modifica
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBlock>
      </div>

      {sel && <IfDetail key={`${sel.numero_if}-${anno}`} iv={sel} anno={anno} onUpdated={onUpdated} show={show} />}
    </>
  );
}
