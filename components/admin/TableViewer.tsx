'use client';
import React, { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { fmtCell } from '@/lib/adminHelpers';
import { TableBlock } from './shared';
import type { ColumnMeta } from './dbTypes';

export default function TableViewer({ name }: { name: string }) {
  const limit = 50;
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ columns: ColumnMeta[]; rows: Record<string, unknown>[]; total: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErr(false);
    fetchWithTimeout(`/api/admin/db/table/${encodeURIComponent(name)}?limit=${limit}&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error);
        setData(d);
        setLoaded(true);
      })
      .catch(() => {
        setErr(true);
        setLoaded(true);
      });
  }, [name, offset]);

  const cols = data?.columns.map((c) => c.column_name) ?? [];

  return (
    <div className="card">
      <h3>
        Struttura e contenuto · <span className="mono">{name}</span>
      </h3>
      {!loaded ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Caricamento in corso…</span>
          <div className="skel skel-line w60" style={{ marginBottom: 8 }} aria-hidden />
          <div className="skel skel-line w80" style={{ marginBottom: 8 }} aria-hidden />
          <div className="skel skel-line w40" aria-hidden />
        </div>
      ) : err ? (
        <div style={{ color: 'var(--bad, #c0392b)', fontSize: 13 }}>
          Errore nel caricamento della tabella.
        </div>
      ) : (
        <>
          <div className="cap">Colonne</div>
          <TableBlock copyTitle="Copia struttura colonne per Excel" style={{ marginBottom: 14 }}>
            <table className="datatable">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Nullable</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {data!.columns.map((c) => (
                  <tr key={c.column_name}>
                    <td className="mono">{c.column_name}</td>
                    <td>{c.data_type}</td>
                    <td>{c.is_nullable === 'YES' ? 'sì' : 'no'}</td>
                    <td className="mono">{c.column_default ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableBlock>

          <div className="cap">Contenuto ({data!.total.toLocaleString('it-IT')} righe totali)</div>
          <TableBlock copyTitle="Copia contenuto della pagina corrente per Excel">
            <table className="datatable">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((row, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c} className="mono">
                        {fmtCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
                {data!.rows.length === 0 && (
                  <tr>
                    <td colSpan={cols.length || 1} style={{ color: 'var(--muted)', padding: 14 }}>
                      Nessuna riga.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableBlock>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="ubtn" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>
              ← Precedenti
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {data!.total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, data!.total)} di {data!.total}
            </span>
            <button className="ubtn" disabled={offset + limit >= data!.total} onClick={() => setOffset((o) => o + limit)}>
              Successive →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
