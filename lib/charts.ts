// SVG/HTML chart builders ported 1:1 from the original static dashboard.
// They return HTML strings rendered via dangerouslySetInnerHTML; interactivity
// (drill-down, tooltips) is wired through event delegation on the container.
import { C, EUR, EUR0 } from './format';

export const esc = (s: unknown) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

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
