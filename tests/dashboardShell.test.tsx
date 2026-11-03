import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '@/components/Dashboard';
import ActivePanel, { type ActivePanelProps } from '@/components/dashboard/ActivePanel';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import EmptyPortfolio from '@/components/dashboard/EmptyPortfolio';
import { getDashboardData } from '@/lib/getDashboardData';
import type { SafeUser } from '@/lib/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/dashboard' }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const user = (role: SafeUser['role'], name: string | null = 'Mario'): SafeUser => ({ id: 1, email: 'm@x.it', name, role, status: 'approved', created_at: null, approved_at: null });

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.__ARIA_MEM__;
  delete g.__ARIA_MESI__;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Dashboard shell', () => {
  it('renders header, tab bar, filter bar, active panel, footer and no toast', async () => {
    const data = await getDashboardData();
    const h = renderToStaticMarkup(<Dashboard initial={data} user={user('ADMIN')} canEdit isAdmin />);
    expect(h).toContain('role="tablist"');
    expect(h).toContain('class="filterbar"');
    expect(h).toContain('id="tabpanel-0"');
    expect(text(h)).toContain('Fonte: aggregatore Modulo 106');
    expect(h).not.toContain('class="toast');
  });

  it('shows the empty-portfolio state instead of any panel', async () => {
    const data = { ...(await getDashboardData()), interventi: [] };
    const h = renderToStaticMarkup(<Dashboard initial={data} user={user('ADMIN')} canEdit isAdmin />);
    expect(text(h)).toContain('Nessun dato nel portafoglio');
    expect(text(h)).toContain('Carica un file Excel');
    expect(h).not.toContain('data-p=');
  });
});

describe('EmptyPortfolio', () => {
  it('editors get the upload call to action, read-only users a hint', () => {
    const edit = renderToStaticMarkup(<EmptyPortfolio canEdit />);
    expect(edit).toContain('href="/upload"');
    const ro = renderToStaticMarkup(<EmptyPortfolio canEdit={false} />);
    expect(ro).not.toContain('href="/upload"');
    expect(text(ro)).toContain('Chiedi a un utente abilitato');
  });
});

describe('DashboardHeader', () => {
  const meta = { cig: 'CIG-1', contratto: '', odag: '', generato: '2026-05-04T10:00:00Z', contract_date: '', valid_to: '', months: 0 };
  const base = { meta, lastEdit: null, anno: 2026, anni: [2025, 2026], yearPending: false, onYearChange: () => {}, canEdit: false, isAdmin: false, editMode: false, onToggleEdit: () => {} };

  it('role-based actions: read-only user sees no edit/upload/admin links', () => {
    const t = renderToStaticMarkup(<DashboardHeader {...base} user={user('USER')} />);
    expect(t).not.toContain('Abilita modifica');
    expect(t).not.toContain('/upload');
    expect(t).not.toContain('/admin/');
    expect(t).toContain('Esci');
  });

  it('editor gets the edit toggle and upload link; admin also the admin links', () => {
    const editor = renderToStaticMarkup(<DashboardHeader {...base} canEdit user={user('USERPLUS')} />);
    expect(editor).toContain('🔒 Abilita modifica');
    expect(editor).toContain('href="/upload"');
    expect(editor).not.toContain('/admin/');
    const admin = renderToStaticMarkup(<DashboardHeader {...base} canEdit isAdmin editMode user={user('ADMIN')} />);
    expect(admin).toContain('🔓 Modalità modifica attiva');
    expect(admin).toContain('href="/admin/gestione"');
    expect(admin).toContain('href="/admin/users"');
  });

  it('year selector lists the years, marks the current, and disables while pending', () => {
    const h = renderToStaticMarkup(<DashboardHeader {...base} yearPending user={user('USER')} />);
    expect(h).toMatch(/<option value="2026" selected="">/);
    expect(h).toMatch(/<select[^>]*disabled/);
  });

  it('shows the last-edit date only when there is one; falls back to the e-mail without a name', () => {
    expect(text(renderToStaticMarkup(<DashboardHeader {...base} user={user('USER', null)} />))).toContain('m@x.it');
    expect(text(renderToStaticMarkup(<DashboardHeader {...base} user={user('USER')} />))).not.toContain('ultima modifica');
    expect(text(renderToStaticMarkup(<DashboardHeader {...base} lastEdit={new Date('2026-03-04T10:00:00Z')} user={user('USER')} />))).toContain('ultima modifica');
  });
});

describe('ActivePanel', () => {
  it('mounts exactly the panel of the selected tab, and nothing for an unknown tab', async () => {
    const data = await getDashboardData();
    const noop = () => {};
    const props = {
      data, IFs: data.interventi, rti: data.rti, quotaVal: data.quota_val, singleForn: undefined, anno: data.anno,
      canEdit: true, editMode: false, rtiSel: null, setRtiSel: noop, tlMode: 'mese', setTlMode: noop, distSub: 0, setDistSub: noop,
      onDrillMod: noop, onDrillStato: noop, onUpdateRti: noop, onSaveField: noop, onOpenEdit: noop, onOpenNew: noop, onDelete: noop,
      savingIds: new Set<string>(), highlightIds: new Set<string>(),
    } as Omit<ActivePanelProps, 'tab'>;
    const marker = (tab: number) => renderToStaticMarkup(<ActivePanel {...props} tab={tab} />).match(/data-p="(\d+)"/)?.[1];
    for (let tab = 0; tab <= 7; tab++) expect(marker(tab), `tab ${tab}`).toBe(String(tab));
    expect(renderToStaticMarkup(<ActivePanel {...props} tab={99} />)).toBe('');
  });
});
