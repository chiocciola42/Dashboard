import { EUR, EURM, PCT, C, erosionRisk } from '@/lib/format';
import { esc } from '@/lib/charts';
import { assertFinite, assertMaxLen, svgCircle, svgLine, svgRect, svgText, svgWrap } from '@/lib/chartKit';

// Tooltip hook shared with the other SVG charts: the dashboard shows `data-tip`
// of any `.seg` element on hover.
const tipAttr = (tip: string): string => ` data-tip="${esc(tip)}" class="seg"`;
const HIT = 'fill="transparent" style="pointer-events:all"';
const MAX_ROWS = 20;

const it1 = (v: number): string => v.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const signedPp = (v: number): string => `${v >= 0 ? '+' : '−'}${it1(Math.abs(v))} p.p.`;
const f1 = (v: number): string => v.toFixed(1);
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ---------------------------------------------------------------------------
// 1 — Dumbbell: per ogni azienda (e per il totale) il teorico a oggi (cerchio
// vuoto = tempo trascorso) contro il reale (cerchio pieno, colore = soglia di
// rischio), uniti da un segmento. A destra lo scarto in punti percentuali e la
// proiezione a fine contratto.
// ---------------------------------------------------------------------------
export type PaceRow = {
  name: string;
  color: string;
  realPct: number | null; // % della propria quota già impegnata
  projectedPct: number | null; // % a fine contratto al ritmo attuale
  realEur: number | null;
  quota: number;
  isTotal?: boolean;
};

export function buildPaceDumbbell(rows: PaceRow[], elapsedPct: number): string {
  assertMaxLen('rows', rows.length, MAX_ROWS);
  assertFinite('pace', [elapsedPct, ...rows.flatMap((r) => [r.quota, r.realPct ?? 0, r.projectedPct ?? 0])]);
  if (rows.length === 0) return '<div class="empty">Nessun partner RTI configurato</div>';

  const elapsed = Math.min(100, Math.max(0, elapsedPct));
  const W = 920, pl = 160, right = 270, top = 34, rh = 46, bottom = 34;
  const pw = W - pl - right;
  const maxReal = Math.max(100, ...rows.map((r) => r.realPct ?? 0));
  const maxV = Math.ceil(maxReal / 25) * 25;
  const x = (v: number): number => pl + (pw * Math.min(Math.max(v, 0), maxV)) / maxV;
  const yEnd = top + rows.length * rh;

  let out = '';
  for (let v = 0; v <= maxV; v += 25) {
    out += svgLine(x(v), top - 6, x(v), yEnd, v === 100 ? C.ink : C.line, v === 100 ? 1.2 : 1, v === 100 ? '4 3' : undefined);
    out += svgText(x(v), yEnd + 18, `${v}%`, { anchor: 'middle', fill: C.muted, size: 11.5 });
  }
  out += svgText(x(100), top - 14, 'quota 100%', { anchor: 'middle', fill: C.ink, weight: 700, size: 10.5 });
  out += svgText(W - 6, top - 14, 'Scarto · proiezione a fine contratto', { anchor: 'end', fill: C.ink, weight: 700, size: 12 });

  rows.forEach((r, i) => {
    const cy = top + i * rh + rh / 2;
    if (r.isTotal && i === 0) out += svgLine(8, top + rh, W - 8, top + rh, C.line, 1);
    out += svgRect(10, cy - 5, 10, 10, r.color, 2);
    out += svgText(28, cy + 4.5, clip(r.name, 18), { fill: C.ink, weight: r.isTotal ? 700 : 500, size: 13 });
    out += svgLine(pl, cy, x(maxV), cy, C.line, 1);

    const tipBase = `${r.name}\nQuota ${EUR(r.quota)}\nTeorico a oggi (tempo trascorso): ${PCT(elapsed)}`;
    if (r.realPct == null) {
      out += svgCircle(x(elapsed), cy, 6, '#fff', C.ink);
      out += svgText(pl + pw + 14, cy + 4.5, 'Contratto non ancora iniziato', { fill: C.muted, size: 12 });
      out += `<rect x="0" y="${f1(cy - rh / 2)}" width="${W}" height="${rh}" ${HIT}${tipAttr(tipBase + '\nContratto non ancora iniziato')}/>`;
      return;
    }
    const gap = r.realPct - elapsed;
    const col = erosionRisk(r.realPct).color;
    const x1 = x(elapsed), x2 = x(r.realPct);
    out += svgLine(x1, cy, x2, cy, col, 4);
    out += svgCircle(x1, cy, 6, '#fff', C.ink);
    out += svgCircle(x2, cy, 7, col, '#fff');
    const word = gap >= 0 ? 'avanti al ritmo' : 'sotto il ritmo';
    out += svgText(pl + pw + 14, cy - 2, `${signedPp(gap)} ${word}`, { fill: gap > 0 ? col : C.ink, weight: 700, size: 13 });
    const proj = r.projectedPct;
    out += svgText(pl + pw + 14, cy + 14, proj == null ? '—' : `≈ ${Math.round(proj)}% a fine contratto`, {
      fill: proj != null && proj > 100 ? C.bad : C.muted,
      weight: proj != null && proj > 100 ? 700 : 400,
      size: 11.5,
    });
    const tip =
      `${tipBase}\nReale: ${PCT(r.realPct)}${r.realEur != null ? ` (${EUR(r.realEur)})` : ''}\nScarto: ${signedPp(gap)}\n` +
      `Proiezione a fine contratto: ${proj == null ? '—' : PCT(proj)}`;
    out += `<rect x="0" y="${f1(cy - rh / 2)}" width="${W}" height="${rh}" ${HIT}${tipAttr(tip)}/>`;
  });
  return svgWrap(W, yEnd + bottom - 8, out);
}

