'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { TableBlock } from './shared';
import type { TableMeta, ColumnMeta } from './dbTypes';
import TableViewer from './TableViewer';
import QueryRunner from './QueryRunner';

export default function DbSection({ show }: { show: (m: string, bad?: boolean) => void }) {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadTables = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    fetchWithTimeout('/api/admin/db/tables')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error);
        setTables(d.tables || []);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  return (
    <>
      <div className="card">
        <h3>Tabelle del database</h3>
        <div className="cap">
          Elenco delle tabelle presenti nello schema. Seleziona una tabella per vederne struttura e contenuto.
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
            Errore nel caricamento delle tabelle. Riprova ricaricando la pagina.
          </div>
        ) : (
          <TableBlock copyTitle="Copia elenco tabelle per Excel">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Tabella</th>
                  <th style={{ textAlign: 'right' }}>Colonne</th>
                  <th style={{ textAlign: 'right' }}>Righe (circa)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={t.name} className={t.name === selected ? 'selrow' : ''}>
                    <td className="mono">{t.name}</td>
                    <td style={{ textAlign: 'right' }}>{t.columnCount}</td>
                    <td style={{ textAlign: 'right' }}>{t.approxRows.toLocaleString('it-IT')}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="ubtn" onClick={() => setSelected(t.name)}>
                        Visualizza
                      </button>
                    </td>
                  </tr>
                ))}
                {tables.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--muted)', padding: 14 }}>
                      Nessuna tabella trovata.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableBlock>
        )}
      </div>

      {selected && <TableViewer key={selected} name={selected} />}

      <QueryRunner show={show} onMutated={loadTables} />
    </>
  );
}
