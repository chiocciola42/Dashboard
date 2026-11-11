import type { RtiConfig } from '@/lib/types';
import { EURM, PCT, FCOL, C } from '@/lib/format';
import { legchips, esc } from '@/lib/charts';
import { chartRtiBullets } from '@/lib/chartsInsight';
import type { RtiErosion } from '@/lib/rtiErosion';
import { buildPaceDumbbell, buildErosionMini, buildQuotaBars, sharedPctMax, type PaceRow } from './rtiCharts';

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

const legend = (items: string): string =>
  `<div style="display:flex;gap:9px 20px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:14px">${items}</div>`;

// Righe del dumbbell: Totale contratto in testa, poi le aziende ordinate per scarto
// (reale − teorico a oggi) decrescente; quelle senza dato in fondo.
export function paceRows(e: RtiErosion): PaceRow[] {
  const toRow = (r: RtiErosion['summaryRows'][number], isTotal: boolean): PaceRow => ({
    name: r.label, color: r.color, realPct: r.realPct, projectedPct: r.projectedPct, realEur: r.realEur, quota: r.quota, isTotal,
  });
  const total = toRow(e.summaryRows[e.summaryRows.length - 1], true);
  const partners = e.summaryRows.slice(0, -1).map((r) => toRow(r, false));
  const gap = (r: PaceRow): number => (r.realPct == null ? -Infinity : r.realPct - e.theoreticalTodayPct);
  partners.sort((a, b) => gap(b) - gap(a));
  return [total, ...partners];
}

export function buildPaceHtml(e: RtiErosion): string {
  const chip = (style: string, t: string): string => `<span class="chip"><span class="dot" style="${style}"></span>${esc(t)}</span>`;
  return `<div>
    ${buildPaceDumbbell(paceRows(e), e.theoreticalTodayPct)}
    ${legend(
      chip(`background:#fff;border:2px solid ${C.ink}`, `Teorico a oggi (${PCT(e.theoreticalTodayPct)} del tempo trascorso)`) +
        chip(`background:${C.good}`, 'Reale · sotto soglia') +
        chip(`background:${C.amberD}`, 'Reale · attenzione ≥ 75%') +
        chip(`background:${C.bad}`, 'Reale · critico ≥ 90%'),
    )}
    <div style="font-size:11px;color:var(--muted);margin-top:14px">
      Ogni riga confronta la quota già impegnata con la quota che sarebbe consumata a ritmo lineare. Il segmento è la distanza tra i due: più è lungo verso destra, più l'azienda sta consumando più in fretta del tempo.
    </div>
  </div>`;
}

export function buildMiniGridHtml(e: RtiErosion): string {
  const total = e.summaryRows[e.summaryRows.length - 1];
  const series = [
    { name: total.label, color: total.color, realToday: total.realPct, quota: total.quota },
    ...e.quotaErosion.map((s) => ({ name: s.name, color: s.color, realToday: s.realPct, quota: s.quota })),
  ];
  const maxV = sharedPctMax(series, e.contractStartMs, e.contractEndMs, e.nowMs);
  const cells = series
    .map((s) => `<div class="erocell">${buildErosionMini(e.contractStartMs, e.contractEndMs, e.nowMs, s, maxV)}</div>`)
    .join('');
  return `<div>
    <div class="erogrid">${cells}</div>
    ${legend(
      legchips([
        { c: C.slateL, t: 'Ritmo teorico lineare (0 → 100% della propria quota)', dash: true },
        { c: C.ink, t: 'Reale fino a oggi', line: true },
        { c: C.ink, t: 'Proiezione a fine contratto al ritmo attuale', dash: true },
      ]),
    )}
    <div style="font-size:11px;color:var(--muted);margin-top:14px">
      Stessa scala verticale in tutti i riquadri (% della propria quota, mai del massimale totale): le linee sono confrontabili a colpo d'occhio. La linea ambra verticale segna oggi.
    </div>
  </div>`;
}

export function buildQuotaBarsHtml(e: RtiErosion): string {
  const rows = e.quotaErosion
    .map((s) => ({ name: s.name, color: s.color, quota: s.quota, realEur: s.realEur }))
    .sort((a, b) => b.quota - a.quota);
  return `<div>
    ${buildQuotaBars(rows, e.theoreticalTodayPct)}
    ${legend(
      legchips([
        { c: C.petrol, t: 'Impegnato (colore dell\u2019azienda)' },
        { c: C.line, t: 'Residuo della quota' },
        { c: C.bad, t: 'Sforamento oltre la quota' },
        { c: C.ink, t: 'Teorico a oggi (ritmo lineare)', line: true },
      ]),
    )}
  </div>`;
}
