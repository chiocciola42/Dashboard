'use client';
import React, { useRef } from 'react';
import { EUR0, PCT } from '@/lib/format';
import { DESC, MODLAB, type ModalitaRow } from '@/lib/modalita';
import { CopyTableButton } from '../../export/ExportControls';

// "Dettaglio modalità fornitura": one clickable row per modalità.
export default function ModalitaTable({
  modalita,
  tot,
  onDrillMod,
}: {
  modalita: ModalitaRow[];
  tot: number;
  onDrillMod: (modLabel: string) => void;
}) {
  const tblRef = useRef<HTMLDivElement>(null);
  return (
    <div className="tablecard">
      <div className="tbar">
        <h3>Dettaglio modalità fornitura</h3>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>clic su una riga per gli IF ↗</span>
        <CopyTableButton targetRef={tblRef} />
      </div>
      <div className="tscroll" ref={tblRef}>
        <table className="dtable">
          <thead>
            <tr>
              <th>Modalità</th>
              <th className="num">N° IF</th>
              <th className="num">Costo totale (€)</th>
              <th className="num">% valore</th>
              <th>Descrizione</th>
            </tr>
          </thead>
          <tbody>
            {modalita.map((m) => (
              <tr key={m.mod} style={{ cursor: 'pointer' }} onClick={() => onDrillMod(MODLAB[m.mod])}>
                <td>
                  <b>{MODLAB[m.mod] || m.mod}</b>
                </td>
                <td className="num">{m.n}</td>
                <td className="num">{EUR0(m.costo)} €</td>
                <td className="num">{PCT((m.costo / tot) * 100)}</td>
                <td style={{ color: 'var(--muted)' }}>{DESC[m.mod] || ''} ↗</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
