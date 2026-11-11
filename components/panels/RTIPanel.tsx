'use client';
import React from 'react';
import type { Intervento, RtiConfig, Meta } from '@/lib/types';
import { EURM, PCT, C } from '@/lib/format';
import { legchips } from '@/lib/charts';
import { computeRtiErosion } from '@/lib/rtiErosion';
import type { QuotePartner } from '@/lib/ripartizionePartner';
import { Html } from '../Html';
import { ChartCard } from '../export/ExportControls';
import RtiConfigForm from './rti/RtiConfigForm';
import RtiSummaryTable from './rti/RtiSummaryTable';
import {
  buildRtiBulletsHtml,
  buildRtiSummaryLine,
  buildPaceHtml,
  buildMiniGridHtml,
  buildQuotaBarsHtml,
} from './rti/rtiHtml';

function RTIPanel({
  IFs,
  rti,
  meta,
  quote,
  quotaVal,
  filtersForn,
  rtiSel,
  setRtiSel,
  editMode,
  onUpdateRti,
}: {
  IFs: Intervento[];
  rti: RtiConfig;
  meta: Meta;
  quote?: QuotePartner;
  quotaVal: Record<string, number>;
  filtersForn?: string;
  rtiSel: string | null;
  setRtiSel: (v: string | null) => void;
  editMode: boolean;
  onUpdateRti: (u: { massimale_totale: number; quota_intellera_pct: number; quota_deloitte_pct: number }) => void;
}) {
  const e = computeRtiErosion(IFs, rti, meta, Date.now(), quote);
  const { ceil, quotaErosion, totalRealEur } = e;
  const selP = rtiSel || (filtersForn && quotaVal[filtersForn] ? filtersForn : null);

  const bulletsHtml = buildRtiBulletsHtml(rti, e, selP);
  const summaryLineHtml = buildRtiSummaryLine(e);
  const paceHtml = buildPaceHtml(e);
  const miniGridHtml = buildMiniGridHtml(e);
  const quotaBarsHtml = buildQuotaBarsHtml(e);

  const onBulletClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const target = (ev.target as HTMLElement).closest('[data-drill-rti]') as HTMLElement | null;
    if (target) {
      const p = target.getAttribute('data-drill-rti');
      setRtiSel(rtiSel === p ? null : p);
    }
  };

  return (
    <div className="panel on" data-p="1">
      <div className="phead">
        <h2>Quote RTI ed erosione</h2>
        <p>Composizione del raggruppamento ed erosione del massimale e delle quote.</p>
      </div>
      {editMode && <RtiConfigForm rti={rti} onUpdate={onUpdateRti} />}
      <ChartCard
        title="Quanta quota hanno consumato tutte le aziende dell'RTI rispetto al tempo trascorso?"
        caption="Impegnato (IF/BO della vista) di ciascuna azienda rispetto alla propria quota contrattuale · il segno nero è il tempo contrattuale trascorso"
        filename="Erosione_quote_RTI"
      >
        <Html
          ariaLabel={`Composizione del massimale ${EURM(rti.ceiling)} e erosione della quota di ogni azienda dell'RTI rispetto al tempo contrattuale trascorso (${PCT(e.theoreticalTodayPct)}). ${e.summaryRows
            .map((s) => `${s.label}: ${s.realPct != null ? `erosione ${PCT(s.realPct)}` : 'contratto non iniziato'}${s.projectedPct != null ? `, proiezione a fine contratto ${PCT(s.projectedPct)}` : ''}`)
            .join('; ')}.`}
          html={bulletsHtml}
          onClick={onBulletClick}
        />
        <Html
          className="legrow"
          html={legchips([
            { c: C.petrol, t: 'Impegnato (sotto soglia)' },
            { c: C.amberD, t: 'Attenzione ≥ 75%' },
            { c: C.bad, t: 'Critico ≥ 90%' },
            { c: C.ink, t: 'Tempo contrattuale trascorso', line: true },
          ])}
        />
        <Html html={summaryLineHtml} />
        <div
          style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 10 }}
          data-export-ignore
        >
          {selP ? (
            <>
              Stai vedendo la quota di <b>{selP}</b>.{' '}
              <a
                href="#"
                style={{ color: 'var(--petrol-d)' }}
                onClick={(ev) => {
                  ev.preventDefault();
                  setRtiSel(null);
                }}
              >
                ↺ mostra intero massimale
              </a>
            </>
          ) : (
            "Clic su un'azienda per evidenziarne la quota ↗"
          )}
        </div>
      </ChartCard>
      <ChartCard
        title="Chi sta consumando la propria quota più in fretta del tempo?"
        caption="Quota già impegnata (cerchio pieno) contro la quota che sarebbe consumata a ritmo lineare (cerchio vuoto) · ordinate per scarto"
        filename="Erosione_ritmo_per_azienda"
      >
        <Html
          ariaLabel={`Ritmo di erosione rispetto al tempo contrattuale trascorso (${PCT(e.theoreticalTodayPct)}). ${e.summaryRows
            .map((s) => `${s.label}: ${s.realPct != null ? `reale ${PCT(s.realPct)}, scarto ${(s.realPct - e.theoreticalTodayPct).toFixed(1)} punti percentuali` : 'contratto non iniziato'}`)
            .join('; ')}.`}
          html={paceHtml}
        />
      </ChartCard>
      <ChartCard
        title="Come evolve nel tempo l'erosione di ogni azienda?"
        caption="Una linea per azienda (e per il totale), tutte sulla stessa scala: erosione reale, ritmo teorico e proiezione a fine contratto"
        filename="Erosione_andamento_per_azienda"
      >
        <Html
          ariaLabel={`Andamento dell'erosione nel tempo, una mini-serie per ogni azienda. ${quotaErosion
            .map((s) => `${s.name}: reale a oggi ${s.realPct != null ? PCT(s.realPct) : 'n/d'}${s.projectedPct != null ? `, proiezione a fine contratto ${PCT(s.projectedPct)}` : ''}`)
            .join('; ')}.`}
          html={miniGridHtml}
        />
      </ChartCard>
      <ChartCard
        title="Quanto resta da impegnare a ciascuna azienda?"
        caption="Valori in euro su scala comune: impegnato e residuo di ogni quota contrattuale, con il tick del teorico a oggi"
        filename="Erosione_quote_valore"
      >
        <Html
          ariaLabel={`Impegnato e residuo in euro per azienda. ${quotaErosion
            .map((s) => `${s.name}: ${s.realEur != null ? `impegnato ${EURM(s.realEur)}` : 'non iniziato'} su una quota di ${EURM(s.quota)}`)
            .join('; ')}. Massimale totale ${EURM(ceil)}, impegnato ${totalRealEur != null ? EURM(totalRealEur) : 'n/d'}.`}
          html={quotaBarsHtml}
        />
      </ChartCard>
      <RtiSummaryTable summaryRows={e.summaryRows} theoreticalTodayPct={e.theoreticalTodayPct} meta={meta} />
    </div>
  );
}

// Memoized: only the active tab is mounted, but edits elsewhere in the
// Dashboard (toasts, drawer, saving flags) re-render the parent — memo skips
// re-rendering the panel when its own data/props are unchanged.
export default React.memo(RTIPanel);
