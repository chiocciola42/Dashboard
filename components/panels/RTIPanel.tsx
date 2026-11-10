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
  buildEroTotalPctHtml,
  buildEroTotalEurHtml,
  buildEroQuotaPctHtml,
  buildEroQuotaEurHtml,
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
  const { ceil, quotaErosion, totalRealPct, totalRealEur } = e;
  const selP = rtiSel || (filtersForn && quotaVal[filtersForn] ? filtersForn : null);

  const bulletsHtml = buildRtiBulletsHtml(rti, e, selP);
  const summaryLineHtml = buildRtiSummaryLine(e);
  const eroTotalPctHtml = buildEroTotalPctHtml(e);
  const eroTotalEurHtml = buildEroTotalEurHtml(e);
  const eroQuotaPctHtml = buildEroQuotaPctHtml(e);
  const eroQuotaEurHtml = buildEroQuotaEurHtml(e);

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
        title="Erosione teorica vs reale del massimale (%)"
        caption="Ritmo di erosione lineare atteso dell'intero massimale contrattuale, confrontato con l'erosione reale totale maturata ad oggi — a prescindere da come si ripartisce tra le aziende del RTI"
        filename="Erosione_teorica_vs_reale_massimale_pct"
      >
        <Html
          ariaLabel={`Erosione teorica lineare vs reale del massimale contrattuale, in percentuale. Reale a oggi ${totalRealPct != null ? PCT(totalRealPct) : 'n/d'} contro un target teorico del 100% a fine contratto.`}
          html={eroTotalPctHtml}
        />
      </ChartCard>
      <ChartCard
        title="Erosione teorica vs reale del massimale (valore)"
        caption="Stesso confronto in valore assoluto sull'intero massimale contrattuale"
        filename="Erosione_teorica_vs_reale_massimale_valore"
      >
        <Html
          ariaLabel={`Erosione teorica lineare vs reale del massimale contrattuale, in valore. Reale a oggi ${totalRealEur != null ? EURM(totalRealEur) : 'n/d'} contro un massimale di ${EURM(ceil)}.`}
          html={eroTotalEurHtml}
        />
      </ChartCard>
      <ChartCard
        title="Erosione teorica vs reale delle quote per azienda (%)"
        caption="Ritmo di erosione lineare atteso della quota di ciascuna azienda rispetto alla propria quota (mai rispetto al massimale totale), confrontato con l'erosione reale maturata ad oggi"
        filename="Erosione_teorica_vs_reale_quote_pct"
      >
        <Html
          ariaLabel={`Erosione teorica lineare vs reale delle quote, in percentuale, per azienda. ${quotaErosion
            .map((s) => `${s.name}: reale a oggi ${s.realPct != null ? PCT(s.realPct) : 'n/d'} contro un target teorico del 100% della propria quota a fine contratto`)
            .join('; ')}.`}
          html={eroQuotaPctHtml}
        />
      </ChartCard>
      <ChartCard
        title="Erosione teorica vs reale delle quote per azienda (valore)"
        caption="Stesso confronto in valore assoluto, per azienda: traiettoria teorica lineare della propria quota contrattuale rispetto al proprio impegnato reale"
        filename="Erosione_teorica_vs_reale_quote_valore"
      >
        <Html
          ariaLabel={`Erosione teorica lineare vs reale delle quote, in valore, per azienda. ${quotaErosion
            .map((s) => `${s.name}: reale a oggi ${s.realEur != null ? EURM(s.realEur) : 'n/d'} contro una quota contrattuale di ${EURM(s.quota)}`)
            .join('; ')}.`}
          html={eroQuotaEurHtml}
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
