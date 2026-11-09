// Grafici "insight": ogni grafico risponde a una domanda e confronta il dato con un
// riferimento (piano, totale iniziale, quota). Builder puri: dati in ingresso, stringa
// SVG in uscita. Input incoerenti → ChartInputError (errore di programmazione);
// dati semplicemente assenti → blocco "empty" (caso normale a runtime).
import { C, EUR, PCT, clamp } from './format';
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
// P1 — Siamo in linea con il ritmo di revenue previsto?
// Sopra: cumulato consuntivato vs cumulato di competenza (stesso asse €).
// Sotto: barre mensili, mesi non ancora consuntivati tratteggiati.
// ---------------------------------------------------------------------------
export type PaceInput = {
  labels: readonly string[];
  plan: readonly number[]; // revenue di competenza per periodo (tutto l'anno)
  actual: readonly number[]; // consuntivato per periodo
  lastActual: number; // ultimo indice consuntivabile: -1 nessuno, n-1 tutti
  periodLabel?: string;
  todayLabel?: string; // se presente, marca `lastActual` con questa etichetta (es. "oggi")
};

export type PaceGeom = { W: number; pl: number; pr: number; x: (i: number) => number };

function validatePace(inp: PaceInput): void {
  assertMaxLen('labels', inp.labels.length);
  assertSameLength('plan', inp.plan, inp.labels);
  assertSameLength('actual', inp.actual, inp.labels);
  assertFinite('plan', inp.plan);
  assertFinite('actual', inp.actual);
}

function paceTop(g: PaceGeom, cumPlan: number[], cumAct: number[], top: number, h: number): string {
  const last = cumAct.length - 1;
  const max = niceCeil(Math.max(cumPlan[cumPlan.length - 1] || 0, cumAct[last] || 0));
  const y = linearScale(0, max, top + h, top);
  let out = hGrid(g.pl, g.W - g.pr, y, max, 4, eurCompact, { line: C.line, text: C.muted });
  out += svgPath(pathD(cumPlan.map((v, i) => [g.x(i), y(v)] as const)), { stroke: C.slate, width: 2, dash: '6 4' });
  const lastPlan = cumPlan.length - 1;
  out += svgText(g.x(lastPlan) + 10, y(cumPlan[lastPlan]) + 4, `Competenza ${eurCompact(cumPlan[lastPlan])}`, {
    fill: C.muted,
    size: 11,
  });
  if (last < 0) return out;
  const pts = cumAct.map((v, i) => [g.x(i), y(v)] as const);
  out += svgPath(`${pathD(pts)} L${g.x(last).toFixed(1)},${y(0).toFixed(1)} L${g.x(0).toFixed(1)},${y(0).toFixed(1)} Z`, {
    fill: C.petrol,
    opacity: 0.1,
  });
  out += svgPath(pathD(pts), { stroke: C.petrol, width: 3 });
  out += svgCircle(g.x(last), y(cumAct[last]), 5, C.petrol);
  const delta = cumAct[last] - cumPlan[last];
  const sign = delta >= 0 ? '+' : '−';
  out += svgText(g.x(last) - 8, y(cumAct[last]) - 12, `Consuntivato ${eurCompact(cumAct[last])}`, {
    anchor: 'end',
    fill: C.ink,
    weight: 700,
    size: 12,
  });
  out += svgText(g.x(last) + 12, y(cumAct[last]) + 24, `${sign}${eurCompact(Math.abs(delta))} vs competenza a oggi`, {
    fill: delta >= 0 ? C.good : C.bad,
    weight: 700,
    size: 11.5,
    extra: HALO,
  });
  return out;
}

function paceBars(inp: PaceInput, g: PaceGeom, base: number, h: number): string {
  const n = inp.labels.length;
  const max = niceCeil(Math.max(...inp.plan, ...inp.actual, 1));
  const y = linearScale(0, max, base, base - h);
  const bw = Math.min(46, ((g.W - g.pl - g.pr) / Math.max(1, n - 1)) * 0.6);
  let out = svgText(g.pl, base - h - 10, 'Per periodo', { fill: C.ink, weight: 600, size: 12 });
  for (let i = 0; i < n; i++) {
    const done = i <= inp.lastActual;
    const v = done ? inp.actual[i] : inp.plan[i];
    const x = g.x(i) - bw / 2;
    out += done
      ? svgRect(x, y(v), bw, base - y(v), C.petrol, 3)
      : svgRect(x, y(v), bw, base - y(v), 'none', 3, `stroke="${C.slateL}" stroke-width="1.5" stroke-dasharray="3 3"`);
    out += svgText(g.x(i), base + 16, inp.labels[i], { anchor: 'middle', fill: C.muted, size: 11 });
  }
  return out + svgLine(g.pl, base, g.W - g.pr, base, C.line);
}

function paceHover(inp: PaceInput, g: PaceGeom, cumPlan: number[], cumAct: number[], top: number, bottom: number): string {
  const n = inp.labels.length;
  const slot = (g.W - g.pl - g.pr) / Math.max(1, n - 1);
  const per = inp.periodLabel ? ` ${inp.periodLabel}` : '';
  let out = '';
  for (let i = 0; i < n; i++) {
    const done = i <= inp.lastActual;
    const tip =
      `${inp.labels[i]}${per} · Revenue\n` +
      `Competenza: ${EUR(inp.plan[i])} (cum. ${EUR(cumPlan[i])})\n` +
      (done ? `Consuntivato: ${EUR(inp.actual[i])} (cum. ${EUR(cumAct[i])})` : 'Consuntivato: non ancora disponibile');
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
  const cumAct = last >= 0 ? cumulative(inp.actual.slice(0, last + 1)) : [];
  const topY = 18;
  const topH = 230;
  const barsBase = topY + topH + 130;
  let inner = paceTop(g, cumPlan, cumAct, topY, topH);
  if (last >= 0 && inp.todayLabel) {
    const lx = g.x(last);
    inner += svgLine(lx, topY, lx, topY + topH, C.amberD, 1.2, '4 3');
    inner += svgText(lx + 5, topY + 12, inp.todayLabel, { fill: C.amberD, weight: 700, size: 10 });
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
