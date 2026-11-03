'use client';
import React, { useRef } from 'react';
import { EUR0 } from '@/lib/format';
import { C } from '@/lib/format';
import { legchips } from '@/lib/charts';
import type { RefAgg } from '@/lib/distribuzione';
import { Html } from '../../Html';
import { ChartCard, CopyTableButton } from '../../export/ExportControls';
import { buildRefStack } from './distribuzioneHtml';

// 4b — per referente ARIA.
export default function ReferenteTab({ re, active }: { re: [string, RefAgg][]; active: boolean }) {
  const refTblRef = useRef<HTMLDivElement>(null);
  const refStack = buildRefStack(re);
  return (
  <div className={'subpanel' + (active ? ' on' : '')}>
    <ChartCard
      title={
        <>
          Valore per referente ARIA{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(split Intellera / Deloitte)</span>
        </>
      }
      exportTitle="Valore per referente ARIA (split Intellera / Deloitte)"
      filename="Valore_per_referente_ARIA"
    >
      <Html
        className="legrow"
        style={{ marginTop: 0, marginBottom: 14 }}
        html={legchips([
          { c: C.petrol, t: 'Intellera' },
          { c: C.gold, t: 'Deloitte' },
        ])}
      />
      <Html html={refStack} />
    </ChartCard>
    <div className="tablecard">
      <div className="tbar">
        <h3>Dettaglio referenti</h3>
        <CopyTableButton style={{ marginLeft: 'auto' }} targetRef={refTblRef} />
      </div>
      <div className="tscroll" ref={refTblRef}>
        <table className="dtable">
          <thead>
            <tr>
              <th>Referente ARIA</th>
              <th className="num">Intellera (€)</th>
              <th className="num">Deloitte (€)</th>
              <th className="num">Totale (€)</th>
              <th className="num">N° IF</th>
            </tr>
          </thead>
          <tbody>
            {re.length ? (
              re.map(([k, o]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{o.Intellera ? EUR0(o.Intellera) + ' €' : '—'}</td>
                  <td className="num">{o.Deloitte ? EUR0(o.Deloitte) + ' €' : '—'}</td>
                  <td className="num">
                    <b>{EUR0(o.tot)} €</b>
                  </td>
                  <td className="num">{o.n}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>
                  Nessun dato
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}
