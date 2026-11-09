// Grafici "insight": ogni grafico risponde a una domanda e confronta il dato con un
// riferimento (piano, totale iniziale, quota). Builder puri: dati in ingresso, stringa
// SVG in uscita. Input incoerenti → ChartInputError (errore di programmazione);
// dati semplicemente assenti → blocco "empty" (caso normale a runtime).
import { C, EROSION_THRESHOLDS, EUR, PCT, clamp } from './format';
import { esc } from './charts';
import {
  ChartInputError,
  assertFinite,
  assertMaxLen,
  assertSameLength,
  cumulative,
  eurCompact,
  hGrid,
  linearScale,
  niceCeil,
  pathD,
  svgCircle,
  svgLine,
  svgPath,
  svgRect,
  svgText,
  svgWrap,
} from './chartKit';

const LINE2 = '#EEF2F1';

const EMPTY = (msg: string): string => `<div class="empty">${esc(msg)}</div>`;

// Colore del testo leggibile sopra un riempimento.
const textOn = (fill: string): string => (fill === C.gold ? C.ink : '#fff');

// Alone bianco: l'etichetta resta leggibile anche sopra linee e aree.
const HALO = `paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"`;

const tipAttr = (tip: string): string => ` data-tip="${esc(tip)}" class="seg"`;

// ---------------------------------------------------------------------------
// P1 — Quanta revenue è maturata e quanta resta da maturare nell'anno?
// Sopra: cumulato della revenue di competenza (pieno fino a oggi, tratteggiato per i
// mesi futuri) ed, SE disponibile, il consuntivato cumulato come confronto.
// Sotto: barre mensili di competenza, mesi futuri tratteggiati.
// Il consuntivato (cons_mesi) esiste solo per le IF attivate: senza, il grafico
// resta pienamente leggibile sulla sola revenue.
// ---------------------------------------------------------------------------
export type PaceInput = {
  labels: readonly string[];
  plan: readonly number[]; // revenue di competenza per periodo (tutto l'anno)
  actual?: readonly number[] | null; // consuntivato per periodo, se disponibile
  lastActual: number; // ultimo indice trascorso: -1 nessuno, n-1 tutti
  periodLabel?: string;
  todayLabel?: string; // se presente, marca `lastActual` con questa etichetta (es. "oggi")
};

export type PaceGeom = { W: number; pl: number; pr: number; x: (i: number) => number };

function validatePace(inp: PaceInput): void {
  assertMaxLen('labels', inp.labels.length);
  assertSameLength('plan', inp.plan, inp.labels);
  assertFinite('plan', inp.plan);
  if (inp.actual) {
    assertSameLength('actual', inp.actual, inp.labels);
    assertFinite('actual', inp.actual);
  }
}

// Consuntivato utilizzabile: presente e con almeno un valore > 0.
export function hasActualSeries(actual: readonly number[] | null | undefined): actual is readonly number[] {
  return !!actual && actual.some((v) => v > 0);
}

function paceRevenueLines(g: PaceGeom, cumPlan: number[], last: number, y: (v: number) => number): string {
  const n = cumPlan.length;
  const pt = (i: number) => [g.x(i), y(cumPlan[i])] as const;
  const idx = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);
  let out = '';
  if (last < n - 1) {
    out += svgPath(pathD(idx(Math.max(last, 0), n - 1).map(pt)), { stroke: C.petrol, width: 2.4, dash: '6 4', opacity: 0.8 });
  }
  if (last >= 0) {
    const solid = idx(0, last).map(pt);
    out += svgPath(`${pathD(solid)} L${g.x(last).toFixed(1)},${y(0).toFixed(1)} L${g.x(0).toFixed(1)},${y(0).toFixed(1)} Z`, { fill: C.petrol, opacity: 0.1 });
    out += svgPath(pathD(solid), { stroke: C.petrol, width: 3 });
    out += svgCircle(g.x(last), y(cumPlan[last]), 5, C.petrol);
  }
  return out;
}

function paceActualLine(g: PaceGeom, cumAct: number[], cumPlan: number[], last: number, y: (v: number) => number): string {
  if (last < 0) return '';
  let out = svgPath(pathD(cumAct.map((v, i) => [g.x(i), y(v)] as const)), { stroke: C.amberD, width: 2.4 });
  out += svgCircle(g.x(last), y(cumAct[last]), 4.5, C.amberD);
  const delta = cumAct[last] - cumPlan[last];
  out += svgText(g.x(last) - 10, y(cumAct[last]) + 26, `Consuntivato ${eurCompact(cumAct[last])} · ${delta >= 0 ? '+' : '−'}${eurCompact(Math.abs(delta))} vs competenza`, {
    anchor: 'end',
    fill: delta >= 0 ? C.good : C.bad,
    weight: 700,
    size: 11.5,
    extra: HALO,
  });
  return out;
}

