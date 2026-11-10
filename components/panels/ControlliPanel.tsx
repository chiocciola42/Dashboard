'use client';
import React, { useMemo, useRef, useState } from 'react';
import type { Intervento } from '@/lib/types';
import { CONFRONTI, conta, type Controlli, type Confronto } from '@/lib/riconciliazione';
import { CopyTableButton } from '../export/ExportControls';
import {
  MAX_RIGHE_VISIBILI,
  SCHEDE,
  STATO_CLASS,
  STATO_LABEL,
  ammesso,
  differenza,
  entita,
  esitiInVista,
  euro,
  filtra,
  intestazioni,
  ordina,
} from './controlli/controlliView';

// Controlli di coerenza: tre confronti fra costi per IF (Generalità, Oggetto Fornitura, GG × profilo).
// Le fonti descrivono la stessa fornitura, quindi oltre l'arrotondamento una differenza è un errore.
function ControlliPanel({ IFs, controlli }: { IFs: Intervento[]; controlli: Controlli }) {
  const [scheda, setScheda] = useState<Confronto | 'tutti'>('tutti');
  const [tutti, setTutti] = useState(false);
  const tblRef = useRef<HTMLDivElement>(null);

  const inVista = useMemo(() => esitiInVista(controlli.esiti, new Set(IFs.map((i) => i.numero_if))), [controlli.esiti, IFs]);
  // Nessuna riga GdL importata: non c'è nulla da confrontare (il confronto RTI esisterebbe comunque, vuoto).
  const senzaDati = controlli.righe.gdl === 0;
  const righe = senzaDati ? [] : ordina(filtra(inVista, scheda, !tutti));
  const mostrate = righe.slice(0, MAX_RIGHE_VISIBILI);
  const head = intestazioni(scheda);
  const perConfronto = (Object.keys(CONFRONTI) as Confronto[]).map((id) => ({ id, ...conta(inVista, id) }));

  return (
    <div className="panel on" data-p="8">
      <div className="phead">
        <h2>Controlli di coerenza</h2>
        <p>
          Per ogni IF: Importo Previsto (Generalità) contro GG × profilo professionale, Σ costi di Oggetto Fornitura
          contro Importo Previsto, Σ costi di Oggetto Fornitura contro GG × profilo. Oltre l&apos;arrotondamento una
          differenza indica un errore nelle fonti.
        </p>
      </div>
      {controlli.errore && (
        <div className="alert" role="alert">
          <h3>Controlli non eseguiti</h3>
          <div className="cap">I dati importati non sono coerenti: {controlli.errore}</div>
        </div>
      )}
      {controlli.tariffeMancanti.length > 0 && (
        <div className="disclaimer" data-testid="tariffe-mancanti">
          <b>Tariffe di gara mancanti</b> per {controlli.tariffeMancanti.length}{' '}
          {controlli.tariffeMancanti.length === 1 ? 'figura' : 'figure'} ({controlli.tariffeMancanti.join(', ')}). Impostale in
          Gestione dati › Figure professionali e tariffe: finché mancano, i confronti a tariffa risultano non confrontabili. Le
          tariffe si modificano solo a mano.
        </div>
      )}
      <div className="kpis">
        {perConfronto.map((c) => (
          <div key={c.id} className={'kpi' + (c.discrepanza ? ' attn' : ' accent')}>
            <div className="lab">{CONFRONTI[c.id].label}</div>
            <div className="val" style={c.discrepanza ? { color: 'var(--bad)' } : undefined}>
              {c.discrepanza}
            </div>
            <div className="note">
              discrepanze · {c.quadra + c.arrotondamento} ok · {c.non_confrontabile} non confrontabili
            </div>
          </div>
        ))}
      </div>
      <div className="tablecard">
        <div className="tbar">
          <h3>Confronti</h3>
          <label style={{ marginLeft: 'auto', fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} />
            Mostra anche i confronti che quadrano
          </label>
          <CopyTableButton targetRef={tblRef} />
        </div>
        <div className="subtabs" role="group" aria-label="Confronto">
          {SCHEDE.map((l) => (
            <button key={l.id} className={scheda === l.id ? 'on' : ''} aria-pressed={scheda === l.id} onClick={() => setScheda(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="tscroll" ref={tblRef}>
          <table className="dtable" aria-label="Confronti fra i costi di Generalità, Oggetto Fornitura e GG × profilo">
            <thead>
              <tr>
                <th>Entità e controllo</th>
                <th className="num">{head.primo}</th>
                <th className="num">{head.secondo}</th>
                <th className="num">Differenza</th>
                <th className="num">Ammesso</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {mostrate.length ? (
                mostrate.map((e, i) => (
                  <tr key={i}>
                    <td>
                      <b>{entita(e)}</b>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{e.controllo}</div>
                      {e.motivo && <div style={{ color: 'var(--ink)', fontSize: 12 }}>{e.motivo}</div>}
                    </td>
                    <td className="num">{euro(e.primo)}</td>
                    <td className="num">{euro(e.secondo)}</td>
                    <td className="num">{differenza(e.differenza)}</td>
                    <td className="num">{ammesso(e.ammesso)}</td>
                    <td>
                      <span className={'pill ' + STATO_CLASS[e.stato]}>{STATO_LABEL[e.stato]}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--muted)' }}>
                    {senzaDati
                      ? 'Nessun dato: carica un file Aggregatore con i fogli «GdL - Gruppo di Lavoro» e «Oggetto Fornitura».'
                      : 'Nessun confronto da mostrare con questi filtri.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {righe.length > mostrate.length && (
          <div className="foot" style={{ marginTop: 10 }}>
            Mostrati i primi {mostrate.length} di {righe.length} confronti: scegli un confronto per vederli tutti.
          </div>
        )}
      </div>
      <div className="foot" style={{ marginTop: 14 }}>
        <b>Come si legge:</b> Differenza = secondo valore − primo valore. «Ammesso» è la soglia di arrotondamento: 0,05 € per
        Fornitura ↔ Generalità; per i confronti con GG × profilo 0,01 € più 0,005 giornate × tariffa per ogni riga (le
        giornate hanno al massimo 2 decimali). Un confronto con costi, giornate o tariffe mancanti non viene stimato in
        parte: risulta non confrontabile.
      </div>
    </div>
  );
}

export default React.memo(ControlliPanel);
