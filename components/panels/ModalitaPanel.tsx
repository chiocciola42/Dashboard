'use client';
import React from 'react';
import type { Intervento } from '@/lib/types';
import { aggregateModalita } from '@/lib/modalita';
import { Html } from '../Html';
import { ChartCard } from '../export/ExportControls';
import ModalitaTable from './modalita/ModalitaTable';
import { buildModalitaBars, buildModalitaDonut } from './modalita/modalitaHtml';

function ModalitaPanel({
  interventi,
  onDrillMod,
}: {
  interventi: Intervento[];
  onDrillMod: (modLabel: string) => void;
}) {
  // Computed live from the (already filtered) portfolio in view, so this panel
  // reacts to FilterBar/uploads/edits like every other panel — it previously
  // read a static seed snapshot that never changed and never respected filters.
  const { rows: modalita, tot } = aggregateModalita(interventi);
  const modDonut = buildModalitaDonut(modalita, tot);
  const modBars = buildModalitaBars(modalita);

  const onDrill = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = (e.target as HTMLElement).closest('[data-drill-mod]') as HTMLElement | null;
    if (t) onDrillMod(t.getAttribute('data-drill-mod') || '');
  };


  return (
    <div className="panel on" data-p="4">
      <div className="phead">
        <h2>Modalità fornitura</h2>
        <p>Distribuzione per tipologia contrattuale · vista corrente (rispetta i filtri attivi).</p>
      </div>
      <div className="grid2">
        <ChartCard
          title="Distribuzione valore per modalità"
          caption="Quota del valore per tipologia contrattuale"
          filename="Valore_per_modalita"
        >
          <Html html={modDonut} />
        </ChartCard>
        <ChartCard
          title="N° IF per modalità"
          caption="Numero di IF per modalità · clic su una barra per vedere gli IF"
          filename="IF_per_modalita"
        >
          <Html html={modBars} onClick={onDrill} />
        </ChartCard>
      </div>
      <ModalitaTable modalita={modalita} tot={tot} onDrillMod={onDrillMod} />
      <div className="foot" style={{ marginTop: 14 }}>
        <b>Note:</b> A_corpo = fatturazione a consegna milestone · A_canone = fatturazione mensile ricorrente · A_consumo =
        fatturazione a misura (GG/Uomo).
      </div>
    </div>
  );
}

// Memoized: only the active tab is mounted, but edits elsewhere in the
// Dashboard (toasts, drawer, saving flags) re-render the parent — memo skips
// re-rendering the panel when its own data/props are unchanged.
export default React.memo(ModalitaPanel);