function paceTop(g: PaceGeom, cumPlan: number[], cumAct: number[] | null, last: number, top: number, h: number): string {
  const n = cumPlan.length;
  const max = niceCeil(Math.max(cumPlan[n - 1] || 0, cumAct ? cumAct[Math.max(last, 0)] || 0 : 0));
  const y = linearScale(0, max, top + h, top);
  let out = hGrid(g.pl, g.W - g.pr, y, max, 4, eurCompact, { line: C.line, text: C.muted });
  out += paceRevenueLines(g, cumPlan, last, y);
  out += svgText(g.x(n - 1) + 10, y(cumPlan[n - 1]) + 4, `Anno ${eurCompact(cumPlan[n - 1])}`, { fill: C.muted, size: 11 });
  if (last >= 0) {
    const share = cumPlan[n - 1] > 0 ? ` · ${PCT((cumPlan[last] / cumPlan[n - 1]) * 100)} dell'anno` : '';
    out += svgText(g.x(last) - 8, y(cumPlan[last]) - 12, `Maturata ${eurCompact(cumPlan[last])}${share}`, { anchor: 'end', fill: C.ink, weight: 700, size: 12, extra: HALO });
  }
  if (cumAct) out += paceActualLine(g, cumAct, cumPlan, last, y);
  return out;
}

function paceBars(inp: PaceInput, g: PaceGeom, base: number, h: number): string {
  const n = inp.labels.length;
  const max = niceCeil(Math.max(...inp.plan, 1));
  const y = linearScale(0, max, base, base - h);
  const bw = Math.min(46, ((g.W - g.pl - g.pr) / Math.max(1, n - 1)) * 0.6);
  let out = svgText(g.pl, base - h - 10, 'Revenue di competenza per periodo', { fill: C.ink, weight: 600, size: 12 });
  for (let i = 0; i < n; i++) {
    const v = inp.plan[i];
    const x = g.x(i) - bw / 2;
    out +=
      i <= inp.lastActual
        ? svgRect(x, y(v), bw, base - y(v), C.petrol, 3)
        : svgRect(x, y(v), bw, base - y(v), 'none', 3, `stroke="${C.slateL}" stroke-width="1.5" stroke-dasharray="3 3"`);
    out += svgText(g.x(i), base + 16, inp.labels[i], { anchor: 'middle', fill: C.muted, size: 11 });
  }
  return out + svgLine(g.pl, base, g.W - g.pr, base, C.line);
}

function paceHover(inp: PaceInput, g: PaceGeom, cumPlan: number[], cumAct: number[] | null, top: number, bottom: number): string {
  const n = inp.labels.length;
  const slot = (g.W - g.pl - g.pr) / Math.max(1, n - 1);
  const per = inp.periodLabel ? ` ${inp.periodLabel}` : '';
  let out = '';
  for (let i = 0; i < n; i++) {
    const done = i <= inp.lastActual;
    let tip = `${inp.labels[i]}${per} · Revenue\nCompetenza: ${EUR(inp.plan[i])} (cum. ${EUR(cumPlan[i])})${done ? '' : '\nperiodo non ancora trascorso'}`;
    if (cumAct && inp.actual && done) tip += `\nConsuntivato: ${EUR(inp.actual[i])} (cum. ${EUR(cumAct[i])})`;
    out += svgRect(g.x(i) - slot / 2, top, slot, bottom - top, 'transparent', 0, `style="pointer-events:all"${tipAttr(tip)}`);
  }
  return out;
}

export function chartRevenuePace(inp: PaceInput): string {
  validatePace(inp);
  const n = inp.labels.length;
  if (n === 0) return EMPTY('Nessun dato');
  const W = 920;
  const g: PaceGeom = { W, pl: 78, pr: 150, x: linearScale(0, Math.max(1, n - 1), 78 + 20, W - 150 - 20) };
  const last = Math.min(inp.lastActual, n - 1);
  const cumPlan = cumulative(inp.plan);
  const cumAct = hasActualSeries(inp.actual) && last >= 0 ? cumulative(inp.actual.slice(0, last + 1)) : null;
  const topY = 18;
  const topH = 230;
  const barsBase = topY + topH + 130;
  let inner = paceTop(g, cumPlan, cumAct, last, topY, topH);
  if (last >= 0 && inp.todayLabel) {
    inner += svgLine(g.x(last), topY, g.x(last), topY + topH, C.amberD, 1.2, '4 3');
    inner += svgText(g.x(last) + 5, topY + 12, inp.todayLabel, { fill: C.amberD, weight: 700, size: 10 });
  }
  inner += paceBars({ ...inp, lastActual: last }, g, barsBase, 80);
  inner += paceHover({ ...inp, lastActual: last }, g, cumPlan, cumAct, topY, barsBase);
  return svgWrap(W, barsBase + 30, inner);
}