// ---------------------------------------------------------------------------
// 2 — Small multiples: una mini-linea per azienda, tutte con la stessa scala
// verticale (% della propria quota) e lo stesso asse temporale.
// ---------------------------------------------------------------------------
export type MiniSeries = { name: string; color: string; realToday: number | null; quota?: number };

export function sharedPctMax(series: MiniSeries[], contractStartMs: number, contractEndMs: number, todayMs: number): number {
  const total = Math.max(1, contractEndMs - contractStartMs);
  const el = Math.min(Math.max(todayMs, contractStartMs), contractEndMs) - contractStartMs;
  let m = 100;
  for (const s of series) {
    if (s.realToday == null) continue;
    m = Math.max(m, s.realToday, el > 0 ? (s.realToday * total) / el : s.realToday);
  }
  return Math.min(200, Math.ceil(m / 25) * 25);
}

export function buildErosionMini(
  contractStartMs: number,
  contractEndMs: number,
  todayMs: number,
  s: MiniSeries,
  maxV: number,
): string {
  assertFinite('mini', [contractStartMs, contractEndMs, todayMs, maxV, s.realToday ?? 0]);
  const W = 460, H = 240, pl = 40, pr = 62, pt = 38, pb = 28;
  const pw = W - pl - pr, ph = H - pt - pb;
  const totalMs = Math.max(1, contractEndMs - contractStartMs);
  const today = Math.min(Math.max(todayMs, contractStartMs), contractEndMs);
  const elapsed = today - contractStartMs;
  const x = (ms: number): number => pl + pw * ((ms - contractStartMs) / totalMs);
  const y = (v: number): number => pt + ph - (Math.min(v, maxV) / maxV) * ph;
  const x0 = x(contractStartMs), xE = x(contractEndMs), xT = x(today);

  let out = svgRect(8, 10, 10, 10, s.color, 2) + svgText(25, 19.5, clip(s.name, 22), { fill: C.ink, weight: 700, size: 13.5 });

  const step = maxV <= 100 ? 25 : 50;
  for (let v = 0; v <= maxV; v += step) {
    out += svgLine(pl, y(v), W - pr, y(v), v === 100 ? C.muted : C.line, 1, v === 100 ? '4 3' : undefined);
    out += svgText(pl - 6, y(v) + 4, `${v}%`, { anchor: 'end', fill: C.muted, size: 11 });
  }
  const y0 = new Date(contractStartMs).getUTCFullYear(), y1 = new Date(contractEndMs).getUTCFullYear();
  const every = Math.max(1, Math.ceil((y1 - y0 + 1) / 6));
  for (let yr = y0; yr <= y1; yr += every) {
    const px = x(Math.min(contractEndMs, Math.max(contractStartMs, Date.UTC(yr, 0, 1))));
    out += svgText(px, H - 8, String(yr), { anchor: 'middle', fill: C.muted, size: 11 });
  }

  // teorico: diagonale 0 → 100% (grigio tratteggiato)
  out += svgLine(x0, y(0), xE, y(100), C.slateL, 2, '6 4');
  out += svgLine(xT, pt, xT, pt + ph, C.amberD, 1.2, '4 3');

  let head = '';
  if (s.realToday == null) {
    head = svgText(W - 8, 19.5, 'non iniziato', { anchor: 'end', fill: C.muted, size: 12 });
  } else {
    const proj = elapsed > 0 ? (s.realToday * totalMs) / elapsed : s.realToday;
    // la proiezione oltre la scala viene tagliata sul bordo superiore
    let xP = xE;
    if (proj > maxV && proj > s.realToday) xP = xT + (xE - xT) * ((maxV - s.realToday) / (proj - s.realToday));
    out += svgLine(x0, y(0), xT, y(s.realToday), s.color, 3);
    out += svgLine(xT, y(s.realToday), xP, y(Math.min(proj, maxV)), s.color, 2.2, '2 4');
    out += svgCircle(xT, y(s.realToday), 5.5, s.color, '#fff');
    out += svgText(xP + 5, y(Math.min(proj, maxV)) + 4, `≈ ${Math.round(proj)}%`, {
      fill: proj > 100 ? C.bad : C.ink,
      weight: 700,
      size: 12,
    });
    head = svgText(W - 8, 19.5, `oggi ${PCT(s.realToday)}`, { anchor: 'end', fill: erosionRisk(s.realToday).color, weight: 700, size: 13 });
    const tip =
      `${s.name}\nReale a oggi: ${PCT(s.realToday)}${s.quota != null ? ` di ${EUR(s.quota)}` : ''}\n` +
      `Teorico a oggi: ${PCT((elapsed / totalMs) * 100)}\nProiezione a fine contratto: ${PCT(proj)}`;
    out += `<rect x="${pl}" y="${pt}" width="${f1(pw)}" height="${f1(ph)}" ${HIT}${tipAttr(tip)}/>`;
  }
  return svgWrap(W, H, out + head).replace('class="msvg"', 'class="msvg mini"');
}

