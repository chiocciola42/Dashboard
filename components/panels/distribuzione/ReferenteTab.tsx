'use client';
import React, { useRef } from 'react';
import { EUR0, FCOL, C } from '@/lib/format';
import { legchips } from '@/lib/charts';
import type { RefAgg } from '@/lib/distribuzione';
import { FUORI_RTI } from '@/lib/distribuzione';
import type { RtiPartner } from '@/lib/types';
import { Html } from '../../Html';
import { ChartCard, CopyTableButton } from '../../export/ExportControls';
import { buildRefShares } from './distribuzioneHtml';

const euro = (v: number): string => (v ? EUR0(v) + ' €' : '—');

// 4b — per referente ARIA, ripartito fra tutte le aziende dell'RTI.
export default function ReferenteTab({
  re,
  partners,
  active,
}: {
  re: [string, RefAgg][];
  partners: RtiPartner[];
  active: boolean;
}) {
  const refTblRef = useRef<HTMLDivElement>(null);
  const refShares = buildRefShares(re, partners);
  const hasFuori = re.some(([, o]) => o.fuoriRti > 0);
  const chips = [
    ...partners.map((p) => ({ c: FCOL[p.name] || C.slateL, t: `${p.name} · quota ${Math.round(p.pct * 1000) / 10}%` })),
    ...(hasFuori ? [{ c: FCOL.Altro || C.slateL, t: FUORI_RTI }] : []),
    { c: C.ink, t: 'Linee: quote da contratto', line: true },
  ];
  return (
  <div className={'subpanel' + (active ? ' on' : '')}>
    <ChartCard
      title="Come si ripartisce ogni referente fra tutte le aziende dell'RTI, rispetto alle quote contrattuali?"
      exportTitle="Ripartizione dei referenti ARIA fra le aziende dell'RTI"
      caption="Quota e importo per azienda · barra in cima e linee tratteggiate = quote da contratto · scostamento max in punti percentuali"
      filename="Valore_per_referente_ARIA"
    >
      <Html
        ariaLabel={`Ripartizione del valore di ogni referente ARIA fra le aziende dell'RTI (${partners
          .map((p) => `${p.name} quota ${Math.round(p.pct * 1000) / 10}%`)
          .join(', ')}). ${re
          .map(([k, o]) => `${k}: ${partners.map((p) => `${p.name} ${EUR0(o.byPartner[p.name] || 0)} euro`).join(', ')}${o.fuoriRti ? `, fuori RTI ${EUR0(o.fuoriRti)} euro` : ''}`)
          .join('; ')}.`}
        html={refShares}
      />
      <Html className="legrow" html={legchips(chips)} />
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
              {partners.map((p) => (
                <th className="num" key={p.name}>
                  {p.name} (€)
                </th>
              ))}
              {hasFuori && <th className="num">{FUORI_RTI} (€)</th>}
              <th className="num">Totale (€)</th>
              <th className="num">N° IF</th>
            </tr>
          </thead>
          <tbody>
            {re.length ? (
              re.map(([k, o]) => (
                <tr key={k}>
                  <td>{k}</td>
                  {partners.map((p) => (
                    <td className="num" key={p.name}>
                      {euro(o.byPartner[p.name] || 0)}
                    </td>
                  ))}
                  {hasFuori && <td className="num">{euro(o.fuoriRti)}</td>}
                  <td className="num">
                    <b>{EUR0(o.tot)} €</b>
                  </td>
                  <td className="num">{o.n}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={partners.length + (hasFuori ? 1 : 0) + 3} style={{ color: 'var(--muted)' }}>
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