// ---------------------------------------------------------------------------
// P2 — Quanto lavoro è maturato ma non ancora fatturato?
// Tre cumulati su un solo asse e l'area "da fatturare" fra revenue e fatturato.
// ---------------------------------------------------------------------------
export type BillingGapInput = {
  labels: readonly string[];
  revenue: readonly number[];
  billed: readonly number[]; // fatturato di riferimento (BEF emesso, o fatturazione a piano)
  billedName: string;
  planBilled?: readonly number[]; // fatturazione a piano, tratteggiata, se distinta da `billed`
  lastActual: number; // -1 nessun periodo trascorso
  periodLabel?: string;
  todayLabel?: string;
};

function validateGap(inp: BillingGapInput): void {
  assertMaxLen('labels', inp.labels.length);
  assertSameLength('revenue', inp.revenue, inp.labels);
  assertSameLength('billed', inp.billed, inp.labels);
  if (inp.planBilled) assertSameLength('planBilled', inp.planBilled, inp.labels);
  assertFinite('revenue', inp.revenue);
  assertFinite('billed', inp.billed);
  assertFinite('planBilled', inp.planBilled || []);
}

function gapArea(x: (i: number) => number, y: (v: number) => number, upper: number[], lower: number[]): string {
  const up = upper.map((v, i) => [x(i), y(v)] as const);
  const lo = lower.map((v, i) => [x(i), y(v)] as const).reverse();
  return svgPath(`${pathD(up)} L${pathD(lo).slice(1)} Z`, { fill: C.gold, opacity: 0.3 });
}

function gapHover(inp: BillingGapInput, x: (i: number) => number, cums: { r: number[]; b: number[] }, w: number, top: number, h: number, last: number): string {
  const n = inp.labels.length;
  const per = inp.periodLabel ? ` ${inp.periodLabel}` : '';
  let out = '';
  for (let i = 0; i < n; i++) {
    const hasB = i <= last;
    const tip =
      `${inp.labels[i]}${per}\nRevenue: ${EUR(inp.revenue[i])} (cum. ${EUR(cums.r[i])})\n` +
      (hasB
        ? `${inp.billedName}: ${EUR(inp.billed[i])} (cum. ${EUR(cums.b[i])})\nDa fatturare (cum.): ${EUR(cums.r[i] - cums.b[i])}`
        : `${inp.billedName}: periodo non ancora trascorso`);
    out += svgRect(x(i) - w / 2, top, w, h, 'transparent', 0, `style="pointer-events:all"${tipAttr(tip)}`);
  }
  return out;
}

export function chartBillingGap(inp: BillingGapInput): string {
  validateGap(inp);
  const n = inp.labels.length;
  if (n === 0) return EMPTY('Nessun dato');
  const W = 920;
  const H = 380;
  const pl = 78;
  const pr = 180;
  const pt = 16;
  const pb = 32;
  const h = H - pt - pb;
  const last = Math.min(inp.lastActual, n - 1);
  const x = linearScale(0, Math.max(1, n - 1), pl + 20, W - pr - 20);
  const cumR = cumulative(inp.revenue);
  const cumB = last >= 0 ? cumulative(inp.billed.slice(0, last + 1)) : [];
  const cumP = inp.planBilled && last >= 0 ? cumulative(inp.planBilled.slice(0, last + 1)) : [];
  const max = niceCeil(Math.max(cumR[n - 1] || 0, cumB[last] || 0, cumP[last] || 0));
  const y = linearScale(0, max, pt + h, pt);
  let out = hGrid(pl, W - pr, y, max, 4, eurCompact, { line: C.line, text: C.muted });
  for (let i = 0; i < n; i++) out += svgText(x(i), H - 10, inp.labels[i], { anchor: 'middle', fill: C.muted, size: 11 });
  if (last >= 0) out += gapArea(x, y, cumR.slice(0, last + 1), cumB);
  out += svgPath(pathD(cumR.map((v, i) => [x(i), y(v)] as const)), { stroke: C.petrol, width: 3 });
  if (cumP.length) out += svgPath(pathD(cumP.map((v, i) => [x(i), y(v)] as const)), { stroke: C.slate, width: 2.2, dash: '6 4' });
  if (cumB.length) out += svgPath(pathD(cumB.map((v, i) => [x(i), y(v)] as const)), { stroke: C.amberD, width: 2.6 });
  if (last >= 0 && inp.todayLabel) {
    out += svgLine(x(last), pt, x(last), pt + h, C.amberD, 1.2, '4 3');
    out += svgText(x(last) + 5, pt + 12, inp.todayLabel, { fill: C.amberD, weight: 700, size: 10 });
  }
  out += gapLabels(inp, { x, y, W, pr, pt, pb: pt + h, last, cumR, cumB });
  const slot = (W - pl - pr) / Math.max(1, n - 1);
  out += gapHover(inp, x, { r: cumR, b: cumB }, slot, pt, h, last);
  return svgWrap(W, H, out);
}

