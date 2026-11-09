import type { RtiConfig } from '@/lib/types';
import { EURM, PCT, FCOL, C } from '@/lib/format';
import { legchips, esc } from '@/lib/charts';
import { chartRtiBullets } from '@/lib/chartsInsight';
import type { RtiErosion } from '@/lib/rtiErosion';
import { buildErosionProjectionChart } from './rtiCharts';

// Totale contratto + un bullet per OGNI partner dell'RTI (righe = rti.partners), ciascuno
// contro la propria quota, con composizione del massimale e tempo trascorso.
export function buildRtiBulletsHtml(rti: RtiConfig, e: RtiErosion, selP: string | null): string {
  const partners = rti.partners.map((p) => ({ name: p.name, color: FCOL[p.name] || C.slateL, pct: p.pct, quota: p.quota }));
  const total = e.summaryRows[e.summaryRows.length - 1];
  const rows = [
    {
      name: total.label,
      color: total.color,
      quota: total.quota,
      realEur: total.realEur,
      realPct: total.realPct,
      projectedPct: total.projectedPct,
      projectedEur: total.projectedEur,
    },
    ...e.summaryRows.slice(0, -1).map((r) => ({
      name: r.label,
      color: r.color,
      quota: r.quota,
      realEur: r.realEur,
      realPct: r.realPct,
      projectedPct: r.projectedPct,
      projectedEur: r.projectedEur,
      drillRti: r.label,
    })),
  ];
  return chartRtiBullets({ ceiling: rti.ceiling, partners, rows, elapsedPct: e.theoreticalTodayPct, selected: selP });
}

// Riga di sintesi sotto il grafico: massimale, impegnato, residuo (o sforamento) e rischio.
export function buildRtiSummaryLine(e: RtiErosion): string {
  const { ceil, totImpegnato, eroTotPct, residuo, totRisk } = e;
  const resid =
    residuo < 0 ? `<b style="color:${C.bad}">Sforamento ${EURM(-residuo)}</b>` : `Residuo <b>${EURM(residuo)}</b>`;
  return `<div class="eroleg" style="margin-top:10px"><span>Massimale contrattuale <b>${EURM(ceil)}</b> · <span style="color:${totRisk.color}">${esc(
    totRisk.label,
  )}</span></span><span>Impegnato totale <b>${EURM(totImpegnato)}</b> (${PCT(eroTotPct)})</span><span>${resid}</span></div>`;
}

export function buildEroTotalPctHtml(e: RtiErosion): string {
  const { contractStartMs, contractEndMs, nowMs, totalRealPct, totalProjectedPct, TOTAL_COLOR } = e;
  const eroTotalPctSvg = buildErosionProjectionChart(
    contractStartMs,
    contractEndMs,
    nowMs,
    [{ name: 'Totale contratto', color: TOTAL_COLOR, theoreticalEnd: 100, realToday: totalRealPct }],
    'pct',
    false,
  );

  const totalDeltaHtml = (() => {
    if (totalProjectedPct == null) return '';
    const delta = totalProjectedPct - 100;
    const sign = delta >= 0 ? '+' : '';
    const word = delta >= 0 ? 'supererebbe il massimale a questo ritmo' : 'resterebbe sotto il massimale a questo ritmo';
    return `<div style="max-width:320px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;border-left:3px solid ${TOTAL_COLOR}">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700">Totale contratto · proiezione a fine contratto</div>
      <div style="font-size:19px;font-weight:800;font-family:'SFMono-Regular',monospace;color:${TOTAL_COLOR}">${sign}${delta.toFixed(1)} p.p.</div>
      <div style="font-size:12px;color:var(--muted)">${word}</div>
    </div>`;
  })();

  const eroTotalPctHtml = `<div>
    ${eroTotalPctSvg}
    <div style="display:flex;gap:9px 20px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:14px">${legchips([
      { c: TOTAL_COLOR, t: 'Ritmo teorico lineare (0→100% del massimale)', dash: true },
      { c: TOTAL_COLOR, t: 'Totale contratto · reale', line: true },
    ])}</div>
    ${totalDeltaHtml ? `<div style="margin-top:16px">${totalDeltaHtml}</div>` : ''}
    <div style="font-size:11px;color:var(--muted);margin-top:14px">
      Erosione dell'intero massimale contrattuale, indipendente dalla ripartizione tra le aziende del RTI. Tratto continuo = erosione reale a oggi, tratteggiato = proiezione a fine contratto mantenendo il ritmo attuale.
    </div>
  </div>`;
  return eroTotalPctHtml;
}

