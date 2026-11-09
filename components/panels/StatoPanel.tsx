'use client';
import React from 'react';
import type { Intervento } from '@/lib/types';
import { EUR, EUR0, PCT } from '@/lib/format';
import { chartFunnel, funnelFromStats } from '@/lib/chartsInsight';
import { funnelStats } from '@/lib/stato';
import { Html } from '../Html';
import { ChartCard, CopyTableButton } from '../export/ExportControls';

function StatoPanel({
  IFs,
  onDrillStato,
}: {
  IFs: Intervento[];
  onDrillStato: (stato: string) => void;
}) {
  const conBo = IFs.filter((i) => i.has_bo);
  const senzaBo = IFs.filter((i) => !i.has_bo);
  const pct = IFs.length ? Math.round((conBo.length / IFs.length) * 100) : 0;

  const steps = funnelFromStats(funnelStats(IFs));
  const stBox = chartFunnel(steps);

  const subIFs = IFs.filter((i) => i.subappalto);
  const onDrill = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = (e.target as HTMLElement).closest('[data-drill-stato]') as HTMLElement | null;
    if (t) onDrillStato(t.getAttribute('data-drill-stato') || '');
  };

  return (
    <div className="panel on" data-p="5">
      <div className="phead">
        <h2>Stato IF / BO e subappalti</h2>
        <p>Stati di lavorazione, copertura Buoni d&apos;Ordine e subappalti.</p>
      </div>
      <div className="grid2">
        <ChartCard
          title="Dove si fermano gli IF prima di diventare fatturabili?"
          caption={`${IFs.length} IF · ${conBo.length} con BO · ${senzaBo.length} in attesa`}
          filename="IF_per_stato_BO"
        >
          <Html
            ariaLabel={`Imbuto degli IF verso la fatturabilità. ${steps.map((s) => `${s.label} ${s.n} IF, ${EUR(s.v)}`).join('; ')}. In attesa di Buono d'Ordine: ${senzaBo.length} IF.`}
            html={stBox}
            onClick={onDrill}
          />
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 8 }} data-export-ignore>
            Clic sul passo «Approvati» per vedere gli IF ↗
          </div>
          <div className="exsum" style={{ marginTop: 16 }}>
            {(
              [
                ['IF totali', IFs.length, ' '],
                ['BO emessi', conBo.length, PCT(pct)],
                ['In attesa', senzaBo.length, ' '],
                ['Approvati', steps[1].n, ' '],
              ] as [string, number, string][]
            ).map((s, i) => (
              <div className="stat" key={i}>
                <div className="l">{s[0]}</div>
                <div className="v">{s[1]}</div>
                <div className="s">{s[2]}</div>
              </div>
            ))}
          </div>
        </ChartCard>
        <div className="alert">
          <div className="cardhead">
            <div className="cardhead-txt">
              <h3>Da presidiare</h3>
              <div className="cap" style={{ color: 'var(--amber-d)' }}>
                IF ancora privi di Buono d&apos;Ordine (non fatturabili)
              </div>
            </div>
            {senzaBo.length > 0 && (
              <CopyTableButton
                label="Copia elenco per Excel"
                title="Copia gli IF in attesa di Buono d'Ordine: incollali in un foglio Excel"
                getMatrix={() => [
                  ['N° IF', 'Intervento', 'Referente ARIA', 'Importo (€)'],
                  ...senzaBo.map((i) => [i.numero_if, i.titolo, i.ref_aria || '', EUR0(i.importo)]),
                ]}
              />
            )}
          </div>
          <ul className="todo">
            {senzaBo.length ? (
              senzaBo.map((i) => (
                <li key={i.numero_if}>
                  <span className="tag">IF {i.numero_if}</span>
                  <div>
                    <b>{i.titolo}</b>
                    <br />
                    <span style={{ color: 'var(--muted)' }}>
                      In attesa di Buono d&apos;Ordine · Ref. {i.ref_aria} · € {EUR0(i.importo)}
                    </span>
                  </div>
                </li>
              ))
            ) : (
              <li>
                <div className="okstate">✓ Tutti gli IF di questa vista hanno il Buono d&apos;Ordine emesso.</div>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="card">
        <h3>Subappalti</h3>
        <div className="cap">Presenza di subappalto dichiarato sugli IF della vista</div>
        {subIFs.length ? (
          (() => {
            const t = subIFs.reduce((s, i) => s + (i.costo_subappalto || 0), 0);
            const nm = [...new Set(subIFs.flatMap((i) => i.subappaltatore))].filter(Boolean);
            return (
              <div className="subcard">
                <div className="subbadge yes">{subIFs.length}</div>
                <div>
                  <b>{subIFs.length} IF con subappalto</b>
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {EUR(t)} subappaltato{nm.length ? ' · ' + nm.join(', ') : ''}
                  </span>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="subcard">
            <div className="subbadge no">0</div>
            <div>
              <b>Nessun subappalto</b>
              <br />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                Tutte le prestazioni di questa vista sono erogate direttamente dai partner del RTI.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized: only the active tab is mounted, but edits elsewhere in the
// Dashboard (toasts, drawer, saving flags) re-render the parent — memo skips
// re-rendering the panel when its own data/props are unchanged.
export default React.memo(StatoPanel);