type GapLabelCtx = {
  x: (i: number) => number;
  y: (v: number) => number;
  W: number;
  pr: number;
  pt: number;
  pb: number; // ordinata della base del grafico
  last: number;
  cumR: number[];
  cumB: number[];
};

function gapLabels(inp: BillingGapInput, c: GapLabelCtx): string {
  const n = inp.labels.length;
  let out = svgText(c.x(n - 1) + 10, c.y(c.cumR[n - 1]) + 4, `Revenue ${eurCompact(c.cumR[n - 1])}`, {
    fill: C.ink,
    weight: 700,
    size: 11.5,
  });
  if (c.last < 0) return out;
  out += svgCircle(c.x(c.last), c.y(c.cumB[c.last]), 5, C.amberD);
  out += svgText(c.x(c.last) + 10, c.y(c.cumB[c.last]) + 4, `${inp.billedName} ${eurCompact(c.cumB[c.last])}`, {
    fill: C.amberD,
    weight: 700,
    size: 11.5,
  });
  const gap = c.cumR[c.last] - c.cumB[c.last];
  const bx = c.W - c.pr + 12;
  out += svgText(bx, c.pb - 34, 'Da fatturare ad oggi', { fill: C.muted, size: 11 });
  out += svgText(bx, c.pb - 10, eurCompact(gap), { fill: C.ink, weight: 800, size: 20 });
  const mid = Math.floor(c.last / 2);
  if (gap > 0) {
    out += svgText(c.x(mid), (c.y(c.cumR[mid]) + c.y(c.cumB[mid])) / 2 + 4, 'da fatturare', {
      anchor: 'middle',
      fill: C.amberD,
      weight: 700,
      size: 11,
      extra: HALO,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// P3 — Dove si fermano gli IF prima di diventare fatturabili?
// Imbuto annidato: ogni passo è un sottoinsieme del precedente.
// ---------------------------------------------------------------------------
export type FunnelStep = { label: string; n: number; v: number; drillStato?: string };

const FUNNEL_PREFIXES = ['IF totali', 'Approvati', 'Approvati con BO', 'BO e attivati'] as const;

export function funnelFromStats(stats: readonly { n: number; v: number }[]): FunnelStep[] {
  if (stats.length !== FUNNEL_PREFIXES.length) {
    throw new ChartInputError(`funnel: attesi ${FUNNEL_PREFIXES.length} passi, ricevuti ${stats.length}`);
  }
  return stats.map((s, i) => ({
    label: FUNNEL_PREFIXES[i],
    n: s.n,
    v: s.v,
    ...(i === 1 ? { drillStato: 'approvato' } : {}),
  }));
}

function funnelTip(s: FunnelStep, first: FunnelStep): string {
  const share = first.n ? PCT((s.n / first.n) * 100) : '—';
  return `${s.label}\n${s.n} IF · ${EUR(s.v)}\n${share} degli IF totali${s.drillStato ? '\nclic per vedere gli IF' : ''}`;
}

function funnelRow(s: FunnelStep, i: number, steps: readonly FunnelStep[], g: { pl: number; bw: number; y: number; rh: number; W: number }): string {
  const first = steps[0];
  const byValue = first.v > 0;
  const ratio = byValue ? s.v / first.v : first.n ? s.n / first.n : 0;
  const w = g.bw * Math.min(1, Math.max(0, ratio));
  const drill = s.drillStato ? ` data-drill-stato="${esc(s.drillStato)}" style="cursor:pointer"` : '';
  let out = svgRect(g.pl, g.y, g.bw, g.rh, LINE2, 6);
  out += svgRect(g.pl, g.y, Math.max(w, 3), g.rh, i === steps.length - 1 ? C.petrol : C.petrolL, 6, tipAttr(funnelTip(s, first)).trim() + drill);
  out += svgText(g.pl - 12, g.y + g.rh / 2 + 4, s.label, { anchor: 'end', fill: C.ink, size: 12.5, weight: 500 });
  out += svgText(g.pl + Math.max(w, 3) + 10, g.y + g.rh / 2 - 2, `${s.n} IF`, { fill: C.ink, weight: 700, size: 13 });
  out += svgText(g.pl + Math.max(w, 3) + 10, g.y + g.rh / 2 + 14, eurCompact(s.v), { fill: C.muted, size: 11 });
  if (i === 0) return out;
  const prev = steps[i - 1];
  const lostN = prev.n - s.n;
  if (lostN <= 0) return out;
  return out + svgText(g.W - 6, g.y - 7, `−${lostN} IF · ${eurCompact(Math.max(0, prev.v - s.v))} persi`, { anchor: 'end', fill: C.bad, weight: 700, size: 11 });
}

export function chartFunnel(steps: readonly FunnelStep[]): string {
  assertMaxLen('steps', steps.length, 12);
  assertFinite('steps', steps.flatMap((s) => [s.n, s.v]));
  if (steps.length === 0 || steps[0].n === 0) return EMPTY('Nessun IF');
  const W = 920;
  const pl = 200;
  const bw = W - pl - 300;
  const rh = 46;
  const gapY = 26;
  const top = 20;
  let out = '';
  steps.forEach((s, i) => {
    out += funnelRow(s, i, steps, { pl, bw, y: top + i * (rh + gapY), rh, W });
  });
  return svgWrap(W, top + steps.length * (rh + gapY), out);
}

// ---------------------------------------------------------------------------
// P4 — Le modalità pesano di più per numero o per valore?
// Due barre al 100% (quota IF / quota valore) collegate da fasce.
// ---------------------------------------------------------------------------
export type ShareRow = { label: string; color: string; n: number; v: number; drill?: string };

const SHARE_BAR_H = 40;

function shareSegments(rows: readonly ShareRow[], key: 'n' | 'v', total: number, x0: number, w: number, y: number, tipOf: (r: ShareRow) => string): string {
  let acc = 0;
  let out = '';
  for (const r of rows) {
    const sw = (w * r[key]) / total;
    const drill = r.drill ? ` data-drill-mod="${esc(r.drill)}" style="cursor:pointer"` : '';
    if (sw > 0) {
      out += svgRect(x0 + acc, y, Math.max(0, sw - 2), SHARE_BAR_H, r.color, 4, tipAttr(tipOf(r)).trim() + drill);
      if (sw > 46) {
        out += svgText(x0 + acc + sw / 2 - 1, y + SHARE_BAR_H / 2 + 4, PCT((r[key] / total) * 100), {
          anchor: 'middle',
          fill: textOn(r.color),
          weight: 700,
          size: 12,
          extra: 'pointer-events="none"',
        });
      }
    }
    acc += sw;
  }
  return out;
}

function shareBands(rows: readonly ShareRow[], tn: number, tv: number, x0: number, w: number, yTop: number, yBot: number): string {
  let a = 0;
  let b = 0;
  let out = '';
  for (const r of rows) {
    const w1 = (w * r.n) / tn;
    const w2 = (w * r.v) / tv;
    const d = `M${(x0 + a).toFixed(1)},${yTop} L${(x0 + a + w1 - 2).toFixed(1)},${yTop} L${(x0 + b + w2 - 2).toFixed(1)},${yBot} L${(x0 + b).toFixed(1)},${yBot} Z`;
    out += svgPath(d, { fill: r.color, opacity: 0.16 });
    a += w1;
    b += w2;
  }
  return out;
}

export function chartShareCompare(rows: readonly ShareRow[]): string {
  assertMaxLen('rows', rows.length, 12);
  assertFinite('rows', rows.flatMap((r) => [r.n, r.v]));
  const tn = rows.reduce((s, r) => s + r.n, 0);
  const tv = rows.reduce((s, r) => s + r.v, 0);
  if (rows.length === 0 || tn <= 0 || tv <= 0) return EMPTY('Nessun dato');
  const W = 920;
  const pl = 16;
  const w = W - 2 * pl;
  const y1 = 36;
  const y2 = 150;
  const tip = (r: ShareRow): string =>
    `${r.label}\n${r.n} IF · ${PCT((r.n / tn) * 100)} degli IF\n${EUR(r.v)} · ${PCT((r.v / tv) * 100)} del valore${r.drill ? '\nclic per vedere gli IF' : ''}`;
  let out = svgText(pl, y1 - 12, `Quota degli IF · ${tn} IF`, { fill: C.ink, weight: 700, size: 12.5 });
  out += svgText(pl, y2 - 12, `Quota del valore · ${eurCompact(tv)}`, { fill: C.ink, weight: 700, size: 12.5 });
  out += shareBands(rows, tn, tv, pl, w, y1 + SHARE_BAR_H, y2);
  out += shareSegments(rows, 'n', tn, pl, w, y1, tip);
  out += shareSegments(rows, 'v', tv, pl, w, y2, tip);
  return svgWrap(W, y2 + SHARE_BAR_H + 10, out);
}

// ---------------------------------------------------------------------------
// P5 — Quali ambiti concentrano il valore?
// Barre ordinate per valore, IF come punti, quota cumulata, soglia 80%.
// ---------------------------------------------------------------------------
export type ParetoRow = { label: string; v: number; n: number };

const PARETO_MAX_ROWS = 12;
const PARETO_MAX_DOTS = 12;

// Oltre PARETO_MAX_ROWS le righe finali confluiscono in "Altri k": l'altezza resta limitata.
export function foldTail(rows: readonly ParetoRow[], max = PARETO_MAX_ROWS): ParetoRow[] {
  if (rows.length <= max) return [...rows];
  const head = rows.slice(0, max - 1);
  const tail = rows.slice(max - 1);
  return [...head, { label: `Altri ${tail.length}`, v: tail.reduce((s, r) => s + r.v, 0), n: tail.reduce((s, r) => s + r.n, 0) }];
}

export function paretoCutoff(values: readonly number[], share = 0.8): number {
  const tot = values.reduce((s, v) => s + v, 0);
  if (tot <= 0) return -1;
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (acc / tot >= share) return i;
  }
  return values.length - 1;
}

function dots(n: number, x0: number, cy: number): string {
  const shown = Math.min(n, PARETO_MAX_DOTS);
  let out = '';
  for (let k = 0; k < shown; k++) out += `<circle cx="${(x0 + k * 10).toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4" fill="${C.slate}"/>`;
  if (n > shown) out += svgText(x0 + shown * 10, cy + 4, `+${n - shown}`, { fill: C.muted, size: 10.5 });
  return out;
}

export function chartPareto(input: readonly ParetoRow[]): string {
  assertFinite('rows', input.flatMap((r) => [r.v, r.n]));
  const rows = foldTail(input);
  const tot = rows.reduce((s, r) => s + r.v, 0);
  if (rows.length === 0 || tot <= 0) return EMPTY('Nessun dato');
  const W = 920;
  const pl = 230;
  const colN = 640;
  const bw = colN - pl - 90;
  const rh = 38;
  const top = 30;
  const max = Math.max(...rows.map((r) => r.v));
  const cut = paretoCutoff(rows.map((r) => r.v));
  let out = svgText(pl, 14, 'Valore', { fill: C.muted, weight: 600, size: 11 });
  out += svgText(colN, 14, 'N° IF', { fill: C.muted, weight: 600, size: 11 });
  out += svgText(W - 6, 14, '% cumulata', { anchor: 'end', fill: C.muted, weight: 600, size: 11 });
  let acc = 0;
  rows.forEach((r, i) => {
    const y = top + i * rh;
    acc += r.v;
    const cp = (acc / tot) * 100;
    const w = (bw * r.v) / max;
    const tip = `${r.label}\n${EUR(r.v)} · ${PCT((r.v / tot) * 100)} del valore\n${r.n} IF · cumulata ${PCT(cp)}`;
    out += svgRect(pl, y, Math.max(w, 3), rh - 12, i <= cut ? C.petrol : C.petrolL, 4, tipAttr(tip).trim());
    out += svgText(pl - 12, y + (rh - 12) / 2 + 4, clamp(r.label, 30), { anchor: 'end', fill: C.ink, size: 12.5, weight: 500 });
    out += svgText(pl + Math.max(w, 3) + 8, y + (rh - 12) / 2 + 4, eurCompact(r.v), { fill: C.ink, weight: 700, size: 12 });
    out += dots(r.n, colN, y + (rh - 12) / 2);
    out += svgText(W - 6, y + (rh - 12) / 2 + 4, PCT(cp), { anchor: 'end', fill: i <= cut ? C.ink : C.muted, weight: i <= cut ? 700 : 400, size: 12 });
  });
  if (cut >= 0 && cut < rows.length - 1) {
    const yl = top + (cut + 1) * rh - 6;
    out += svgLine(pl, yl, W - 6, yl, C.amberD, 1, '4 3');
    out += svgText(W - 6, yl - 4, `primi ${cut + 1} su ${rows.length}: oltre l'80% del valore`, { anchor: 'end', fill: C.amberD, weight: 700, size: 10.5 });
  }
  return svgWrap(W, top + rows.length * rh + 18, out);
}

// ---------------------------------------------------------------------------
// P7 — Dove si concentra lo sforzo e quanto costa?
// GG/Uomo per figura, con tariffa e costo complessivo (GG × tariffa).
// ---------------------------------------------------------------------------
export type SeniorityBar = { label: string; code: string; gg: number; tariffa: number | null };

export function seniorityCost(gg: number, tariffa: number | null): number | null {
  return tariffa ? gg * tariffa : null;
}

export function chartSeniority(input: readonly SeniorityBar[]): string {
  assertMaxLen('rows', input.length, 40);
  assertFinite('rows', input.map((r) => r.gg));
  const rows = [...input].sort((a, b) => b.gg - a.gg);
  if (rows.length === 0 || rows[0].gg <= 0) return EMPTY('Nessun dato');
  const W = 920;
  const pl = 230;
  const colT = 640;
  const bw = colT - pl - 90;
  const rh = 38;
  const top = 30;
  let out = svgText(pl, 14, 'GG/Uomo', { fill: C.muted, weight: 600, size: 11 });
  out += svgText(colT, 14, '€ / GG', { fill: C.muted, weight: 600, size: 11 });
  out += svgText(W - 6, 14, 'Costo (GG × tariffa)', { anchor: 'end', fill: C.muted, weight: 600, size: 11 });
  rows.forEach((r, i) => {
    const y = top + i * rh;
    const w = (bw * r.gg) / rows[0].gg;
    const cost = seniorityCost(r.gg, r.tariffa);
    const tip = `${r.label} (${r.code})\n${r.gg.toLocaleString('it-IT')} GG/uomo${r.tariffa ? `\nTariffa € ${r.tariffa.toLocaleString('it-IT')}/GG` : ''}${cost != null ? `\nCosto ${EUR(cost)}` : ''}`;
    out += svgRect(pl, y, Math.max(w, 3), rh - 12, C.petrol, 4, tipAttr(tip).trim());
    out += svgText(pl - 12, y + (rh - 12) / 2 + 4, clamp(r.label, 30), { anchor: 'end', fill: C.ink, size: 12.5, weight: 500 });
    out += svgText(pl + Math.max(w, 3) + 8, y + (rh - 12) / 2 + 4, r.gg.toLocaleString('it-IT'), { fill: C.ink, weight: 700, size: 12 });
    out += svgText(colT, y + (rh - 12) / 2 + 4, r.tariffa ? `€ ${r.tariffa.toLocaleString('it-IT')}` : '—', { fill: C.muted, size: 12 });
    out += svgText(W - 6, y + (rh - 12) / 2 + 4, cost != null ? eurCompact(cost) : '—', { anchor: 'end', fill: C.ink, weight: 700, size: 12 });
  });
  return svgWrap(W, top + rows.length * rh + 10, out);
}

// ---------------------------------------------------------------------------
// P8 — Quanta quota hanno consumato tutte le aziende dell'RTI rispetto al tempo?
// Composizione del massimale + un bullet chart per il totale e per OGNI partner,
// ciascuno contro la propria quota, con il tempo contrattuale trascorso.
// ---------------------------------------------------------------------------
export type RtiPartnerShare = { name: string; color: string; pct: number; quota: number }; // pct: frazione 0..1 del massimale

export type RtiBulletRow = {
  name: string;
  color: string;
  quota: number;
  realEur: number | null; // null = contratto non ancora iniziato
  realPct: number | null; // % della PROPRIA quota
  projectedPct: number | null;
  projectedEur: number | null;
  drillRti?: string; // se presente, il clic seleziona il partner
};

export type RtiBulletsInput = {
  ceiling: number;
  partners: readonly RtiPartnerShare[];
  rows: readonly RtiBulletRow[]; // prima il totale, poi un partner per riga
  elapsedPct: number; // tempo contrattuale trascorso, 0..100
  selected?: string | null;
};

const RTI_MAX_ROWS = 20;
const RTI_AXIS_MAX = 120; // % oltre cui la barra viene troncata (il valore resta scritto)

function riskColor(pct: number): string {
  if (pct >= EROSION_THRESHOLDS.critical) return C.bad;
  if (pct >= EROSION_THRESHOLDS.warn) return C.amberD;
  return C.petrol;
}

function rtiComposition(partners: readonly RtiPartnerShare[], pl: number, bw: number, ceiling: number, selected: string | null): string {
  let out = svgText(pl, 14, `Composizione del massimale · ${eurCompact(ceiling)}`, { fill: C.ink, weight: 700, size: 12.5 });
  let acc = 0;
  for (const p of partners) {
    const w = bw * Math.max(0, p.pct);
    const dim = selected && selected !== p.name ? ' opacity="0.45"' : '';
    const tip = `${p.name}\nQuota ${PCT(p.pct * 100)} · ${EUR(p.quota)}\nclic per evidenziarla`;
    out += svgRect(pl + acc, 24, Math.max(0, w - 1.5), 28, p.color, 3, `data-drill-rti="${esc(p.name)}" style="cursor:pointer"${dim}${tipAttr(tip)}`);
    if (w > 46) out += svgText(pl + acc + w / 2, 43, PCT(p.pct * 100), { anchor: 'middle', fill: '#fff', weight: 700, size: 11, extra: 'pointer-events="none"' });
    acc += w;
  }
  return out;
}

function rtiBullet(r: RtiBulletRow, i: number, g: { pl: number; bw: number; y: number; elapsed: number; W: number; selected: string | null }): string {
  const h = 22;
  const x = (pc: number): number => g.pl + (g.bw * Math.min(Math.max(pc, 0), RTI_AXIS_MAX)) / RTI_AXIS_MAX;
  const isSel = g.selected === r.name;
  const warn = EROSION_THRESHOLDS.warn;
  const crit = EROSION_THRESHOLDS.critical;
  let out = svgRect(g.pl, g.y, x(warn) - g.pl, h + 10, LINE2);
  out += svgRect(x(warn), g.y, x(crit) - x(warn), h + 10, C.gold, 0, 'opacity="0.35"');
  out += svgRect(x(crit), g.y, x(RTI_AXIS_MAX) - x(crit), h + 10, C.bad, 0, 'opacity="0.28"');
  if (r.realPct != null) out += svgRect(g.pl, g.y + 5, x(r.realPct) - g.pl, h, riskColor(r.realPct), 3);
  out += svgLine(x(g.elapsed), g.y - 3, x(g.elapsed), g.y + h + 13, C.ink, 2);
  out += svgRect(12, g.y + 8, 9, 9, r.color, 2);
  out += svgText(28, g.y + h / 2 + 9, clamp(r.name, 20), { fill: C.ink, weight: i === 0 || isSel ? 700 : 500, size: 12.5 });
  out += svgText(g.pl - 10, g.y + h + 24, eurCompact(r.quota), { anchor: 'end', fill: C.muted, size: 10.5 });
  if (r.realPct != null) {
    out += svgText(Math.max(x(r.realPct) - 6, g.pl + 34), g.y + h / 2 + 10, `${Math.round(r.realPct)}%`, { anchor: 'end', fill: '#fff', weight: 700, size: 11.5, extra: 'pointer-events="none"' });
  }
  const proj = r.projectedPct;
  out += svgText(g.W - 6, g.y + h / 2 + 10, proj == null ? '—' : `≈ ${Math.round(proj)}%`, { anchor: 'end', fill: proj != null && proj > 100 ? C.bad : C.ink, weight: 700, size: 13 });
  const tip =
    `${r.name}\nQuota ${EUR(r.quota)}\n` +
    (r.realPct == null || r.realEur == null
      ? 'Contratto non ancora iniziato'
      : `Impegnato ${EUR(r.realEur)} · erosione ${PCT(r.realPct)}\nProiezione a fine contratto: ${proj == null ? '—' : PCT(proj)}`) +
    (r.drillRti ? '\nclic per evidenziarla' : '');
  const drillAttr = r.drillRti ? ` data-drill-rti="${esc(r.drillRti)}"` : '';
  const style = r.drillRti ? 'pointer-events:all;cursor:pointer' : 'pointer-events:all';
  return out + svgRect(0, g.y - 4, g.W, h + 30, 'transparent', 0, `style="${style}"${drillAttr}${tipAttr(tip)}`);
}

export function chartRtiBullets(inp: RtiBulletsInput): string {
  assertMaxLen('rows', inp.rows.length, RTI_MAX_ROWS);
  assertMaxLen('partners', inp.partners.length, RTI_MAX_ROWS);
  assertFinite('elapsedPct', [inp.elapsedPct, inp.ceiling]);
  assertFinite('partners', inp.partners.flatMap((p) => [p.pct, p.quota]));
  assertFinite('rows', inp.rows.flatMap((r) => [r.quota, r.realPct ?? 0, r.projectedPct ?? 0]));
  if (inp.rows.length === 0) return EMPTY('Nessun partner RTI configurato');
  const W = 920;
  const pl = 190;
  const bw = W - pl - 130;
  const rh = 58;
  const top = inp.partners.length ? 110 : 40;
  const selected = inp.selected ?? null;
  const elapsed = Math.min(100, Math.max(0, inp.elapsedPct));
  let out = inp.partners.length ? rtiComposition(inp.partners, pl, bw, inp.ceiling, selected) : '';
  out += svgText(pl, top - 22, 'Impegnato rispetto alla propria quota', { fill: C.ink, weight: 700, size: 12.5 });
  out += svgText(W - 6, top - 22, 'A fine contratto', { anchor: 'end', fill: C.ink, weight: 700, size: 12.5 });
  inp.rows.forEach((r, i) => {
    out += rtiBullet(r, i, { pl, bw, y: top + i * rh, elapsed, W, selected });
  });
  const yEnd = top + inp.rows.length * rh;
  out += svgText(pl + (bw * elapsed) / RTI_AXIS_MAX, yEnd + 4, `tempo trascorso ${Math.round(elapsed)}%`, { anchor: 'middle', fill: C.ink, weight: 700, size: 10.5 });
  return svgWrap(W, yEnd + 16, out);
}