// ---------------------------------------------------------------------------
// 3 — Barre in €: ogni barra = quota dell'azienda, scala comune a tutte;
// pieno = impegnato, grigio = residuo, tick = teorico a oggi, rosso = sforamento.
// ---------------------------------------------------------------------------
export type QuotaBar = { name: string; color: string; quota: number; realEur: number | null };

export function buildQuotaBars(rows: QuotaBar[], elapsedPct: number): string {
  assertMaxLen('rows', rows.length, MAX_ROWS);
  assertFinite('bars', [elapsedPct, ...rows.flatMap((r) => [r.quota, r.realEur ?? 0])]);
  if (rows.length === 0) return '<div class="empty">Nessun partner RTI configurato</div>';

  const elapsed = Math.min(100, Math.max(0, elapsedPct));
  const W = 920, pl = 160, right = 250, top = 30, rh = 54, bh = 20;
  const pw = W - pl - right;
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.quota, r.realEur ?? 0))) * 1.04;
  const x = (v: number): number => pl + (pw * v) / maxV;
  const yEnd = top + rows.length * rh;

  let out = svgText(pl, top - 12, 'Quota contrattuale (scala comune)', { fill: C.ink, weight: 700, size: 12 });
  out += svgText(W - 6, top - 12, 'Impegnato / quota · residuo', { anchor: 'end', fill: C.ink, weight: 700, size: 12 });

  rows.forEach((r, i) => {
    const cy = top + i * rh + rh / 2;
    const by = cy - bh / 2;
    out += svgRect(10, cy - 5, 10, 10, r.color, 2);
    out += svgText(28, cy + 4.5, clip(r.name, 18), { fill: C.ink, weight: 500, size: 13 });
    out += svgRect(pl, by, x(r.quota) - pl, bh, C.line, 4);
    const tx = x((r.quota * elapsed) / 100);
    const tipBase = `${r.name}\nQuota ${EUR(r.quota)}\nTeorico a oggi: ${EUR((r.quota * elapsed) / 100)} (${PCT(elapsed)})`;
    let tip = tipBase + '\nContratto non ancora iniziato';
    if (r.realEur != null) {
      const within = Math.min(r.realEur, r.quota);
      out += svgRect(pl, by, Math.max(within > 0 ? 3 : 0, x(within) - pl), bh, r.color, 4);
      if (r.realEur > r.quota) out += svgRect(x(r.quota), by, x(r.realEur) - x(r.quota), bh, C.bad, 4);
      const resid = r.quota - r.realEur;
      const pct = r.quota ? (r.realEur / r.quota) * 100 : 0;
      out += svgText(pl + pw + 14, cy - 2, `${EURM(r.realEur)} / ${EURM(r.quota)}`, { fill: C.ink, weight: 700, size: 13 });
      out += svgText(pl + pw + 14, cy + 14, resid < 0 ? `Sforamento ${EURM(-resid)}` : `Residuo ${EURM(resid)}`, {
        fill: resid < 0 ? C.bad : C.muted,
        weight: resid < 0 ? 700 : 400,
        size: 11.5,
      });
      tip = `${tipBase}\nImpegnato ${EUR(r.realEur)} (${PCT(pct)} della quota)\n${resid < 0 ? 'Sforamento' : 'Residuo'} ${EUR(Math.abs(resid))}`;
    } else {
      out += svgText(pl + pw + 14, cy + 4.5, `Quota ${EURM(r.quota)} · non iniziato`, { fill: C.muted, size: 12 });
    }
    out += svgLine(tx, by - 5, tx, by + bh + 5, C.ink, 2);
    out += `<rect x="0" y="${f1(cy - rh / 2)}" width="${W}" height="${rh}" ${HIT}${tipAttr(tip)}/>`;
  });
  return svgWrap(W, yEnd + 12, out);
}
