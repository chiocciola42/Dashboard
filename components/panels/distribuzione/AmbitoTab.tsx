'use client';
import React, { useRef } from 'react';
import { EUR0, PCT } from '@/lib/format';
import type { AmbitoAgg } from '@/lib/distribuzione';
import { Html } from '../../Html';
import { ChartCard, CopyTableButton } from '../../export/ExportControls';
import { buildAmbCount, buildAmbVal } from './distribuzioneHtml';

// 4a — per ambito.
export default function AmbitoTab({ ae, tot, active }: { ae: [string, AmbitoAgg][]; tot: number; active: boolean }) {
  const ambTblRef = useRef<HTMLDivElement>(null);
  const ambCount = buildAmbCount(ae);
  const ambVal = buildAmbVal(ae);
  return (
  <div className={'subpanel' + (active ? ' on' : '')}>
    <div className="grid2">
      <ChartCard
        title="N° IF per ambito"
        caption="Numero di Interventi di Fornitura per macro ambito"
        filename="IF_per_ambito"
      >
        <Html html={ambCount} />
      </ChartCard>
      <ChartCard
        title="Valore (€) per ambito"
        caption="Valore ordinato per macro ambito"
        filename="Valore_per_ambito"
      >
        <Html html={ambVal} />
      </ChartCard>
    </div>
    <div className="tablecard">
      <div className="tbar">
        <h3>Dettaglio per ambito</h3>
        <CopyTableButton style={{ marginLeft: 'auto' }} targetRef={ambTblRef} />
      </div>
      <div className="tscroll" ref={ambTblRef}>
        <table className="dtable">
          <thead>
            <tr>
              <th>Ambito</th>
              <th className="num">N° IF</th>
              <th className="num">Valore (€)</th>
              <th className="num">% sul totale</th>
            </tr>
          </thead>
          <tbody>
            {ae.length ? (
              ae.map((e) => (
                <tr key={e[0]}>
                  <td>{e[0]}</td>
                  <td className="num">{e[1].n}</td>
                  <td className="num">{EUR0(e[1].v)} €</td>
                  <td className="num">{tot ? PCT((e[1].v / tot) * 100) : '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)' }}>
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
