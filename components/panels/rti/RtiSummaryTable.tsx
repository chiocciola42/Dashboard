'use client';
import React, { useRef } from 'react';
import type { Meta } from '@/lib/types';
import { EUR0, PCT } from '@/lib/format';
import type { SummaryRow } from '@/lib/rtiErosion';
import { CopyTableButton } from '../../export/ExportControls';

// "Riepilogo numerico": every theoretical and real figure per company and for
// the contract total, today and projected to the contract's end.
export default function RtiSummaryTable({
  summaryRows,
  theoreticalTodayPct,
  meta,
}: {
  summaryRows: SummaryRow[];
  theoreticalTodayPct: number;
  meta: Meta;
}) {
  const summaryTblRef = useRef<HTMLDivElement>(null);
  return (
        <div className="card">
          <div className="cardhead">
            <div className="cardhead-txt">
              <h3>Riepilogo numerico</h3>
              <div className="cap">
                Tutti i numeri teorici e reali, per azienda e per il totale del contratto, alla data odierna e in proiezione a fine contratto
              </div>
            </div>
            <CopyTableButton targetRef={summaryTblRef} />
          </div>
          <div className="tscroll" ref={summaryTblRef}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Azienda</th>
                  <th className="num">Quota</th>
                  <th className="num">Quota %</th>
                  <th className="num">Reale a oggi</th>
                  <th className="num">Erosione reale a oggi</th>
                  <th className="num">Erosione teorica attesa a oggi</th>
                  <th className="num">Scostamento a oggi</th>
                  <th className="num">Proiezione fine contratto</th>
                  <th className="num">Proiezione fine contratto %</th>
                  <th className="num">Scostamento proiezione</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r) => {
                  const deltaToday = r.realPct != null ? r.realPct - theoreticalTodayPct : null;
                  const deltaProjected = r.projectedPct != null ? r.projectedPct - 100 : null;
                  return (
                    <tr key={r.label}>
                      <td>
                        <span className="dot" style={{ background: r.color, display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 7 }} />
                        {r.label === 'Totale contratto' ? <b>{r.label}</b> : r.label}
                      </td>
                      <td className="num">{EUR0(r.quota)} €</td>
                      <td className="num">{PCT(r.quotaPct)}</td>
                      <td className="num">{r.realEur != null ? `${EUR0(r.realEur)} €` : '—'}</td>
                      <td className="num">{r.realPct != null ? PCT(r.realPct) : '—'}</td>
                      <td className="num">{EUR0(r.theoreticalTodayEur)} € · {PCT(theoreticalTodayPct)}</td>
                      <td className="num" style={{ color: deltaToday == null ? undefined : deltaToday >= 0 ? 'var(--good)' : 'var(--amber-d)' }}>
                        {deltaToday != null ? `${deltaToday >= 0 ? '+' : ''}${deltaToday.toFixed(1)} p.p.` : '—'}
                      </td>
                      <td className="num">{r.projectedEur != null ? `${EUR0(r.projectedEur)} €` : '—'}</td>
                      <td className="num">{r.projectedPct != null ? PCT(r.projectedPct) : '—'}</td>
                      <td className="num" style={{ color: deltaProjected == null ? undefined : deltaProjected >= 0 ? 'var(--bad)' : 'var(--good)' }}>
                        {deltaProjected != null ? `${deltaProjected >= 0 ? '+' : ''}${deltaProjected.toFixed(1)} p.p.` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Contratto {meta.contract_date} → {meta.valid_to}. &quot;Erosione teorica attesa a oggi&quot; è il ritmo lineare 0→100% calcolato sulle date di stipula e scadenza. &quot;Proiezione fine contratto&quot; estrapola il ritmo reale osservato finora fino alla scadenza.
          </div>
        </div>
  );
}