export function buildEroTotalEurHtml(e: RtiErosion): string {
  const { contractStartMs, contractEndMs, nowMs, ceil, totalRealEur, TOTAL_COLOR } = e;
  const eroTotalEurSvg = buildErosionProjectionChart(
    contractStartMs,
    contractEndMs,
    nowMs,
    [{ name: 'Totale contratto', color: TOTAL_COLOR, theoreticalEnd: ceil, realToday: totalRealEur }],
    'eur',
    false,
  );

  const eroTotalEurHtml = `<div>
    ${eroTotalEurSvg}
    <div style="display:flex;gap:9px 20px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:14px">${legchips([
      { c: TOTAL_COLOR, t: 'Massimale · ritmo teorico lineare', dash: true },
      { c: TOTAL_COLOR, t: 'Totale contratto · reale', line: true },
    ])}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:14px">
      Stesso confronto in valore assoluto sull'intero massimale contrattuale.
    </div>
  </div>`;
  return eroTotalEurHtml;
}

export function buildEroQuotaPctHtml(e: RtiErosion): string {
  const { contractStartMs, contractEndMs, nowMs, quotaErosion } = e;
  const eroQuotaPctSvg = buildErosionProjectionChart(
    contractStartMs,
    contractEndMs,
    nowMs,
    quotaErosion.map((s) => ({ name: s.name, color: s.color, theoreticalEnd: 100, realToday: s.realPct })),
    'pct',
    true,
  );

  const quotaDeltaHtml = quotaErosion
    .map((s) => {
      if (s.projectedPct == null) return '';
      const delta = s.projectedPct - 100;
      const sign = delta >= 0 ? '+' : '';
      const word = delta >= 0 ? 'supererebbe la propria quota a questo ritmo' : 'resterebbe sotto la propria quota a questo ritmo';
      return `<div style="flex:1;min-width:190px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;border-left:3px solid ${s.color}">
        <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700">${esc(s.name)} · proiezione a fine contratto</div>
        <div style="font-size:19px;font-weight:800;font-family:'SFMono-Regular',monospace;color:${s.color}">${sign}${delta.toFixed(1)} p.p.</div>
        <div style="font-size:12px;color:var(--muted)">${word}</div>
      </div>`;
    })
    .join('');

  const eroQuotaPctHtml = `<div>
    ${eroQuotaPctSvg}
    <div style="display:flex;gap:9px 20px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:14px">${legchips(
      [
        { c: C.muted, t: 'Ritmo teorico lineare (0→100% della propria quota)', dash: true },
        ...quotaErosion.map((s) => ({ c: s.color, t: `${s.name} · reale`, line: true })),
      ],
    )}</div>
    ${quotaDeltaHtml ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${quotaDeltaHtml}</div>` : ''}
    <div style="font-size:11px;color:var(--muted);margin-top:14px">
      Ogni azienda confrontata solo con la propria quota contrattuale, mai con il massimale totale: comparabile anche tra quote di dimensione diversa. Tratto continuo = erosione reale a oggi, tratteggiato = proiezione a fine contratto mantenendo il ritmo attuale.
    </div>
  </div>`;
  return eroQuotaPctHtml;
}

export function buildEroQuotaEurHtml(e: RtiErosion): string {
  const { contractStartMs, contractEndMs, nowMs, quotaErosion } = e;
  const eroQuotaEurSvg = buildErosionProjectionChart(
    contractStartMs,
    contractEndMs,
    nowMs,
    quotaErosion.map((s) => ({ name: s.name, color: s.color, theoreticalEnd: s.quota, realToday: s.realEur })),
    'eur',
    false,
  );

  const eroQuotaEurHtml = `<div>
    ${eroQuotaEurSvg}
    <div style="display:flex;gap:9px 20px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:14px">${legchips(
      quotaErosion.flatMap((s) => [
        { c: s.color, t: `${s.name} · teorico`, dash: true },
        { c: s.color, t: `${s.name} · reale`, line: true },
      ]),
    )}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:14px">
      Stesso confronto in valore assoluto: tratteggiata sottile = ritmo teorico lineare della propria quota, continua = impegnato reale, tratteggiata spessa = proiezione a fine contratto al ritmo attuale.
    </div>
  </div>`;
  return eroQuotaEurHtml;
}

