'use client';
import React from 'react';
import type { Intervento, RtiConfig, Meta } from '@/lib/types';
import { EURM, PCT } from '@/lib/format';
import { computeRtiErosion } from '@/lib/rtiErosion';
import { Html } from '../Html';
import { ChartCard } from '../export/ExportControls';
import RtiConfigForm from './rti/RtiConfigForm';
import RtiSummaryTable from './rti/RtiSummaryTable';
import {
  buildDonutHtml,
  buildPartnerBarsHtml,
  buildEroAnnoHtml,
  buildEroTotalPctHtml,
  buildEroTotalEurHtml,
  buildEroQuotaPctHtml,
  buildEroQuotaEurHtml,
} from './rti/rtiHtml';

function RTIPanel({
  IFs,
  rti,
  meta,
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
  quotaVal: Record<string, number>;
  filtersForn?: string;
  rtiSel: string | null;
  setRtiSel: (v: string | null) => void;
  editMode: boolean;
  onUpdateRti: (u: { massimale_totale: number; quota_intellera_pct: number; quota_deloitte_pct: number }) => void;
}) {
  const e = computeRtiErosion(IFs, rti, meta, Date.now());
  const { ceil, years, impByYear, totImpegnato, eroTotPct, totRisk, residuo, quotaErosion, totalRealPct, totalRealEur } = e;
  const selP = rtiSel || (filtersForn && quotaVal[filtersForn] ? filtersForn : null);

  const donutHtml = buildDonutHtml(rti, quotaVal, selP);
  const eroPartner = buildPartnerBarsHtml(rti, e.impByP);
  const eroAnnoHtml = buildEroAnnoHtml(e, meta);
  const eroTotalPctHtml = buildEroTotalPctHtml(e);
  const eroTotalEurHtml = buildEroTotalEurHtml(e);
  const eroQuotaPctHtml = buildEroQuotaPctHtml(e);
  const eroQuotaEurHtml = buildEroQuotaEurHtml(e);

  const onDonutClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-drill-rti]') as HTMLElement | null;
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
      <div className="grid2">
        <ChartCard
          title="Composizione del RTI"
          caption="Quota contrattuale per partner sul massimale contrattuale"
          filename="Composizione_RTI"
        >
          <Html
            ariaLabel={`Grafico a ciambella della composizione del RTI sul massimale ${EURM(rti.ceiling)}. ${rti.partners
              .map((p) => `${p.name} ${PCT(p.pct * 100)} pari a ${EURM(p.quota)}`)
              .join('; ')}.`}
            html={donutHtml}
            onClick={onDonutClick}
          />
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
                  onClick={(e) => {
                    e.preventDefault();
                    setRtiSel(null);
                  }}
                >
                  ↺ mostra intero massimale
                </a>
              </>
            ) : (
              "Clic su uno spicchio per vedere l'erosione della quota di quel partner ↗"
            )}
          </div>
        </ChartCard>
        <ChartCard
          title="Erosione della quota per partner RTI"
          caption="Valore impegnato (IF/BO della vista) rispetto alla quota contrattuale di ciascun partner"
          filename="Erosione_quota_partner_RTI"
          style={{ display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div className="hbars-fill" style={{ flex: 1 }}>
            <Html html={eroPartner} style={{ height: '100%', display: 'flex', flexDirection: 'column' }} />
          </div>
        </ChartCard>
      </div>
      <ChartCard
        title="Erosione per Anno"
        caption="Impegnato (IF/BO della vista) distribuito per anno lungo la durata contrattuale"
        filename="Erosione_per_anno"
      >
        <Html
          ariaLabel={`Erosione del massimale contrattuale per anno. Massimale ${EURM(ceil)}, impegnato totale ${EURM(totImpegnato)} (${PCT(eroTotPct)}, ${totRisk.label}), ${residuo < 0 ? `sforamento ${EURM(-residuo)}` : `residuo ${EURM(residuo)}`}. Impegnato per anno: ${years.map((y) => `${y} ${EURM(impByYear[y] || 0)}`).join(', ')}.`}
          html={eroAnnoHtml}
        />
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
