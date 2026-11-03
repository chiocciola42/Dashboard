import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DettaglioIFPanel from '@/components/panels/DettaglioIFPanel';
import IfCardsView from '@/components/panels/dettaglio/IfCardsView';
import IfTableView from '@/components/panels/dettaglio/IfTableView';
import MonthlyDetail from '@/components/panels/dettaglio/MonthlyDetail';
import DocPill from '@/components/panels/dettaglio/DocPill';
import { confirmAndDelete } from '@/components/panels/dettaglio/downloadCsv';
import type { MonthlyState } from '@/lib/dettaglioIF';
import { EUR0 } from '@/lib/format';
import { makeIf } from './helpers/fixtures';

const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const IFs = [
  makeIf({ numero_if: '20260002', titolo: 'Beta', fornitore: 'Deloitte', importo: 1500, subappalto: true }),
  makeIf({ numero_if: '20260001', titolo: 'Alfa', fornitore: 'Intellera', importo: 500, has_bo: true, bdo: '77' }),
];
const noop = () => {};
const base = { IFs, onSaveField: noop, onOpenEdit: noop, onOpenNew: noop, onDelete: noop, savingIds: new Set<string>(), highlightIds: new Set<string>() };

describe('DettaglioIFPanel', () => {
  it('shows the count and total of the IFs shown', () => {
    const t = text(renderToStaticMarkup(<DettaglioIFPanel {...base} />));
    expect(t).toContain('Mostrati: 2');
    expect(t).toContain(`Valore: € ${EUR0(2000)}`);
  });

  it('sorts by IF number ascending by default', () => {
    const h = renderToStaticMarkup(<DettaglioIFPanel {...base} />);
    expect(h.indexOf('20260001')).toBeLessThan(h.indexOf('20260002'));
    expect(h).toContain('aria-sort="ascending"');
  });

  it('edit controls only appear when canEdit', () => {
    const edit = renderToStaticMarkup(<DettaglioIFPanel {...base} canEdit />);
    const ro = renderToStaticMarkup(<DettaglioIFPanel {...base} canEdit={false} />);
    expect(edit).toContain('+ Nuovo IF');
    expect(edit).toContain('Modifica completa');
    expect(ro).not.toContain('+ Nuovo IF');
    expect(ro).not.toContain('Modifica completa');
    expect(text(ro)).toContain('sola visualizzazione');
  });

  it('shows the empty state for an empty portfolio', () => {
    expect(text(renderToStaticMarkup(<DettaglioIFPanel {...base} IFs={[]} />))).toContain('Nessun IF in questa vista.');
  });

  it('marks saving rows as dimmed and highlighted rows as saved', () => {
    const h = renderToStaticMarkup(
      <DettaglioIFPanel {...base} savingIds={new Set(['20260001'])} highlightIds={new Set(['20260002'])} />,
    );
    expect(h).toContain('opacity:0.55');
    expect(h).toContain('row-saved');
  });
});

describe('IfTableView / IfCardsView', () => {
  const common = { canEdit: false, savingIds: new Set<string>(), highlightIds: new Set<string>(), monthly: {}, onToggleMonthly: noop, onSaveField: noop, onOpenEdit: noop, onDelete: noop };

  it('table: one body row per IF, header marks the sorted column', () => {
    const h = renderToStaticMarkup(
      <IfTableView {...common} rows={IFs} sortK="importo" sortDir={-1} onSort={noop} expanded={new Set()} />,
    );
    expect((h.match(/<tbody>/g) || []).length).toBe(1);
    expect(h).toContain('aria-sort="descending"');
    expect(h).toContain('Beta');
    expect(h).toContain('Alfa');
  });

  it('table: an expanded row renders its monthly detail (loading until fetched)', () => {
    const h = renderToStaticMarkup(
      <IfTableView {...common} rows={IFs} sortK="numero_if" sortDir={1} onSort={noop} expanded={new Set(['20260001'])} />,
    );
    expect(text(h)).toContain('Caricamento dettaglio mensile');
    expect(h).toContain('aria-expanded="true"');
  });

  it('table: empty message spans every column', () => {
    const h = renderToStaticMarkup(
      <IfTableView {...common} canEdit rows={[]} sortK="numero_if" sortDir={1} onSort={noop} expanded={new Set()} />,
    );
    expect(h).toContain('colSpan="19"');
  });

  it('cards: one card per IF with its document statuses', () => {
    const h = renderToStaticMarkup(<IfCardsView {...common} rows={IFs} />);
    expect((h.match(/class="difcard/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(text(h)).toContain('V. Apertura');
    expect(text(h)).toContain('Azione Richiesta');
  });

  it('cards: empty state', () => {
    expect(text(renderToStaticMarkup(<IfCardsView {...common} rows={[]} />))).toContain('Nessun IF in questa vista.');
  });
});

describe('MonthlyDetail', () => {
  it('loading and error states', () => {
    expect(text(renderToStaticMarkup(<MonthlyDetail state="loading" />))).toContain('Caricamento');
    expect(text(renderToStaticMarkup(<MonthlyDetail state="error" />))).toContain('Impossibile caricare');
  });

  it('empty data shows one empty message per column', () => {
    const t = text(renderToStaticMarkup(<MonthlyDetail state={{ pdc: [], sal: [], bef: [] }} />));
    expect(t).toContain('Nessuna PDC registrata per questo BO.');
    expect(t).toContain('Nessun verbale SAL registrato per questo BO.');
    expect(t).toContain('Nessun BEF registrato per questo IF.');
  });

  it('rows are sorted by period and use traffic-light colors', () => {
    const state = {
      pdc: [
        { periodo_pdc: '03/2026', stato_pdc: 'PDC Approvata', codice_pdc: 'C3' },
        { periodo_pdc: '01/2026', stato_pdc: 'mancante', codice_pdc: 'C1' },
      ],
      sal: [],
      bef: [{ periodo_competenza: '02/2026', importo_ricezione: 1500, num_fattura: null }],
    } as unknown as MonthlyState;
    const h = renderToStaticMarkup(<MonthlyDetail state={state} />);
    expect(h.indexOf('C1')).toBeLessThan(h.indexOf('C3'));
    expect(h).toContain('color:var(--bad)');
    expect(h).toContain('color:var(--good)');
    expect(text(h)).toContain('fatturabile');
    expect(text(h)).toContain(` ${EUR0(1500)} fatturabile`);
  });
});

describe('DocPill / confirmAndDelete', () => {
  it('DocPill renders the label of the status', () => {
    expect(text(renderToStaticMarkup(<DocPill v="ok" />)).trim().length).toBeGreaterThan(0);
  });

  it('confirmAndDelete only deletes after the user confirms', () => {
    const onDelete = vi.fn();
    const confirm = vi.fn();
    vi.stubGlobal('window', { confirm });
    confirm.mockReturnValueOnce(false);
    confirmAndDelete('X1', onDelete);
    expect(onDelete).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    confirmAndDelete('X1', onDelete);
    expect(onDelete).toHaveBeenCalledWith('X1');
    expect(confirm.mock.calls[0][0]).toContain('X1');
    vi.unstubAllGlobals();
  });
});
