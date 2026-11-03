import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AdminGestione from '@/components/AdminGestione';
import GaraSection from '@/components/admin/GaraSection';
import GlobalRevSection from '@/components/admin/GlobalRevSection';
import IfBoSection from '@/components/admin/IfBoSection';
import IfDetail from '@/components/admin/IfDetail';
import RisorseEditor from '@/components/admin/RisorseEditor';
import BefEditor from '@/components/admin/BefEditor';
import DbSection from '@/components/admin/DbSection';
import TableViewer from '@/components/admin/TableViewer';
import QueryRunner from '@/components/admin/QueryRunner';
import ExportSection from '@/components/admin/ExportSection';
import { Field, MonthGrid, NumInput, Rollups, TableBlock, TextInput } from '@/components/admin/shared';
import type { Meta, MultiYearTimeline, RtiConfig, Seniority } from '@/lib/types';
import { makeIf } from './helpers/fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/admin/gestione' }));

const show = vi.fn();
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const meta: Meta = {
  cig: 'CIG-123',
  contratto: 'Contratto X',
  odag: 'ODAG-9',
  generato: '2026-01-01',
  contract_date: '2025-01-01',
  valid_to: '2030-01-01',
  months: 60,
};
const rti: RtiConfig = {
  ceiling: 1_000_000,
  partners: [
    { name: 'Intellera', pct: 0.6, quota: 0, impegnato: 0 },
    { name: 'Deloitte', pct: 0.4, quota: 0, impegnato: 0 },
  ],
  tot_impegnato: 0,
  erosione_2026: 0,
};
const sen: Seniority[] = [{ figura: 'Senior Dev', code: 'SD', gg: 10, tariffa: 500 }];
const my: MultiYearTimeline = {
  years: [2026],
  months: [{ anno: 2026, mese: 1, revenue: 1234, consuntivato: 99 }],
};

describe('admin/shared primitives', () => {
  it('NumInput shows the value, and an empty field for null', () => {
    expect(html(<NumInput value={42} onChange={() => {}} />)).toContain('value="42"');
    expect(html(<NumInput value={null} onChange={() => {}} />)).toContain('value=""');
  });

  it('TextInput renders value and placeholder, null as empty', () => {
    const h = html(<TextInput value="abc" onChange={() => {}} placeholder="ph" />);
    expect(h).toContain('value="abc"');
    expect(h).toContain('placeholder="ph"');
    expect(html(<TextInput value={null} onChange={() => {}} />)).toContain('value=""');
  });

  it('MonthGrid renders 12 cells in calendar order, defaulting missing slots to 0', () => {
    const h = html(<MonthGrid values={[5]} onChange={() => {}} />);
    expect(h.match(/class="mg-cell"/g)).toHaveLength(12);
    expect(h.match(/value="0"/g)).toHaveLength(11);
    expect(h).toContain('value="5"');
  });

  it('Rollups defaults to calendar-year quarters and totals the series', () => {
    const t = text(html(<Rollups values={[100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 50]} />));
    expect(t).toContain('Q1');
    expect(t).toContain('Q4');
    expect(t).toContain('Totale € 350');
  });

  it('Field wraps children with its label; TableBlock wraps its children', () => {
    expect(text(html(<Field label="Etichetta"><i>x</i></Field>))).toContain('Etichetta x');
    expect(html(<TableBlock><table id="t" /></TableBlock>)).toContain('id="t"');
  });
});

describe('AdminGestione shell', () => {
  const props = { meta, rti, multiYear: my, seniority: sen, interventi: [makeIf()], anno: 2026, anni: [2026] };

  it('renders the five section tabs and opens on "Valori di gara"', () => {
    const h = html(<AdminGestione {...props} />);
    for (const s of ['Valori di gara', 'Revenue & Consuntivazione', 'IF / BO', 'Database', 'Export']) {
      expect(h).toContain(s.replace('&', '&amp;'));
    }
    expect(h).toMatch(/class="tab on"[^>]*><span class="ti">1<\/span>Valori di gara/);
    expect(h).toContain('CIG-123');
  });

  it('links back to the dashboard', () => {
    expect(html(<AdminGestione {...props} />)).toContain('href="/dashboard"');
  });
});

describe('admin sections render from their props', () => {
  it('GaraSection: meta, partners and seniority rows', () => {
    const h = html(<GaraSection meta0={meta} rti0={rti} sen0={sen} show={show} />);
    expect(h).toContain('CIG-123');
    expect(h).toContain('Intellera');
    expect(h).toContain('Deloitte');
    expect(h).toContain('Senior Dev');
  });

  it('GlobalRevSection: the selected year and its monthly profile', () => {
    const h = html(<GlobalRevSection my0={my} show={show} />);
    expect(text(h)).toContain('Revenue mensile · 2026');
    expect(h).toContain('value="1234"');
  });

  it('IfBoSection: lists the portfolio', () => {
    const h = html(
      <IfBoSection ifs0={[makeIf({ numero_if: '20269999', titolo: 'Titolo di prova' })]} anno0={2026} anni0={[2026]} show={show} />,
    );
    expect(h).toContain('20269999');
    expect(h).toContain('Titolo di prova');
  });

  it('IfDetail, RisorseEditor, BefEditor render without data loaded', () => {
    const iv = makeIf({ numero_if: '20268888', titolo: 'Dettaglio' });
    expect(html(<IfDetail iv={iv} anno={2026} onUpdated={() => {}} show={show} />)).toContain('20268888');
    expect(html(<RisorseEditor numeroIf="20268888" show={show} />)).not.toBe('');
    expect(html(<BefEditor numeroIf="20268888" show={show} />)).not.toBe('');
  });

  it('DbSection, TableViewer, QueryRunner, ExportSection render their initial state', () => {
    expect(html(<DbSection show={show} />)).not.toBe('');
    expect(html(<TableViewer name="interventi" />)).toContain('interventi');
    expect(html(<QueryRunner show={show} onMutated={() => {}} />)).toContain('textarea');
    expect(text(html(<ExportSection show={show} />))).toContain('Esporta formule (.csv)');
  });
});
