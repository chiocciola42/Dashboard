// Primitive SVG minimali e pure, condivise dai grafici "insight" (lib/chartsInsight.ts).
// Ogni funzione restituisce una stringa SVG; nessuno stato, nessun accesso al DOM.
// Ogni ciclo qui scorre una struttura finita ricevuta in ingresso, quindi è limitato
// dalla sua dimensione (che i chiamanti validano con `assertMaxLen`).
import { esc } from './charts';

export const MAX_POINTS = 400;

// Errore di programmazione (input incoerente): si fallisce subito e in modo esplicito.
export class ChartInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartInputError';
  }
}

export function assertMaxLen(name: string, len: number, max = MAX_POINTS): void {
  if (len > max) throw new ChartInputError(`${name}: ${len} elementi, massimo ${max}`);
}

export function assertSameLength(name: string, a: readonly unknown[], b: readonly unknown[]): void {
  if (a.length !== b.length) throw new ChartInputError(`${name}: lunghezze diverse (${a.length} vs ${b.length})`);
}

export function assertFinite(name: string, values: readonly number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) throw new ChartInputError(`${name}: valore non finito (${v})`);
  }
}

const f1 = (n: number): string => n.toFixed(1);

// Scala lineare dominio -> range. Dominio degenere: tutto sul punto iniziale del range.
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (span === 0) return () => r0;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

// Massimo "tondo" (1, 2, 2.5, 5, 10 × 10^k) >= v, mai 0.
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / exp;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * exp;
}

const IT = (n: number, d = 0): string =>
  n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

// Valore in € in forma compatta per assi ed etichette: "€ 850 k", "€ 1,2 M".
export function eurCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `€ ${IT(v / 1e6, 1)} M`;
  if (a >= 1e3) return `€ ${IT(v / 1e3, 0)} k`;
  return `€ ${IT(v, 0)}`;
}

export type TextOpts = {
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  weight?: number;
  fill: string;
  extra?: string;
};

export function svgText(x: number, y: number, s: string, o: TextOpts): string {
  return `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${o.anchor || 'start'}" font-size="${o.size || 11.5}" font-weight="${
    o.weight || 400
  }" fill="${o.fill}"${o.extra ? ' ' + o.extra : ''}>${esc(s)}</text>`;
}

export function svgLine(x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1, dash?: string): string {
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}"${
    dash ? ` stroke-dasharray="${dash}"` : ''
  }/>`;
}

export function svgRect(x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = ''): string {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}" rx="${rx}" fill="${fill}"${
    extra ? ' ' + extra : ''
  }/>`;
}

export function svgCircle(cx: number, cy: number, r: number, fill: string, stroke = '#fff', extra = ''): string {
  return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"${extra ? ' ' + extra : ''}/>`;
}

export function pathD(points: readonly (readonly [number, number])[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])},${f1(p[1])}`).join(' ');
}

export function svgPath(d: string, o: { stroke?: string; width?: number; fill?: string; dash?: string; opacity?: number }): string {
  return `<path d="${d}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.width || 0}"${
    o.dash ? ` stroke-dasharray="${o.dash}"` : ''
  }${o.opacity != null ? ` opacity="${o.opacity}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
}

export function svgWrap(w: number, h: number, inner: string): string {
  return `<svg class="msvg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

export function cumulative(vals: readonly number[]): number[] {
  let acc = 0;
  return vals.map((v) => (acc += v));
}

// Righe orizzontali di griglia con etichetta a sinistra. `ticks` è fisso e piccolo.
export function hGrid(
  x0: number,
  x1: number,
  yOf: (v: number) => number,
  max: number,
  ticks: number,
  fmt: (v: number) => string,
  colors: { line: string; text: string },
): string {
  let out = '';
  for (let i = 0; i <= ticks; i++) {
    const v = (max * i) / ticks;
    out += svgLine(x0, yOf(v), x1, yOf(v), colors.line);
    out += svgText(x0 - 8, yOf(v) + 4, fmt(v), { anchor: 'end', fill: colors.text, size: 11 });
  }
  return out;
}
