// SVG/HTML chart builders ported 1:1 from the original static dashboard.
// They return HTML strings rendered via dangerouslySetInnerHTML; interactivity
// (drill-down, tooltips) is wired through event delegation on the container.
import { C, EUR, EUR0 } from './format';

export const esc = (s: unknown) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

export type DonutSeg = {
  label: string;
  v: number;
  c: string;
  tip?: string;
  drillStato?: string;
  drillRti?: string;
};

export function donut(segs: DonutSeg[], big: string | number, small: string): string {
  const tot = segs.reduce((s, x) => s + x.v, 0);
  const R = 70,
    SW = 42,
    cx = 115,
    cy = 115,
    Circ = 2 * Math.PI * R,
    gap = tot > 0 ? Math.min(2.2, Circ * 0.004) : 0;
  let arcs = '',
    acc = 0;
  if (tot > 0) {
    segs.forEach((s) => {
      const f = s.v / tot;
      if (f <= 0) return;
      const len = Math.max(0.5, f * Circ - gap),
        off = -acc * Circ - gap / 2;
      arcs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.c}" stroke-width="${SW}" stroke-linecap="butt" stroke-dasharray="${len.toFixed(
        2,
      )} ${(Circ - len).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" data-tip="${esc(
        s.tip || s.label,
      )}"${s.drillStato ? ` data-drill-stato="${esc(s.drillStato)}"` : ''}${
        s.drillRti ? ` data-drill-rti="${esc(s.drillRti)}"` : ''
      } class="seg"/>`;
      acc += f;
    });
  } else
    arcs = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="${SW}"/>`;
  const center =
    big !== '' && big != null
      ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="30" font-weight="800" fill="${C.ink}">${esc(
          big,
        )}</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="11.5" fill="${C.muted}">${esc(
          small,
        )}</text>`
      : '';
  const chips = segs
    .map(
      (s) =>
        `<span class="chip"><span class="dot" style="background:${s.c}"></span>${esc(s.label)}</span>`,
    )
    .join('');
  return `<div class="donutwrap"><svg viewBox="0 0 230 230" class="donutsvg"><g transform="rotate(-90 ${cx} ${cy})">${arcs}</g>${center}</svg><div class="chips">${chips}</div></div>`;
}

export type HBarRow = {
  label: string;
  v: number;
  disp: string;
  sub?: string;
  c?: string;
  tip?: string;
};

export function hbars(rows: HBarRow[], color?: string, opts?: { max?: number }): string {
  opts = opts || {};
  const max = opts.max || Math.max(1, ...rows.map((r) => r.v));
  return (
    `<div class="hbars">` +
    rows
      .map((r) => {
        const col = r.c || color || C.petrolL;
        return `<div class="hrow" data-tip="${esc(r.tip || r.label)}"><div class="hl" title="${esc(
          r.label,
        )}">${esc(r.label)}</div><div class="htrack"><div class="hfill" style="width:${Math.min(
          100,
          (r.v / max) * 100,
        ).toFixed(1)}%;background:${col}"></div></div><div class="hval">${esc(r.disp)}${
          r.sub ? `<span class="hsub">${esc(r.sub)}</span>` : ''
        }</div></div>`;
      })
      .join('') +
    `</div>`
  );
}

export type StackRow = {
  label: string;
  total: number;
  disp: string;
  sub?: string;
  segs: { v: number; c: string }[];
  tip: string;
};

export function hbarsStacked(rows: StackRow[], opts?: { max?: number }): string {
  opts = opts || {};
  const max = opts.max || Math.max(1, ...rows.map((r) => r.total));
  return (
    `<div class="hbars">` +
    rows
      .map((r) => {
        const segs = r.segs
          .filter((s) => s.v > 0)
          .map(
            (s) =>
              `<div class="hsseg" style="width:${((s.v / max) * 100).toFixed(2)}%;background:${s.c}"></div>`,
          )
          .join('');
        return `<div class="hsrow" data-tip="${esc(r.tip)}"><div class="hl" title="${esc(
          r.label,
        )}">${esc(r.label)}</div><div class="hstrack">${segs}</div><div class="hval">${esc(r.disp)}${
          r.sub ? `<span class="hsub">${esc(r.sub)}</span>` : ''
        }</div></div>`;
      })
      .join('') +
    `</div>`
  );
}

export type LegItem = { c: string; t: string; line?: boolean; dash?: boolean };
export function legchips(items: LegItem[]): string {
  return items
    .map(
      (i) =>
        `<span class="chip"><span class="dot" style="background:${i.c};${
          i.line ? 'width:14px;height:3px;border-radius:2px;' : ''
        }${i.dash ? 'width:14px;height:0;border-top:2px dashed ' + i.c + ';background:none;' : ''}"></span>${esc(
          i.t,
        )}</span>`,
    )
    .join('');
}
