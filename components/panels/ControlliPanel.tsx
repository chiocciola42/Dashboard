'use client';
import React, { useMemo, useRef, useState } from 'react';
import type { Intervento } from '@/lib/types';
import { CONFRONTI, conta, type Controlli, type Esito } from '@/lib/riconciliazione';
import { CopyTableButton } from '../export/ExportControls';
import {
  LEGENDA,
  MAX_RIGHE_VISIBILI,
  ORDINE_CONFRONTI,
  STATO_CLASS,
  STATO_LABEL,
  ammesso,
  differenza,
  entita,
  esitiInVista,
  euro,
  filtra,
  ordina,
  righePerIf,
} from './controlli/controlliView';

// Controlli di coerenza: tre confronti fra costi per IF (Generalità, Oggetto Fornitura, GG × profilo).
// Le fonti descrivono la stessa fornitura, quindi oltre l'arrotondamento una differenza è un errore.
function ControlliPanel({ IFs, controlli }: { IFs: Intervento[]; controlli: Controlli }) {
  const [tutti, setTutti] = useState(false);
  const tblRef = useRef<HTMLDivElement>(null);

  const inVista = useMemo(() => esitiInVista(controlli.esiti, new Set(IFs.map((i) => i.numero_if))), [controlli.esiti, IFs]);
  // Nessuna riga GdL importata: non c'è nulla da confrontare (il confronto RTI esisterebbe comunque, vuoto).
  const senzaDati = controlli.righe.gdl === 0;
  const righe = senzaDati ? [] : ordina(filtra(righePerIf(inVista), !tutti));
  const mostrate = righe.slice(0, MAX_RIGHE_VISIBILI);
  const perConfronto = ORDINE_CONFRONTI.map((id) => ({ id, ...conta(inVista, id) }));

  return (
    <div className="panel on" data-p="8">
      <div className="phead">
        <h2>Controlli di coerenza</h2>
        <p>
          Per ogni IF, in un&apos;unica vista: Importo Previsto (Generalità), Σ gg × tariffa del profilo professionale e
          Σ costi di Oggetto Fornitura, con le differenze fra le colonne. Oltre l&apos;arrotondamento una differenza
          indica un errore nelle fonti.
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
        <div className="tscroll" ref={tblRef}>
          <table className="dtable" aria-label="Confronto per IF fra Generalità, Σ gg × tariffa e Σ Oggetto Fornitura">
            <thead>
              <tr>
                <th>IF</th>
                <th className="num">Generalità</th>
                <th className="num">Σ gg × tariffa</th>
                <th className="num">Σ Oggetto Fornitura</th>
                <th className="num">GG × profilo − Generalità</th>
                <th className="num">Fornitura − Generalità</th>
                <th className="num">Fornitura − GG × profilo</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {mostrate.length ? (
                mostrate.map((r) => (
                  <tr key={r.numero_if}>
                    <td>
                      <b>{entita(r)}</b>
                      {r.motivi.map((m) => (
                        <div key={m} style={{ color: 'var(--ink)', fontSize: 12 }}>
                          {m}
                        </div>
                      ))}
                    </td>
                    <td className="num">{euro(r.generalita)}</td>
                    <td className="num">{euro(r.gg)}</td>
                    <td className="num">{euro(r.fornitura)}</td>
                    {ORDINE_CONFRONTI.map((k) => (
                      <CellaConfronto key={k} e={r.confronti[k]} />
                    ))}
                    <td>
                      <span className={'pill ' + STATO_CLASS[r.stato]}>{STATO_LABEL[r.stato]}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--muted)' }}>
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
            Mostrati i primi {mostrate.length} di {righe.length} IF, in ordine di gravità.
          </div>
        )}
      </div>
      <div className="tablecard" style={{ marginTop: 14 }} data-testid="legenda-controlli">
        <div className="tbar">
          <h3>Formule e fonti</h3>
        </div>
        <div className="tscroll">
          <table className="dtable" aria-label="Formule e fonti di ogni colonna">
            <thead>
              <tr>
                <th>Colonna</th>
                <th>Formula</th>
                <th>Fonte e soglia</th>
              </tr>
            </thead>
            <tbody>
              {LEGENDA.map((l) => (
                <tr key={l.colonna}>
                  <td>
                    <b>{l.colonna}</b>
                  </td>
                  <td>{l.formula}</td>
                  <td>{l.fonte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="foot" style={{ marginTop: 10 }}>
          Un confronto con costi, giornate o tariffe mancanti non viene stimato in parte: risulta non confrontabile, con il motivo.
          Le tariffe si leggono soltanto: si modificano solo a mano.
        </div>
      </div>
    </div>
  );
}

// Differenza di un confronto con lo stato scritto (mai solo colore) e la soglia ammessa.
function CellaConfronto({ e }: { e: Esito }) {
  return (
    <td className="num" title={CONFRONTI[e.confronto].label}>
      {differenza(e.differenza)}
      <div style={{ fontSize: 11 }}>
        <span className={'pill ' + STATO_CLASS[e.stato]}>{STATO_LABEL[e.stato]}</span>
      </div>
      {e.ammesso != null && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ammesso(e.ammesso)}</div>}
    </td>
  );
}

export default React.memo(ControlliPanel);
