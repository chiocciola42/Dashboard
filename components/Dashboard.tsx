'use client';
import React, { useMemo, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardData, Intervento, SafeUser } from '@/lib/types';
import { filterInterventi, type Filters } from '@/lib/queries';
import { REGISTRO_TAB, lastEditDate, singleFornitore, sumImporto } from '@/lib/dashboardView';
import FilterBar from './FilterBar';
import EditDrawer from './editing/EditDrawer';
import ActivePanel from './dashboard/ActivePanel';
import DashboardHeader from './dashboard/DashboardHeader';
import DashboardTabs from './dashboard/DashboardTabs';
import EmptyPortfolio from './dashboard/EmptyPortfolio';
import { useChartTooltip } from './dashboard/useChartTooltip';
import { usePortfolioEditing } from './dashboard/usePortfolioEditing';
import { useToast } from './dashboard/useToast';

export default function Dashboard({
  initial,
  user,
  canEdit,
  isAdmin,
}: {
  initial: DashboardData;
  user: SafeUser;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  // Calendar year the monthly profiles (revenue / consuntivazione) refer to. Changing
  // it re-renders the page on the server with ?anno=; mutations carry it along so the
  // row the server sends back has the profiles of the year on screen.
  const anno = initial.anno;
  const [yearPending, startYearTransition] = useTransition();
  const onYearChange = (y: number) => startYearTransition(() => router.push(`/dashboard?anno=${y}`));

  const { toast, showToast } = useToast();
  const {
    interventi, rti, quotaVal, savingIds, highlightIds,
    onSaveField, onSaveDrawer, onDelete, onUpdateRti,
  } = usePortfolioEditing({ initial, anno, showToast });
  useChartTooltip();

  const [filters, setFilters] = useState<Filters>({});
  const [tab, setTab] = useState(0);
  const [tabPending, startTabTransition] = useTransition();
  const [rtiSel, setRtiSel] = useState<string | null>(null);
  const [tlMode, setTlMode] = useState<'mese' | 'trim'>('mese');
  const [distSub, setDistSub] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; mode: 'edit' | 'new'; initial: Intervento | null }>({
    open: false,
    mode: 'edit',
    initial: null,
  });

  const IFs = useMemo(() => filterInterventi(interventi, filters), [interventi, filters]);
  // F-8: distingui la data del file sorgente (meta.generato) dall'ultima
  // modifica reale registrata sui dati, così l'header non lascia ambiguità su
  // "quanto sono freschi" i numeri mostrati.
  const lastEdit = useMemo(() => lastEditDate(interventi), [interventi]);
  const viewTot = useMemo(() => sumImporto(IFs), [IFs]);
  // RTI quota panels are meaningful only for a single fornitore in scope.
  const singleForn = singleFornitore(filters);

  // Stable references so the memoized panels don't re-render from fresh
  // closures created on every Dashboard render.
  const selectTab = useCallback((i: number) => startTabTransition(() => setTab(i)), []);
  const drillTo = useCallback((patch: Filters) => {
    setFilters((f) => ({ ...f, ...patch }));
    startTabTransition(() => setTab(REGISTRO_TAB));
  }, []);
  const onDrillMod = useCallback((m: string) => drillTo({ mod: m }), [drillTo]);
  const onDrillStato = useCallback((s: string) => drillTo({ stato: [s] }), [drillTo]);
  const onOpenEdit = useCallback((i: Intervento) => setDrawer({ open: true, mode: 'edit', initial: i }), []);
  const onOpenNew = useCallback(() => setDrawer({ open: true, mode: 'new', initial: null }), []);

  return (
    <>
      <DashboardHeader
        meta={initial.meta}
        lastEdit={lastEdit}
        anno={anno}
        anni={initial.anni}
        yearPending={yearPending}
        onYearChange={onYearChange}
        user={user}
        canEdit={canEdit}
        isAdmin={isAdmin}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
      />

      <DashboardTabs tab={tab} onSelect={selectTab} />

      <FilterBar
        interventi={interventi}
        fornitoriFilter={initial.fornitori_filter}
        filters={filters}
        setFilters={setFilters}
        viewCount={IFs.length}
        viewTot={viewTot}
      />

      <main
        className={'wrap' + (tabPending ? ' main-pending' : '')}
        id={`tabpanel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        aria-busy={tabPending || undefined}
        tabIndex={0}
      >
        <div className="tab-spinner" aria-label="Caricamento…" />
        {interventi.length === 0 ? (
          <EmptyPortfolio canEdit={canEdit} />
        ) : (
          <ActivePanel
            tab={tab}
            data={initial}
            IFs={IFs}
            rti={rti}
            quotaVal={quotaVal}
            singleForn={singleForn}
            anno={anno}
            canEdit={canEdit}
            editMode={editMode}
            rtiSel={rtiSel}
            setRtiSel={setRtiSel}
            tlMode={tlMode}
            setTlMode={setTlMode}
            distSub={distSub}
            setDistSub={setDistSub}
            onDrillMod={onDrillMod}
            onDrillStato={onDrillStato}
            onUpdateRti={onUpdateRti}
            onSaveField={onSaveField}
            onOpenEdit={onOpenEdit}
            onOpenNew={onOpenNew}
            onDelete={onDelete}
            savingIds={savingIds}
            highlightIds={highlightIds}
          />
        )}

        <div className="foot">
          <b>Fonte:</b> aggregatore Modulo 106 e cruscotto revenue — contratto SISS L2 (CIG {initial.meta.cig}), RTI 7-26 a
          mandataria Intellera. I filtri si applicano a tutte le viste; le quote RTI sono contrattuali, mentre
          impegnato/erosione e revenue si ricalcolano sulla selezione. Importi al netto IVA.
        </div>
      </main>

      <EditDrawer
        open={drawer.open}
        mode={drawer.mode}
        initial={drawer.initial}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        onSave={onSaveDrawer}
      />

      {toast && <div className={'toast' + (toast.bad ? ' bad' : '')}>{toast.msg}</div>}
    </>
  );
}
