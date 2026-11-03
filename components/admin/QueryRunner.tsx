'use client';
import React, { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { fmtCell } from '@/lib/adminHelpers';
import { TableBlock } from './shared';

export default function QueryRunner({
  show,
  onMutated,
}: {
  show: (m: string, bad?: boolean) => void;
  onMutated: () => void;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ rows: Record<string, unknown>[]; rowCount: number; durationMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMutating = /^\s*(insert|update|delete|drop|alter|truncate|create)\b/i.test(query);

  const run = async () => {
    if (!query.trim()) return;
    if (isMutating && !window.confirm('Questa query modifica schema o dati ed è irreversibile. Continuare?')) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetchWithTimeout('/api/admin/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Errore esecuzione query');
      setResult(d);
      show('Query eseguita');
      if (isMutating) onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore esecuzione query');
      show('Query non riuscita', true);
    } finally {
      setBusy(false);
    }
  };

  const cols = result && result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

  return (
    <div className="card">
      <h3>Esegui query SQL</h3>
      <div className="cap">
        Esegui una singola istruzione SQL direttamente sul database (SELECT, INSERT, UPDATE, DELETE, DDL…).
        Riservato agli amministratori: le modifiche a schema o dati sono irreversibili.
      </div>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SELECT * FROM interventi LIMIT 10"
        rows={6}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          border: '1px solid var(--line)',
          borderRadius: 7,
          padding: '10px 12px',
          resize: 'vertical',
        }}
      />
      <div style={{ marginTop: 10 }}>
        <button className="exp-save" disabled={busy || !query.trim()} onClick={run}>
          {busy ? 'Esecuzione…' : '▶ Esegui query'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 14, color: 'var(--bad, #c0392b)', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="cap">
            {result.rows.length > 0
              ? `${result.rowCount} righe · ${result.durationMs} ms`
              : `Query eseguita (${result.rowCount} righe interessate) · ${result.durationMs} ms`}
          </div>
          {result.rows.length > 0 && (
            <TableBlock copyTitle="Copia risultato della query per Excel" style={{ marginTop: 8 }}>
              <table className="datatable">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {cols.map((c) => (
                        <td key={c} className="mono">
                          {fmtCell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableBlock>
          )}
        </div>
      )}
    </div>
  );
}
