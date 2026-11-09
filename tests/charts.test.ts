import { describe, expect, it } from 'vitest';
import { C } from '@/lib/format';
import { donut, esc, hbars, hbarsStacked, legchips } from '@/lib/charts';

const count = (html: string, needle: string | RegExp) => (html.match(typeof needle === 'string' ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : needle) ?? []).length;

describe('esc', () => {
  it('escapes the characters that could break out of an attribute or a tag', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
  it('turns null/undefined into an empty string and numbers into text', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(42)).toBe('42');
  });
});

describe('donut', () => {
  it('draws one arc per non-empty segment and a chip per segment', () => {
    const html = donut([{ label: 'A', v: 3, c: '#111' }, { label: 'B', v: 0, c: '#222' }, { label: 'C', v: 1, c: '#333' }], 4, 'IF');
    expect(count(html, 'class="seg"')).toBe(2);
    expect(count(html, 'class="chip"')).toBe(3);
    expect(html).toContain('>4</text>');
    expect(html).toContain('>IF</text>');
  });

  it('shows an empty ring (no arcs) when there is nothing to show', () => {
    const html = donut([{ label: 'A', v: 0, c: '#111' }], '', '');
    expect(count(html, 'class="seg"')).toBe(0);
    expect(html).toContain(C.line);
    expect(html).not.toContain('<text');
  });

  it('carries the tooltip and drill-down hooks, escaped', () => {
    const html = donut([{ label: 'X<y>', v: 1, c: '#111', tip: 'tip "q"', drillStato: 'approvato', drillRti: 'Intellera' }], 1, 'a');
    expect(html).toContain('data-tip="tip &quot;q&quot;"');
    expect(html).toContain('data-drill-stato="approvato"');
    expect(html).toContain('data-drill-rti="Intellera"');
    expect(html).toContain('X&lt;y&gt;');
    expect(html).not.toContain('X<y>');
  });

  it('never produces NaN', () => {
    expect(donut([], 0, '')).not.toContain('NaN');
  });
});

describe('hbars', () => {
  const rows = [{ label: 'Uno', v: 50, disp: '50' }, { label: 'Due', v: 100, disp: '100', sub: 'sotto' }];

  it('scales each bar against the largest value', () => {
    const html = hbars(rows);
    expect(html).toContain('width:50.0%');
    expect(html).toContain('width:100.0%');
    expect(html).toContain('<span class="hsub">sotto</span>');
  });

  it('honours an explicit max and never overflows 100%', () => {
    expect(hbars(rows, undefined, { max: 200 })).toContain('width:25.0%');
    expect(hbars([{ label: 'x', v: 500, disp: '500' }], undefined, { max: 100 })).toContain('width:100.0%');
  });

  it('colours by row, then by argument, then by the default', () => {
    expect(hbars([{ label: 'x', v: 1, disp: '1', c: '#aaa' }], '#bbb')).toContain('background:#aaa');
    expect(hbars([{ label: 'x', v: 1, disp: '1' }], '#bbb')).toContain('background:#bbb');
    expect(hbars([{ label: 'x', v: 1, disp: '1' }])).toContain(C.petrolL);
  });

  it('copes with no rows and escapes labels', () => {
    expect(hbars([])).toBe('<div class="hbars"></div>');
    expect(hbars([{ label: '<b>', v: 1, disp: '"1"' }])).not.toContain('<b>');
  });
});

describe('hbarsStacked', () => {
  it('draws only the positive segments, sized against the max', () => {
    const html = hbarsStacked([{ label: 'A', total: 10, disp: '10', tip: 't', segs: [{ v: 5, c: '#1' }, { v: 0, c: '#2' }, { v: 5, c: '#3' }] }], { max: 20 });
    expect(count(html, 'class="hsseg"')).toBe(2);
    expect(html).toContain('width:25.00%');
  });
});

describe('legchips', () => {
  it('renders a dot, a line or a dashed marker per item, escaped', () => {
    const html = legchips([{ c: '#111', t: 'Punto' }, { c: '#222', t: 'Linea', line: true }, { c: '#333', t: 'Trat<>', dash: true }]);
    expect(count(html, 'class="chip"')).toBe(3);
    expect(html).toContain('height:3px');
    expect(html).toContain('border-top:2px dashed #333');
    expect(html).toContain('Trat&lt;&gt;');
    expect(legchips([])).toBe('');
  });
});
