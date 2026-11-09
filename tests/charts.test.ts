import { describe, expect, it } from 'vitest';
import { C } from '@/lib/format';
import { esc, hbarsStacked, legchips } from '@/lib/charts';

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
