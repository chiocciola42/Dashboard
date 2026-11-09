'use client';
import React from 'react';
import type { DashboardData, Intervento, InterventoInput, RtiConfig } from '@/lib/types';
import OverviewPanel from '../panels/OverviewPanel';
import RTIPanel from '../panels/RTIPanel';
import TimelinePanel from '../panels/TimelinePanel';
import DistribuzionePanel from '../panels/DistribuzionePanel';
import ModalitaPanel from '../panels/ModalitaPanel';
import StatoPanel from '../panels/StatoPanel';
import RegistroPanel from '../panels/RegistroPanel';
import DettaglioIFPanel from '../panels/DettaglioIFPanel';
import type { RtiUpdate } from './usePortfolioEditing';

export type ActivePanelProps = {
  tab: number;
  data: DashboardData;
  IFs: Intervento[];
  rti: RtiConfig;
  quotaVal: Record<string, number>;
  singleForn: string | undefined;
  anno: number;
  canEdit: boolean;
  editMode: boolean;
  rtiSel: string | null;
  setRtiSel: (v: string | null) => void;
  tlMode: 'mese' | 'trim';
  setTlMode: (m: 'mese' | 'trim') => void;
  distSub: number;
  setDistSub: (n: number) => void;
  onDrillMod: (m: string) => void;
  onDrillStato: (s: string) => void;
  onUpdateRti: (u: RtiUpdate) => void;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onOpenNew: () => void;
  onDelete: (numero_if: string) => void;
  savingIds: Set<string>;
  highlightIds: Set<string>;
};

// The panel of the selected tab (only the active one is mounted).
export default function ActivePanel(p: ActivePanelProps) {
  const { tab, data, IFs } = p;
  switch (tab) {
    case 0:
      return <OverviewPanel IFs={IFs} rti={p.rti} quotaVal={p.quotaVal} filtersForn={p.singleForn} anno={p.anno} />;
    case 1:
      return (
        <RTIPanel
          IFs={IFs}
          rti={p.rti}
          meta={data.meta}
          quotaVal={p.quotaVal}
          filtersForn={p.singleForn}
          rtiSel={p.rtiSel}
          setRtiSel={p.setRtiSel}
          editMode={p.editMode}
          onUpdateRti={p.onUpdateRti}
        />
      );
    case 2:
      return (
        <TimelinePanel
          timelineMy={data.timeline_my}
          befMonthly={data.bef_monthly}
          befFatturabile={data.bef_fatturabile}
          befAggregates={data.bef_aggregates}
          tlMode={p.tlMode}
          setTlMode={p.setTlMode}
        />
      );
    case 3:
      return <DistribuzionePanel IFs={IFs} seniority={data.seniority} partners={p.rti.partners} distSub={p.distSub} setDistSub={p.setDistSub} />;
    case 4:
      return <ModalitaPanel interventi={IFs} onDrillMod={p.onDrillMod} />;
    case 5:
      return <StatoPanel IFs={IFs} onDrillStato={p.onDrillStato} />;
    case 6:
      return (
        <RegistroPanel
          IFs={IFs}
          canEdit={p.canEdit}
          onSaveField={p.onSaveField}
          onOpenEdit={p.onOpenEdit}
          onOpenNew={p.onOpenNew}
          onDelete={p.onDelete}
          savingIds={p.savingIds}
          highlightIds={p.highlightIds}
          anno={p.anno}
        />
      );
    case 7:
      return (
        <DettaglioIFPanel
          IFs={IFs}
          canEdit={p.canEdit}
          onSaveField={p.onSaveField}
          onOpenEdit={p.onOpenEdit}
          onOpenNew={p.onOpenNew}
          onDelete={p.onDelete}
          savingIds={p.savingIds}
          highlightIds={p.highlightIds}
        />
      );
    default:
      return null;
  }
}
