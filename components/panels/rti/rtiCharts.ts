import { EUR, EURM, PCT, C } from '@/lib/format';
import { esc } from '@/lib/charts';

export type ProjectionSeries = {
  name: string;
  color: string;
  theoreticalEnd: number; // target value at the contract's end date (100 for %, the quota for €)
  realToday: number | null; // actual cumulative value as of today; null if the contract hasn't started yet
};

// Theoretical linear pace vs real erosion, one line per company, on a
// continuous date axis spanning the whole contract (contractStartMs ->
// contractEndMs). The theoretical line is the true straight diagonal from
// 0 on the signing date to its target on the expiry date. The real line
// starts at 0 on the signing date, passes through today's actual value,
// and continues straight (same slope, i.e. "at the current pace") to the
// expiry date — solid for the realised segment, dashed for the projection.
export function buildErosionProjectionChart(
  contractStartMs: number,
  contractEndMs: number,
  todayMs: number,
  series: ProjectionSeries[],
  mode: 'pct' | 'eur',
  sharedTheoretical: boolean,
): string {
  const W = 920, H = 300, pl = 76, pr = 18, pt = 20, pb = 44;
  const pw = W - pl - pr, ph = H - pt - pb;
  const totalMs = Math.max(1, contractEndMs - contractStartMs);
  const clampedToday = Math.min(Math.max(todayMs, contractStartMs), contractEndMs);
  const elapsedMs = clampedToday - contractStartMs;

  const projectedEnd = series.map((s) =>
    s.realToday == null ? null : elapsedMs > 0 ? (s.realToday * totalMs) / elapsedMs : s.realToday,
  );

  const rawMax = Math.max(
    1,
    ...series.map((s) => s.theoreticalEnd),
    ...projectedEnd.filter((v): v is number => v != null),
    ...series.map((s) => s.realToday ?? 0),
  );
  const maxV = mode === 'pct' ? Math.max(100, Math.ceil(rawMax / 10) * 10) : rawMax * 1.08;
  const ticks = 4;
  const yOf = (v: number) => pt + ph - (v / maxV) * ph;
  const xOf = (ms: number) => pl + pw * ((ms - contractStartMs) / totalMs);
  const fmtAxis = (v: number) => (mode === 'pct' ? `${Math.round(v)}%` : `€${(v / 1e6).toFixed(1)}M`);
  const fmtVal = (v: number) => (mode === 'pct' ? PCT(v) : EURM(v));
  const fmtDelta = (v: number) => (mode === 'pct' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)} p.p.` : `${v >= 0 ? '+' : ''}${EURM(v)}`);

  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = (maxV * i) / ticks, y = yOf(v);
    g += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="${C.line}"/>`;
    g += `<text x="${pl - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11.5" fill="${C.muted}">${fmtAxis(v)}</text>`;
  }

  const x0 = xOf(contractStartMs), xEnd = xOf(contractEndMs), xToday = xOf(clampedToday);
  let vgrid = '', labs = '';
  const startYear = new Date(contractStartMs).getUTCFullYear();
  const endYear = new Date(contractEndMs).getUTCFullYear();
  const seen = new Set<number>();
  for (let y = startYear; y <= endYear; y++) {
    const tickMs = Math.min(contractEndMs, Math.max(contractStartMs, Date.UTC(y, 0, 1)));
    const x = xOf(tickMs);
    const key = Math.round(x);
    if (seen.has(key)) continue;
    seen.add(key);
    vgrid += `<line x1="${x.toFixed(1)}" y1="${pt}" x2="${x.toFixed(1)}" y2="${pt + ph}" stroke="${C.line}" opacity="0.5"/>`;
    labs += `<text x="${x.toFixed(1)}" y="${H - pb + 18}" text-anchor="middle" font-size="12.5" fill="${C.muted}">${y}</text>`;
  }

  let lines = '';
  if (sharedTheoretical && series.length) {
    lines += `<polyline points="${x0.toFixed(1)},${yOf(0).toFixed(1)} ${xEnd.toFixed(1)},${yOf(series[0].theoreticalEnd).toFixed(1)}" fill="none" stroke="${C.muted}" stroke-width="2" stroke-dasharray="6 4"/>`;
  }

  series.forEach((s, si) => {
    if (!sharedTheoretical) {
      lines += `<polyline points="${x0.toFixed(1)},${yOf(0).toFixed(1)} ${xEnd.toFixed(1)},${yOf(s.theoreticalEnd).toFixed(1)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="6 4" opacity="0.6"/>`;
    }
    if (s.realToday == null) return;
    const yToday = yOf(s.realToday);
    const yProjEnd = yOf(projectedEnd[si] as number);
    lines += `<polyline points="${x0.toFixed(1)},${yOf(0).toFixed(1)} ${xToday.toFixed(1)},${yToday.toFixed(1)}" fill="none" stroke="${s.color}" stroke-width="2.6"/>`;
    lines += `<polyline points="${xToday.toFixed(1)},${yToday.toFixed(1)} ${xEnd.toFixed(1)},${yProjEnd.toFixed(1)}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-dasharray="2 4" opacity="0.85"/>`;
    lines += `<circle cx="${xToday.toFixed(1)}" cy="${yToday.toFixed(1)}" r="5.5" fill="${s.color}" stroke="#fff" stroke-width="2" class="seg" data-tip="${esc(
      `${s.name} · oggi\nErosione reale: ${fmtVal(s.realToday)}\nProiezione a fine contratto al ritmo attuale: ${fmtVal(projectedEnd[si] as number)}\nTarget teorico a fine contratto: ${fmtVal(s.theoreticalEnd)}\nScostamento proiezione vs target: ${fmtDelta((projectedEnd[si] as number) - s.theoreticalEnd)}`,
    )}"/>`;
  });

  const mk = `<line x1="${xToday.toFixed(1)}" y1="${pt}" x2="${xToday.toFixed(1)}" y2="${pt + ph}" stroke="${C.amberD}" stroke-width="1.3" stroke-dasharray="4 3"/><text x="${(xToday + 5).toFixed(1)}" y="${pt + 13}" text-anchor="start" font-size="10" fill="${C.amberD}" font-weight="700">oggi</text>`;

  return `<svg class="msvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${vgrid}${lines}${mk}${labs}</svg>`;
}
