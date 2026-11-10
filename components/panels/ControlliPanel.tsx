'use client';
import React, { useMemo, useRef, useState } from 'react';
import type { Intervento } from '@/lib/types';
import { conta, type Controlli, type Livello } from '@/lib/riconciliazione';
import { CopyTableButton } from '../export/ExportControls';
import {
  LIVELLI,
  MAX_RIGHE_VISIBILI,
  STATO_CLASS,
  STATO_LABEL,
  ammesso,
  differenza,
  entita,
  esitiInVista,
  euro,
  filtra,
  ordina,
} from './controlli/controlliView';

// Controlli di coerenza: giornate × tariffa di gara contro i valori importati. Importi e giornate
// derivano dalla stessa fonte, quindi oltre l'arrotondamento una differenza è un errore delle fonti.
function ControlliPanel({ IFs, controlli }: { IFs: Intervento[]; controlli: Controlli }) {
  const [livello, setLivello] = useState<Livello | 'tutti'>('tutti');
  const [tutti, setTutti] = useState(false);
  const tblRef = useRef<HTMLDivElement>(null);

  const inVista = useMemo(() => esitiInVista(controlli.esiti, new Set(IFs.map((i) => i.numero_if))), [controlli.esiti, IFs]);
  // Nessuna riga GdL importata: non c'è nulla da confrontare (il confronto RTI esisterebbe comunque, vuoto).
  const senzaDati = controlli.righe.gdl === 0;
  const righe = senzaDati ? [] : ordina(filtra(inVista, livello, !tutti));
  const mostrate = righe.slice(0, MAX_RIGHE_VISIBILI);
  const perIf = conta(inVista, 'if');

  return (
    <div className="panel on" data-p="8">
      <div className="phead">
        <h2>Controlli di coerenza</h2>
        <p>
          Giornate × tariffa di gara contro i valori importati. Importi e giornate vengono dalla stessa fonte: oltre
          l&apos;arrotondamento una differenza indica un errore nelle fonti.
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
        <div className="kpi accent">
          <div className="lab">Quadrano · IF</div>
          <div className="val">{perIf.quadra}</div>
          <div className="note">entro 0,05 €</div>
        </div>
        <div className="kpi accent">
          <div className="lab">Arrotondamento · IF</div>
          <div className="val">{perIf.arrotondamento}</div>
          <div className="note">entro la soglia per riga</div>
        </div>
        <div className={'kpi' + (perIf.discrepanza ? ' attn' : ' accent')}>
          <div className="lab">Discrepanze · IF</div>
          <div className="val" style={perIf.discrepanza ? { color: 'var(--bad)' } : undefined}>
            {perIf.discrepanza}
          </div>
          <div className="note">oltre l&apos;arrotondamento</div>
        </div>
        <div className="kpi accent">
          <div className="lab">Non confrontabili · IF</div>
          <div className="val">{perIf.non_confrontabile}</div>
          <div className="note">manca un dato</div>
        </div>
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
        <div className="subtabs" role="group" aria-label="Livello del confronto">
          {LIVELLI.map((l) => (
            <button key={l.id} className={livello === l.id ? 'on' : ''} aria-pressed={livello === l.id} onClick={() => setLivello(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="tscroll" ref={tblRef}>
          <table className="dtable" aria-label="Confronti fra valori ricostruiti e valori importati">
            <thead>
              <tr>
                <th>Livello</th>
                <th>Entità e controllo</th>
                <th className="num">Importato</th>
                <th className="num">Ricostruito</th>
                <th className="num">Differenza</th>
                <th className="num">Ammesso</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {mostrate.length ? (
                mostrate.map((e, i) => (
                  <tr key={i}>
                    <td>{e.livello.toUpperCase()}</td>
                    <td>
                      <b>{entita(e)}</b>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{e.controllo}</div>
                      {e.motivo && <div style={{ color: 'var(--ink)', fontSize: 12 }}>{e.motivo}</div>}
                    </td>
                    <td className="num">{euro(e.importato)}</td>
                    <td className="num">{euro(e.ricostruito)}</td>
                    <td className="num">{differenza(e.differenza)}</td>
                    <td className="num">{ammesso(e.ammesso)}</td>
                    <td>
                      <span className={'pill ' + STATO_CLASS[e.stato]}>{STATO_LABEL[e.stato]}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ color: 'var(--muted)' }}>
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
            Mostrati i primi {mostrate.length} di {righe.length} confronti: restringi il livello per vederli tutti.
          </div>
        )}
      </div>
      <div className="foot" style={{ marginTop: 14 }}>
        <b>Come si legge:</b> Differenza = ricostruito − importato. «Ammesso» è la soglia di arrotondamento dell&apos;entità
        (0,01 € più 0,005 giornate × tariffa per ogni riga: le giornate hanno al massimo 2 decimali). Un confronto con una riga
        senza giornate o senza tariffa non viene stimato in parte: risulta non confrontabile.
      </div>
    </div>
  );
}

export default React.memo(ControlliPanel);
