'use client';
import React, { useRef } from 'react';
import { EUR0 } from '@/lib/format';
import { formatTariffa } from '@/lib/distribuzione';
import type { Seniority } from '@/lib/types';
import { Html } from '../../Html';
import { ChartCard, CopyTableButton } from '../../export/ExportControls';
import { buildSenDonut } from './distribuzioneHtml';

// 4c — per seniority.
export default function SeniorityTab({ seniority, active }: { seniority: Seniority[]; active: boolean }) {
  const senTblRef = useRef<HTMLDivElement>(null);
  const senDonut = buildSenDonut(seniority);
  return (
  <div className={'subpanel' + (active ? ' on' : '')}>
    <div className="grid2">
      <ChartCard
        title="GG/Uomo per figura professionale"
        caption="Giornate/uomo pianificate · intero portafoglio"
        filename="GG_uomo_per_figura"
      >
        <Html html={senDonut} />
      </ChartCard>
      <div className="tablecard">
        <div className="tbar">
          <h3>Figure professionali e tariffe</h3>
          <CopyTableButton style={{ marginLeft: 'auto' }} targetRef={senTblRef} />
        </div>
        <div className="tscroll" ref={senTblRef}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Figura</th>
                <th>Codice</th>
                <th className="num">GG/Uomo</th>
                <th className="num">Tariffa (€/GG)</th>
              </tr>
            </thead>
            <tbody>
              {seniority.map((s, i) => (
                <tr key={i}>
                  <td>{s.figura}</td>
                  <td>
                    <span className="pill" style={{ background: '#EEF2F1', color: 'var(--ink)' }}>
                      {s.code}
                    </span>
                  </td>
                  <td className="num">{EUR0(s.gg)}</td>
                  <td className="num">{formatTariffa(s.tariffa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  );
}
